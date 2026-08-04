/**
 * Petits outils de texte partages par les modules du parseur de CV.
 *
 * NOTE POUR LE BRANCHEMENT : `sansAccents` existe aussi dans
 * src/core/texte/normaliser.js (ecrit en parallele de ce module). Les deux
 * versions donnent le meme resultat sur du texte francais ; il faudra n'en
 * garder qu'une. Celle-ci est volontairement sans dependance pour que le
 * parseur de CV reste autonome tant que le branchement n'est pas fait.
 *
 * Pourquoi ne pas utiliser `String.normalize('NFD')` pour retirer les accents ?
 * Parce que NFD change la LONGUEUR de la chaine (« e » devient « e » + accent
 * combinant). Or on cherche des dates et des numeros avec des regex sur une
 * copie sans accents, puis on veut recouper les positions avec le texte
 * d'origine. Un remplacement caractere par caractere garde les positions
 * intactes, ce qui evite une classe entiere de bugs silencieux.
 */

const REMPLACEMENTS = {
  'à': 'a', 'â': 'a', 'ä': 'a', 'á': 'a', 'ã': 'a', 'å': 'a',
  'ç': 'c',
  'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
  'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
  'ñ': 'n',
  'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
  'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
  'ý': 'y', 'ÿ': 'y',
  // Ligatures : on perd une lettre (« oeuvre » devient « ouvre ») mais on
  // garde la longueur. Ces copies ne servent qu'a la comparaison, jamais a
  // l'affichage, donc c'est sans consequence pour l'utilisateur.
  'œ': 'o', 'æ': 'a', 'ß': 's'
};

/**
 * Retire les accents en gardant exactement la meme longueur de chaine.
 */
function sansAccents(texte) {
  if (typeof texte !== 'string') return '';
  return texte.replace(/[^\x00-\x7F]/g, (caractere) => {
    const minuscule = caractere.toLowerCase();
    const remplacement = REMPLACEMENTS[minuscule];
    if (!remplacement) return caractere;
    return caractere === minuscule ? remplacement : remplacement.toUpperCase();
  });
}

/**
 * Copie minuscule + sans accents, de meme longueur que l'original.
 * C'est la forme sur laquelle on lance les regex de dates.
 */
function normaliserMemeLongueur(texte) {
  return sansAccents(texte).toLowerCase();
}

/**
 * Forme comparable d'un titre : sans accents, en majuscules, sans
 * ponctuation, sans articles de tete, et au singulier.
 * « Mes experiences professionnelles : » et « EXPERIENCE PROFESSIONNELLE »
 * donnent tous les deux « EXPERIENCE PROFESSIONNELLE ».
 */
const ARTICLES_DE_TETE = new Set(['MES', 'MON', 'MA', 'LES', 'LE', 'LA', 'L', 'DE', 'DU', 'D', 'LEURS']);

function normaliserTitre(texte) {
  if (typeof texte !== 'string') return '';
  const brut = sansAccents(texte)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!brut) return '';

  const mots = brut.split(' ');
  while (mots.length > 1 && ARTICLES_DE_TETE.has(mots[0])) {
    mots.shift();
  }

  // Singulier approximatif : on enleve le S final des mots assez longs.
  // « COMPETENCES » et « COMPETENCE » deviennent identiques, sans avoir a
  // lister les deux formes dans le fichier de donnees.
  return mots
    .map((mot) => (mot.length > 3 && mot.endsWith('S') ? mot.slice(0, -1) : mot))
    .join(' ');
}

/** Caracteres utilises comme puces dans les CV. */
const PUCES = '•▪●◦‣·∙*■□▶▸➢➤·-–—+>';

/**
 * Une ligne commence-t-elle par une puce ? (utile pour distinguer un
 * en-tete d'experience d'une ligne de description)
 */
function estLignePuce(ligne) {
  if (typeof ligne !== 'string') return false;
  const nettoyee = ligne.trim();
  if (!nettoyee) return false;
  // « o » et « - » suivis d'un espace, ou un vrai caractere de puce.
  return /^[•▪●◦‣·∙*■□▶▸➢➤]/.test(nettoyee) || /^[-–—+>]\s/.test(nettoyee) || /^o\s/.test(nettoyee);
}

/** Retire la puce et les espaces de tete d'un fragment. */
function retirerPuce(fragment) {
  if (typeof fragment !== 'string') return '';
  return fragment
    .replace(new RegExp(`^[\\s${PUCES.replace(/[-\]\\]/g, '\\$&')}]+`), '')
    .trim();
}

/** Decoupe en lignes en tolerant les fins de ligne Windows. */
function enLignes(texte) {
  if (typeof texte !== 'string') return [];
  return texte.replace(/\r\n?/g, '\n').split('\n');
}

module.exports = {
  sansAccents,
  normaliserMemeLongueur,
  normaliserTitre,
  estLignePuce,
  retirerPuce,
  enLignes
};
