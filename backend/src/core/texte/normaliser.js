/**
 * Normalisation de texte — la brique la plus basse de Mew.
 *
 * Pourquoi ce fichier existe : un CV et une offre d'emploi parlent rarement
 * de la meme facon de la meme chose. « Développeuse », « DEVELOPPEUSE » et
 * « developpeuse » doivent devenir un seul et meme mot avant qu'on essaie de
 * les comparer. Sinon tout le reste du calcul (score, matching, extraction)
 * se trompe pour de mauvaises raisons.
 *
 * Regle de survie : ces fonctions ne plantent JAMAIS. Elles sont appelees sur
 * du texte sorti d'un PDF, c'est-a-dire sur n'importe quoi. Une entree qui
 * n'est pas une chaine renvoie '' plutot qu'une exception.
 */

/**
 * Les ligatures typographiques ne sont PAS des accents : `normalize('NFD')`
 * ne les decompose pas. Sans cette table, « Cœur » reste « cœur » et ne
 * matchera jamais « coeur » ecrit au clavier. Les PDF en produisent beaucoup
 * (les polices remplacent « fi » par le glyphe unique « ﬁ »).
 */
const LIGATURES = {
  'œ': 'oe', 'Œ': 'OE',
  'æ': 'ae', 'Æ': 'AE',
  'ĳ': 'ij', 'Ĳ': 'IJ',
  'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl',
  'ﬅ': 'st', 'ﬆ': 'st'
};

const REGEX_LIGATURES = new RegExp(`[${Object.keys(LIGATURES).join('')}]`, 'g');

/**
 * Espaces « exotiques » produits par les PDF et les traitements de texte.
 * Visuellement identiques a un espace normal, mais on ne peut pas s'y fier :
 * c'est une source de bugs invisibles a l'oeil nu.
 */
const ESPACES_EXOTIQUES = new RegExp('[\u005cu00a0\u005cu1680\u005cu2000-\u005cu200a\u005cu202f\u005cu205f\u005cu3000]', 'g');

/** Caracteres de largeur nulle : invisibles, mais ils cassent les comparaisons. */
const CARACTERES_INVISIBLES = new RegExp('[\u005cu200b-\u005cu200d\u005cu2060\u005cufeff]', 'g');

/** Caracteres de controle : un PDF mal extrait en seme un peu partout. */
const CARACTERES_CONTROLE = new RegExp('[\u005cu0000-\u005cu0008\u005cu000b\u005cu000c\u005cu000e-\u005cu001f\u005cu007f]', 'g');

/** Puces Unicode que les PDF placent en debut de ligne de liste. */
const PUCES_UNICODE = /^[ \t]*[•●▪▫◦‣∙⋅▸►▹→◆◇■□○·]+[ \t]*/gm;

/** Puces ASCII : on exige un espace apres, sinon on casserait « -5 % » ou « +33 ». */
const PUCES_ASCII = /^[ \t]*[-–—*+][ \t]+/gm;

/**
 * Retire les diacritiques (accents, cedilles, tremas) d'un texte.
 * La casse est conservee : « Développeuse Senior » -> « Developpeuse Senior ».
 *
 * @param {string} texte
 * @returns {string}
 */
function sansAccents(texte) {
  if (typeof texte !== 'string') return '';
  return texte
    .replace(REGEX_LIGATURES, (c) => LIGATURES[c])
    // NFD separe la lettre de son accent ; on supprime ensuite les accents seuls.
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .normalize('NFC');
}

/**
 * Forme canonique d'un texte : minuscules, sans accents, espaces reduits a un
 * seul, sans blancs au debut ni a la fin.
 *
 * C'est la forme dans laquelle TOUT est compare dans Mew. La ponctuation est
 * volontairement conservee : c'est au tokeniseur de decider quoi en faire
 * (« node.js » et « c++ » ont besoin de la leur).
 *
 * @param {string} texte
 * @returns {string}
 */
function normaliser(texte) {
  if (typeof texte !== 'string') return '';
  return sansAccents(texte)
    .replace(CARACTERES_INVISIBLES, '')
    .replace(CARACTERES_CONTROLE, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Repare le texte brut sorti de `pdf-parse`.
 *
 * Contrairement a `normaliser`, on garde ici les accents, la casse et les
 * retours a la ligne : ce texte est destine a etre relu par un humain ou
 * decoupe en sections (« EXPERIENCE », « FORMATION »...). On ne fait que
 * reparer les degats de l'extraction PDF :
 *   - les espaces insecables qui remplacent les espaces normaux
 *   - les ligatures (« ﬁnance » -> « finance »)
 *   - les puces de listes collees au texte
 *   - les paquets de lignes vides
 *   - les espaces avant la ponctuation (« metier : » -> « metier: »)
 *
 * @param {string} texte
 * @returns {string}
 */
function nettoyerPdf(texte) {
  if (typeof texte !== 'string') return '';

  return texte
    // 1. Uniformiser les fins de ligne (Windows / vieux Mac).
    .replace(/\r\n?/g, '\n')
    // 2. Ligatures et caracteres parasites.
    .replace(REGEX_LIGATURES, (c) => LIGATURES[c])
    .replace(CARACTERES_INVISIBLES, '')
    .replace(CARACTERES_CONTROLE, ' ')
    // 3. Espaces exotiques -> espace normal.
    .replace(ESPACES_EXOTIQUES, ' ')
    // 4. Puces de debut de ligne.
    .replace(PUCES_UNICODE, '')
    .replace(PUCES_ASCII, '')
    // 5. Espaces horizontaux multiples -> un seul (sans toucher aux \n).
    .replace(/[^\S\n]+/g, ' ')
    // 6. Espace avant la ponctuation : la typographie francaise en met un,
    //    mais il gene le decoupage en phrases et en champs.
    .replace(/ +([,;:!?.…%])/g, '$1')
    .replace(/([([«]) +/g, '$1')
    // 7. Blancs en debut et fin de chaque ligne.
    .replace(/^ +| +$/gm, '')
    // 8. Trois retours a la ligne ou plus -> une seule ligne vide.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { sansAccents, normaliser, nettoyerPdf };
