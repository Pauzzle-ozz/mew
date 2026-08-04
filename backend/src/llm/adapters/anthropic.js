/**
 * Adaptateur natif Anthropic (Claude).
 *
 * POURQUOI CE FICHIER EXISTE
 * Mew laisse l'utilisateur choisir son fournisseur. La plupart parlent le
 * dialecte d'OpenAI et passent par l'adaptateur « openai-compatible ».
 * Anthropic, non : point d'entree different, en-tetes differentes, reponse
 * decoupee en blocs. On ecrit donc son dialecte a la main.
 *
 * POURQUOI PAS LE SDK @anthropic-ai/sdk
 * Une dependance de plus a installer, a mettre a jour et a auditer, pour
 * un seul appel HTTP. `fetch` est natif dans Node 22 : il suffit.
 *
 * CE QUE CE FICHIER NE FAIT PAS
 * Il n'interprete pas la reponse. Il rend du TEXTE. Le decoupage en
 * donnees structurees se fait ailleurs, avec des marqueurs texte
 * (voir src/llm/parseurs/) — c'est ce qui rend le projet portable.
 *
 * Reference : https://platform.claude.com/docs/en/api/messages
 */

// Valeurs par defaut. Elles vivent ici et pas dans le catalogue parce que
// l'adaptateur doit rester appelable seul, avec le strict minimum.
const BASE_URL_PAR_DEFAUT = 'https://api.anthropic.com/v1';
const VERSION_API = '2023-06-01';
const MAX_TOKENS_PAR_DEFAUT = 4096;
const TIMEOUT_PAR_DEFAUT_MS = 120000;
const TIMEOUT_LISTE_PAR_DEFAUT_MS = 15000;

/**
 * Anthropic EXIGE max_tokens dans la requete, contrairement a OpenAI.
 * Sans valeur, l'API repond 400. On en fournit donc toujours une.
 */

/**
 * jsonMode n'existe pas chez Anthropic sous la forme d'un interrupteur.
 * On demande le JSON en francais, dans le prompt, et on laisse le parseur
 * du projet nettoyer. C'est exactement le pari de l'architecture : une
 * consigne texte marche partout, un mode contraint ne marche nulle part.
 */
const CONSIGNE_JSON = 'Reponds UNIQUEMENT avec un objet JSON valide, '
  + 'sans phrase autour et sans bloc de code.';

// ---------------------------------------------------------------------------
// Outils internes
// ---------------------------------------------------------------------------

/**
 * Construit une erreur porteuse d'un `.code` du contrat commun.
 * Codes possibles : CLE_INVALIDE, QUOTA_DEPASSE, MODELE_INTROUVABLE,
 * TIMEOUT, RESEAU, FOURNISSEUR.
 */
function erreur(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/**
 * Masque une cle API pour l'affichage : « sk-ant-abc...4f2a ».
 *
 * Regle absolue du projet : une cle ne doit JAMAIS apparaitre en clair,
 * ni dans un log, ni dans un message d'erreur. Mais dire a l'utilisateur
 * « la cle qui finit par 4f2a est refusee » l'aide a comprendre laquelle
 * de ses cles pose probleme.
 */
function masquer(cle) {
  if (typeof cle !== 'string' || cle.length < 8) return '***';
  return `${cle.slice(0, 3)}...${cle.slice(-4)}`;
}

/**
 * Filet de securite : si jamais un fournisseur renvoyait la cle dans son
 * message d'erreur (ca arrive quand la cle voyage dans l'URL), on la
 * remplace avant de la recopier quelque part.
 */
function nettoyer(texte, cle) {
  const brut = typeof texte === 'string' ? texte : '';
  if (typeof cle !== 'string' || cle.length < 8) return brut;
  return brut.split(cle).join(masquer(cle));
}

/**
 * Ramene une adresse a la racine versionnee de l'API.
 *
 * Le catalogue donne l'adresse nue (« https://api.anthropic.com »), un
 * utilisateur qui colle l'URL de la doc donnera « .../v1 », et un relais
 * maison peut donner « http://localhost:8080/proxy ». Les trois doivent
 * marcher : on ajoute « /v1 » seulement s'il n'y a pas deja un segment de
 * version a la fin. Sans ca, l'un des deux cas part sur un 404 muet.
 */
function racineApi(base) {
  const racine = String(base || BASE_URL_PAR_DEFAUT).trim().replace(/\/+$/, '');
  return /\/v\d+[a-z]*$/i.test(racine) ? racine : `${racine}/v1`;
}

/** Colle la racine et un chemin sans jamais produire de double slash. */
function joindre(base, chemin) {
  return `${racineApi(base)}/${String(chemin).replace(/^\/+/, '')}`;
}

/**
 * Extrait « https://api.anthropic.com » d'une URL complete, pour les
 * messages d'erreur. Une URL malformee ne doit pas faire planter le
 * message qui explique justement qu'elle est malformee.
 */
function origine(url) {
  try {
    return new URL(url).origin;
  } catch {
    return String(url);
  }
}

/** Un delai valide, sinon la valeur par defaut. Jamais NaN, jamais 0. */
function delai(timeoutMs, defaut) {
  const n = Number(timeoutMs);
  return Number.isFinite(n) && n > 0 ? n : defaut;
}

/**
 * Traduit une panne de transport (pas de reponse HTTP du tout).
 * `AbortSignal.timeout` fait rejeter fetch avec une erreur nommee
 * « TimeoutError » ; une connexion refusee ou un DNS mort donne un
 * TypeError « fetch failed ».
 */
function erreurTransport(err, url, ms) {
  const nom = err && err.name;
  if (nom === 'TimeoutError' || nom === 'AbortError') {
    return erreur('TIMEOUT', `Anthropic n'a pas repondu en moins de ${Math.round(ms / 1000)} secondes. `
      + 'Reessaie, ou choisis un modele plus rapide.');
  }
  return erreur('RESEAU', `Impossible de joindre ${origine(url)}. `
    + 'Verifie ta connexion internet, et l\'adresse du serveur si tu utilises un relais.');
}

/**
 * Traduit une reponse HTTP en erreur du contrat commun.
 *
 * On se fie au code HTTP en priorite : c'est ce qu'Anthropic documente, et
 * c'est aussi ce que renvoient les relais compatibles.
 */
function erreurHttp(statut, corps, cle, modele) {
  const messageFournisseur = nettoyer(
    corps && corps.error && corps.error.message ? corps.error.message : '',
    cle
  );

  if (statut === 401 || statut === 403) {
    return erreur('CLE_INVALIDE', `Anthropic refuse cette cle API (${masquer(cle)}). `
      + 'Verifie qu\'elle est correcte et toujours active sur console.anthropic.com.');
  }
  if (statut === 429 || statut === 402) {
    return erreur('QUOTA_DEPASSE', 'Anthropic a refuse la demande : credit epuise ou trop de '
      + 'requetes en peu de temps. Reessaie dans quelques minutes, ou verifie le solde de ton compte.');
  }
  if (statut === 404) {
    return erreur('MODELE_INTROUVABLE', `Le modele « ${modele} » n'existe pas chez Anthropic `
      + '(ou n\'est pas accessible avec cette cle). Choisis-en un autre.');
  }

  // 400 : requete refusee. Le message d'Anthropic est en anglais et souvent
  // technique, mais il est le seul a dire ce qui cloche exactement — on le
  // cite APRES une phrase francaise qui donne le contexte.
  const detail = messageFournisseur ? ` Detail du fournisseur : ${messageFournisseur}` : '';
  return erreur('FOURNISSEUR', `Anthropic a renvoye une erreur (HTTP ${statut}).${detail}`);
}

/**
 * Lit le corps d'une reponse. On passe par `.text()` puis JSON.parse plutot
 * que par `.json()` : quand un relais renvoie une page HTML d'erreur, on
 * veut pouvoir la montrer (tronquee) au lieu de crasher sur le parseur.
 */
async function lireCorps(reponse) {
  const brut = await reponse.text();
  try {
    return { brut, json: brut ? JSON.parse(brut) : null };
  } catch {
    return { brut, json: null };
  }
}

/** Convertit en nombre positif, 0 sinon. Les compteurs viennent du reseau. */
function nombre(valeur) {
  const n = Number(valeur);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ---------------------------------------------------------------------------
// Contrat
// ---------------------------------------------------------------------------

/**
 * Envoie un prompt a Claude et renvoie du texte.
 *
 * @param {object} options
 * @param {string} [options.baseURL]     racine de l'API (relais possible)
 * @param {string} options.cleApi        cle de l'utilisateur, jamais logguee
 * @param {string} options.modele        ex. « claude-sonnet-4-6 »
 * @param {string} options.prompt        le texte a envoyer
 * @param {number} [options.temperature] 0 a 1 chez Anthropic
 * @param {number} [options.maxTokens]   obligatoire cote API, defaut 4096
 * @param {boolean} [options.jsonMode]   ajoute une consigne JSON au prompt
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{texte: string, usage: {tokensEntree: number, tokensSortie: number}, modele: string}>}
 */
async function completer({
  baseURL, cleApi, modele, prompt, temperature, maxTokens, jsonMode, timeoutMs
} = {}) {
  if (typeof cleApi !== 'string' || cleApi.trim() === '') {
    throw erreur('CLE_INVALIDE', 'Aucune cle API Anthropic n\'est renseignee. '
      + 'Ajoute ta cle dans les reglages pour utiliser Claude.');
  }
  if (typeof modele !== 'string' || modele.trim() === '') {
    throw erreur('MODELE_INTROUVABLE', 'Aucun modele Anthropic n\'a ete choisi.');
  }
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    throw erreur('FOURNISSEUR', 'Le prompt envoye a Anthropic est vide.');
  }

  const ms = delai(timeoutMs, TIMEOUT_PAR_DEFAUT_MS);
  const url = joindre(baseURL, 'messages');
  const texteEnvoye = jsonMode ? `${prompt}\n\n${CONSIGNE_JSON}` : prompt;

  const corpsEnvoye = {
    model: modele,
    max_tokens: nombre(maxTokens) || MAX_TOKENS_PAR_DEFAUT,
    messages: [{ role: 'user', content: texteEnvoye }]
  };

  // Anthropic n'accepte la temperature que de 0 a 1, la ou OpenAI monte a 2.
  // Un appelant qui envoie 1.5 recevrait un 400 incomprehensible : on borne.
  if (Number.isFinite(Number(temperature))) {
    corpsEnvoye.temperature = Math.min(1, Math.max(0, Number(temperature)));
  }

  let reponse;
  let corps;
  try {
    reponse = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cleApi,
        'anthropic-version': VERSION_API
      },
      body: JSON.stringify(corpsEnvoye),
      signal: AbortSignal.timeout(ms)
    });
    corps = await lireCorps(reponse);
  } catch (err) {
    throw erreurTransport(err, url, ms);
  }

  if (!reponse.ok) {
    throw erreurHttp(reponse.status, corps.json, cleApi, modele);
  }
  if (!corps.json || typeof corps.json !== 'object') {
    throw erreur('FOURNISSEUR', 'Anthropic a renvoye une reponse illisible '
      + '(ce n\'est pas du JSON). Verifie l\'adresse du serveur.');
  }

  // La reponse est une LISTE de blocs : texte, raisonnement, appels d'outils.
  // On ne garde que le texte et on recolle les morceaux dans l'ordre.
  const blocs = Array.isArray(corps.json.content) ? corps.json.content : [];
  const texte = blocs
    .filter((bloc) => bloc && bloc.type === 'text' && typeof bloc.text === 'string')
    .map((bloc) => bloc.text)
    .join('');

  if (texte.trim() === '') {
    // Refus de securite, ou reponse tronquee avant le premier mot. Rendre une
    // chaine vide ferait croire a l'appelant que tout s'est bien passe.
    const raison = corps.json.stop_reason;
    const pourquoi = raison === 'refusal'
      ? 'Claude a refuse de repondre a cette demande.'
      : `Claude n'a renvoye aucun texte (raison d'arret : ${raison || 'inconnue'}).`;
    throw erreur('FOURNISSEUR', `${pourquoi} Reformule ta demande ou essaie un autre modele.`);
  }

  const usage = corps.json.usage || {};
  return {
    texte,
    usage: {
      tokensEntree: nombre(usage.input_tokens),
      tokensSortie: nombre(usage.output_tokens)
    },
    modele: typeof corps.json.model === 'string' && corps.json.model ? corps.json.model : modele
  };
}

/**
 * Liste les modeles disponibles avec cette cle.
 *
 * Renvoie `null` si la liste n'a pas pu etre obtenue, QUELLE QUE SOIT la
 * raison — et ne leve donc jamais. C'est volontaire : cette fonction sert a
 * enrichir le catalogue statique, pas a valider une cle. Si elle echoue,
 * l'utilisateur garde la liste ecrite en dur et rien ne casse. Pour savoir
 * si une cle marche, il faut appeler `completer`.
 *
 * @returns {Promise<Array<{id: string, nom: string}>|null>}
 */
async function listerModeles({ baseURL, cleApi, timeoutMs } = {}) {
  if (typeof cleApi !== 'string' || cleApi.trim() === '') return null;

  const ms = delai(timeoutMs, TIMEOUT_LISTE_PAR_DEFAUT_MS);
  const url = `${joindre(baseURL, 'models')}?limit=1000`;

  try {
    const reponse = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': cleApi,
        'anthropic-version': VERSION_API
      },
      signal: AbortSignal.timeout(ms)
    });
    if (!reponse.ok) return null;

    const { json } = await lireCorps(reponse);
    if (!json || !Array.isArray(json.data)) return null;

    const modeles = json.data
      .filter((m) => m && typeof m.id === 'string' && m.id !== '')
      .map((m) => ({
        id: m.id,
        nom: typeof m.display_name === 'string' && m.display_name ? m.display_name : m.id
      }));

    // Une liste vide n'est pas une liste : mieux vaut le catalogue statique.
    return modeles.length > 0 ? modeles : null;
  } catch {
    return null;
  }
}

module.exports = {
  id: 'anthropic',
  completer,
  listerModeles
};
