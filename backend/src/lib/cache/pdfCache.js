const crypto = require('crypto');

/**
 * Cache d'extraction de CV, indexe par le contenu du fichier.
 *
 * POURQUOI CE FICHIER EXISTE
 * En mode Decouverte, l'utilisateur televerse UN CV, voit 5 offres, et
 * clique « Adapter mon CV » sur chacune. Sans cache, le meme PDF est
 * re-extrait 5 fois : 5 appels au modele, 5 attentes, 5 factures, pour un
 * resultat rigoureusement identique. Meme fichier = meme empreinte = un
 * seul calcul.
 *
 * VIE PRIVEE — CHOIX DELIBERE
 * Ce cache contient des donnees de CV : noms, emails, telephones, parcours.
 * Il vit UNIQUEMENT en memoire (une Map), n'est JAMAIS ecrit sur le disque,
 * et disparait entierement a l'arret du serveur. Ecrire ce cache sur disque
 * serait une regression de confidentialite, pas une optimisation : ne le
 * faites pas. La duree de vie courte (1 heure) et la taille bornee (50
 * entrees) sont la pour la meme raison — une donnee personnelle qui n'est
 * plus utile ne doit plus etre la.
 *
 * L'empreinte est un SHA-256 du contenu : deux utilisateurs differents avec
 * deux CV differents n'ont aucun risque de collision. Deux utilisateurs qui
 * televersent LE MEME fichier octet pour octet partageraient l'entree ; en
 * pratique ce sont deux copies du meme document, donc le meme resultat.
 */

// Une heure : assez pour couvrir une session de travail, assez court pour
// que des donnees de CV ne trainent pas en memoire toute la journee.
const DUREE_DE_VIE_MS = 60 * 60 * 1000;

// 50 CV extraits, c'est quelques megaoctets de texte : negligeable pour le
// serveur, largement suffisant pour un usage local.
const TAILLE_MAX = 50;

// cle (empreinte) -> { valeur, expireA }
// Une Map conserve l'ordre d'insertion : la premiere cle est donc toujours
// la plus anciennement ecrite, ce qui rend l'eviction triviale.
const entrees = new Map();

// Extractions DEJA LANCEES mais pas encore terminees : cle -> Promise.
// Sans ca, cinq clics quasi simultanes sur le meme CV declenchent cinq
// extractions : chacune demarre avant que la premiere ait eu le temps
// d'ecrire son resultat. On memorise donc la promesse, pas seulement la
// valeur, et les quatre autres attendent la premiere.
const enCours = new Map();

let succes = 0;
let echecs = 0;

/**
 * Horloge injectable.
 *
 * Un test qui veut verifier l'expiration ne doit pas attendre une heure.
 * Plutot que de dependre de faux timers, le module lit l'heure a travers
 * cette fonction, que les tests remplacent.
 */
let horloge = () => Date.now();

/**
 * Remplace l'horloge interne. Reserve aux tests.
 * @param {Function|null} fn - fonction sans argument renvoyant un timestamp
 */
function _utiliserHorloge(fn) {
  horloge = typeof fn === 'function' ? fn : () => Date.now();
}

/**
 * Empreinte SHA-256 du contenu d'un fichier, en hexadecimal.
 *
 * On hache le CONTENU, jamais le nom du fichier : « cv.pdf » et
 * « cv_final_v3.pdf » avec les memes octets doivent partager le resultat.
 *
 * @param {Buffer|Uint8Array|string} buffer
 * @returns {string|null} empreinte, ou null si l'entree est inexploitable
 */
function empreinte(buffer) {
  let octets = null;

  // ATTENTION : on passe la VUE telle quelle a update(), on ne remonte jamais
  // a son tampon sous-jacent (buffer.buffer). Une vue ne couvre souvent qu'un
  // MORCEAU de sa memoire (byteOffset / byteLength) : hacher le tampon entier
  // donnerait la meme empreinte a deux extraits differents, donc le CV d'une
  // personne renvoye a une autre. C'est le pire bug possible ici.
  if (Buffer.isBuffer(buffer) || ArrayBuffer.isView(buffer)) {
    if (buffer.byteLength === 0) return null;
    octets = buffer;
  } else if (buffer instanceof ArrayBuffer) {
    if (buffer.byteLength === 0) return null;
    octets = Buffer.from(buffer);
  } else if (typeof buffer === 'string') {
    if (buffer === '') return null;
    octets = Buffer.from(buffer, 'utf8');
  } else {
    // null, undefined, nombre, objet quelconque : inexploitable.
    return null;
  }

  return crypto.createHash('sha256').update(octets).digest('hex');
}

/**
 * Cherche une entree encore valide, sans compter de succes ni d'echec.
 * Interne : permet de distinguer « absent » de « present et vaut null ».
 */
function _chercher(cle) {
  const entree = entrees.get(cle);
  if (!entree) return undefined;

  if (entree.expireA <= horloge()) {
    // Perimee : on la retire tout de suite plutot que d'attendre l'eviction.
    // Une donnee de CV expiree ne doit pas rester en memoire.
    entrees.delete(cle);
    return undefined;
  }
  return entree;
}

/**
 * Lit une valeur du cache.
 * @param {string} cle - empreinte renvoyee par empreinte()
 * @returns {*} la valeur memorisee, ou null si absente ou perimee
 */
function lire(cle) {
  if (typeof cle !== 'string' || cle === '') {
    echecs += 1;
    return null;
  }

  const entree = _chercher(cle);
  if (entree === undefined) {
    echecs += 1;
    return null;
  }

  succes += 1;
  return entree.valeur;
}

/**
 * Ecrit une valeur dans le cache.
 * @param {string} cle - empreinte
 * @param {*} valeur - resultat a memoriser
 * @returns {*} la valeur, pour pouvoir chainer
 */
function ecrire(cle, valeur) {
  if (typeof cle !== 'string' || cle === '') return valeur;

  // Reecrire une cle existante la remet en fin de file : elle redevient la
  // plus « fraiche » et ne sera donc pas la prochaine evincee.
  if (entrees.has(cle)) entrees.delete(cle);

  entrees.set(cle, { valeur, expireA: horloge() + DUREE_DE_VIE_MS });

  while (entrees.size > TAILLE_MAX) {
    const plusAncienne = entrees.keys().next().value;
    entrees.delete(plusAncienne);
  }

  return valeur;
}

/**
 * Coeur du module : ne calcule que ce qui n'a jamais ete calcule.
 *
 * Si le PDF est deja connu, `calculer` n'est PAS appelee du tout — c'est
 * tout l'interet : zero appel au modele, reponse instantanee.
 *
 * Si le meme PDF est demande plusieurs fois EN MEME TEMPS (le mode Decouverte
 * lance ses appels en parallele), une seule extraction part reellement : les
 * autres attendent son resultat.
 *
 * Une erreur pendant le calcul n'est jamais memorisee : un echec reseau ne
 * doit pas condamner ce CV pour l'heure qui vient.
 *
 * @param {Buffer} buffer - contenu du fichier PDF
 * @param {Function} calculer - fonction (potentiellement async) sans argument
 * @returns {Promise<*>}
 */
async function memoiser(buffer, calculer) {
  if (typeof calculer !== 'function') {
    throw new TypeError('memoiser attend une fonction de calcul en second argument');
  }

  const cle = empreinte(buffer);
  // Buffer illisible : on ne sait pas l'identifier, donc on ne memorise
  // rien, mais on ne prive pas l'appelant de son resultat pour autant.
  if (cle === null) return calculer();

  const entree = _chercher(cle);
  if (entree !== undefined) {
    succes += 1;
    return entree.valeur;
  }

  // Meme fichier deja en cours d'extraction : on se greffe dessus.
  const dejaLancee = enCours.get(cle);
  if (dejaLancee) {
    succes += 1;
    return dejaLancee;
  }

  echecs += 1;
  // Le wrapper async transforme une erreur SYNCHRONE de calculer() en rejet,
  // sinon elle sauterait le nettoyage de enCours.
  // Rien n'est ecrit en cas d'erreur : un timeout reseau ne doit pas
  // condamner ce CV pendant une heure.
  const promesse = (async () => calculer())().then((valeur) => {
    ecrire(cle, valeur);
    return valeur;
  });

  enCours.set(cle, promesse);
  // On retire l'extraction en cours quoi qu'il arrive, mais seulement si
  // c'est bien la notre (vider() a pu en relancer une autre entre-temps).
  const nettoyer = () => { if (enCours.get(cle) === promesse) enCours.delete(cle); };
  promesse.then(nettoyer, nettoyer);

  return promesse;
}

/**
 * Vide entierement le cache.
 * Utile aux tests, et disponible si un jour on veut offrir un bouton
 * « effacer mes donnees » : la promesse de confidentialite doit etre
 * actionnable, pas seulement documentee.
 */
function vider() {
  entrees.clear();
  enCours.clear();
  succes = 0;
  echecs = 0;
}

/**
 * @returns {{entrees: number, succes: number, echecs: number}}
 */
function statistiques() {
  return { entrees: entrees.size, succes, echecs };
}

module.exports = {
  empreinte,
  lire,
  ecrire,
  memoiser,
  vider,
  statistiques,
  DUREE_DE_VIE_MS,
  TAILLE_MAX,
  _utiliserHorloge
};
