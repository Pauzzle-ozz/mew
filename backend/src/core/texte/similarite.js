const { normaliser } = require('./normaliser');

/**
 * Mesures de similarite entre deux textes — tout est calcule en local,
 * aucun appel reseau, aucune dependance.
 *
 * Toutes les entrees passent par `normaliser` : « Développeur » et
 * « developpeur » sont donc consideres identiques. C'est voulu — dans Mew on
 * compare des competences et des intitules de poste, pas des mots de passe.
 *
 * ---------------------------------------------------------------------------
 * LE PIEGE A CONNAITRE : Jaro-Winkler sur des EXPRESSIONS
 * ---------------------------------------------------------------------------
 * Jaro-Winkler ajoute un bonus quand deux chaines commencent pareil. C'est
 * excellent pour rattraper une faute de frappe dans UN mot :
 *
 *   jaroWinkler('developpeur', 'developpeuse')   ~ 0.95   <- vrai, utile
 *
 * Mais sur une EXPRESSION, ce bonus de prefixe ment. Deux intitules de poste
 * qui commencent par les memes mots recoivent un score tres eleve alors que
 * ce sont deux metiers differents, avec des salaires et des competences
 * differents :
 *
 *   jaroWinkler('chef de projet', 'chef de produit')  ~ 0.93   <- FAUX AMI
 *   dice('chef de projet', 'chef de produit')         ~ 0.67   <- honnete
 *
 * Regle : Jaro-Winkler pour comparer DEUX MOTS (rattraper une coquille),
 * dice ou jaccard pour comparer DES EXPRESSIONS et des listes. Un test dans
 * backend/test/texte.test.js verrouille ces deux valeurs : si quelqu'un
 * remplace dice par jaroWinkler dans le matcher, le test le rattrape.
 */

/** Coefficient du bonus de prefixe de Winkler (valeur standard). */
const POIDS_PREFIXE = 0.1;
/** Longueur maximale du prefixe commun pris en compte (valeur standard). */
const PREFIXE_MAX = 4;
/** En dessous de ce score Jaro, Winkler n'applique pas son bonus. */
const SEUIL_BONUS = 0.7;

/** Decoupage « mots » minimal, sans stopwords retires : dice en a besoin. */
const MOTS = /[\p{L}\p{N}+#]+/gu;

function enMots(valeur) {
  if (Array.isArray(valeur)) {
    return valeur.map((m) => normaliser(m)).filter(Boolean);
  }
  const normalise = normaliser(valeur);
  if (!normalise) return [];
  return normalise.match(MOTS) || [];
}

function enEnsemble(valeur) {
  if (valeur instanceof Set) return valeur;
  if (Array.isArray(valeur)) return new Set(valeur);
  return new Set();
}

function enMap(valeur) {
  if (valeur instanceof Map) return valeur;
  if (valeur && typeof valeur === 'object') return new Map(Object.entries(valeur));
  return new Map();
}

/**
 * Distance de Levenshtein : nombre minimal d'insertions, suppressions et
 * substitutions pour passer d'une chaine a l'autre. 0 = identique.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} un entier >= 0
 */
function levenshtein(a, b) {
  const x = normaliser(a);
  const y = normaliser(b);
  if (x === y) return 0;
  if (!x.length) return y.length;
  if (!y.length) return x.length;

  // On ne garde que deux lignes de la matrice : la memoire reste minuscule
  // meme sur un CV entier.
  let precedente = Array.from({ length: y.length + 1 }, (_, j) => j);
  let courante = new Array(y.length + 1);

  for (let i = 1; i <= x.length; i++) {
    courante[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const cout = x[i - 1] === y[j - 1] ? 0 : 1;
      courante[j] = Math.min(
        courante[j - 1] + 1,        // insertion
        precedente[j] + 1,          // suppression
        precedente[j - 1] + cout    // substitution
      );
    }
    [precedente, courante] = [courante, precedente];
  }
  return precedente[y.length];
}

/** Similarite de Jaro, sans le bonus de prefixe. */
function jaro(x, y) {
  if (x === y) return 1;
  if (!x.length || !y.length) return 0;

  // Deux caracteres ne peuvent s'apparier que s'ils sont assez proches.
  const fenetre = Math.max(0, Math.floor(Math.max(x.length, y.length) / 2) - 1);
  const prisX = new Array(x.length).fill(false);
  const prisY = new Array(y.length).fill(false);

  let communs = 0;
  for (let i = 0; i < x.length; i++) {
    const debut = Math.max(0, i - fenetre);
    const fin = Math.min(y.length, i + fenetre + 1);
    for (let j = debut; j < fin; j++) {
      if (prisY[j] || x[i] !== y[j]) continue;
      prisX[i] = true;
      prisY[j] = true;
      communs++;
      break;
    }
  }
  if (communs === 0) return 0;

  // Transpositions : caracteres communs, mais pas dans le meme ordre.
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < x.length; i++) {
    if (!prisX[i]) continue;
    while (!prisY[k]) k++;
    if (x[i] !== y[k]) transpositions++;
    k++;
  }
  transpositions /= 2;

  return (communs / x.length + communs / y.length + (communs - transpositions) / communs) / 3;
}

/**
 * Jaro-Winkler : Jaro plus un bonus quand les chaines partagent un debut.
 * A RESERVER A LA COMPARAISON DE DEUX MOTS (voir l'avertissement en haut du
 * fichier). Sur des expressions, prefere `dice`.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} entre 0 et 1
 */
function jaroWinkler(a, b) {
  const x = normaliser(a);
  const y = normaliser(b);
  if (x === y) return x.length ? 1 : 0;
  if (!x.length || !y.length) return 0;

  const base = jaro(x, y);
  if (base < SEUIL_BONUS) return base;

  let prefixe = 0;
  const maximum = Math.min(PREFIXE_MAX, x.length, y.length);
  while (prefixe < maximum && x[prefixe] === y[prefixe]) prefixe++;

  return base + prefixe * POIDS_PREFIXE * (1 - base);
}

/**
 * Coefficient de Dice calcule sur les MOTS (et non sur les caracteres) :
 *   2 x (mots communs) / (mots de A + mots de B)
 *
 * C'est la bonne mesure pour comparer deux intitules de poste ou deux
 * phrases : elle ne se laisse pas berner par un debut identique.
 * Les mots vides sont volontairement conserves — « chef de projet » et
 * « chef projet » doivent pouvoir se distinguer.
 *
 * @param {string|string[]} a
 * @param {string|string[]} b
 * @returns {number} entre 0 et 1
 */
function dice(a, b) {
  const motsA = new Set(enMots(a));
  const motsB = new Set(enMots(b));
  if (!motsA.size || !motsB.size) return 0;

  let communs = 0;
  for (const mot of motsA) if (motsB.has(mot)) communs++;

  return (2 * communs) / (motsA.size + motsB.size);
}

/**
 * Indice de Jaccard : taille de l'intersection divisee par celle de l'union.
 * Accepte des Set ou des tableaux.
 *
 * Deux ensembles vides renvoient 0 et non 1 : dans Mew, un ensemble vide veut
 * dire « on n'a rien reussi a extraire ». Renvoyer 1 afficherait un match
 * parfait a un candidat dont on n'a lu aucune competence.
 *
 * @param {Set|Array} ensembleA
 * @param {Set|Array} ensembleB
 * @returns {number} entre 0 et 1
 */
function jaccard(ensembleA, ensembleB) {
  const a = enEnsemble(ensembleA);
  const b = enEnsemble(ensembleB);
  if (!a.size || !b.size) return 0;

  let communs = 0;
  const [petit, grand] = a.size <= b.size ? [a, b] : [b, a];
  for (const element of petit) if (grand.has(element)) communs++;

  return communs / (a.size + b.size - communs);
}

/**
 * TF-IDF : pour chaque document, le poids de chacun de ses mots.
 *
 * L'idee en une phrase : un mot present dans TOUS les documents ne dit rien
 * d'utile (« experience » dans un lot d'offres d'emploi), un mot rare est
 * discriminant (« bloc operatoire », « soudure tig »).
 *
 * L'IDF est lisse — log((N+1)/(df+1)) + 1 — pour que le poids ne tombe
 * jamais a zero : sur un seul document, tous les mots garderaient sinon un
 * poids nul et le cosinus vaudrait 0.
 *
 * @param {Array<string|string[]>} documents textes bruts ou listes de mots
 * @returns {Array<Map<string, number>>} un poids par mot et par document
 */
function tfIdf(documents) {
  if (!Array.isArray(documents) || documents.length === 0) return [];

  const listes = documents.map((doc) => enMots(doc));
  const nombreDocuments = listes.length;

  // df = dans combien de documents le mot apparait-il au moins une fois ?
  const df = new Map();
  for (const liste of listes) {
    for (const mot of new Set(liste)) {
      df.set(mot, (df.get(mot) || 0) + 1);
    }
  }

  return listes.map((liste) => {
    const poids = new Map();
    if (liste.length === 0) return poids;

    const occurrences = new Map();
    for (const mot of liste) occurrences.set(mot, (occurrences.get(mot) || 0) + 1);

    for (const [mot, nombre] of occurrences) {
      const tf = nombre / liste.length;
      const idf = Math.log((nombreDocuments + 1) / (df.get(mot) + 1)) + 1;
      poids.set(mot, tf * idf);
    }
    return poids;
  });
}

/**
 * Similarite cosinus entre deux vecteurs creux (des Map mot -> poids).
 * Se combine avec `tfIdf` : cosinus(vecteurs[0], vecteurs[1]).
 *
 * @param {Map<string, number>|Object} vecteurA
 * @param {Map<string, number>|Object} vecteurB
 * @returns {number} entre 0 et 1
 */
function cosinus(vecteurA, vecteurB) {
  const a = enMap(vecteurA);
  const b = enMap(vecteurB);
  if (!a.size || !b.size) return 0;

  let produit = 0;
  let normeA = 0;
  let normeB = 0;

  for (const valeur of a.values()) {
    if (Number.isFinite(valeur)) normeA += valeur * valeur;
  }
  for (const valeur of b.values()) {
    if (Number.isFinite(valeur)) normeB += valeur * valeur;
  }
  if (normeA === 0 || normeB === 0) return 0;

  // On parcourt le plus petit vecteur : les autres mots n'apportent rien au
  // produit scalaire puisqu'ils valent 0 dans l'autre vecteur.
  const [petit, grand] = a.size <= b.size ? [a, b] : [b, a];
  for (const [mot, valeur] of petit) {
    const autre = grand.get(mot);
    if (Number.isFinite(valeur) && Number.isFinite(autre)) produit += valeur * autre;
  }

  const score = produit / (Math.sqrt(normeA) * Math.sqrt(normeB));
  return Math.min(1, Math.max(0, score));
}

module.exports = { levenshtein, jaroWinkler, dice, jaccard, tfIdf, cosinus };
