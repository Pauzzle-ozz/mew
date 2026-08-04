/**
 * Appels backend de l'ecran Parametres : le choix du fournisseur de modele.
 *
 * POURQUOI CE FICHIER EXISTE
 * Regle du projet : aucune page ne fait `fetch` elle-meme. Tout passe par
 * lib/api/, qui traduit les pannes en phrases lisibles (lireReponse et
 * messageErreurReseau de ./config).
 *
 * DEUX PRECAUTIONS PROPRES A CET ECRAN
 *
 * 1. LES ROUTES PEUVENT NE PAS EXISTER. Les routes /api/ia sont recentes :
 *    quelqu'un qui tourne avec un backend plus ancien recevra un 404. Un 404
 *    sur une LECTURE n'est pas une panne, c'est « ce backend ne sait pas
 *    encore faire » : on renvoie null et la page l'explique. Un 404 sur une
 *    ECRITURE leve, avec la marche a suivre.
 *
 * 2. LA CLE NE REDESCEND JAMAIS EN CLAIR. Le backend est cense n'envoyer
 *    qu'une version masquee (« sk-...4f2a »). On ne lui fait quand meme pas
 *    aveuglement confiance : masquerParPrudence() re-masque tout ce qui
 *    arriverait entier. Et la cle n'est JAMAIS mise en parametre d'URL, meme
 *    pour lister des modeles : une adresse finit dans les journaux du serveur,
 *    l'historique du navigateur et les traces de proxy. Elle ne voyage que
 *    dans un corps de requete.
 *
 * FORME DES REPONSES
 * Les fonctions ci-dessous suivent backend/src/routes/ia.js, mais elles
 * NORMALISENT ce qu'elles recoivent plutot que d'exiger un champ precis :
 * elles acceptent plusieurs ecritures plausibles d'un meme renseignement
 * (`cleApi` masquee ou `cleMasquee`, `coutEstime` ou `cout`, tableau nu ou
 * objet enveloppe). Une difference de nommage entre les deux moities du
 * projet doit couter un champ manquant, jamais un ecran vide.
 */

import { API_URL, lireReponse, messageErreurReseau } from './config';

const BASE_IA = `${API_URL}/api/ia`;

/** Les deux roles du projet, si le backend ne les annonce pas lui-meme. */
export const ROLES = ['redaction', 'extraction'];

/**
 * Ce que le backend a repondu quand la route n'existe pas encore.
 * Message unique : il est affiche tel quel a l'utilisateur.
 */
const MESSAGE_ROUTE_ABSENTE =
  "Ce backend Mew ne connait pas encore l'ecran Parametres (route /api/ia absente). "
  + 'Mets a jour le dossier backend/ puis relance `cd backend && npm run dev`.';

// ---------------------------------------------------------------------------
// Petits convertisseurs
// ---------------------------------------------------------------------------

/** Chaine non vide, ou null. Evite les « undefined » affiches dans l'interface. */
const texte = (valeur) => (typeof valeur === 'string' && valeur.trim() !== '' ? valeur.trim() : null);

/** Nombre fini, ou null. Un prix absent ne doit pas devenir NaN a l'ecran. */
const nombre = (valeur) => {
  const n = Number(valeur);
  return Number.isFinite(n) ? n : null;
};

/**
 * Re-masque une cle qui arriverait entiere.
 *
 * Le backend masque deja. Ce filet sert au cas ou : une cle affichee en clair
 * dans une page ouverte au bureau, c'est une cle compromise. On garde le debut
 * (il identifie le fournisseur) et la fin (il identifie la cle), on efface le
 * milieu.
 */
function masquerParPrudence(valeur) {
  const brut = texte(valeur);
  if (!brut) return null;

  // Deja masquee par le backend : on n'y touche pas.
  if (/\.\.\.|…|\*{2,}|•{2,}/.test(brut)) return brut;

  // Trop courte pour etre une vraie cle : probablement deja un resume.
  if (brut.length <= 12) return brut;

  return `${brut.slice(0, 5)}...${brut.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Le transport
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Normalisation du catalogue
// ---------------------------------------------------------------------------

/**
 * Un modele du catalogue, dans la forme attendue par l'interface.
 * `entree`, `sortie` et `contexte` valent null quand on ne les connait pas :
 * c'est le cas des modeles decouverts en direct chez Ollama ou OpenRouter.
 * L'interface affiche alors « tarif inconnu » plutot qu'un faux zero.
 */
function normaliserModele(brut) {
  if (!brut) return null;

  // Le listage en direct peut renvoyer une simple liste de chaines.
  if (typeof brut === 'string') {
    return { id: brut, nom: brut, entree: null, sortie: null, contexte: null, roles: [] };
  }

  const id = texte(brut.id) || texte(brut.modele) || texte(brut.name);
  if (!id) return null;

  return {
    id,
    nom: texte(brut.nom) || texte(brut.name) || id,
    entree: nombre(brut.entree),
    sortie: nombre(brut.sortie),
    contexte: nombre(brut.contexte),
    roles: Array.isArray(brut.roles) ? brut.roles.filter((r) => typeof r === 'string') : [],
  };
}

function normaliserFournisseur(brut) {
  const id = texte(brut && brut.id);
  if (!id) return null;

  return {
    id,
    nom: texte(brut.nom) || id,
    adaptateur: texte(brut.adaptateur) || 'openai-compatible',
    baseURL: texte(brut.baseURL) || texte(brut.baseUrl),
    // Par defaut on suppose qu'une cle est demandee : c'est le cas le plus
    // frequent, et se tromper dans ce sens fait au pire afficher un champ
    // inutile, alors que l'inverse cacherait un champ indispensable.
    cleRequise: brut.cleRequise !== false,
    urlCle: texte(brut.urlCle),
    prefixeCle: texte(brut.prefixeCle),
    local: brut.local === true,
    paliergratuit: brut.paliergratuit === true || brut.palierGratuit === true,
    listageDynamique: brut.listageDynamique === true,
    note: texte(brut.note) || '',
    modeles: (Array.isArray(brut.modeles) ? brut.modeles : []).map(normaliserModele).filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// Les six appels
// ---------------------------------------------------------------------------

/**
 * Le catalogue des fournisseurs.
 *
 * @returns {Promise<{fournisseurs: Array, roles: Array<string>, verifieLe: string|null}|null>}
 *   null si le backend ne connait pas encore /api/ia.
 */
export async function getFournisseurs() {
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
    roles: Array.isArray(data.roles) && data.roles.length > 0 ? data.roles : ROLES,
    verifieLe: texte(data && data.verifieLe),
    etat: normaliserEtat(data && data.etat),
  };
}

/**
 * D'ou vient la configuration reellement utilisee par le backend.
 *
 * `verrouilleParEnv` est le champ important : quand backend/.env impose une
 * cle, tout ce que l'utilisateur enregistre ici reste sans effet. Le lui
 * cacher serait le pire des scenarios — il changerait de modele, verrait
 * « enregistre », et rien ne bougerait.
 */
function normaliserEtat(brut) {
  if (!brut || typeof brut !== 'object') return null;

  return {
    source: texte(brut.source),                 // 'env' | 'fichier' | 'aucune'
    verrouilleParEnv: brut.verrouilleParEnv === true,
    active: brut.active === true,
    note: texte(brut.note),
  };
}

/**
 * La configuration enregistree.
 *
 * @returns {Promise<object|null>} null si rien n'est configure OU si la route
 *   n'existe pas : dans les deux cas l'interface part d'un formulaire vierge.
 */
export async function getConfig() {
  const data = await appeler(
    `${BASE_IA}/config`,
    undefined,
    'Impossible de lire la configuration',
    { tolerer404: true }
  );
  if (!data || typeof data !== 'object') return null;

  const modeles = data.modeles && typeof data.modeles === 'object' ? data.modeles : {};

  // Le backend renvoie la cle DEJA masquee dans le champ `cleApi`
  // (configUtilisateur.lireMasquee). masquerParPrudence la laisse telle quelle
  // et ne se declenche que si une cle entiere arrivait un jour par accident.
  const cleMasquee = masquerParPrudence(
    data.cleMasquee || data.cleApiMasquee || data.cleApi || data.cle
  );

  return {
    fournisseur: texte(data.fournisseur) || texte(data.idFournisseur),
    baseURL: texte(data.baseURL) || texte(data.baseUrl),
    modeleRedaction: texte(modeles.redaction) || texte(data.modeleRedaction),
    modeleExtraction: texte(modeles.extraction) || texte(data.modeleExtraction),
    cleMasquee,
    // Une cle peut etre enregistree sans que le backend en renvoie un apercu :
    // on accepte les differentes facons de le dire.
    cleEnregistree: data.aUneCle === true
      || data.cleEnregistree === true
      || data.clePresente === true
      || Boolean(cleMasquee),
    // « configure » = un fournisseur connu, au moins un modele, et une cle si
    // ce fournisseur en exige une. Une configuration a moitie remplie vaut
    // false.
    configure: data.configure === true,
    etat: normaliserEtat(data.etat),
  };
}

/**
 * Enregistre la configuration.
 *
 * @param {object} config
 * @param {string} config.fournisseur
 * @param {string|null} config.baseURL      adresse personnalisee, ou null
 * @param {string|null} config.cleApi       LA NOUVELLE cle, ou null pour
 *   conserver celle deja enregistree. On n'envoie jamais la version masquee :
 *   elle ecraserait la vraie cle par « sk-...4f2a ».
 * @param {string|null} config.modeleRedaction
 * @param {string|null} config.modeleExtraction
 */
export async function enregistrerConfig({
  fournisseur,
  baseURL = null,
  cleApi = null,
  modeleRedaction = null,
  modeleExtraction = null,
}) {
  const corps = {
    fournisseur,
    baseURL,
    // Les deux ecritures sont envoyees volontairement : l'imbriquee suit le
    // vocabulaire des roles, les plates sont l'ecriture la plus courante cote
    // Express. Un champ en trop est ignore par le backend, un champ manquant
    // ferait perdre le choix de l'utilisateur sans qu'il comprenne pourquoi.
    modeles: { redaction: modeleRedaction, extraction: modeleExtraction },
    modeleRedaction,
    modeleExtraction,
  };

  // La cle n'est ajoutee au corps QUE si l'utilisateur en a saisi une nouvelle.
  // Cote backend, une cle absente veut dire « garde celle deja enregistree ».
  if (texte(cleApi)) corps.cleApi = cleApi.trim();

  const data = await appeler(
    `${BASE_IA}/config`,
    { method: 'PUT', ...enJson(corps) },
    "Impossible d'enregistrer la configuration"
  );

  // Le backend accepte des configurations imparfaites (modele absent du
  // catalogue, prefixe de cle inhabituel) et le signale plutot que de refuser.
  // Ces remarques doivent remonter jusqu'a l'utilisateur.
  return {
    avertissements: (Array.isArray(data && data.avertissements) ? data.avertissements : [])
      .map(texte)
      .filter(Boolean),
  };
}

/** Efface la configuration enregistree (cle comprise). */
export async function supprimerConfig() {
  return appeler(
    `${BASE_IA}/config`,
    { method: 'DELETE' },
    'Impossible de supprimer la configuration'
  );
}

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
 * Une cle n'a rien a faire dans une URL : elle finirait dans les journaux du
 * serveur, l'historique du navigateur et les traces de proxy. C'est ce qui
 * permet de coller sa cle et de voir aussitot les modeles, avant d'enregistrer
 * quoi que ce soit.
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

/**
 * Essaie la configuration AVANT de l'enregistrer.
 *
 * CETTE FONCTION NE LEVE JAMAIS. Un test qui echoue n'est pas un bug de
 * l'application : c'est precisement son resultat, et il doit s'afficher dans
 * le meme encadre que le succes. Tout est donc traduit en objet resultat, y
 * compris un backend eteint (code RESEAU).
 *
 * @returns {Promise<{
 *   ok: boolean, etape: string|null, suitLesConsignes: boolean,
 *   latenceMs: number|null, cout: {eur: number|null, usd: number|null}|null,
 *   usage: {tokensEntree: number|null, tokensSortie: number|null}|null,
 *   modele: string|null, avertissement: string|null,
 *   message: string|null, code: string|null
 * }>}
 */
export async function testerConnexion({
  fournisseur,
  baseURL = null,
  cleApi = null,
  modele = null,
  role = 'redaction',
}) {
  const corps = { fournisseur, baseURL, modele, role };
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

/** Met la reponse du test dans une forme unique, quelle que soit son ecriture. */
function normaliserTest(data, okParDefaut) {
  const brut = data && typeof data === 'object' ? data : {};

  // Un avertissement peut arriver seul ou en liste (« format non respecte »,
  // « le modele a ajoute du texte autour »...).
  const avertissements = []
    .concat(brut.avertissement || [], brut.avertissements || [])
    .map(texte)
    .filter(Boolean);

  // Le backend nomme ce champ `coutEstime` (testConnexion.js) ; `cout` est
  // accepte au cas ou il serait renomme un jour.
  const brutCout = brut.coutEstime || brut.cout;
  const cout = brutCout && typeof brutCout === 'object'
    ? { eur: nombre(brutCout.eur), usd: nombre(brutCout.usd) }
    : null;

  const usage = brut.usage && typeof brut.usage === 'object'
    ? {
      tokensEntree: nombre(brut.usage.tokensEntree ?? brut.usage.prompt_tokens),
      tokensSortie: nombre(brut.usage.tokensSortie ?? brut.usage.completion_tokens),
    }
    : null;

  return {
    ok: brut.ok === undefined ? okParDefaut !== false : brut.ok === true,
    // Jusqu'ou le test est alle : 'connexion', 'authentification', 'format'.
    etape: texte(brut.etape),
    // LE champ decisif quand ok vaut true : le modele a repondu, mais a-t-il
    // respecte le format que Mew lui demande ? Un « non » ne bloque rien, il
    // annonce des lettres mal decoupees. Absent = on ne suppose pas le pire.
    suitLesConsignes: brut.suitLesConsignes !== false,
    latenceMs: nombre(brut.latenceMs ?? brut.latence ?? brut.dureeMs),
    cout,
    usage,
    modele: texte(brut.modele),
    avertissement: avertissements.length > 0 ? avertissements.join(' ') : null,
    message: texte(brut.message) || texte(brut.erreur),
    code: texte(brut.code),
  };
}
