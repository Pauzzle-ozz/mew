/**
 * Adaptateur « compatible OpenAI ».
 *
 * POURQUOI CE FICHIER EXISTE
 * Mew laisse l'utilisateur choisir son fournisseur d'IA. Or la quasi-totalite
 * des fournisseurs parlent le MEME protocole que l'API d'OpenAI : une requete
 * POST /chat/completions avec des messages, une reponse avec des choices.
 * OpenAI, Mistral, Groq, DeepSeek, Kimi, xAI, Together, Fireworks, Cerebras,
 * OpenRouter, Ollama et LM Studio sont donc tous couverts par ce seul fichier :
 * on change juste `baseURL` et `cleApi` a chaque appel.
 *
 * DEUX REGLES QUI STRUCTURENT TOUT LE CODE CI-DESSOUS
 *
 * 1. Une cle API ne doit JAMAIS ressortir : ni dans un message d'erreur, ni
 *    dans un log, ni vers le navigateur. Tout texte qui sort d'ici passe par
 *    masquerTexte().
 *
 * 2. Une erreur qui remonte a l'utilisateur doit etre en francais et
 *    comprehensible par quelqu'un qui ne programme pas. Le SDK, lui, parle
 *    anglais et technique (« 401 Incorrect API key provided: sk-... »). On
 *    traduit donc systematiquement vers les six codes du contrat :
 *    CLE_INVALIDE, QUOTA_DEPASSE, MODELE_INTROUVABLE, TIMEOUT, RESEAU,
 *    FOURNISSEUR.
 */

const OpenAI = require('openai');

const ID = 'openai-compatible';

// Une minute : large pour un gros modele distant, supportable pour un modele
// local qui demarre (Ollama charge parfois plusieurs Go avant de repondre).
const DELAI_DEFAUT_MS = 60000;

// Valeur de repli quand personne ne precise d'adresse.
const BASE_URL_DEFAUT = 'https://api.openai.com/v1';

// Le SDK exige une chaine non vide meme quand le serveur ignore la cle
// (Ollama, LM Studio). On lui donne un mot quelconque.
const CLE_FACTICE = 'local';

// Une temperature non precisee vaut 1.0 chez OpenAI, soit le maximum de
// variabilite. Comme ailleurs dans le projet, on prefere la stabilite.
const TEMPERATURE_DEFAUT = 0.2;

/* ------------------------------------------------------------------ */
/* Outils de securite : rien qui ressemble a une cle ne doit sortir    */
/* ------------------------------------------------------------------ */

/**
 * Reduit une cle a ses extremites : « sk-proj-abcd1234efgh » -> « sk-...efgh ».
 * Assez pour reconnaitre de quelle cle on parle, inutile pour s'en servir.
 */
function masquerCle(cle) {
  if (typeof cle !== 'string' || cle.trim() === '') return '(aucune cle)';
  const propre = cle.trim();
  if (propre.length <= 8) return '...';
  return `${propre.slice(0, 3)}...${propre.slice(-4)}`;
}

// Motif volontairement large : sk-, sk-proj-, gsk_ (Groq), xai-, or- (OpenRouter),
// AIza (Google), ou toute suite assez longue precedee de « key ».
const MOTIF_CLE = /\b(?:sk|gsk|xai|or|api|key|token|bearer)[-_ ]?[A-Za-z0-9_-]{12,}\b|\bAIza[A-Za-z0-9_-]{20,}\b/gi;

/**
 * Derniere ligne de defense avant qu'un texte ne sorte d'ici.
 * On masque la cle connue (si on l'a) ET tout ce qui ressemble a une cle,
 * parce que le fournisseur recopie parfois la cle dans son message d'erreur.
 */
function masquerTexte(texte, cleApi) {
  if (typeof texte !== 'string' || texte === '') return '';
  let sortie = texte;

  if (typeof cleApi === 'string' && cleApi.trim().length >= 8) {
    // split/join plutot que replace : aucun risque qu'un caractere special
    // de la cle soit interprete comme un motif d'expression reguliere.
    sortie = sortie.split(cleApi.trim()).join(masquerCle(cleApi));
  }

  return sortie.replace(MOTIF_CLE, (trouve) => masquerCle(trouve));
}

/* ------------------------------------------------------------------ */
/* Adresse du serveur                                                  */
/* ------------------------------------------------------------------ */

/**
 * Nettoie l'adresse saisie par l'utilisateur.
 *
 * Piege classique : on colle « http://localhost:11434 » (l'adresse affichee
 * par Ollama) au lieu de « http://localhost:11434/v1 ». Le SDK appelle alors
 * /chat/completions, recoit un 404, et l'utilisateur croit que son modele
 * n'existe pas. On ajoute donc /v1 quand l'adresse n'a aucun chemin.
 */
function normaliserBaseURL(baseURL) {
  const brut = typeof baseURL === 'string' && baseURL.trim() !== ''
    ? baseURL.trim()
    : BASE_URL_DEFAUT;

  const sansSlash = brut.replace(/\/+$/, '');

  try {
    const url = new URL(sansSlash);
    if (url.pathname === '' || url.pathname === '/') return `${sansSlash}/v1`;
  } catch (_) {
    // Adresse illisible : on la laisse telle quelle, le SDK levera une erreur
    // qu'on saura traduire. Ce n'est pas ici qu'on valide la configuration.
  }

  return sansSlash;
}

const HOTES_LOCAUX = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'];

/**
 * Ce serveur tourne-t-il sur la machine de l'utilisateur (ou sur son reseau) ?
 * Sert a deux choses : choisir le bon message d'erreur reseau, et savoir
 * qu'une cle API n'est probablement pas necessaire.
 */
function estLocal(baseURL) {
  try {
    const hote = new URL(baseURL).hostname.toLowerCase();
    if (HOTES_LOCAUX.includes(hote)) return true;
    if (hote.endsWith('.local')) return true;
    // Reseau prive : un Ollama installe sur le PC du salon, par exemple.
    if (/^10\./.test(hote) || /^192\.168\./.test(hote)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hote)) return true;
    return false;
  } catch (_) {
    return false;
  }
}

/**
 * Nomme le service pour que le message d'erreur parle a l'utilisateur.
 * « Ollama ne repond pas » est cent fois plus utile que « ECONNREFUSED ».
 */
function nomDuService(baseURL) {
  try {
    const url = new URL(baseURL);
    if (url.port === '11434') return 'Ollama';
    if (url.port === '1234') return 'LM Studio';
    if (estLocal(baseURL)) return 'Le serveur local';
    return url.hostname;
  } catch (_) {
    return 'Le fournisseur';
  }
}

/* ------------------------------------------------------------------ */
/* Erreurs : traduction du SDK vers les codes du contrat               */
/* ------------------------------------------------------------------ */

/**
 * Fabrique une erreur conforme au contrat : un `.code` parmi les six prevus,
 * un `.message` en francais. `statut` et `detail` sont un bonus pour le
 * debogage — `detail` est TOUJOURS masque.
 */
function erreurLlm(code, message, extra = {}) {
  const erreur = new Error(message);
  erreur.code = code;
  erreur.adaptateur = ID;
  if (extra.statut !== undefined) erreur.statut = extra.statut;
  if (extra.detail) erreur.detail = extra.detail;
  return erreur;
}

/**
 * Recupere tous les noms possibles d'une erreur.
 * Le SDK d'OpenAI ne renseigne pas `.name` sur ses sous-classes : sans
 * `constructor.name`, on ne distinguerait pas un timeout d'une coupure reseau.
 */
function nomsDe(erreur) {
  const noms = [];
  if (!erreur) return noms;
  if (typeof erreur.name === 'string') noms.push(erreur.name);
  if (erreur.constructor && typeof erreur.constructor.name === 'string') {
    noms.push(erreur.constructor.name);
  }
  return noms;
}

/**
 * Suit la chaine des `cause` pour ramasser les codes systeme.
 * Un ECONNREFUSED de Node arrive enfoui a deux niveaux sous l'erreur du SDK.
 */
function codesSysteme(erreur) {
  const codes = [];
  let courant = erreur;
  for (let profondeur = 0; courant && profondeur < 5; profondeur += 1) {
    if (typeof courant.code === 'string') codes.push(courant.code.toUpperCase());
    if (typeof courant.errno === 'string') codes.push(courant.errno.toUpperCase());
    courant = courant.cause;
  }
  return codes;
}

/** Rassemble tout le texte exploitable d'une erreur, causes comprises. */
function texteDe(erreur) {
  const morceaux = [];
  let courant = erreur;
  for (let profondeur = 0; courant && profondeur < 5; profondeur += 1) {
    if (typeof courant.message === 'string') morceaux.push(courant.message);
    if (courant.error && typeof courant.error.message === 'string') {
      morceaux.push(courant.error.message);
    }
    courant = courant.cause;
  }
  return morceaux.join(' | ');
}

const CODES_RESEAU = [
  'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'EHOSTUNREACH',
  'ENETUNREACH', 'EPIPE', 'EADDRNOTAVAIL', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT'
];

const CODES_TIMEOUT = ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'];

/** Le fournisseur n'a pas repondu a temps, ou la requete a ete abandonnee. */
function estTimeout(erreur) {
  const noms = nomsDe(erreur).join(' ');
  if (/Timeout|AbortError/i.test(noms)) return true;
  if (codesSysteme(erreur).some((c) => CODES_TIMEOUT.includes(c))) return true;
  return /timed out|timeout|aborted|abort/i.test(texteDe(erreur));
}

/** Le serveur est injoignable : eteint, adresse fausse, pas de reseau. */
function estReseau(erreur) {
  if (codesSysteme(erreur).some((c) => CODES_RESEAU.includes(c))) return true;
  if (nomsDe(erreur).some((n) => n === 'APIConnectionError')) return true;
  return /connection error|fetch failed|getaddrinfo|socket hang up|network|econnrefused/i
    .test(texteDe(erreur));
}

/**
 * Traduit n'importe quelle erreur en erreur du contrat.
 *
 * L'ordre compte : un statut HTTP est l'indice le plus fiable, on le regarde
 * en premier. Ce n'est qu'en son absence (le SDK met `status` a undefined pour
 * les problemes de transport) qu'on inspecte le transport puis le texte.
 *
 * @param {*} erreur l'erreur brute (SDK, fetch, ou objet imitant l'un des deux)
 * @param {{baseURL?: string, modele?: string, cleApi?: string}} contexte
 * @returns {Error} avec .code et .message en francais
 */
function traduireErreur(erreur, contexte = {}) {
  // Une erreur deja traduite (levee par nous plus haut dans la pile) ne doit
  // pas etre retraduite : elle porterait alors un message moins precis.
  if (erreur && erreur.adaptateur === ID && typeof erreur.code === 'string') return erreur;

  const baseURL = normaliserBaseURL(contexte.baseURL);
  const service = nomDuService(baseURL);
  const modele = contexte.modele || 'le modele demande';
  const detail = masquerTexte(texteDe(erreur), contexte.cleApi).slice(0, 400);
  const statut = erreur && Number.isFinite(Number(erreur.status)) ? Number(erreur.status) : null;
  const codeApi = erreur && typeof erreur.code === 'string' ? erreur.code.toLowerCase() : '';

  // Certains fournisseurs signalent le credit epuise avec un statut inattendu :
  // le code applicatif est alors plus parlant que le statut HTTP.
  if (codeApi === 'insufficient_quota' || /insufficient_quota|insufficient balance|no credit|quota exceeded/i.test(detail)) {
    return erreurLlm('QUOTA_DEPASSE',
      `Le credit de ton compte ${service} est epuise. Recharge-le ou attends le renouvellement de ton quota.`,
      { statut, detail });
  }

  if (statut !== null) {
    if (statut === 401) {
      return erreurLlm('CLE_INVALIDE',
        `${service} refuse ta cle API (${masquerCle(contexte.cleApi)}). Verifie que tu l'as copiee en entier et qu'elle est toujours active.`,
        { statut, detail });
    }
    if (statut === 403) {
      return erreurLlm('CLE_INVALIDE',
        `${service} refuse l'acces avec cette cle API (${masquerCle(contexte.cleApi)}). Elle n'a peut-etre pas le droit d'utiliser ce modele.`,
        { statut, detail });
    }
    if (statut === 402) {
      return erreurLlm('QUOTA_DEPASSE',
        `${service} demande un paiement : ton credit est epuise. Recharge ton compte pour continuer.`,
        { statut, detail });
    }
    if (statut === 404) {
      return erreurLlm('MODELE_INTROUVABLE',
        `Le modele « ${modele} » est introuvable sur ${baseURL}. Verifie son nom exact, ou l'adresse du serveur.`,
        { statut, detail });
    }
    if (statut === 429) {
      return erreurLlm('QUOTA_DEPASSE',
        `${service} a recu trop de requetes d'un coup, ou ton quota est atteint. Attends une minute et reessaie.`,
        { statut, detail });
    }
    if (statut === 408 || statut === 504) {
      return erreurLlm('TIMEOUT',
        `${service} a mis trop de temps a repondre. Reessaie, ou choisis un modele plus rapide.`,
        { statut, detail });
    }
    if (statut === 400 || statut === 422) {
      return erreurLlm('FOURNISSEUR',
        `${service} a refuse la requete (elle ne correspond pas a ce qu'il attend). Detail technique : ${detail || 'aucun'}`,
        { statut, detail });
    }
    if (statut >= 500) {
      return erreurLlm('FOURNISSEUR',
        `${service} rencontre un probleme de son cote (erreur ${statut}). Ce n'est pas ta faute : reessaie dans un moment.`,
        { statut, detail });
    }
    return erreurLlm('FOURNISSEUR',
      `${service} a renvoye une erreur inattendue (code ${statut}). Detail technique : ${detail || 'aucun'}`,
      { statut, detail });
  }

  // Pas de statut : le probleme est en amont de la reponse HTTP.
  if (estTimeout(erreur)) {
    return erreurLlm('TIMEOUT',
      `${service} n'a pas repondu dans le temps imparti. `
      + (estLocal(baseURL)
        ? 'Un modele local peut etre tres lent au premier appel : reessaie, ou prends un modele plus petit.'
        : 'Reessaie, ou choisis un modele plus rapide.'),
      { detail });
  }

  if (estReseau(erreur)) {
    return erreurLlm('RESEAU',
      estLocal(baseURL)
        ? `${service} ne repond pas sur ${baseURL}. Verifie qu'il est bien lance sur ta machine.`
        : `Impossible de joindre ${service} (${baseURL}). Verifie ta connexion internet et l'adresse du serveur.`,
      { detail });
  }

  return erreurLlm('FOURNISSEUR',
    `Reponse incomprehensible de ${service}. Detail technique : ${detail || 'aucun'}`,
    { detail });
}

/* ------------------------------------------------------------------ */
/* Mode JSON : demander, et savoir renoncer                            */
/* ------------------------------------------------------------------ */

const MOTIF_JSON_REFUSE = /response_format|json[ _-]?object|json[ _-]?mode|json[ _-]?schema|structured output/i;

const MOTIF_NON_SUPPORTE = /unsupported|not supported|unrecognized|unknown (?:parameter|field|argument|key)|extra (?:inputs|fields)|invalid[_ ]?(?:parameter|argument|request)|does not support|unexpected keyword|no such/i;

/**
 * Le fournisseur a-t-il refuse la requete A CAUSE du mode JSON ?
 *
 * POURQUOI : beaucoup de petits modeles locaux (llama.cpp, certains modeles
 * servis par Ollama) ne connaissent pas `response_format`. Echouer serait
 * absurde : le projet sait deja reparer un JSON approximatif (reparerJson
 * dans services/aiService.js). Mieux vaut donc redemander sans l'option.
 *
 * On reste prudent : il faut a la fois un statut de requete invalide ET un
 * message qui mentionne le format, sinon on relancerait un appel payant a
 * chaque fois qu'un prompt est trop long.
 */
function refuseLeModeJson(erreur) {
  if (!erreur) return false;
  const statut = Number(erreur.status);
  const texte = texteDe(erreur);

  const statutSuspect = statut === 400 || statut === 422 || statut === 501 || statut === 500;
  if (!statutSuspect) return false;

  // Le message nomme explicitement le format : aucun doute possible.
  if (MOTIF_JSON_REFUSE.test(texte)) return true;

  // Message vague (« Unsupported parameter ») : on tente quand meme, c'est le
  // seul parametre optionnel qu'on envoie.
  return MOTIF_NON_SUPPORTE.test(texte);
}

/**
 * Lance l'appel, avec un unique repli si le mode JSON est refuse.
 *
 * Le client est passe en parametre (et non cree ici) pour que les tests
 * puissent fournir un faux client et verifier le repli sans reseau.
 *
 * @param {{chat: {completions: {create: Function}}}} client
 * @param {Object} params corps de la requete, deja pret
 * @param {boolean} jsonMode
 * @returns {Promise<Object>} la reponse brute du fournisseur
 */
async function appelerAvecRepli(client, params, jsonMode) {
  if (!jsonMode) return client.chat.completions.create(params);

  try {
    return await client.chat.completions.create({
      ...params,
      response_format: { type: 'json_object' }
    });
  } catch (erreur) {
    if (!refuseLeModeJson(erreur)) throw erreur;
    // Une seule seconde chance, sans l'option : si celle-ci echoue aussi,
    // l'erreur remonte telle quelle et sera traduite normalement.
    return client.chat.completions.create(params);
  }
}

/* ------------------------------------------------------------------ */
/* Lecture de la reponse                                               */
/* ------------------------------------------------------------------ */

const nombre = (valeur) => {
  const n = Number(valeur);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Les compteurs de tokens sont facultatifs et nommes differemment selon les
 * fournisseurs. On ne fait confiance a rien : 0 par defaut, jamais NaN.
 */
function lireUsage(usage) {
  if (!usage || typeof usage !== 'object') return { tokensEntree: 0, tokensSortie: 0 };
  return {
    tokensEntree: nombre(usage.prompt_tokens !== undefined ? usage.prompt_tokens : usage.input_tokens),
    tokensSortie: nombre(usage.completion_tokens !== undefined ? usage.completion_tokens : usage.output_tokens)
  };
}

/**
 * Extrait le texte de la reponse.
 * Certains serveurs locaux renvoient `content: null` avec le vrai texte dans
 * `reasoning_content`, ou repondent avec l'ancien champ `text`.
 */
function lireTexte(reponse) {
  const choix = reponse && Array.isArray(reponse.choices) ? reponse.choices[0] : null;
  if (!choix) return null;

  const message = choix.message || {};
  if (typeof message.content === 'string' && message.content !== '') return message.content;
  if (typeof choix.text === 'string' && choix.text !== '') return choix.text;
  if (typeof message.reasoning_content === 'string' && message.reasoning_content !== '') {
    return message.reasoning_content;
  }
  // Une chaine vide reste une reponse (le modele n'a rien eu a dire).
  return typeof message.content === 'string' ? message.content : null;
}

/* ------------------------------------------------------------------ */
/* Le contrat                                                          */
/* ------------------------------------------------------------------ */

/**
 * Cree un client SDK pour CET appel.
 *
 * On n'en garde aucun en cache : baseURL, cle et delai changent d'un appel a
 * l'autre selon ce que l'utilisateur a configure, et un cache melangeant deux
 * cles serait le pire des bugs possibles. Le cout de construction est
 * negligeable a cote d'un appel reseau.
 */
function creerClient({ baseURL, cleApi, timeoutMs }) {
  return new OpenAI({
    apiKey: (typeof cleApi === 'string' && cleApi.trim() !== '') ? cleApi.trim() : CLE_FACTICE,
    baseURL,
    timeout: nombre(timeoutMs) || DELAI_DEFAUT_MS,
    // Le SDK reessaie tout seul sur les erreurs passageres. Deux tentatives
    // suffisent : au-dela, l'utilisateur attend sans comprendre pourquoi.
    maxRetries: 1
  });
}

/**
 * Envoie un prompt, renvoie du texte. C'est tout.
 *
 * @param {Object} options
 * @param {string} options.baseURL   adresse de l'API (ex. https://api.mistral.ai/v1)
 * @param {string} [options.cleApi]  cle de l'utilisateur (inutile en local)
 * @param {string} options.modele    identifiant du modele chez ce fournisseur
 * @param {string} options.prompt    le texte envoye au modele
 * @param {number} [options.temperature]
 * @param {number} [options.maxTokens]
 * @param {boolean} [options.jsonMode]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{texte: string, usage: {tokensEntree: number, tokensSortie: number}, modele: string}>}
 */
async function completer(options = {}) {
  const { cleApi, modele, prompt, temperature, maxTokens, jsonMode, timeoutMs } = options;
  const baseURL = normaliserBaseURL(options.baseURL);

  if (typeof prompt !== 'string' || prompt.trim() === '') {
    throw erreurLlm('FOURNISSEUR', "Aucun texte n'a ete envoye au modele : la demande est vide.");
  }
  if (typeof modele !== 'string' || modele.trim() === '') {
    throw erreurLlm('MODELE_INTROUVABLE',
      "Aucun modele n'a ete choisi. Selectionne un modele dans les reglages avant de lancer l'outil.");
  }

  // Un serveur distant sans cle, c'est un 401 garanti : autant le dire tout de
  // suite plutot que de faire attendre l'utilisateur pour rien.
  const aUneCle = typeof cleApi === 'string' && cleApi.trim() !== '';
  if (!aUneCle && !estLocal(baseURL)) {
    throw erreurLlm('CLE_INVALIDE',
      `Aucune cle API n'est enregistree pour ${nomDuService(baseURL)}. Ajoute la tienne dans les reglages.`);
  }

  const params = {
    model: modele.trim(),
    messages: [{ role: 'user', content: prompt }],
    temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : TEMPERATURE_DEFAUT
  };
  if (nombre(maxTokens) > 0) params.max_tokens = Math.round(nombre(maxTokens));

  let reponse;
  try {
    reponse = await appelerAvecRepli(creerClient({ baseURL, cleApi, timeoutMs }), params, Boolean(jsonMode));
  } catch (erreur) {
    throw traduireErreur(erreur, { baseURL, modele, cleApi });
  }

  const texte = lireTexte(reponse);
  if (texte === null) {
    throw erreurLlm('FOURNISSEUR',
      `${nomDuService(baseURL)} a repondu, mais sa reponse ne contient aucun texte exploitable. Reessaie, ou change de modele.`);
  }

  return {
    texte,
    usage: lireUsage(reponse.usage),
    // Le fournisseur renvoie parfois un nom plus precis que celui demande
    // (« gpt-4o » devient « gpt-4o-2024-11-20 ») : c'est celui-la qui compte
    // pour le calcul du cout.
    modele: (reponse && typeof reponse.model === 'string' && reponse.model !== '')
      ? reponse.model
      : modele.trim()
  };
}

/**
 * Normalise la liste renvoyee par GET /models.
 * Chaque fournisseur a ses champs : OpenRouter donne un `name` lisible,
 * Ollama et OpenAI ne donnent que l'`id`.
 *
 * @returns {Array<{id: string, nom: string}>|null} null si rien d'exploitable
 */
function normaliserModeles(reponse) {
  const liste = Array.isArray(reponse) ? reponse
    : (reponse && Array.isArray(reponse.data)) ? reponse.data
      : null;
  if (!liste) return null;

  const modeles = liste
    .filter((m) => m && typeof m.id === 'string' && m.id.trim() !== '')
    .map((m) => ({
      id: m.id.trim(),
      nom: (typeof m.name === 'string' && m.name.trim() !== '') ? m.name.trim()
        : (typeof m.display_name === 'string' && m.display_name.trim() !== '') ? m.display_name.trim()
          : m.id.trim()
    }));

  if (modeles.length === 0) return null;

  // Tri alphabetique : l'ordre renvoye par les fournisseurs est arbitraire et
  // une liste qui bouge a chaque rafraichissement est desagreable a l'usage.
  return modeles.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Demande au client la liste des modeles. Isole du reste pour que les tests
 * puissent injecter un faux client.
 */
async function listerAvec(client) {
  const reponse = await client.models.list();

  // Le SDK renvoie un objet paginable : `data` est presente, mais on accepte
  // aussi un simple tableau au cas ou le fournisseur reponde plus simplement.
  if (Array.isArray(reponse)) return normaliserModeles(reponse);
  if (reponse && Array.isArray(reponse.data)) return normaliserModeles(reponse.data);
  if (reponse && Array.isArray(reponse.body && reponse.body.data)) return normaliserModeles(reponse.body.data);
  return null;
}

/**
 * Liste les modeles disponibles chez ce fournisseur.
 *
 * Renvoie null — et non une erreur — quand le fournisseur n'expose tout
 * simplement pas cet endpoint : ce n'est pas un probleme, le catalogue
 * statique prend alors le relais.
 *
 * En revanche, une cle refusee, un quota depasse ou un serveur injoignable
 * sont des situations que l'utilisateur doit voir : celles-la sont levees,
 * traduites en francais.
 *
 * @returns {Promise<Array<{id: string, nom: string}>|null>}
 */
async function listerModeles(options = {}) {
  const { cleApi, timeoutMs } = options;
  const baseURL = normaliserBaseURL(options.baseURL);

  try {
    return await listerAvec(creerClient({ baseURL, cleApi, timeoutMs }));
  } catch (erreur) {
    const traduite = traduireErreur(erreur, { baseURL, cleApi });

    // Endpoint absent ou reponse illisible : on abandonne en silence.
    if (traduite.code === 'MODELE_INTROUVABLE' || traduite.code === 'FOURNISSEUR') return null;

    throw traduite;
  }
}

module.exports = {
  id: ID,
  completer,
  listerModeles,

  /**
   * Rouages internes, exposes UNIQUEMENT pour les tests : ils permettent de
   * verifier la traduction des erreurs et le repli JSON sans appeler la
   * moindre API. Ne pas utiliser depuis le reste du code.
   */
  interne: {
    traduireErreur,
    refuseLeModeJson,
    appelerAvecRepli,
    normaliserBaseURL,
    normaliserModeles,
    listerAvec,
    lireUsage,
    lireTexte,
    masquerCle,
    masquerTexte,
    estLocal,
    nomDuService,
    DELAI_DEFAUT_MS
  }
};
