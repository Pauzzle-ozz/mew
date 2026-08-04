const { normaliser } = require('./normaliser');
const STOPWORDS_BRUTS = require('../../data/fr/stopwords.json');

/**
 * Decoupage d'un texte en mots utiles.
 *
 * Le piege de ce fichier : la ponctuation. Un decoupage naif sur
 * /[^a-z]+/ transforme « C++ » en « c », « C# » en « c » et « Node.js » en
 * « node » + « js ». On perd exactement les mots qui comptent. On garde donc
 * a l'interieur d'un mot les caracteres « techniques » : + # . _ &
 * (c++, c#, node.js, r&d, snake_case).
 *
 * Le trait d'union, lui, reste un separateur : « e-commerce » donne
 * « commerce », qui matchera une offre ecrite « commerce en ligne ». Garder
 * « e-commerce » entier aurait ferme cette porte.
 *
 * IMPORTANT — les stopwords ne servent qu'a enlever le bruit grammatical
 * (le, de, pour, avec...). Ils ne servent JAMAIS a decider qu'un mot n'est
 * pas une competence : « responsable », « chef », « gestion », « anglais »,
 * « permis » sont des mots pleins pour un CV d'infirmier, de plombier ou de
 * commercial, et ils ne sont pas dans la liste.
 */

/** On repasse la liste dans `normaliser` : une faute d'accent dans le JSON ne casse rien. */
const STOPWORDS = new Set(STOPWORDS_BRUTS.map((mot) => normaliser(mot)).filter(Boolean));

/** Un « mot » = lettres, chiffres, et la ponctuation technique collee dedans. */
const MOTS = /[\p{L}\p{N}+#._&]+/gu;

/** Ponctuation qu'on retire aux extremites seulement (« paris. » -> « paris »). */
const BORDS = /^[._&]+|[._&]+$/g;

const LONGUEUR_MINIMALE = 2;

/**
 * Vrai si le mot est un mot vide du francais.
 * @param {string} mot
 * @returns {boolean}
 */
function estStopword(mot) {
  return STOPWORDS.has(normaliser(mot));
}

/**
 * Decoupe un texte en mots normalises et utiles.
 *
 * @param {string} texte
 * @param {{ garderStopwords?: boolean, longueurMinimale?: number }} [options]
 *        `garderStopwords` sert aux comparaisons d'intitules de poste, ou
 *        « chef de projet » et « chef de produit » doivent garder leur « de ».
 * @returns {string[]}
 */
function tokeniser(texte, options = {}) {
  const normalise = normaliser(texte);
  if (!normalise) return [];

  const garderStopwords = options.garderStopwords === true;
  const longueurMinimale = Number.isInteger(options.longueurMinimale)
    ? options.longueurMinimale
    : LONGUEUR_MINIMALE;

  const bruts = normalise.match(MOTS);
  if (!bruts) return [];

  const jetons = [];
  for (const brut of bruts) {
    // « c++ » et « c# » gardent leur suffixe : il fait partie du nom.
    const jeton = brut.replace(BORDS, '');
    if (jeton.length < longueurMinimale) continue;
    if (!garderStopwords && STOPWORDS.has(jeton)) continue;
    jetons.push(jeton);
  }
  return jetons;
}

/**
 * Les mots distincts d'un texte.
 *
 * @param {string} texte
 * @param {{ garderStopwords?: boolean, longueurMinimale?: number }} [options]
 * @returns {Set<string>}
 */
function motsUniques(texte, options) {
  return new Set(tokeniser(texte, options));
}

/**
 * Groupes de n mots consecutifs, joints par un espace.
 * Utile pour reconnaitre des expressions : « chef de projet », « bloc
 * operatoire », « permis poids lourd » ne veulent rien dire mot a mot.
 *
 * @param {string[]|string} tokens tableau de mots (une chaine est tokenisee)
 * @param {number} n taille des groupes
 * @returns {string[]}
 */
function ngrammes(tokens, n) {
  const liste = typeof tokens === 'string' ? tokeniser(tokens) : tokens;
  if (!Array.isArray(liste)) return [];
  if (!Number.isInteger(n) || n < 1 || liste.length < n) return [];

  const groupes = [];
  for (let i = 0; i + n <= liste.length; i++) {
    groupes.push(liste.slice(i, i + n).join(' '));
  }
  return groupes;
}

module.exports = { tokeniser, motsUniques, ngrammes, estStopword, STOPWORDS };
