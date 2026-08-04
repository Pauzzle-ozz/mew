/**
 * Adaptateur natif Google (Gemini).
 *
 * POURQUOI CE FICHIER EXISTE
 * Google ne parle pas le dialecte d'OpenAI. Le modele fait partie de
 * l'URL, la cle passe dans une en-tete a lui, le prompt est decoupe en
 * « parties », et la reponse arrive sous forme de « candidats ». On ecrit
 * donc son dialecte a la main, avec `fetch` (natif dans Node 22), sans
 * installer le SDK Google.
 *
 * LE PIEGE PROPRE A GOOGLE
 * Gemini peut repondre 200 OK avec ZERO texte : le filtre de securite a
 * bloque la generation. Ca arrivera dans Mew — un CV contient un nom, une
 * adresse, une date de naissance. Rendre une chaine vide ferait croire a
 * l'appelant que tout va bien et produirait une lettre de motivation vide.
 * Ce fichier detecte le cas et leve une erreur qui l'explique.
 *
 * Reference : https://ai.google.dev/api/generate-content
 */

const BASE_URL_PAR_DEFAUT = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_PAR_DEFAUT_MS = 120000;
const TIMEOUT_LISTE_PAR_DEFAUT_MS = 15000;

/**
 * Comme chez Anthropic : pas de mode JSON contraint, une consigne en clair.
 * Gemini sait faire du JSON force (responseMimeType), mais les anciens
 * modeles repondent 400 quand on l'envoie. Une consigne texte, elle, ne
 * casse jamais — et c'est le choix d'architecture du projet.
 */
const CONSIGNE_JSON = 'Reponds UNIQUEMENT avec un objet JSON valide, '
  + 'sans phrase autour et sans bloc de code.';

/**
 * Raisons d'arret qui signifient « j'ai bloque la generation ».
 * STOP et MAX_TOKENS sont normales : elles laissent du texte derriere elles.
 */
const ARRETS_BLOQUANTS = new Set([
  'SAFETY',
  'RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'IMAGE_SAFETY',
  'LANGUAGE'
]);

// ---------------------------------------------------------------------------
// Outils internes
// ---------------------------------------------------------------------------

function erreur(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/** « AIz...4f2a ». Une cle ne sort jamais en clair d'ici. */
function masquer(cle) {
  if (typeof cle !== 'string' || cle.length < 8) return '***';
  return `${cle.slice(0, 3)}...${cle.slice(-4)}`;
}

/**
 * Filet de securite avant de recopier un message venu de Google. La cle
 * voyage dans une en-tete et pas dans l'URL (voir plus bas), mais si un
 * relais la renvoyait quand meme, elle serait masquee ici.
 */
function nettoyer(texte, cle) {
  const brut = typeof texte === 'string' ? texte : '';
  if (typeof cle !== 'string' || cle.length < 8) return brut;
  return brut.split(cle).join(masquer(cle));
}

/**
 * Ramene une adresse a la racine versionnee de l'API.
 *
 * Le catalogue donne l'adresse nue (« https://generativelanguage.googleapis.com »),
 * la doc de Google donne « .../v1beta ». Les deux doivent marcher : on ajoute
 * « /v1beta » seulement s'il n'y a pas deja un segment de version a la fin,
 * sinon l'un des deux cas part sur un 404 muet.
 */
function racineApi(base) {
  const racine = String(base || BASE_URL_PAR_DEFAUT).trim().replace(/\/+$/, '');
  return /\/v\d+[a-z]*$/i.test(racine) ? racine : `${racine}/v1beta`;
}

/** Colle la racine et un chemin sans jamais produire de double slash. */
function joindre(base, chemin) {
  return `${racineApi(base)}/${String(chemin).replace(/^\/+/, '')}`;
}

function origine(url) {
  try {
    return new URL(url).origin;
  } catch {
    return String(url);
  }
}

function delai(timeoutMs, defaut) {
  const n = Number(timeoutMs);
  return Number.isFinite(n) && n > 0 ? n : defaut;
}

function nombre(valeur) {
  const n = Number(valeur);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Google nomme ses modeles « models/gemini-2.5-flash » dans ses listes, mais
 * l'utilisateur (et le catalogue) ecrit « gemini-2.5-flash ». On accepte les
 * deux et on ne garde que le nom court : le prefixe est deja dans l'URL.
 */
function nomCourt(modele) {
  return String(modele).trim().replace(/^models\//, '');
}

function erreurTransport(err, url, ms) {
  const nom = err && err.name;
  if (nom === 'TimeoutError' || nom === 'AbortError') {
    return erreur('TIMEOUT', `Google n'a pas repondu en moins de ${Math.round(ms / 1000)} secondes. `
      + 'Reessaie, ou choisis un modele plus rapide.');
  }
  return erreur('RESEAU', `Impossible de joindre ${origine(url)}. `
    + 'Verifie ta connexion internet, et l\'adresse du serveur si tu utilises un relais.');
}

/**
 * Traduit une reponse HTTP en erreur du contrat commun.
 *
 * Particularite Google : une cle invalide ne donne pas toujours 401. Selon
 * l'endpoint et la version, elle donne 400 avec le statut « INVALID_ARGUMENT »
 * et le message « API key not valid ». On regarde donc le code HTTP ET le
 * contenu, sinon l'utilisateur recoit « erreur 400 » la ou il aurait fallu
 * lui dire « ta cle est refusee ».
 */
function erreurHttp(statut, corps, cle, modele) {
  const info = corps && typeof corps.error === 'object' && corps.error ? corps.error : {};
  const messageFournisseur = nettoyer(typeof info.message === 'string' ? info.message : '', cle);
  const statutTexte = String(info.status || '').toUpperCase();
  const indices = `${statutTexte} ${messageFournisseur}`.toUpperCase();

  const ressembleACleInvalide = statut === 401
    || statut === 403
    || statutTexte === 'UNAUTHENTICATED'
    || statutTexte === 'PERMISSION_DENIED'
    || indices.includes('API KEY')
    || indices.includes('API_KEY_INVALID');

  if (ressembleACleInvalide) {
    return erreur('CLE_INVALIDE', `Google refuse cette cle API (${masquer(cle)}). `
      + 'Verifie qu\'elle est correcte et active sur aistudio.google.com/apikey.');
  }
  if (statut === 429 || statut === 402 || statutTexte === 'RESOURCE_EXHAUSTED') {
    return erreur('QUOTA_DEPASSE', 'Google a refuse la demande : quota depasse ou trop de '
      + 'requetes en peu de temps. Reessaie dans quelques minutes, ou verifie ton quota.');
  }
  if (statut === 404 || statutTexte === 'NOT_FOUND') {
    return erreur('MODELE_INTROUVABLE', `Le modele « ${modele} » n'existe pas chez Google `
      + '(ou n\'est pas accessible avec cette cle). Choisis-en un autre.');
  }

  const detail = messageFournisseur ? ` Detail du fournisseur : ${messageFournisseur}` : '';
  return erreur('FOURNISSEUR', `Google a renvoye une erreur (HTTP ${statut}).${detail}`);
}

async function lireCorps(reponse) {
  const brut = await reponse.text();
  try {
    return { brut, json: brut ? JSON.parse(brut) : null };
  } catch {
    return { brut, json: null };
  }
}

// ---------------------------------------------------------------------------
// Contrat
// ---------------------------------------------------------------------------

/**
 * Envoie un prompt a Gemini et renvoie du texte.
 *
 * @param {object} options
 * @param {string} [options.baseURL]
 * @param {string} options.cleApi        cle de l'utilisateur, jamais logguee
 * @param {string} options.modele        ex. « gemini-2.5-flash »
 * @param {string} options.prompt
 * @param {number} [options.temperature] 0 a 2 chez Google
 * @param {number} [options.maxTokens]
 * @param {boolean} [options.jsonMode]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{texte: string, usage: {tokensEntree: number, tokensSortie: number}, modele: string}>}
 */
async function completer({
  baseURL, cleApi, modele, prompt, temperature, maxTokens, jsonMode, timeoutMs
} = {}) {
  if (typeof cleApi !== 'string' || cleApi.trim() === '') {
    throw erreur('CLE_INVALIDE', 'Aucune cle API Google n\'est renseignee. '
      + 'Ajoute ta cle dans les reglages pour utiliser Gemini.');
  }
  if (typeof modele !== 'string' || modele.trim() === '') {
    throw erreur('MODELE_INTROUVABLE', 'Aucun modele Google n\'a ete choisi.');
  }
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    throw erreur('FOURNISSEUR', 'Le prompt envoye a Google est vide.');
  }

  const ms = delai(timeoutMs, TIMEOUT_PAR_DEFAUT_MS);
  const nom = nomCourt(modele);

  // La cle passe par l'en-tete `x-goog-api-key`, PAS par « ?key=... ».
  // Google accepte les deux, mais une URL finit toujours par se retrouver
  // dans un log ou un message d'erreur — et la regle du projet est qu'aucune
  // cle ne doit y apparaitre. L'en-tete, elle, ne fuite pas.
  const url = joindre(baseURL, `models/${encodeURIComponent(nom)}:generateContent`);

  const texteEnvoye = jsonMode ? `${prompt}\n\n${CONSIGNE_JSON}` : prompt;
  const generationConfig = {};

  // Gemini accepte 0 a 2 (les modeles recents). On borne pour eviter un 400
  // incomprehensible si l'appelant vient d'un autre fournisseur.
  if (Number.isFinite(Number(temperature))) {
    generationConfig.temperature = Math.min(2, Math.max(0, Number(temperature)));
  }
  if (nombre(maxTokens) > 0) {
    generationConfig.maxOutputTokens = nombre(maxTokens);
  }

  const corpsEnvoye = {
    contents: [{ role: 'user', parts: [{ text: texteEnvoye }] }]
  };
  // Un generationConfig vide n'apporte rien et brouille la lecture des logs.
  if (Object.keys(generationConfig).length > 0) {
    corpsEnvoye.generationConfig = generationConfig;
  }

  let reponse;
  let corps;
  try {
    reponse = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': cleApi
      },
      body: JSON.stringify(corpsEnvoye),
      signal: AbortSignal.timeout(ms)
    });
    corps = await lireCorps(reponse);
  } catch (err) {
    throw erreurTransport(err, url, ms);
  }

  if (!reponse.ok) {
    throw erreurHttp(reponse.status, corps.json, cleApi, nom);
  }
  if (!corps.json || typeof corps.json !== 'object') {
    throw erreur('FOURNISSEUR', 'Google a renvoye une reponse illisible '
      + '(ce n\'est pas du JSON). Verifie l\'adresse du serveur.');
  }

  const donnees = corps.json;

  // Cas 1 : la DEMANDE a ete bloquee. Aucun candidat n'est meme genere.
  const blocage = donnees.promptFeedback && donnees.promptFeedback.blockReason;
  if (blocage) {
    throw erreur('FOURNISSEUR', 'Google a bloque la demande avant de repondre '
      + `(filtre de securite : ${blocage}). C'est frequent avec des donnees personnelles `
      + 'comme un CV. Essaie un autre fournisseur, ou retire les informations sensibles.');
  }

  // Google peut renvoyer plusieurs candidats ; on n'en demande qu'un, et
  // c'est toujours le premier qu'on lit.
  const candidats = donnees.candidates;
  const candidat = Array.isArray(candidats) && candidats.length > 0 ? candidats[0] : null;

  if (!candidat) {
    throw erreur('FOURNISSEUR', 'Google n\'a renvoye aucune reponse, sans dire pourquoi. '
      + 'Reessaie, ou choisis un autre modele.');
  }

  const parties = candidat.content && Array.isArray(candidat.content.parts)
    ? candidat.content.parts
    : [];
  const texte = parties
    .filter((partie) => partie && typeof partie.text === 'string')
    .map((partie) => partie.text)
    .join('');

  // Cas 2 : la REPONSE a ete coupee en cours de route (ou n'a jamais commence).
  // C'est le piege annonce en tete de fichier : 200 OK, texte vide.
  if (texte.trim() === '') {
    const raison = String(candidat.finishReason || '').toUpperCase();
    if (ARRETS_BLOQUANTS.has(raison)) {
      throw erreur('FOURNISSEUR', 'Google a bloque sa propre reponse '
        + `(filtre de securite : ${raison}). C'est frequent avec des donnees personnelles `
        + 'comme un CV. Essaie un autre fournisseur, ou retire les informations sensibles.');
    }
    throw erreur('FOURNISSEUR', 'Google a repondu, mais sans aucun texte '
      + `(raison d'arret : ${raison || 'inconnue'}). Reformule ta demande ou essaie un autre modele.`);
  }

  const usage = donnees.usageMetadata || {};
  return {
    texte,
    usage: {
      tokensEntree: nombre(usage.promptTokenCount),
      tokensSortie: nombre(usage.candidatesTokenCount)
    },
    modele: typeof donnees.modelVersion === 'string' && donnees.modelVersion
      ? donnees.modelVersion
      : nom
  };
}

/**
 * Liste les modeles disponibles avec cette cle.
 *
 * Meme regle que chez Anthropic : renvoie `null` en cas d'echec, quelle que
 * soit la raison, et ne leve jamais. Cette fonction complete le catalogue
 * statique ; si elle echoue, l'utilisateur garde la liste ecrite en dur.
 *
 * @returns {Promise<Array<{id: string, nom: string}>|null>}
 */
async function listerModeles({ baseURL, cleApi, timeoutMs } = {}) {
  if (typeof cleApi !== 'string' || cleApi.trim() === '') return null;

  const ms = delai(timeoutMs, TIMEOUT_LISTE_PAR_DEFAUT_MS);
  const url = `${joindre(baseURL, 'models')}?pageSize=1000`;

  try {
    const reponse = await fetch(url, {
      method: 'GET',
      headers: { 'x-goog-api-key': cleApi },
      signal: AbortSignal.timeout(ms)
    });
    if (!reponse.ok) return null;

    const { json } = await lireCorps(reponse);
    if (!json || !Array.isArray(json.models)) return null;

    const modeles = json.models
      .filter((m) => m && typeof m.name === 'string' && m.name !== '')
      // La liste contient aussi des modeles d'embedding ou d'images, qui ne
      // savent pas repondre a generateContent. Les proposer serait un piege.
      // Quand le champ est absent (relais qui ne le renvoie pas), on garde.
      .filter((m) => !Array.isArray(m.supportedGenerationMethods)
        || m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => {
        const id = nomCourt(m.name);
        return {
          id,
          nom: typeof m.displayName === 'string' && m.displayName ? m.displayName : id
        };
      });

    return modeles.length > 0 ? modeles : null;
  } catch {
    return null;
  }
}

module.exports = {
  id: 'google',
  completer,
  listerModeles
};
