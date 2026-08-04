const aiService = require('./aiService');

// Prompts matcher (offre saisie dans un formulaire)
const { buildPrompt: buildMatcherCvPersoPrompt } = require('../prompts/matcherCvPersonnalise');
const { buildPrompt: buildMatcherLettrePrompt } = require('../prompts/matcherLettre');

// Prompts scraper (offre lue depuis une URL)
const { buildPrompt: buildScraperCvPersoPrompt } = require('../prompts/scraperCvPersonnalise');
const { buildPrompt: buildScraperLettrePrompt } = require('../prompts/scraperLettre');

const { buildPrompt: buildExtractCandidatPrompt } = require('../prompts/extractCandidatFromCV');
const { personalizedCVToJSON } = require('../prompts/jsonSchemas');

const { extraireExigences } = require('../core/offre/extraireExigences');
const { scoreMatching } = require('../core/score/matching');
const { creer } = require('../lib/logger');

const log = creer('Matcher');

/**
 * Service de matching d'offres.
 *
 * CE QUI A CHANGE
 *
 * 1. LE SCORE N'EST PLUS INVENTE. Il valait `result.score_matching`, un
 *    nombre produit par le modele — dans une reponse dont le prompt exigeait
 *    par ailleurs « un score de concordance MINIMUM de 80/100 ». Le cercle
 *    vert de l'interface ne mesurait donc pas la correspondance entre le
 *    candidat et l'offre : il mesurait l'obeissance du modele a une consigne.
 *    Il est desormais calcule par core/score/matching.js, a partir des
 *    competences reellement exigees et de celles reellement presentes.
 *
 * 2. LA LISTE DES MODIFICATIONS EST CONSTATEE, PAS RACONTEE. Le modele
 *    decrivait ce qu'il venait de faire, dans la meme reponse ou il le
 *    faisait. On compare maintenant les deux versions du CV.
 *
 * 3. LA LETTRE REVIENT EN TEXTE BRUT. On payait un second appel pour
 *    decouper la lettre en cinq champs... que le frontend recollait avec des
 *    sauts de ligne 200 ms plus tard.
 *
 * 4. SIX METHODES POUR TROIS COMPORTEMENTS. Les versions « matcher » et
 *    « scraper » etaient identiques a la construction du prompt pres, et
 *    avaient DEJA diverge (l'une demandait de garder prenom, nom, email et
 *    telephone exacts, l'autre seulement « les donnees exactes »). Une seule
 *    methode desormais, avec un mode.
 *
 * 5. LE « CV IDEAL » EST SUPPRIME. L'interface ne l'affichait nulle part :
 *    c'etaient deux appels a gpt-4o pour un document que personne ne voyait.
 */
class MatcherService {
  /**
   * Genere les documents demandes pour une offre saisie au formulaire.
   */
  async analyzeAndGenerate(offer, candidate, options = {}) {
    return this.genererDocuments({
      mode: 'formulaire',
      offre: this.formatOfferData(offer),
      candidate,
      options
    });
  }

  /**
   * Genere les documents a partir du texte brut d'une offre lue sur le web.
   */
  async scrapeAndGenerate(rawText, url, candidate, options = {}) {
    return this.genererDocuments({
      mode: 'scraper',
      rawText,
      url,
      candidate,
      options
    });
  }

  /**
   * Coeur commun aux deux modes.
   */
  async genererDocuments({ mode, offre, rawText, url, candidate, options = {} }) {
    const { generatePersonalizedCV = true, generateCoverLetter = true } = options;
    const formattedCandidate = this.formatCandidateData(candidate);

    // Le score est calcule AVANT tout appel a un modele, et il ne depend
    // d'aucun d'eux : il est donc disponible meme en mode degrade.
    const correspondance = this.evaluerCorrespondance({ mode, offre, rawText, candidate: formattedCandidate });

    log.info(`Generation (${mode}) - correspondance calculee : ${correspondance.score}/100`);

    const travaux = [];
    const resultats = {};

    if (generatePersonalizedCV) {
      travaux.push(
        this.genererCvPersonnalise({ mode, offre, rawText, url, candidate: formattedCandidate, correspondance })
          .then((data) => { resultats.personalizedCV = data; })
      );
    }

    if (generateCoverLetter) {
      travaux.push(
        this.genererLettre({ mode, offre, rawText, url, candidate: formattedCandidate })
          .then((data) => { resultats.coverLetter = data; })
      );
    }

    await Promise.all(travaux);
    resultats.correspondance = correspondance;
    return resultats;
  }

  /**
   * Correspondance candidat / offre, entierement calculee en local.
   */
  evaluerCorrespondance({ mode, offre, rawText, candidate }) {
    const description = mode === 'scraper' ? rawText : offre?.description || '';
    const intituleOffre = mode === 'scraper' ? '' : offre?.title || '';

    const exigences = extraireExigences(description);
    const resultat = scoreMatching(candidate, exigences, { intituleOffre });

    return {
      score: resultat.score,
      criteres: resultat.criteres,
      competencesCommunes: resultat.competencesCommunes,
      competencesManquantes: resultat.competencesManquantes,
      actions: resultat.actions,
      exigencesDetectees: exigences
    };
  }

  /**
   * CV adapte a l'offre. Le seul endroit ou un modele reste indispensable :
   * reformuler des phrases en francais naturel.
   */
  async genererCvPersonnalise({ mode, offre, rawText, url, candidate, correspondance }) {
    const genPrompt = mode === 'scraper'
      ? buildScraperCvPersoPrompt(rawText, url, candidate)
      : buildMatcherCvPersoPrompt(offre, candidate);

    const result = await aiService.generateThenConvert(
      genPrompt,
      personalizedCVToJSON('{{GENERATED_TEXT}}'),
      { role: 'redaction', temperature: 0.7, maxTokens: 2000 },
      { role: 'extraction' }
    );

    if (!result.personalizedCV) {
      throw new Error("La generation du CV personnalise a echoue : reponse inexploitable");
    }

    return {
      // On IGNORE volontairement result.score_matching : c'est le score que
      // le modele s'attribuait a lui-meme.
      score_matching: correspondance.score,
      modifications_apportees: this.comparerCv(candidate, result.personalizedCV),
      competences_manquantes: correspondance.competencesManquantes,
      cvData: result.personalizedCV
    };
  }

  /**
   * Lettre de motivation, renvoyee en TEXTE BRUT.
   *
   * `letterData.texte` est le nouveau format. Les champs greeting /
   * introduction / body / conclusion / closing restent presents pour que les
   * resultats archives dans l'historique continuent de s'afficher.
   */
  async genererLettre({ mode, offre, rawText, url, candidate }) {
    const genPrompt = mode === 'scraper'
      ? buildScraperLettrePrompt(rawText, url, candidate)
      : buildMatcherLettrePrompt(offre, candidate);

    const texte = await aiService.generate(genPrompt, {
      role: 'redaction',
      temperature: 0.7,
      maxTokens: 1500
    });

    const propre = String(texte || '').trim();
    if (!propre) {
      throw new Error('La generation de la lettre a echoue : reponse vide');
    }

    return { letterData: { texte: propre } };
  }

  /**
   * Compare le CV d'origine et le CV adapte, et liste ce qui a REELLEMENT
   * change. Le code, lui, ne peut pas se tromper sur ce qu'il vient de faire.
   */
  comparerCv(avant, apres) {
    const modifications = [];
    const listeDe = (valeur) => {
      if (!valeur) return [];
      if (Array.isArray(valeur)) return valeur.map((v) => String(v).trim()).filter(Boolean);
      return String(valeur).split(/[,;\n•]+/).map((v) => v.trim()).filter(Boolean);
    };

    if (apres.titre_poste && apres.titre_poste !== avant.titre_poste) {
      modifications.push(`Titre adapte : « ${avant.titre_poste || 'sans titre'} » devient « ${apres.titre_poste} »`);
    }

    const compare = (libelle, avantBrut, apresBrut) => {
      const listeAvant = listeDe(avantBrut);
      const listeApres = listeDe(apresBrut);
      const cle = (v) => v.toLowerCase();
      const ajoutees = listeApres.filter((v) => !listeAvant.some((a) => cle(a) === cle(v)));
      const retirees = listeAvant.filter((v) => !listeApres.some((a) => cle(a) === cle(v)));

      if (ajoutees.length) modifications.push(`${libelle} ajoutee(s) : ${ajoutees.slice(0, 5).join(', ')}`);
      if (retirees.length) modifications.push(`${libelle} retiree(s) : ${retirees.slice(0, 5).join(', ')}`);
      if (!ajoutees.length && !retirees.length && listeAvant.length && listeApres.join('|') !== listeAvant.join('|')) {
        modifications.push(`${libelle} reordonnee(s) selon les priorites de l'offre`);
      }
    };

    compare('Competence technique', avant.competences_techniques, apres.competences_techniques);
    compare('Competence transverse', avant.competences_soft, apres.competences_soft);

    const nbAvant = (avant.experiences || []).length;
    const nbApres = (apres.experiences || []).length;
    if (nbApres !== nbAvant) {
      modifications.push(`Experiences : ${nbAvant} en entree, ${nbApres} retenue(s) dans le CV adapte`);
    }

    if (apres.resume && apres.resume !== avant.resume) {
      modifications.push("Accroche reecrite pour reprendre le vocabulaire de l'offre");
    }

    return modifications.length ? modifications : ['Aucune modification structurelle detectee'];
  }

  /**
   * Extraire le profil candidat depuis le texte brut d'un CV.
   * Reste un appel LLM : le parseur local existe (core/cv/profil.js) mais il
   * ne produit pas encore le format attendu par le matcher.
   */
  async extractCandidateFromPDF(cvText) {
    log.info('Extraction du profil candidat depuis un CV PDF');

    const prompt = buildExtractCandidatPrompt(cvText);
    const result = await aiService.generateJSON(prompt, { role: 'extraction' });

    if (!result.prenom && !result.nom) {
      throw new Error("Impossible d'extraire les informations du candidat depuis ce CV");
    }

    return this.formatCandidateData(result);
  }

  formatOfferData(offer) {
    return {
      title: offer.title,
      company: offer.company,
      location: offer.location || '',
      contract_type: offer.contract_type || '',
      salary: offer.salary || '',
      description: offer.description
    };
  }

  formatCandidateData(candidate) {
    return {
      prenom: candidate.prenom,
      nom: candidate.nom,
      titre_poste: candidate.titre_poste,
      email: candidate.email || '',
      telephone: candidate.telephone || '',
      adresse: candidate.adresse || '',
      linkedin: candidate.linkedin || '',
      resume: candidate.resume || '',
      experiences: candidate.experiences || [],
      formations: candidate.formations || [],
      competences_techniques: candidate.competences_techniques || '',
      competences_soft: candidate.competences_soft || '',
      langues: candidate.langues || ''
    };
  }
}

module.exports = new MatcherService();
