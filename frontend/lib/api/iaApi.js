/**
 * Appels backend de l'espace Parametres : le choix des fournisseurs et des
 * modeles.
 *
 * POURQUOI CE FICHIER EXISTE
 * Regle du projet : aucune page ne fait `fetch` elle-meme. Tout passe par
 * lib/api/, qui traduit les pannes en phrases lisibles (lireReponse et
 * messageErreurReseau de ./config). La mise en forme des reponses, elle, vit
 * dans ./iaNormalisation.js.
 *
 * DEUX PRECAUTIONS PROPRES A CET ECRAN
 *
 * 1. LES ROUTES PEUVENT NE PAS EXISTER. Quelqu'un qui tourne avec un backend
 *    plus ancien recevra un 404. Un 404 sur une LECTURE n'est pas une panne,
 *    c'est « ce backend ne sait pas encore faire » : on renvoie null et la page
 *    l'explique. Un 404 sur une ECRITURE leve, avec la marche a suivre.
 *
 * 2. LA CLE NE REDESCEND JAMAIS EN CLAIR, et elle ne monte JAMAIS dans une
 *    URL — meme pour lister des modeles. Une adresse finit dans les journaux
 *    du serveur, l'historique du navigateur et les traces de proxy. La cle ne
 *    voyage que dans un corps de requete.
 */

import { API_URL, lireReponse, messageErreurReseau } from './config';
import {
  texte,
  normaliserModele,
  normaliserFournisseur,
  normaliserOutil,
  normaliserTache,
  normaliserSource,
  normaliserEtat,
  normaliserTest,
} from './iaNormalisation';

const BASE_IA = `${API_URL}/api/ia`;

/** Les deux roles du projet, si le backend ne les annonce pas lui-meme. */
const ROLES = ['redaction', 'extraction'];

/**
 * Ce que le backend a repondu quand la route n'existe pas encore.
 * Message unique : il est affiche tel quel a l'utilisateur.
 */
const MESSAGE_ROUTE_ABSENTE =
  "Ce backend Mew ne connait pas encore l'espace Parametres (route /api/ia absente). "
  + 'Mets a jour le dossier backend/ puis relance `cd backend && npm run dev`.';

/* ------------------------------------------------------------------ */
/* Le transport                                                        */
/* ------------------------------------------------------------------ */

/**
 * Enveloppe commune : traduit la panne reseau, deballe { success, data }.
 *
 * @param {boolean} tolerer404  true pour les lectures (renvoie null), false
 *   pour les ecritures (leve un message qui explique quoi faire).
 */
async function appeler(url, options, messageParDefaut, { tolerer404 = false } = {}) {
  let reponse;
  try {
    reponse = await fetch(url, options);
  } catch (erreur) {
    // fetch echoue de la meme facon que le serveur soit eteint ou injoignable :
    // messageErreurReseau donne la commande a taper plutot qu'un « Failed to fetch ».
    throw new Error(messageErreurReseau(erreur));
  }

  if (reponse.status === 404) {
    if (tolerer404) return null;
    const erreur = new Error(MESSAGE_ROUTE_ABSENTE);
    erreur.code = 'ROUTE_ABSENTE';
    erreur.status = 404;
    throw erreur;
  }

  const json = await lireReponse(reponse, messageParDefaut);

  // Convention du projet : { success, data }. Certaines routes repondent
  // directement l'objet utile — les deux sont acceptes.
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

const enJson = (corps) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corps),
});

/* ------------------------------------------------------------------ */
/* Le catalogue                                                        */
/* ------------------------------------------------------------------ */

/**
 * Tout ce qu'il faut pour construire l'espace Parametres, en un appel : les
 * fournisseurs avec leur guide, les outils de Mew, et les taches confiees a un
 * modele.
 *
 * @returns {Promise<{fournisseurs: Array, outils: Array, taches: Array,
 *   roles: Array<string>, verifieLe: string|null, source: object|null}|null>}
 *   null si le backend ne connait pas encore /api/ia.
 */
export async function getCatalogue() {
  const data = await appeler(
    `${BASE_IA}/fournisseurs`,
    undefined,
    'Impossible de recuperer la liste des fournisseurs',
    { tolerer404: true }
  );
  if (!data) return null;

  const liste = Array.isArray(data)
    ? data
    : (Array.isArray(data.fournisseurs) ? data.fournisseurs : []);

  return {
    fournisseurs: liste.map(normaliserFournisseur).filter(Boolean),
    outils: (Array.isArray(data.outils) ? data.outils : []).map(normaliserOutil).filter(Boolean),
    taches: (Array.isArray(data.taches) ? data.taches : []).map(normaliserTache).filter(Boolean),
    roles: Array.isArray(data.roles) && data.roles.length > 0 ? data.roles : ROLES,
    verifieLe: texte(data && data.verifieLe),
    source: normaliserSource(data && data.etat),
  };
}

/* ------------------------------------------------------------------ */
/* L'etat enregistre                                                   */
/* ------------------------------------------------------------------ */

/**
 * Les acces enregistres et l'affectation des taches.
 * @returns {Promise<object|null>} null si la route n'existe pas : l'interface
 *   part alors d'un ecran vierge plutot que d'afficher une panne.
 */
export async function getEtat() {
  const data = await appeler(
    `${BASE_IA}/etat`,
    undefined,
    "Impossible de lire l'etat des reglages",
    { tolerer404: true }
  );
  return data ? normaliserEtat(data) : null;
}

/**
 * Enregistre ou met a jour UN acces.
 *
 * @param {string} fournisseur
 * @param {{cleApi?: string|null, baseURL?: string|null}} acces
 *   `cleApi` a null ou vide veut dire « garde la cle deja enregistree » : on
 *   n'envoie jamais la version masquee, elle ecraserait la vraie cle.
 * @returns {Promise<object>} l'etat complet, tel que le backend le voit
 */
export async function enregistrerCompte(fournisseur, { cleApi = null, baseURL = null } = {}) {
  const corps = {};
  if (texte(cleApi)) corps.cleApi = cleApi.trim();
  if (texte(baseURL)) corps.baseURL = baseURL.trim();

  const data = await appeler(
    `${BASE_IA}/comptes/${encodeURIComponent(fournisseur)}`,
    { method: 'PUT', ...enJson(corps) },
    "Impossible d'enregistrer cet acces"
  );
  return normaliserEtat(data);
}

/** Retire un acces, cle comprise. @returns {Promise<object>} l'etat complet */
export async function supprimerCompte(fournisseur) {
  const data = await appeler(
    `${BASE_IA}/comptes/${encodeURIComponent(fournisseur)}`,
    { method: 'DELETE' },
    'Impossible de retirer cet acces'
  );
  return normaliserEtat(data);
}

/**
 * Enregistre « quelle tache, allumee ou non, quel modele de quel compte ».
 *
 * L'etat COMPLET est envoye, pas un fragment : le backend remet a leur valeur
 * par defaut les taches absentes du corps. Envoyer un fragment rendrait
 * impossible de rallumer une tache coupee.
 *
 * @param {object} taches { [idTache]: { actif, fournisseur, modele } }
 * @returns {Promise<object>} l'etat complet
 */
export async function enregistrerTaches(taches) {
  const propre = {};
  Object.keys(taches || {}).forEach((id) => {
    const reglage = taches[id] || {};
    propre[id] = {
      actif: reglage.actif !== false,
      fournisseur: texte(reglage.fournisseur) || '',
      modele: texte(reglage.modele) || '',
    };
  });

  const data = await appeler(
    `${BASE_IA}/taches`,
    { method: 'PUT', ...enJson({ taches: propre }) },
    "Impossible d'enregistrer l'affectation des taches"
  );
  return normaliserEtat(data);
}

/** Efface TOUT : tous les acces, toutes les cles, toute l'affectation. */
export async function supprimerConfig() {
  return appeler(
    `${BASE_IA}/config`,
    { method: 'DELETE' },
    'Impossible de supprimer la configuration'
  );
}

/* ------------------------------------------------------------------ */
/* Les modeles reellement disponibles                                  */
/* ------------------------------------------------------------------ */

/**
 * Les modeles reellement disponibles chez un fournisseur.
 *
 * Indispensable pour Ollama, LM Studio et llama.cpp, dont le catalogue est
 * vide par construction (il depend de ce que l'utilisateur a telecharge).
 * Precieux aussi chez OpenRouter, qui en propose des centaines.
 *
 * DEUX METHODES, ET C'EST LA CLE QUI DECIDE
 *   sans cle a transmettre  -> GET, le backend utilise celle qu'il a deja.
 *   avec une cle fraiche    -> POST, la cle voyage dans le CORPS.
 * C'est ce qui permet de coller sa cle et de voir aussitot les modeles, avant
 * d'enregistrer quoi que ce soit.
 *
 * @returns {Promise<{modeles: Array|null, source: string|null}|null>}
 *   `modeles` a null = ce fournisseur ne sait pas lister ; le catalogue fait
 *   alors foi. La fonction entiere a null = la route n'existe pas.
 */
export async function getModeles(idFournisseur, { baseURL = null, cleApi = null } = {}) {
  const chemin = `${BASE_IA}/modeles/${encodeURIComponent(idFournisseur)}`;
  const adresse = texte(baseURL);
  const cle = texte(cleApi);

  const requete = cle
    ? [chemin, { method: 'POST', ...enJson({ cleApi: cle, baseURL: adresse }) }]
    : [`${chemin}${adresse ? `?baseURL=${encodeURIComponent(adresse)}` : ''}`, undefined];

  const data = await appeler(
    requete[0],
    requete[1],
    'Impossible de lister les modeles de ce fournisseur',
    { tolerer404: true }
  );
  if (!data) return null;

  const liste = Array.isArray(data)
    ? data
    : (Array.isArray(data.modeles) ? data.modeles : null);

  return {
    modeles: liste ? liste.map(normaliserModele).filter(Boolean) : null,
    source: texte(data && data.source),
  };
}

/* ------------------------------------------------------------------ */
/* Le test                                                             */
/* ------------------------------------------------------------------ */

/**
 * Essaie un acces AVANT de l'enregistrer.
 *
 * CETTE FONCTION NE LEVE JAMAIS. Un test qui echoue n'est pas un bug de
 * l'application : c'est precisement son resultat, et il doit s'afficher dans
 * le meme encadre que le succes. Tout est donc traduit en objet resultat, y
 * compris un backend eteint (code RESEAU).
 */
export async function testerConnexion({
  fournisseur,
  baseURL = null,
  cleApi = null,
  modele = null,
}) {
  const corps = { fournisseur, baseURL, modele };
  if (texte(cleApi)) corps.cleApi = cleApi.trim();

  try {
    const data = await appeler(
      `${BASE_IA}/tester`,
      { method: 'POST', ...enJson(corps) },
      'Le test a echoue'
    );
    return normaliserTest(data, true);
  } catch (erreur) {
    // Le backend repond souvent 4xx/5xx quand le FOURNISSEUR refuse (cle
    // invalide, quota depasse). lireReponse en a fait une Error porteuse du
    // message francais et du code : on le remet dans la forme d'un resultat.
    return {
      ok: false,
      etape: null,
      suitLesConsignes: false,
      latenceMs: null,
      cout: null,
      usage: null,
      modele: null,
      avertissement: null,
      message: erreur.message || 'Le test a echoue',
      code: erreur.code && erreur.code !== 'UNKNOWN' ? erreur.code : null,
    };
  }
}

/*
 * L'ANCIENNE FORME (`GET·PUT /api/ia/config`, un fournisseur et deux modeles
 * par role) n'a plus de client ici : l'espace Parametres raisonne desormais en
 * comptes et en taches. La route existe toujours cote backend — elle documente
 * le cas simple et des tests garantissent qu'elle ne laisse pas fuir de cle —
 * mais ecrire ici une fonction que personne n'appelle serait du code mort.
 */
