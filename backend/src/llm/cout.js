/**
 * Mesure de ce que coutent les appels au modele.
 *
 * POURQUOI CE FICHIER EXISTE
 * Mew promet de faire le maximum en local et de n'appeler le modele que
 * pour la redaction. Une promesse d'economie qu'on ne mesure pas est une
 * promesse inverifiable : ce module donne le chiffre. Il sert aussi a
 * repondre a la question la plus concrete de l'utilisateur — « ca m'a
 * coute combien, ce CV optimise ? ».
 *
 * Aucun reseau, aucun secret, aucune donnee personnelle : uniquement des
 * compteurs de tokens. Le cumul vit en memoire et repart de zero a chaque
 * redemarrage du serveur, ce qui est suffisant pour un usage local.
 *
 * Ce module a vocation a remplacer la constante TARIFS et la methode
 * _mesurer de services/aiService.js (meme table de tarifs, plus le cumul
 * et le formatage). Le branchement se fera ailleurs.
 */

/**
 * Tarifs publics OpenAI, en DOLLARS PAR MILLION de tokens.
 * A mettre a jour si OpenAI change sa grille.
 */
const TARIFS = {
  'gpt-4o': { entree: 2.5, sortie: 10 },
  'gpt-4o-mini': { entree: 0.15, sortie: 0.6 },
  'gpt-4.1': { entree: 2, sortie: 8 },
  'gpt-4.1-mini': { entree: 0.4, sortie: 1.6 },
  'gpt-4.1-nano': { entree: 0.1, sortie: 0.4 }
};

// Ordre de grandeur, pas un taux de change temps reel : on affiche un cout
// indicatif, pas une facture.
const USD_VERS_EUR = 0.92;

// Cumul de la session en cours.
let appels = 0;
let tokensEntree = 0;
let tokensSortie = 0;
let usdCumule = 0;

/**
 * Lit un compteur de tokens sans jamais renvoyer NaN.
 * L'objet `usage` vient d'un fournisseur externe : il peut etre absent,
 * partiel, ou contenir des chaines. On ne fait confiance a rien.
 */
const nombre = (valeur) => {
  const n = Number(valeur);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const arrondir = (valeur, decimales) => {
  if (!Number.isFinite(valeur)) return 0;
  const facteur = 10 ** decimales;
  return Math.round(valeur * facteur) / facteur;
};

/**
 * Cherche un tarif SANS passer par l'heritage.
 *
 * `TARIFS[modele]` a l'air anodin, mais un modele nomme « constructor » ou
 * « __proto__ » remonte alors une propriete d'Object.prototype : le tarif
 * parait exister, ses champs valent undefined, et tout le calcul devient NaN
 * — y compris le cumul de la session, definitivement. On ne lit donc que les
 * cles reellement declarees dans la table.
 */
const tarifDe = (modele) => (
  typeof modele === 'string' && Object.prototype.hasOwnProperty.call(TARIFS, modele)
    ? TARIFS[modele]
    : null
);

/**
 * Estime le cout d'un appel.
 *
 * Un modele inconnu (modele local type Ollama, autre fournisseur, nom mal
 * orthographie) est compte a ZERO. Ce n'est pas une lacune : un modele qui
 * tourne sur la machine de l'utilisateur ne coute effectivement rien par
 * requete. Afficher 0 EUR est la bonne reponse.
 *
 * @param {string} modele
 * @param {{prompt_tokens: number, completion_tokens: number}} usage
 * @returns {{usd: number, eur: number}}
 */
function coutBrutUsd(modele, usage) {
  const tarif = tarifDe(modele);
  if (!tarif || !usage || typeof usage !== 'object') return 0;

  const entree = nombre(usage.prompt_tokens);
  const sortie = nombre(usage.completion_tokens);

  const usd = (entree / 1e6) * tarif.entree + (sortie / 1e6) * tarif.sortie;
  return Number.isFinite(usd) ? usd : 0;
}

function estimerCout(modele, usage) {
  const usd = coutBrutUsd(modele, usage);

  // 6 decimales : un appel coute souvent moins d'un millieme d'euro, et on
  // veut eviter le bruit des flottants (0.004672000000001).
  return { usd: arrondir(usd, 6), eur: arrondir(usd * USD_VERS_EUR, 6) };
}

/**
 * Separateur de milliers, ecrit a la main plutot qu'avec Intl : le format
 * doit etre identique quelle que soit la locale de la machine, sinon les
 * tests passent chez l'un et echouent chez l'autre.
 * 2840 -> "2 840"
 */
const separerMilliers = (entier) => String(Math.round(entier)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * Nombre a virgule a la francaise : 0.0043 -> "0,0043"
 */
const virgule = (valeur, decimales) => valeur.toFixed(decimales).replace('.', ',');

/**
 * Ligne lisible pour les logs ou l'interface.
 * Exemple : "gpt-4.1-mini - 2 840 entree, 2 210 sortie - 0,0043 EUR"
 *
 * @param {string} modele
 * @param {{prompt_tokens: number, completion_tokens: number}} usage
 * @returns {string}
 */
function formater(modele, usage) {
  const entree = nombre(usage && usage.prompt_tokens);
  const sortie = nombre(usage && usage.completion_tokens);
  const { eur } = estimerCout(modele, usage);
  // Un nom qui n'est pas une chaine (undefined, objet, Symbol) ferait lever
  // le gabarit de chaine : on l'ecarte avant, un log ne doit jamais planter.
  const nom = typeof modele === 'string' && modele !== '' ? modele : 'modele inconnu';

  return `${nom} - ${separerMilliers(entree)} entree, `
    + `${separerMilliers(sortie)} sortie - ${virgule(eur, 4)} EUR`;
}

/**
 * Ajoute un appel au cumul de la session.
 * @returns {{usd: number, eur: number}} le cout de CET appel
 */
function enregistrer(modele, usage) {
  appels += 1;
  tokensEntree += nombre(usage && usage.prompt_tokens);
  tokensSortie += nombre(usage && usage.completion_tokens);
  // On cumule le montant BRUT, pas l'arrondi affiche : sur cent appels,
  // additionner des valeurs deja arrondies fait deriver le total.
  usdCumule += coutBrutUsd(modele, usage);

  return estimerCout(modele, usage);
}

/**
 * @returns {{appels: number, tokensEntree: number, tokensSortie: number, eur: number}}
 */
function cumul() {
  return {
    appels,
    tokensEntree,
    tokensSortie,
    // On cumule en dollars et on convertit a la lecture : arrondir a chaque
    // appel ferait deriver le total.
    eur: arrondir(usdCumule * USD_VERS_EUR, 6)
  };
}

function reinitialiser() {
  appels = 0;
  tokensEntree = 0;
  tokensSortie = 0;
  usdCumule = 0;
}

module.exports = {
  TARIFS,
  USD_VERS_EUR,
  estimerCout,
  formater,
  cumul,
  enregistrer,
  reinitialiser
};
