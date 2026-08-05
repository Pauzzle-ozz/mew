const aiService = require('./aiService');
const { buildPrompt: buildOptimisePdfPrompt } = require('../prompts/optimiseCvPdf');
const { parseCvOptimise } = require('../llm/parseurs/cvOptimise');

const { construireProfil } = require('../core/cv/profil');
const { proposerMetiers } = require('../core/score/metiers');
const { scoreAts } = require('../core/score/ats');
const { recommandations } = require('../core/score/recommandations');
const { creer } = require('../lib/logger');

const log = creer('CV');

/**
 * Service CV.
 *
 * CE QUI A CHANGE
 * Ce service faisait 6 appels a OpenAI. Il n'en fait plus qu'un, et
 * uniquement pour de la reecriture de texte.
 *
 * L'analyse (quels metiers correspondent a ce profil) et la notation ATS
 * sont maintenant calculees en local :
 *   - les metiers viennent du referentiel ROME de France Travail
 *     (1 911 fiches officielles) au lieu d'etre inventes par un modele ;
 *   - le score ATS suit un bareme a points, explicite et verifiable, au lieu
 *     d'etre un nombre plausible tire par le modele — le prompt d'origine
 *     lui disait litteralement « Commence par : SCORE ATS: [nombre entre
 *     0 et 100] », sans definir le moindre critere.
 *
 * Consequence directe : le meme CV donne toujours le meme resultat, on peut
 * expliquer chaque note ligne par ligne, c'est instantane, et ca fonctionne
 * sans cle API.
 */
class CVService {
  /**
   * Analyser un CV saisi via le formulaire.
   * Zero appel a un modele de langage.
   */
  async analyzeCV(cvData) {
    log.info('Analyse de CV depuis le formulaire');

    const resultat = proposerMetiers(cvData, { limite: 6 });

    return {
      success: true,
      profil: {
        prenom: cvData.prenom || 'Non specifie',
        nom: cvData.nom || 'Non specifie',
        niveau_experience: cvData.niveau_experience || 'Non specifie',
        type_poste: cvData.type_poste || 'Non specifie'
      },
      metiers_proposes: resultat.metiers_proposes,
      competences_cles: resultat.competences_cles,
      mots_cles_recherche: resultat.mots_cles_recherche,
      source: resultat.source,
      message: 'Analyse terminee',
      nombre_metiers: resultat.metiers_proposes.length
    };
  }

  /**
   * Analyser un CV a partir du texte extrait d'un PDF.
   * Zero appel a un modele de langage.
   */
  async analyzePDF(cvText, numPages, userId) {
    log.info(`Analyse de CV PDF (${numPages} page(s))`);

    const profil = construireProfil(cvText);
    const resultat = proposerMetiers(profil, { limite: 6 });

    return {
      success: true,
      profil: {
        // On affiche ce qui a REELLEMENT ete lu dans le PDF, au lieu des
        // valeurs de remplissage « Extrait du CV » / « Identifie par l'IA »
        // qui ne disaient rien a personne.
        prenom: profil.contact?.prenom || '',
        nom: profil.contact?.nom || '',
        email: profil.contact?.email || '',
        ville: profil.contact?.ville || '',
        niveau_experience: profil.anneesExperience
          ? `${profil.anneesExperience} an(s) d'experience`
          : 'Non determine',
        type_poste: profil.intitulePrincipal || 'Non determine',
        confiance_lecture: profil.confiance
      },
      metiers_proposes: resultat.metiers_proposes,
      competences_cles: resultat.competences_cles.length
        ? resultat.competences_cles
        : profil.competences,
      mots_cles_recherche: resultat.mots_cles_recherche,
      source: resultat.source,
      message: 'Analyse terminee',
      nombre_metiers: resultat.metiers_proposes.length
    };
  }

  /**
   * Optimiser un CV : score ATS calcule + reecriture assistee.
   *
   * Le score et les recommandations sont deterministes. Seule la reecriture
   * du contenu passe encore par un modele — et si aucune cle n'est
   * configuree, l'outil reste utile : il rend le score detaille et la liste
   * de ce qu'il faut corriger, ce qui est deja l'essentiel.
   */
  async optimizeCVPdf(cvText, numPages, userId, posteCible) {
    log.info(`Optimisation de CV PDF (${numPages} page(s))`);

    // --- Partie deterministe, toujours executee -----------------------------
    const profil = construireProfil(cvText);
    const motsClesPoste = posteCible
      ? posteCible.split(/[\s,;/]+/).filter((mot) => mot.length > 2)
      : [];

    const evaluation = scoreAts(profil, { texteBrut: cvText, motsClesPoste });
    const { pointsForts, ameliorations } = recommandations(evaluation);

    const base = {
      success: true,
      score_ats: evaluation.score,
      score_detail: {
        pointsObtenus: evaluation.pointsObtenus,
        pointsMaxApplicables: evaluation.pointsMaxApplicables,
        familles: evaluation.familles,
        criteres: evaluation.criteres
      },
      points_forts: pointsForts.map((p) => p.message || p.titre),
      ameliorations: ameliorations.map((a) => a.message || a.titre),
      profil_extrait: profil,
      message: 'Score ATS calcule'
    };

    // --- Partie reecriture, seulement si la tache est disponible ------------
    //
    // On distingue les deux raisons possibles : « tu l'as coupee » et « aucun
    // moteur n'est configure » ne se corrigent pas au meme endroit. Les
    // confondre enverrait quelqu'un verifier une cle qui va tres bien.
    const raison = aiService.raisonIndisponible('cv-optimise');
    if (raison) {
      return {
        ...base,
        cvData_optimise: null,
        degraded: true,
        message: raison === 'coupee'
          ? 'Score ATS calcule. Tu as coupe la reecriture par l\'IA pour cet outil dans tes '
            + 'Parametres : les axes d\'amelioration ci-dessus restent applicables a la main.'
          : 'Score ATS calcule. La reecriture demande un moteur d\'IA : ouvre les Parametres '
            + 'de Mew pour en choisir un (un modele local comme Ollama fonctionne, sans cle). '
            + 'Les axes d\'amelioration ci-dessus restent applicables a la main.'
      };
    }

    // UN SEUL appel, la ou il y en avait deux.
    //
    // Avant : un premier modele ecrivait le CV en texte, un second le
    // retapait en JSON. Le format du texte est pourtant impose par NOTRE
    // prompt (prompts/optimiseCvPdf.js) : on payait un modele pour lire une
    // structure qu'on avait nous-memes dictee, avec le risque qu'il
    // reformule le contenu au passage. Le decoupage est desormais fait en
    // JavaScript par llm/parseurs/cvOptimise.js, qui est teste et gratuit.
    const optimPrompt = buildOptimisePdfPrompt(cvText, numPages, posteCible);
    // Meme role de modele qu'avant (« extraction », rapide et bon marche) :
    // on retire un appel, on ne change pas la facture de celui qui reste.
    const texteGenere = await aiService.generate(optimPrompt, {
      tache: 'cv-optimise', role: 'extraction'
    });
    const cvOptimise = parseCvOptimise(texteGenere);

    return {
      ...base,
      cvData_optimise: cvOptimise,
      // Filet de securite : si le decoupage rate une section exotique, le
      // texte complet reste disponible. Champ optionnel, ignore par les
      // anciens resultats rejoues depuis l'historique.
      cv_optimise_texte: texteGenere,
      message: 'CV optimise'
    };
  }
}

module.exports = new CVService();
