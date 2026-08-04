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
 * D'OU VIENNENT LES TARIFS
 * Depuis que l'utilisateur choisit lui-meme son fournisseur, les prix ne
 * peuvent plus etre une petite table OpenAI ecrite ici : ils vivent dans
 * llm/providers/catalogue.js, par FOURNISSEUR et par MODELE. Ce fichier va
 * donc les y chercher. Il garde une table de secours pour les anciens noms
 * de modeles OpenAI, encore utilisables via le .env.
 *
 * REGLE QUI GUIDE TOUT LE FICHIER : un tarif inconnu vaut ZERO, et zero est
 * une bonne reponse — pas une lacune. Un modele qui tourne sur la machine de
 * l'utilisateur ne coute effectivement rien par requete.
 */

/**
 * Table de secours : anciens tarifs publics OpenAI, en DOLLARS PAR MILLION
 * de tokens. Elle ne sert que pour les modeles absents du catalogue, par
 * exemple quand le .env impose encore « gpt-4o ». Le catalogue reste la
 * source de verite.
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

/* ------------------------------------------------------------------ */
/* Acces au catalogue                                                  */
/* ------------------------------------------------------------------ */

/**
 * Le catalogue est charge PARESSEUSEMENT et sous try/catch.
 *
 * POURQUOI : compter des tokens ne doit jamais pouvoir empecher le serveur
 * de demarrer ni faire echouer un appel. Si le catalogue etait casse ou
 * absent, on retombe simplement sur la table de secours et sur zero.
 */
let registre = null;
let registreCharge = false;

function catalogue() {
  if (registreCharge) return registre;
  registreCharge = true;
  try {
    registre = require('./providers');
  } catch (_) {
    registre = null;
  }
  return registre;
}

/** Un tarif n'est exploitable que si ses deux nombres le sont. */
const tarifValide = (modele) => {
  if (!modele) return null;
  const entree = Number(modele.entree);
  const sortie = Number(modele.sortie);
  if (!Number.isFinite(entree) || !Number.isFinite(sortie)) return null;
  if (entree < 0 || sortie < 0) return null;
  return { entree, sortie };
};

/**
 * Le fournisseur renvoie parfois un nom PLUS PRECIS que celui demande :
 * on demande « gpt-4o », il repond « gpt-4o-2024-11-20 ». Sans ce
 * rattrapage, l'appel serait compte a zero alors qu'il a bien ete facture.
 *
 * On n'accepte qu'un suffixe de version ou de date (un separateur suivi
 * d'un CHIFFRE) : sans cette condition, « gpt-4o » servirait de tarif a
 * « gpt-4o-mini », qui coute vingt fois moins cher.
 */
function tarifParSuffixe(modeles, nom) {
  let meilleur = null;
  for (const modele of modeles) {
    if (!modele || typeof modele.id !== 'string' || modele.id === '') continue;
    if (modele.id === nom || !nom.startsWith(modele.id)) continue;
    if (!/^[-_@:.]\d/.test(nom.slice(modele.id.length))) continue;
    // Le nom le plus long est le plus specifique, donc le plus fiable.
    if (!meilleur || modele.id.length > meilleur.id.length) meilleur = modele;
  }
  return tarifValide(meilleur);
}

function tarifChez(fournisseur, nom) {
  if (!fournisseur || !Array.isArray(fournisseur.modeles)) return null;
  const exact = fournisseur.modeles.find((m) => m && m.id === nom);
  return tarifValide(exact) || tarifParSuffixe(fournisseur.modeles, nom);
}

/**
 * Le tarif applicable a un modele.
 *
 * Ordre de recherche, du plus sur au moins sur :
 *   1. le fournisseur precis, s'il est connu — c'est lui qui facture ;
 *   2. tout le catalogue, par nom exact : un meme modele garde souvent le
 *      meme identifiant d'un revendeur a l'autre ;
 *   3. la table de secours des anciens noms OpenAI.
 *
 * Cas particulier : un fournisseur LOCAL (Ollama, LM Studio, llama.cpp)
 * renvoie toujours zero, sans chercher plus loin. Sinon un modele ouvert
 * comme « gpt-oss-120b », qui existe aussi chez Groq, se verrait facturer
 * le tarif de Groq alors qu'il tourne gratuitement chez l'utilisateur.
 *
 * @param {string} modele
 * @param {string} [idFournisseur]
 * @returns {{entree: number, sortie: number}|null}
 */
function tarif(modele, idFournisseur) {
  if (typeof modele !== 'string') return null;
  const nom = modele.trim();
  if (nom === '') return null;

  const acces = catalogue();

  if (acces && typeof idFournisseur === 'string' && idFournisseur.trim() !== '') {
    let fournisseur = null;
    try {
      fournisseur = acces.fournisseur(idFournisseur.trim());
    } catch (_) {
      fournisseur = null;
    }
    if (fournisseur) {
      if (fournisseur.local) return null;
      const trouve = tarifChez(fournisseur, nom);
      if (trouve) return trouve;
    }
  }

  if (acces) {
    try {
      for (const fournisseur of acces.fournisseurs()) {
        if (fournisseur.local) continue;
        const exact = fournisseur.modeles.find((m) => m && m.id === nom);
        const trouve = tarifValide(exact);
        if (trouve) return trouve;
      }
    } catch (_) {
      // Catalogue illisible : la table de secours prend le relais.
    }
  }

  // hasOwnProperty : sans lui, un modele nomme « constructor » ou
  // « __proto__ » remonterait une propriete heritee d'Object.prototype. Le
  // tarif parait exister, ses champs valent undefined, et tout le calcul
  // devient NaN — y compris le cumul de la session, definitivement.
  return Object.prototype.hasOwnProperty.call(TARIFS, nom) ? TARIFS[nom] : null;
}

/* ------------------------------------------------------------------ */
/* Lecture des compteurs de tokens                                     */
/* ------------------------------------------------------------------ */

/**
 * Lit un compteur de tokens sans jamais renvoyer NaN.
 * L'objet `usage` vient d'un fournisseur externe : il peut etre absent,
 * partiel, ou contenir des chaines. On ne fait confiance a rien.
 */
const nombre = (valeur) => {
  const n = Number(valeur);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Deux vocabulaires cohabitent :
 *   - `prompt_tokens` / `completion_tokens`, le format brut d'OpenAI ;
 *   - `tokensEntree` / `tokensSortie`, celui du contrat des adaptateurs.
 * On accepte les deux plutot que d'imposer une traduction a l'appelant.
 */
const entreeDe = (usage) => {
  if (!usage || typeof usage !== 'object') return 0;
  if (usage.prompt_tokens !== undefined) return nombre(usage.prompt_tokens);
  if (usage.tokensEntree !== undefined) return nombre(usage.tokensEntree);
  return nombre(usage.input_tokens);
};

const sortieDe = (usage) => {
  if (!usage || typeof usage !== 'object') return 0;
  if (usage.completion_tokens !== undefined) return nombre(usage.completion_tokens);
  if (usage.tokensSortie !== undefined) return nombre(usage.tokensSortie);
  return nombre(usage.output_tokens);
};

const arrondir = (valeur, decimales) => {
  if (!Number.isFinite(valeur)) return 0;
  const facteur = 10 ** decimales;
  return Math.round(valeur * facteur) / facteur;
};

/* ------------------------------------------------------------------ */
/* Estimation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Estime le cout d'un appel, en dollars bruts.
 *
 * Un modele inconnu (modele local, fournisseur absent du catalogue, nom mal
 * orthographie) est compte a ZERO.
 */
function coutBrutUsd(modele, usage, idFournisseur) {
  const grille = tarif(modele, idFournisseur);
  if (!grille || !usage || typeof usage !== 'object') return 0;

  const usd = (entreeDe(usage) / 1e6) * grille.entree + (sortieDe(usage) / 1e6) * grille.sortie;
  return Number.isFinite(usd) ? usd : 0;
}

/**
 * @param {string} modele
 * @param {{prompt_tokens?: number, completion_tokens?: number,
 *          tokensEntree?: number, tokensSortie?: number}} usage
 * @param {string} [idFournisseur] identifiant du catalogue (ex. « anthropic »)
 * @returns {{usd: number, eur: number}}
 */
function estimerCout(modele, usage, idFournisseur) {
  const usd = coutBrutUsd(modele, usage, idFournisseur);

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
 * Aucune cle, aucun nom de personne : cette ligne peut etre affichee
 * partout sans risque.
 */
function formater(modele, usage, idFournisseur) {
  const entree = entreeDe(usage);
  const sortie = sortieDe(usage);
  const { eur } = estimerCout(modele, usage, idFournisseur);
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
function enregistrer(modele, usage, idFournisseur) {
  appels += 1;
  tokensEntree += entreeDe(usage);
  tokensSortie += sortieDe(usage);
  // On cumule le montant BRUT, pas l'arrondi affiche : sur cent appels,
  // additionner des valeurs deja arrondies fait deriver le total.
  usdCumule += coutBrutUsd(modele, usage, idFournisseur);

  return estimerCout(modele, usage, idFournisseur);
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
  tarif,
  estimerCout,
  formater,
  cumul,
  enregistrer,
  reinitialiser
};
