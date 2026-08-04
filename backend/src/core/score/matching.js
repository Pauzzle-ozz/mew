'use strict';

/**
 * Score de correspondance entre un CV et une offre d'emploi.
 *
 * POURQUOI CE FICHIER EXISTE
 * Avant, le score affiche a l'utilisateur venait du modele de langage, alors
 * que le prompt qui le produisait contenait la consigne « atteindre un score
 * minimum de 80/100 ». Le chiffre ne mesurait donc pas la correspondance entre
 * le candidat et l'offre : il mesurait l'obeissance du modele. Ici tout est
 * calcule localement, sans reseau, et le meme couple (CV, offre) donne
 * toujours exactement le meme resultat.
 *
 * POURQUOI AUCUN DICTIONNAIRE DE COMPETENCES NE FILTRE QUOI QUE CE SOIT
 * Un dictionnaire de « competences connues » ne contient jamais « aide a la
 * toilette », « pose de placo » ou « plan de tournee ». Il ferait donc scorer
 * a zero un infirmier, un plombier ou un commercial parfaitement qualifies.
 * Ici on part TOUJOURS des mots de l'offre et on les cherche dans le CV :
 * aucun metier n'est privilegie.
 */

// ---------------------------------------------------------------------------
// 1. Dependances vers core/texte
// ---------------------------------------------------------------------------

// Rien n'est reecrit ici : la comparaison de chaines vit dans core/texte, et
// ce fichier ne fait que l'utiliser. Le partage compte : si un jour quelqu'un
// ameliore la lemmatisation, le score en profite sans etre touche.
const { normaliser } = require('../texte/normaliser');
const { jaroWinkler, dice } = require('../texte/similarite');
const { tokeniser } = require('../texte/tokeniser');
const { lemmatiser } = require('../texte/lemmatiserFr');

// ---------------------------------------------------------------------------
// 2. Preparation du texte
// ---------------------------------------------------------------------------

/**
 * `normaliser` conserve volontairement la ponctuation (c'est au tokeniseur
 * d'en decider). Ici on a besoin d'une version « aplatie » ou la ponctuation
 * devient un espace : elle sert a chercher une expression entiere dans le CV
 * (« aide a la toilette »). On garde + # . _ & a l'interieur des mots, sinon
 * c++, c# et node.js disparaissent.
 */
function aplatir(valeur) {
  if (valeur === null || valeur === undefined) return '';
  return normaliser(String(valeur))
    .replace(/[^a-z0-9+#._&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tous les mots d'un texte, mots vides compris.
 *
 * `garderStopwords` est indispensable pour les intitules de poste : c'est le
 * « de » qui distingue « chef de projet » de « chef produit ». Et
 * `longueurMinimale: 1` garde les noms de competences d'une lettre, comme le
 * langage R.
 */
function motsDe(valeur) {
  return tokeniser(String(valeur === null || valeur === undefined ? '' : valeur), {
    garderStopwords: true,
    longueurMinimale: 1
  });
}

/**
 * Lemmatisation du francais, plus une seule regle en complement.
 *
 * core/texte/lemmatiserFr.js s'interdit volontairement le feminin en -ante
 * (« attente » deviendrait « attent »). Mais sans cette regle,
 * « aide-soignante » et « aide-soignant » restent deux metiers differents aux
 * yeux du score, et c'est exactement le genre d'injustice qu'on veut eviter.
 * On ne l'applique donc qu'ici, sur des mots d'au moins 7 lettres : les deux
 * cotes de la comparaison y passent, donc aucune correspondance ne se perd.
 */
function lemme(mot) {
  const base = lemmatiser(mot);
  if (base.length >= 7 && /[ae]nte$/.test(base)) return base.slice(0, -1);
  return base;
}

// Mots outils : ils ne portent aucun sens metier, on n'exige donc pas de les
// retrouver dans le CV. Attention, ils restent comptes dans la comparaison des
// intitules : c'est ce qui fait la difference entre « chef de projet » et
// « chef de produit » (0.67 et non 0.5).
const MOTS_LIAISON = new Set([
  'de', 'du', 'des', 'd', 'le', 'la', 'les', 'l', 'un', 'une', 'et', 'ou',
  'en', 'a', 'au', 'aux', 'pour', 'sur', 'sous', 'avec', 'dans', 'par', 'the',
  'of', 'and', 'chez', 'vers'
]);

// ---------------------------------------------------------------------------
// 3. Lecture defensive des entrees
// ---------------------------------------------------------------------------

/**
 * profil et exigences viennent d'autres modules dont les noms de champs
 * peuvent evoluer. On accepte donc plusieurs orthographes plutot que de
 * renvoyer un score de 0 parce qu'une cle s'appelle autrement.
 */
function premierChamp(objet, noms) {
  if (!objet || typeof objet !== 'object') return undefined;
  for (const nom of noms) {
    const valeur = objet[nom];
    if (valeur !== undefined && valeur !== null && valeur !== '') return valeur;
  }
  return undefined;
}

const CLES_LIBELLE = ['libelle', 'terme', 'nom', 'texte', 'competence', 'mot', 'valeur', 'label', 'intitule'];

/**
 * Accepte une chaine « a, b, c », un tableau de chaines, ou un tableau
 * d'objets { libelle, poids }. Retourne toujours [{ libelle, poids }].
 */
function extraireTermes(valeur) {
  if (valeur === null || valeur === undefined) return [];

  if (typeof valeur === 'string') {
    return valeur
      .split(/[,;\n\r|•\/]+/)
      .map((morceau) => morceau.trim())
      .filter((morceau) => morceau.length > 0)
      .map((libelle) => ({ libelle, poids: 1 }));
  }

  if (Array.isArray(valeur)) {
    const resultat = [];
    for (const element of valeur) {
      if (typeof element === 'string') {
        resultat.push(...extraireTermes(element));
      } else if (element && typeof element === 'object') {
        const libelle = premierChamp(element, CLES_LIBELLE);
        if (typeof libelle === 'string' && libelle.trim()) {
          resultat.push({ libelle: libelle.trim(), poids: poidsExigence(element) });
        }
      }
    }
    return resultat;
  }

  return [];
}

/**
 * Une exigence marquee obligatoire pese deux fois plus qu'une exigence
 * « appreciee ». Si l'extracteur ne fournit pas l'information, tout pese 1.
 */
function poidsExigence(element) {
  if (element.obligatoire === true || element.requis === true) return 2;
  const poids = Number(premierChamp(element, ['poids', 'importance']));
  if (Number.isFinite(poids) && poids > 0) return poids;
  return 1;
}

function nombreOuNull(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const n = Number(valeur);
  if (Number.isFinite(n) && n >= 0) return n;
  // « 3 ans », « 3-5 ans », « minimum 2 ans » : on prend le premier nombre.
  const trouve = String(valeur).match(/\d+([.,]\d+)?/);
  if (!trouve) return null;
  const extrait = Number(trouve[0].replace(',', '.'));
  return Number.isFinite(extrait) && extrait >= 0 ? extrait : null;
}

// ---------------------------------------------------------------------------
// 4. Index du CV : tout le texte du candidat, pas seulement ses « competences »
// ---------------------------------------------------------------------------

const CLES_COMPETENCES = [
  'competences', 'competencesTechniques', 'competences_techniques',
  'competencesSoft', 'competences_soft', 'savoirFaire', 'savoir_faire',
  'savoirEtre', 'savoir_etre', 'outils', 'logiciels', 'langues',
  'motsCles', 'mots_cles', 'certifications', 'qualites'
];

const CLES_TITRE = ['titre', 'titrePoste', 'titre_poste', 'intitule', 'poste', 'metier', 'title'];

/**
 * Construit tout ce dont on a besoin pour chercher un terme dans un CV.
 *
 * Point cle pour les profils non-tech : on ratisse le CV ENTIER (experiences,
 * missions, formations, resume), pas seulement une rubrique « competences ».
 * Un aide-soignant ecrit « aide a la toilette » dans le descriptif de son
 * poste, pas dans une liste a puces de savoir-faire.
 */
function indexerProfil(profil) {
  const source = (profil && typeof profil === 'object') ? profil : {};
  const termes = new Set();   // competences declarees, normalisees
  const morceaux = [];        // tout le texte du CV
  const titres = [];          // titre principal + intitules de postes occupes

  // La profondeur est bornee : le profil vient d'un PDF ou d'une reponse de
  // modele, on ne lui fait pas confiance pour etre bien forme.
  const ajouterTexte = (valeur, profondeur = 0) => {
    if (!valeur || profondeur > 6) return;
    if (typeof valeur === 'string' || typeof valeur === 'number') {
      morceaux.push(String(valeur));
    } else if (Array.isArray(valeur)) {
      valeur.forEach((element) => ajouterTexte(element, profondeur + 1));
    } else if (typeof valeur === 'object') {
      Object.values(valeur).forEach((element) => ajouterTexte(element, profondeur + 1));
    }
  };

  for (const cle of CLES_COMPETENCES) {
    if (source[cle] === undefined) continue;
    for (const terme of extraireTermes(source[cle])) {
      const norme = aplatir(terme.libelle);
      if (norme) termes.add(norme);
    }
    ajouterTexte(source[cle]);
  }

  const titrePrincipal = premierChamp(source, CLES_TITRE);
  if (typeof titrePrincipal === 'string') {
    titres.push(titrePrincipal);
    ajouterTexte(titrePrincipal);
  }

  const experiences = premierChamp(source, ['experiences', 'experience', 'postes']);
  if (Array.isArray(experiences)) {
    for (const exp of experiences) {
      if (!exp) continue;
      if (typeof exp === 'string') {
        ajouterTexte(exp);
        continue;
      }
      const titreExp = premierChamp(exp, CLES_TITRE);
      if (typeof titreExp === 'string') titres.push(titreExp);
      ajouterTexte(exp);
    }
  }

  ajouterTexte(premierChamp(source, ['formations', 'formation', 'diplomes']));
  ajouterTexte(premierChamp(source, ['resume', 'accroche', 'profil', 'presentation', 'texte', 'texteBrut', 'texte_brut']));

  const texte = ` ${morceaux.map((m) => aplatir(m)).filter(Boolean).join(' ')} `;
  const mots = new Set();
  const lemmes = new Set();
  for (const mot of texte.split(' ')) {
    const propre = mot.replace(/^\.+|\.+$/g, '');
    if (!propre) continue;
    mots.add(propre);
    lemmes.add(lemme(propre));
  }
  // Les competences declarees sont aussi des mots cherchables.
  for (const terme of termes) {
    for (const mot of terme.split(' ')) {
      if (!mot) continue;
      mots.add(mot);
      lemmes.add(lemme(mot));
    }
  }

  // `brut` = l'objet profil d'origine, encore utile pour lire des champs
  // numeriques (annees d'experience) ou le niveau de diplome.
  return { termes, texte, mots, lemmes, titres, brut: source };
}

/**
 * Un mot de l'offre est-il present dans le CV ?
 * Trois filets successifs : le mot exact, sa forme lemmatisee, puis une
 * tolerance aux fautes de frappe (kubernets -> kubernetes).
 */
function motPresent(mot, index) {
  if (index.mots.has(mot)) return 'exact';
  if (index.lemmes.has(lemme(mot))) return 'lemme';

  // Jaro-Winkler seulement a partir de 5 caracteres : en dessous il rapproche
  // des mots qui n'ont rien a voir (« php » et « pdf », « sql » et « ssl »).
  if (mot.length >= 5) {
    for (const candidat of index.mots) {
      if (Math.abs(candidat.length - mot.length) > 2) continue;
      if (candidat.length < 4) continue;
      if (jaroWinkler(mot, candidat) >= 0.92) return 'approx';
    }
  }
  return null;
}

/**
 * Dans quelle mesure une exigence est-elle couverte par le CV ?
 * Renvoie une part entre 0 et 1, ou null si le terme est inexploitable.
 *
 * POURQUOI UNE PART ET PAS UN OUI/NON
 * L'extracteur d'offre produit beaucoup de groupes de mots qui se chevauchent
 * (« transferts des personnes », « personnes a mobilite », « mobilite
 * reduite » sortent tous de la meme phrase). En tout ou rien, un candidat qui
 * ecrit « transferts et manutention » perdrait ces trois lignes d'un coup et
 * son score s'effondrerait pour une question de formulation, pas de
 * competence. La part de mots retrouves est bien plus proche de la realite.
 */
const PART_MINIMALE_COMMUNE = 0.5;

function couvertureExigence(libelle, index) {
  const norme = aplatir(libelle);
  if (!norme) return null;

  // L'expression entiere figure dans le CV : rien de plus a chercher.
  if (index.termes.has(norme) || index.texte.includes(` ${norme} `)) return 1;

  const mots = motsDe(norme).filter((mot) => mot && !MOTS_LIAISON.has(mot) && !BRUIT_INTITULE.has(mot));
  if (mots.length === 0) return null;

  let trouves = 0;
  for (const mot of mots) {
    if (motPresent(mot, index)) trouves += 1;
  }
  return trouves / mots.length;
}

// ---------------------------------------------------------------------------
// 5. Intitules
// ---------------------------------------------------------------------------

// Bruit systematique des titres d'annonces : il ne dit rien du metier.
const BRUIT_INTITULE = new Set([
  'h', 'f', 'm', 'x', 'w', 'hf', 'fh', 'hfx',
  'cdi', 'cdd', 'stage', 'stagiaire', 'alternance', 'alternant', 'apprentissage',
  'interim', 'freelance', 'temps', 'plein', 'partiel', 'urgent', 'recrute',
  'poste', 'offre', 'emploi', 'job', 'annonce'
]);

/**
 * On lemmatise aussi les intitules, sinon « aide-soignante » et
 * « aide-soignant » ne feraient que 0.5 alors que c'est le meme metier.
 * Ca ne rapproche pas pour autant « projet » et « produit » : la
 * lemmatisation supprime des terminaisons, elle n'invente pas de synonymes.
 */
function motsIntitule(valeur) {
  return motsDe(valeur)
    .filter((mot) => !BRUIT_INTITULE.has(mot))
    .map((mot) => lemme(mot));
}

// ---------------------------------------------------------------------------
// 6. Diplomes
// ---------------------------------------------------------------------------

// Echelle ordonnee. Comparer « master » et « bts » n'a de sens que sur une
// echelle : c'est ce qui evite de traiter un diplome comme un mot-cle.
const NIVEAUX = [
  { niveau: 6, libelle: 'doctorat', motifs: [/doctorat/, /\bphd\b/, /these/, /bac\s*\+\s*8/] },
  { niveau: 5, libelle: 'master ou ingenieur', motifs: [/master/, /mastere/, /ingenieur/, /\bmba\b/, /\bdea\b/, /\bdess\b/, /magistere/, /bac\s*\+\s*5/] },
  { niveau: 4, libelle: 'licence', motifs: [/licence/, /bachelor/, /maitrise/, /bac\s*\+\s*[34]/] },
  // « but » = Bachelor Universitaire de Technologie, mais c'est aussi un mot
  // courant : on l'ignore quand il est suivi de « de » (« dans le but de »).
  { niveau: 3, libelle: 'bts ou dut', motifs: [/\bbts\b/, /\bdut\b/, /\bdeug\b/, /\bdeust\b/, /\bbut\b(?!\s+d)/, /bac\s*\+\s*2/] },
  // « bac » seul ne doit pas se declencher sur « bac+5 », sinon une offre qui
  // exige un master serait lue comme exigeant le bac.
  { niveau: 2, libelle: 'bac', motifs: [/baccalaureat/, /bac\s*pro/, /diplome d etat/, /\bdeas\b/, /\bdeaes\b/, /\bbac\b(?!\s*\+)/] },
  { niveau: 1, libelle: 'cap ou bep', motifs: [/\bcap\b/, /\bbep\b/, /\bcapa\b/, /\bmc\b/] },
  { niveau: 0, libelle: 'sans diplome', motifs: [/sans diplome/, /aucun diplome/] }
];

/**
 * @param {*} valeur texte ou nombre
 * @param {'min'|'max'} mode min pour une offre (elle annonce un plancher),
 *   max pour un CV (on retient le plus haut diplome obtenu).
 */
function detecterNiveau(valeur, mode) {
  if (valeur === null || valeur === undefined) return null;

  if (typeof valeur === 'number' && Number.isFinite(valeur)) {
    // Interprete comme un « bac + N ».
    if (valeur >= 8) return 6;
    if (valeur >= 5) return 5;
    if (valeur >= 3) return 4;
    if (valeur >= 2) return 3;
    return 2;
  }

  let texte;
  if (typeof valeur === 'string') {
    texte = aplatir(valeur);
  } else if (Array.isArray(valeur) || typeof valeur === 'object') {
    const morceaux = [];
    const parcourir = (v) => {
      if (typeof v === 'string' || typeof v === 'number') morceaux.push(String(v));
      else if (Array.isArray(v)) v.forEach(parcourir);
      else if (v && typeof v === 'object') Object.values(v).forEach(parcourir);
    };
    parcourir(valeur);
    texte = aplatir(morceaux.join(' '));
  } else {
    return null;
  }
  if (!texte) return null;

  const trouves = [];
  for (const entree of NIVEAUX) {
    if (entree.motifs.some((motif) => motif.test(texte))) trouves.push(entree.niveau);
  }
  if (trouves.length === 0) return null;
  return mode === 'min' ? Math.min(...trouves) : Math.max(...trouves);
}

function libelleNiveau(niveau) {
  const entree = NIVEAUX.find((e) => e.niveau === niveau);
  return entree ? entree.libelle : 'non precise';
}

// ---------------------------------------------------------------------------
// 7. Le score
// ---------------------------------------------------------------------------

const POIDS_BASE = {
  competences: 50,
  intitule: 20,
  experience: 15,
  diplome: 15
};

const LIBELLES = {
  competences: 'Competences demandees par l\'offre',
  intitule: 'Proximite avec l\'intitule du poste',
  experience: 'Annees d\'experience',
  diplome: 'Niveau de diplome'
};

const ORDRE = ['competences', 'intitule', 'experience', 'diplome'];

function arrondir(valeur, decimales = 1) {
  const facteur = 10 ** decimales;
  return Math.round(valeur * facteur) / facteur;
}

/**
 * Calcule la correspondance entre un profil et les exigences d'une offre.
 *
 * @param {Object} profil     sortie de core/cv/profil.js (objet partiel accepte)
 * @param {Object} exigences  sortie de core/offre/extraireExigences.js
 * @param {Object} [options]  { intituleOffre } : secours si l'offre n'a pas d'intitule
 * @returns {{score:number, criteres:Array, competencesCommunes:Array,
 *            competencesManquantes:Array, actions:Array}}
 */
function scoreMatching(profil, exigences, options = {}) {
  const opt = (options && typeof options === 'object') ? options : {};
  const source = (exigences && typeof exigences === 'object') ? exigences : {};
  const index = indexerProfil(profil);

  const mesures = {};

  // --- 1. Couverture des mots-cles de l'offre ------------------------------
  const brutesCompetences = premierChamp(source, [
    'competences', 'competencesTechniques', 'competences_techniques',
    'motsCles', 'mots_cles', 'savoirFaire', 'savoir_faire', 'exigences', 'termes'
  ]);

  const exigees = [];
  const dejaVues = new Set();
  for (const terme of extraireTermes(brutesCompetences)) {
    const norme = aplatir(terme.libelle);
    if (!norme || dejaVues.has(norme)) continue;
    // « h/f », « cdi », « stage » traversent parfois l'extraction. Ce ne sont
    // pas des competences, et pour aucun metier : les demander au candidat
    // n'aurait aucun sens.
    if (motsDe(norme).every((mot) => BRUIT_INTITULE.has(mot))) continue;
    dejaVues.add(norme);
    exigees.push(terme);
  }

  const competencesCommunes = [];
  const competencesManquantes = [];
  let poidsTrouves = 0;
  let poidsTotal = 0;

  for (const terme of exigees) {
    const part = couvertureExigence(terme.libelle, index);
    if (part === null) continue; // terme inexploitable : ni compte, ni reproche
    poidsTotal += terme.poids;
    poidsTrouves += terme.poids * part;
    if (part >= PART_MINIMALE_COMMUNE) competencesCommunes.push(terme.libelle);
    else competencesManquantes.push(terme.libelle);
  }

  // Moins de 3 competences identifiables : l'offre ne dit pas assez pour que
  // ce signal veuille dire quelque chose.
  const nbExigees = competencesCommunes.length + competencesManquantes.length;
  mesures.competences = {
    applicable: nbExigees >= 3,
    ratio: poidsTotal > 0 ? poidsTrouves / poidsTotal : 0,
    detail: nbExigees === 0
      ? 'Aucune competence identifiable dans l\'offre.'
      : `${competencesCommunes.length} des ${nbExigees} competences de l'offre sont presentes dans le CV.`
  };

  // --- 2. Proximite des intitules -----------------------------------------
  const intituleOffreBrut = premierChamp(source, [...CLES_TITRE, 'intituleOffre', 'titreOffre'])
    || opt.intituleOffre
    || '';
  const motsOffre = motsIntitule(intituleOffreBrut);

  let meilleurIntitule = 0;
  let intituleCompare = '';
  for (const titre of index.titres) {
    const motsCandidat = motsIntitule(titre);
    if (motsCandidat.length === 0) continue;
    const valeur = Number(dice(motsOffre, motsCandidat));
    if (Number.isFinite(valeur) && valeur > meilleurIntitule) {
      meilleurIntitule = valeur;
      intituleCompare = String(titre).trim();
    }
    if (!intituleCompare) intituleCompare = String(titre).trim();
  }

  const intituleMesurable = motsOffre.length > 0 && index.titres.some((t) => motsIntitule(t).length > 0);
  mesures.intitule = {
    applicable: intituleMesurable,
    ratio: Math.max(0, Math.min(1, meilleurIntitule)),
    detail: intituleMesurable
      ? `« ${String(intituleOffreBrut).trim()} » compare a « ${intituleCompare} ».`
      : 'Intitule absent de l\'offre ou du CV.'
  };

  // --- 3. Annees d'experience ---------------------------------------------
  const CLES_ANNEES = [
    'anneesExperience', 'annees_experience', 'experienceAnnees', 'experience_annees',
    'anneesExperienceMin', 'experienceMin', 'experience_min', 'annees', 'experienceTotale'
  ];
  const anneesExigees = nombreOuNull(premierChamp(source, CLES_ANNEES));
  const anneesProfil = nombreOuNull(premierChamp(index.brut, CLES_ANNEES));

  // Deux raisons distinctes de neutraliser, et c'est volontaire :
  // - l'offre ne demande rien : le critere n'existe pas ;
  // - le CV ne dit rien : c'est NOTRE extraction qui a echoue, pas le
  //   candidat qui est mauvais. Mettre 0 punirait une panne d'outil.
  const experienceMesurable = anneesExigees !== null && anneesExigees > 0 && anneesProfil !== null;
  mesures.experience = {
    applicable: experienceMesurable,
    ratio: experienceMesurable ? Math.min(1, anneesProfil / anneesExigees) : 0,
    detail: anneesExigees === null || anneesExigees === 0
      ? 'L\'offre ne mentionne aucune duree d\'experience.'
      : (anneesProfil === null
        ? 'Aucune duree d\'experience lisible dans le CV.'
        : `${anneesProfil} an(s) au CV pour ${anneesExigees} an(s) demande(s).`),
    exigees: anneesExigees,
    possedees: anneesProfil
  };

  // --- 4. Niveau de diplome ------------------------------------------------
  const CLES_DIPLOME = ['niveauDiplome', 'niveau_diplome', 'diplome', 'diplomes', 'niveauEtudes', 'niveau_etudes', 'formation', 'formations'];
  const niveauExige = detecterNiveau(premierChamp(source, CLES_DIPLOME), 'min');
  const niveauProfil = detecterNiveau(premierChamp(index.brut, CLES_DIPLOME), 'max');

  const diplomeMesurable = niveauExige !== null && niveauProfil !== null;
  let ratioDiplome = 0;
  if (diplomeMesurable) {
    // Surqualifie = 100 %, jamais penalise. En dessous, on retire un quart
    // par cran manquant : un BTS face a « master demande » n'est pas a zero.
    const ecart = Math.max(0, niveauExige - niveauProfil);
    ratioDiplome = Math.max(0, 1 - 0.25 * ecart);
  }
  mesures.diplome = {
    applicable: diplomeMesurable,
    ratio: ratioDiplome,
    detail: niveauExige === null
      ? 'L\'offre ne mentionne aucun diplome.'
      : (niveauProfil === null
        ? 'Aucun diplome lisible dans le CV.'
        : `Niveau ${libelleNiveau(niveauProfil)} au CV pour ${libelleNiveau(niveauExige)} demande.`),
    niveauExige,
    niveauProfil
  };

  // --- Neutralisation puis redistribution ---------------------------------
  // Sans cette etape, une offre laconique ecrase le score de tout le monde :
  // 50 points sur 100 seraient perdus d'avance et le chiffre ne voudrait
  // plus rien dire.
  const applicables = ORDRE.filter((id) => mesures[id].applicable);
  const sommePoidsBase = applicables.reduce((total, id) => total + POIDS_BASE[id], 0);

  const criteres = ORDRE.map((id) => {
    const mesure = mesures[id];
    const poidsEffectif = (mesure.applicable && sommePoidsBase > 0)
      ? (POIDS_BASE[id] * 100) / sommePoidsBase
      : 0;
    return {
      id,
      libelle: LIBELLES[id],
      poids: arrondir(poidsEffectif),
      obtenu: arrondir(poidsEffectif * mesure.ratio),
      applicable: mesure.applicable,
      detail: mesure.detail,
      // Extras utiles a l'affichage (barre de progression, mention du poids
      // d'origine quand un critere a ete neutralise).
      ratio: arrondir(mesure.ratio, 3),
      poidsBase: POIDS_BASE[id]
    };
  });

  const score = Math.max(0, Math.min(100, Math.round(
    criteres.reduce((total, critere) => total + critere.obtenu, 0)
  )));

  const actions = construireActions({
    criteres, mesures, competencesManquantes, competencesCommunes,
    nbExigees, intituleOffre: String(intituleOffreBrut).trim(),
    intituleProfil: intituleCompare, applicables
  });

  return { score, criteres, competencesCommunes, competencesManquantes, actions };
}

// ---------------------------------------------------------------------------
// 8. Actions : ce qui aide vraiment l'utilisateur
// ---------------------------------------------------------------------------

/**
 * Un score seul n'a jamais fait progresser personne. « 8 des 9 competences
 * demandees, il te manque kubernetes » se lit et se corrige en une minute.
 * Chaque action porte le nombre de points qu'elle peut faire gagner, ce qui
 * permet a l'interface de les trier sans rien recalculer.
 */
function construireActions(contexte) {
  const {
    criteres, mesures, competencesManquantes, competencesCommunes,
    nbExigees, intituleOffre, intituleProfil, applicables
  } = contexte;

  const parId = Object.fromEntries(criteres.map((critere) => [critere.id, critere]));
  const actions = [];

  const ajouter = (id, message, gainBrut) => {
    const gain = Math.max(0, arrondir(gainBrut, 0));
    actions.push({
      id: `action-${id}`,
      critere: id,
      priorite: gain >= 12 ? 'haute' : (gain >= 5 ? 'moyenne' : 'basse'),
      message,
      gain
    });
  };

  // Competences manquantes : l'action la plus concrete du lot.
  if (competencesManquantes.length > 0) {
    const listees = competencesManquantes.slice(0, 5).join(', ');
    const reste = competencesManquantes.length > 5
      ? ` (et ${competencesManquantes.length - 5} autre(s))`
      : '';
    const message = `${competencesCommunes.length} des ${nbExigees} competences demandees sont dans ton CV. `
      + `Il manque : ${listees}${reste}. Si tu les pratiques, nomme-les avec les mots exacts de l'offre.`;
    ajouter('competences', message, parId.competences.poids - parId.competences.obtenu);
  }

  // Intitule trop eloigne.
  if (mesures.intitule.applicable && mesures.intitule.ratio < 0.6 && intituleOffre) {
    const message = `Ton CV s'intitule « ${intituleProfil} » alors que l'offre vise « ${intituleOffre} ». `
      + 'Si tes experiences le justifient, reprends l\'intitule de l\'offre en titre de CV : les filtres automatiques comparent ces deux lignes.';
    ajouter('intitule', message, parId.intitule.poids - parId.intitule.obtenu);
  }

  // Experience insuffisante ou illisible.
  if (mesures.experience.applicable && mesures.experience.ratio < 1) {
    const message = `L'offre demande ${mesures.experience.exigees} an(s) d'experience, ton CV en affiche ${mesures.experience.possedees}. `
      + 'Compte aussi tes stages, alternances, remplacements et missions ponctuelles : ils sont rarement additionnes alors qu\'ils comptent.';
    ajouter('experience', message, parId.experience.poids - parId.experience.obtenu);
  } else if (!mesures.experience.applicable && mesures.experience.exigees) {
    ajouter('experience', 'L\'offre demande une anciennete mais aucune duree n\'est lisible dans ton CV. Ecris les dates de debut et de fin de chaque poste (mois et annee).', 4);
  }

  // Diplome.
  if (mesures.diplome.applicable && mesures.diplome.ratio < 1) {
    const message = `L'offre vise un niveau ${libelleNiveau(mesures.diplome.niveauExige)}, ton CV indique ${libelleNiveau(mesures.diplome.niveauProfil)}. `
      + 'Ce n\'est pas eliminatoire : mets en avant tes formations continues, certifications et validations d\'acquis.';
    ajouter('diplome', message, parId.diplome.poids - parId.diplome.obtenu);
  } else if (!mesures.diplome.applicable && mesures.diplome.niveauExige !== null && mesures.diplome.niveauExige !== undefined) {
    ajouter('diplome', 'L\'offre mentionne un diplome mais ta formation n\'est pas lisible dans le CV. Ajoute l\'intitule exact de ton diplome et son annee.', 4);
  }

  // Transparence : quand l'offre est pauvre, le score repose sur peu de choses.
  if (applicables.length <= 2) {
    const noms = applicables.map((id) => LIBELLES[id].toLowerCase()).join(' et ');
    const message = applicables.length === 0
      ? 'Cette offre ne contient aucun element mesurable (ni competences, ni intitule, ni experience, ni diplome). Le score n\'est pas exploitable : lis l\'annonce en entier.'
      : `Cette offre donne peu d'informations : le score ne repose que sur ${noms}. A prendre comme une indication, pas comme un verdict.`;
    ajouter('fiabilite', message, 0);
  }

  // Tri stable : le plus rentable d'abord, puis l'ordre des criteres.
  const rang = { competences: 0, intitule: 1, experience: 2, diplome: 3, fiabilite: 4 };
  actions.sort((a, b) => (b.gain - a.gain) || (rang[a.critere] - rang[b.critere]));

  return actions;
}

module.exports = {
  scoreMatching,
  // Exportes pour les tests et pour d'autres briques du coeur. `normaliser`
  // n'est volontairement pas reexporte : il appartient a core/texte.
  detecterNiveau,
  POIDS_BASE
};
