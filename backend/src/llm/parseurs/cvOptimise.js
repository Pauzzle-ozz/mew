const { sansAccents, normaliserTitre, estLignePuce, retirerPuce, enLignes } = require('../../core/cv/texte');
const { extraireContact } = require('../../core/cv/extraireContact');
const { extraireCompetences } = require('../../core/cv/extraireCompetences');
const { decouperExperiences } = require('../../core/cv/experience');

/**
 * Lecture du CV optimise ecrit par le modele, sans second appel payant.
 *
 * POURQUOI CE FICHIER EXISTE
 * L'optimiseur faisait DEUX appels : le premier ecrivait un CV en texte, le
 * second le retapait en JSON. Le format du premier est impose par NOTRE
 * propre prompt (prompts/optimiseCvPdf.js) : « SCORE ATS: », « POINTS
 * FORTS: », « AMELIORATIONS: », puis un CV a sections. On payait donc un
 * modele pour lire un format qu'on avait nous-memes dicte — avec en prime
 * le risque qu'il reformule au passage.
 *
 * CE QU'IL DOIT GARANTIR
 * Etre PLUS tolerant que le modele qu'il remplace :
 *   - casse et accents libres (« Ameliorations », « AMÉLIORATIONS ») ;
 *   - gras et titres markdown (« **PROFIL**  », « ## Experience ») ;
 *   - titres synonymes (« Parcours professionnel », « Cursus ») ;
 *   - contenu ecrit sur la meme ligne que le titre (« LANGUES : Anglais C1 ») ;
 *   - sections absentes, ordre different, texte en trop avant ou apres.
 * Il ne leve JAMAIS d'exception et renvoie TOUJOURS toutes les cles : le
 * frontend lit `cvData_optimise.langues` sans se proteger.
 *
 * CE QU'IL NE FAIT PAS
 * Il ne devine pas la ville d'un employeur : « Acme, Paris » donne
 * l'entreprise « Acme » et une localisation vide. Un champ vide est
 * masque par l'affichage ; une ville inventee, non.
 */

/**
 * Titres de sections reconnus, du plus specifique au plus general.
 * On compare des titres NORMALISES (normaliserTitre : sans accents, en
 * majuscules, sans ponctuation, au singulier) : inutile d'ecrire les
 * pluriels, les accents ou les variantes de casse.
 *
 * L'ordre compte : « COMPETENCE COMPORTEMENTALE » doit etre teste avant
 * « COMPETENCE », sinon les qualites humaines finiraient dans les
 * competences techniques.
 */
const TITRES = [
  ['competences_soft', [
    'QUALIFICATION CLE', 'QUALIFICATION', 'SOFT SKILL', 'SAVOIR ETRE', 'SAVOIR-ETRE',
    'COMPETENCE COMPORTEMENTALE', 'COMPETENCE TRANSVERSALE', 'COMPETENCE INTERPERSONNELLE',
    'QUALITE PERSONNELLE', 'QUALITE', 'APTITUDE', 'ATOUT', 'POINT FORT'
  ]],
  ['competences_techniques', [
    'COMPETENCE TECHNIQUE', 'COMPETENCE CLE', 'COMPETENCE METIER', 'COMPETENCE PROFESSIONNELLE',
    'COMPETENCE', 'HARD SKILL', 'TECHNICAL SKILL', 'SKILL', 'TECHNOLOGIE', 'OUTIL',
    'LOGICIEL', 'LANGAGE DE PROGRAMMATION', 'ENVIRONNEMENT TECHNIQUE', 'EXPERTISE',
    'DOMAINE DE COMPETENCE', 'SAVOIR FAIRE', 'SAVOIR-FAIRE'
  ]],
  ['langues', ['LANGUE', 'LANGUE ETRANGERE', 'LANGUE PARLEE', 'LANGUAGE']],
  ['experiences', [
    'EXPERIENCE PROFESSIONNELLE', 'EXPERIENCE PRO', 'EXPERIENCE', 'PARCOURS PROFESSIONNEL',
    'PARCOURS', 'EMPLOI', 'POSTE OCCUPE', 'CARRIERE', 'MISSION', 'STAGE', 'ALTERNANCE',
    'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE', 'EMPLOYMENT HISTORY'
  ]],
  ['formations', [
    'FORMATION', 'FORMATION INITIALE', 'DIPLOME', 'ETUDE', 'CURSUS', 'SCOLARITE',
    'PARCOURS ACADEMIQUE', 'EDUCATION'
  ]],
  ['resume', [
    'PROFIL PROFESSIONNEL', 'PROFIL', 'RESUME PROFESSIONNEL', 'RESUME', 'A PROPOS',
    'A PROPOS DE MOI', 'SYNTHESE', 'SYNTHESE PROFESSIONNELLE', 'ACCROCHE', 'PRESENTATION',
    'OBJECTIF', 'OBJECTIF PROFESSIONNEL', 'EN BREF', 'SUMMARY', 'PROFILE', 'ABOUT ME'
  ]],
  ['interets', [
    'CENTRE D INTERET', 'INTERET', 'LOISIR', 'HOBBIE', 'HOBBY', 'SPORT ET LOISIR',
    'ACTIVITE EXTRA PROFESSIONNELLE', 'INTEREST'
  ]],
  // Reconnu pour ne PAS etre avale par la section precedente, meme si on
  // n'en fait rien : sans ca, les certifications atterrissaient dans les
  // competences ou dans les formations selon l'ordre du CV.
  ['autres', [
    'CERTIFICATION', 'HABILITATION', 'PROJET', 'BENEVOLAT', 'PUBLICATION',
    'DISTINCTION', 'REFERENCE', 'PERMIS', 'DIVERS', 'INFORMATION COMPLEMENTAIRE'
  ]]
];

/** Index titre normalise -> cle de section, construit une fois. */
const INDEX_TITRES = new Map();
for (const [cle, variantes] of TITRES) {
  for (const variante of variantes) {
    const normalise = normaliserTitre(variante);
    if (normalise && !INDEX_TITRES.has(normalise)) INDEX_TITRES.set(normalise, cle);
  }
}

const LONGUEUR_MAX_TITRE = 60;
const LONGUEUR_MAX_NOM = 60;

/** Ligne purement decorative : ---, ***, ___, ====, une suite de puces. */
const MOTIF_SEPARATEUR = /^[\s\-–—_=~*.·•#]{3,}$/;

const MOTIF_SCORE = /\bscore\s*(?:ats)?\s*[:=]?\s*(\d{1,3})\s*(?:\/\s*100)?\b/i;
const MOTIF_POINTS_FORTS = /^\s*points?\s*forts?\s*[:\-–—]?\s*(.*)$/i;
const MOTIF_AMELIORATIONS = /^\s*(?:axes?\s+d\s*'?\s*)?(?:points?\s+d\s*'?\s*)?ameliorations?\s*[:\-–—]?\s*(.*)$/i;
const MOTIF_LIGNE_SCORE = /^\s*score\s*ats/i;

/** Retire le gras, l'italique et les dieses de titre d'une ligne. */
function sansMarkdown(ligne) {
  return String(ligne)
    .replace(/^\s{0,3}#{1,6}\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/^\s*>\s?/, '')
    .trimEnd();
}

/** Retire un bloc de code markdown qui envelopperait toute la reponse. */
function retirerBlocDeCode(texte) {
  const trouve = texte.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?\s*```$/);
  return trouve ? trouve[1].trim() : texte;
}

const estVide = (ligne) => ligne.trim() === '';
const estSeparateur = (ligne) => MOTIF_SEPARATEUR.test(ligne.trim());

/**
 * Cette ligne est-elle un titre de section ?
 * @returns {{cle: string, reste: string}|null} `reste` = contenu ecrit sur la
 *          meme ligne (« LANGUES : Anglais C1 »), qui serait perdu sinon.
 */
function detecterTitre(ligne) {
  const nettoyee = sansMarkdown(ligne).trim();
  if (!nettoyee || nettoyee.length > LONGUEUR_MAX_TITRE) return null;
  if (/\.\s*$/.test(nettoyee)) return null;          // une phrase, pas un titre
  if (/[@]|https?:\/\//.test(nettoyee)) return null; // des coordonnees
  if (estLignePuce(nettoyee)) return null;           // un element de liste

  const direct = INDEX_TITRES.get(normaliserTitre(nettoyee));
  if (direct) return { cle: direct, reste: '' };

  const separation = nettoyee.indexOf(':');
  if (separation > 0) {
    const cle = INDEX_TITRES.get(normaliserTitre(nettoyee.slice(0, separation)));
    if (cle) return { cle, reste: nettoyee.slice(separation + 1).trim() };
  }

  return null;
}

/**
 * Lit une liste ecrite sous un marqueur (« POINTS FORTS: »).
 *
 * Tolere : les elements sur la meme ligne que le marqueur, les puces de
 * toutes formes, la numerotation, et l'absence totale de puces (le modele
 * ecrit parfois une phrase par ligne, sans rien devant).
 *
 * @returns {{items: string[], fin: number}} `fin` = index de la derniere
 *          ligne consommee.
 */
function lireListe(lignes, debut, premiereValeur) {
  const items = [];
  if (premiereValeur && premiereValeur.trim()) {
    // « POINTS FORTS: • a • b » : tout est sur la ligne du marqueur.
    for (const morceau of premiereValeur.split(/\s*[•▪●◦‣]\s*/)) {
      const propre = retirerPuce(morceau).replace(/^\d+[.)]\s*/, '').trim();
      if (propre) items.push(propre);
    }
  }

  let fin = debut;
  let avaitDesPuces = false;
  let vuLigneVide = false;

  for (let i = debut + 1; i < lignes.length; i += 1) {
    const ligne = lignes[i];
    if (estVide(ligne) || estSeparateur(ligne)) {
      // Une ligne vide n'arrete pas la liste : le modele en met souvent
      // entre les puces. C'est la premiere ligne de CONTENU non listee qui
      // l'arrete, plus bas.
      vuLigneVide = true;
      continue;
    }
    const nettoyee = sansMarkdown(ligne);
    if (estLignePuce(nettoyee) || /^\s*\d+[.)]\s/.test(nettoyee)) {
      const propre = retirerPuce(nettoyee).replace(/^\d+[.)]\s*/, '').trim();
      if (propre) { items.push(propre); fin = i; avaitDesPuces = true; }
      continue;
    }
    // Ligne sans puce : elle appartient encore a la liste seulement si elle
    // suit IMMEDIATEMENT le marqueur (modele qui n'a pas mis de puces) et
    // qu'elle n'est ni un titre de section ni un autre marqueur. La
    // condition « pas de ligne vide avant » evite le pire des cas : un
    // « POINTS FORTS: » suivi de rien, qui avalerait le nom du candidat.
    const estMarqueur = MOTIF_LIGNE_SCORE.test(nettoyee)
      || MOTIF_POINTS_FORTS.test(nettoyee)
      || MOTIF_AMELIORATIONS.test(nettoyee);
    if (items.length === 0 && !avaitDesPuces && !vuLigneVide && !estMarqueur
        && !detecterTitre(nettoyee) && nettoyee.trim().length <= 200) {
      items.push(nettoyee.trim());
      fin = i;
      continue;
    }
    break;
  }

  return { items, fin };
}

/**
 * Contenu ecrit apres un marqueur, AVEC ses accents.
 *
 * Les marqueurs sont cherches sur une copie sans accents (« AMÉLIORATIONS »
 * doit matcher « ameliorations »). Comme sansAccents() remplace un caractere
 * par un caractere, les positions sont identiques : on peut donc couper la
 * ligne d'ORIGINE a la meme longueur et garder « Amélioré la couverture ».
 */
function resteApresMarqueur(ligne, correspondance) {
  const reste = correspondance[correspondance.length - 1] || '';
  return reste ? ligne.slice(ligne.length - reste.length) : '';
}

/**
 * Separe l'en-tete d'evaluation (score, points forts, ameliorations) du CV
 * lui-meme. Si aucun marqueur n'est trouve, tout le texte est le CV : mieux
 * vaut un CV sans evaluation qu'une evaluation qui mange le CV.
 */
function separerEvaluation(lignes) {
  let score = null;
  let pointsForts = [];
  let ameliorations = [];
  let derniereLigneEntete = -1;

  for (let i = 0; i < lignes.length; i += 1) {
    const ligne = sansMarkdown(lignes[i]);
    const sansAccent = sansAccents(ligne);

    if (score === null && MOTIF_LIGNE_SCORE.test(sansAccent)) {
      const trouve = MOTIF_SCORE.exec(sansAccent);
      if (trouve) {
        const valeur = Number(trouve[1]);
        if (valeur >= 0 && valeur <= 100) score = valeur;
      }
      derniereLigneEntete = Math.max(derniereLigneEntete, i);
      continue;
    }

    if (pointsForts.length === 0) {
      const marqueur = MOTIF_POINTS_FORTS.exec(sansAccent);
      // On n'accepte le marqueur qu'en TETE de reponse : « POINTS FORTS »
      // est aussi un titre de section de CV. Au-dela de l'en-tete, c'est
      // une section, pas l'evaluation.
      if (marqueur && i <= derniereLigneEntete + 6) {
        const lu = lireListe(lignes, i, resteApresMarqueur(ligne, marqueur));
        pointsForts = lu.items;
        derniereLigneEntete = Math.max(derniereLigneEntete, lu.fin, i);
        continue;
      }
    }

    if (ameliorations.length === 0) {
      const marqueur = MOTIF_AMELIORATIONS.exec(sansAccent);
      if (marqueur && i <= derniereLigneEntete + 6) {
        const lu = lireListe(lignes, i, resteApresMarqueur(ligne, marqueur));
        ameliorations = lu.items;
        derniereLigneEntete = Math.max(derniereLigneEntete, lu.fin, i);
        continue;
      }
    }

    // Une ligne de contenu apres l'en-tete : le CV commence.
    if (derniereLigneEntete !== -1 && i > derniereLigneEntete && !estVide(ligne) && !estSeparateur(ligne)) {
      break;
    }
  }

  return {
    score,
    pointsForts,
    ameliorations,
    lignesCv: lignes.slice(derniereLigneEntete + 1)
  };
}

/**
 * Repartit les lignes du CV par section. Tout ce qui precede le premier
 * titre est l'en-tete (nom, titre du poste, coordonnees).
 */
function decouper(lignes) {
  const sections = {
    entete: [], resume: [], experiences: [], formations: [],
    competences_techniques: [], competences_soft: [], langues: [], interets: [], autres: []
  };

  let courante = 'entete';
  for (const ligne of lignes) {
    if (estSeparateur(ligne)) continue;
    const titre = detecterTitre(ligne);
    if (titre) {
      courante = titre.cle;
      if (titre.reste) sections[courante].push(titre.reste);
      continue;
    }
    sections[courante].push(sansMarkdown(ligne));
  }

  const texte = {};
  for (const cle of Object.keys(sections)) {
    texte[cle] = sections[cle].join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  return texte;
}

/**
 * Prenom et nom depuis l'en-tete.
 * Gere « Jean Dupont », « DUPONT Jean », « Nom : Jean Dupont » et le gras.
 */
function lireIdentite(entete) {
  for (const brute of enLignes(entete)) {
    let ligne = sansMarkdown(brute).trim();
    if (!ligne || ligne.length > LONGUEUR_MAX_NOM) continue;
    if (/[@]|https?:\/\/|\d/.test(ligne)) continue;      // coordonnees, dates
    ligne = ligne.replace(/^(?:nom(?:\s+complet)?|candidat|identite)\s*[:\-]\s*/i, '');
    ligne = ligne.replace(/[.,;:]+$/, '').trim();

    const mots = ligne.split(/\s+/).filter(Boolean);
    if (mots.length < 2 || mots.length > 4) continue;

    // « DUPONT Jean » : le nom de famille en capitales vient en premier.
    const premierEnCapitales = mots[0] === mots[0].toUpperCase() && mots[0].length > 1;
    const suivantEnCapitales = mots[1] === mots[1].toUpperCase() && mots[1].length > 1;
    if (premierEnCapitales && !suivantEnCapitales) {
      return { prenom: mots.slice(1).join(' '), nom: mots[0] };
    }
    return { prenom: mots[0], nom: mots.slice(1).join(' ') };
  }
  return { prenom: '', nom: '' };
}

/**
 * Intitule de poste : la ligne d'en-tete qui suit le nom, si elle ressemble
 * a un titre. Sinon on prendra le poste le plus recent (fait par l'appelant).
 */
function lireTitrePoste(entete, identite) {
  const lignes = enLignes(entete).map((l) => sansMarkdown(l).trim()).filter(Boolean);
  const nomComplet = `${identite.prenom} ${identite.nom}`.trim().toLowerCase();

  for (const ligne of lignes) {
    const nettoyee = ligne.replace(/[.,;:]+$/, '').trim();
    if (!nettoyee || nettoyee.length < 3 || nettoyee.length > 80) continue;
    if (nettoyee.toLowerCase() === nomComplet) continue;
    if (/@|https?:\/\/|linkedin|github/i.test(nettoyee)) continue;
    if ((nettoyee.match(/\d/g) || []).length >= 4) continue; // telephone, code postal
    if (/\b(19|20)\d{2}\b/.test(nettoyee)) continue;         // une annee
    return nettoyee.replace(/^(?:titre|poste)\s*[:\-]\s*/i, '').trim();
  }
  return '';
}

/** '2022-03' -> '03/2022'. Une periode ouverte devient « Aujourd'hui ». */
function formaterDate(valeur) {
  if (!valeur) return '';
  const trouve = /^(\d{4})-(\d{2})$/.exec(String(valeur));
  return trouve ? `${trouve[2]}/${trouve[1]}` : String(valeur);
}

/**
 * Date d'un diplome.
 *
 * Un CV ecrit « 2018 », jamais « janvier 2018 ». Quand le mois n'etait pas
 * ecrit, le coeur retombe sur janvier et une duree d'un seul mois : on
 * reconnait ce cas et on n'affiche que l'annee, plutot que d'inventer une
 * precision que le candidat n'a pas donnee.
 */
function dateDiplome(periode) {
  if (!periode) return '';
  const valeur = periode.fin || periode.debut;
  if (!valeur) return '';
  if (periode.debut === periode.fin && periode.mois === 1 && /-01$/.test(valeur)) {
    return valeur.slice(0, 4);
  }
  return formaterDate(valeur);
}

/** Les lignes d'une section, debarrassees de leurs puces, une par ligne. */
function lignesUtiles(texte) {
  return enLignes(texte)
    .map((ligne) => retirerPuce(sansMarkdown(ligne)).replace(/^\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Transforme le texte genere par le modele en objet CV structure.
 *
 * @param {string} texte
 * @returns {Object} toujours toutes les cles, jamais d'exception
 */
function parseCvOptimise(texte) {
  const vide = {
    score_ats: null,
    points_forts: [],
    ameliorations: [],
    prenom: '', nom: '', titre_poste: '', email: '', telephone: '', adresse: '', linkedin: '',
    resume: '',
    experiences: [],
    formations: [],
    competences_techniques: '',
    competences_soft: '',
    langues: '',
    interets: ''
  };

  if (typeof texte !== 'string' || texte.trim() === '') return vide;

  const contenu = retirerBlocDeCode(texte.replace(/\r\n?/g, '\n').trim());
  const evaluation = separerEvaluation(enLignes(contenu));
  const sections = decouper(evaluation.lignesCv);
  const texteCv = evaluation.lignesCv.join('\n');

  const contact = extraireContact(texteCv);
  const identite = lireIdentite(sections.entete);

  const experiences = decouperExperiences(sections.experiences).map((bloc) => ({
    poste: bloc.intitule || '',
    entreprise: bloc.entreprise || '',
    // Volontairement vide : voir le commentaire en tete de fichier.
    localisation: '',
    date_debut: bloc.periode ? formaterDate(bloc.periode.debut) : '',
    date_fin: bloc.periode
      ? (bloc.periode.fin ? formaterDate(bloc.periode.fin) : "Aujourd'hui")
      : '',
    description: bloc.description || ''
  }));

  const formations = decouperExperiences(sections.formations).map((bloc) => ({
    diplome: bloc.intitule || '',
    etablissement: bloc.entreprise || '',
    localisation: '',
    date_fin: dateDiplome(bloc.periode)
  }));

  const titrePoste = lireTitrePoste(sections.entete, identite)
    || (experiences[0] && experiences[0].poste)
    || '';

  return {
    // L'evaluation du modele est conservee pour information : cvService la
    // remplace par le score ATS calcule en local, qui est verifiable.
    score_ats: evaluation.score,
    points_forts: evaluation.pointsForts,
    ameliorations: evaluation.ameliorations,

    prenom: identite.prenom,
    nom: identite.nom,
    titre_poste: titrePoste,
    email: contact.email,
    telephone: contact.telephone,
    adresse: [contact.codePostal, contact.ville].filter(Boolean).join(' '),
    linkedin: contact.linkedin,

    resume: sections.resume,
    experiences,
    formations,
    // Les competences techniques sont une enumeration : on la remet a plat.
    competences_techniques: extraireCompetences(sections.competences_techniques).join(', '),
    // Les qualifications sont des PHRASES (notre prompt en demande 5 a 7) :
    // les couper aux virgules les detruirait. Une par ligne, comme ecrit.
    competences_soft: lignesUtiles(sections.competences_soft).join('\n'),
    langues: extraireCompetences(sections.langues).join(', '),
    interets: extraireCompetences(sections.interets).join(', ')
  };
}

module.exports = { parseCvOptimise };
