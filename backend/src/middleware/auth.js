const config = require('../config');
const { creer } = require('../lib/logger');

const log = creer('Auth');

/**
 * Qui parle ?
 *
 * REGLE DE CE FICHIER, A NE JAMAIS OUBLIER :
 * une donnee envoyee par le client ne prouve JAMAIS son identite.
 * Seul un jeton signe, verifie cote serveur, le fait.
 *
 * Un `userId` dans le corps d'une requete, dans l'URL ou dans un cookie non
 * signe, c'est du texte que n'importe qui peut ecrire. Tant que le serveur
 * s'en contente, connaitre l'identifiant de quelqu'un suffit a lire et
 * modifier ses candidatures.
 *
 * DEUX MODES, choisis par AUTH_MODE dans backend/.env :
 *
 *   local (defaut)
 *     On accepte l'identifiant envoye par le client, tel quel. C'est un
 *     choix assume, pas un oubli : Mew est concu pour tourner sur TA
 *     machine, pour toi seul, avec le serveur en ecoute sur 127.0.0.1.
 *     Dans ce cadre il n'y a personne d'autre a qui se faire passer.
 *
 *   supabase
 *     On lit l'en-tete « Authorization: Bearer <jeton> », on le fait
 *     verifier par Supabase, et l'identifiant retenu vient du jeton
 *     VERIFIE — jamais du corps de la requete. C'est le mode obligatoire
 *     des que plusieurs personnes partagent la meme installation.
 *
 * Le middleware pose `req.userId`. Les routes ne doivent plus JAMAIS lire
 * `req.body.userId` ni `req.params.userId` : sinon le mode supabase ne
 * protegerait rien.
 */

const MODES_CONNUS = ['local', 'supabase'];

/**
 * Extrait le jeton de l'en-tete Authorization.
 * Tolere les espaces en trop et « bearer » en minuscules.
 */
function jetonDeLEntete(req) {
  const brut = (req && req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const trouve = /^bearer\s+(.+)$/i.exec(String(brut).trim());
  return trouve ? trouve[1].trim() : '';
}

/**
 * Identifiant propose par le client. Utilise UNIQUEMENT en mode local.
 * On regarde le corps, puis l'URL, puis la query, parce que les routes
 * existantes utilisent les trois selon les cas.
 */
function identifiantPropose(req) {
  for (const source of [req.body, req.params, req.query]) {
    if (source && typeof source === 'object' && source.userId) {
      const valeur = String(source.userId).trim();
      if (valeur) return valeur;
    }
  }
  return null;
}

// Client Supabase dedie a la verification des jetons, cree paresseusement.
// Il est distinct de lib/supabaseClient.js volontairement : on peut vouloir
// verifier des jetons Supabase tout en gardant le stockage local.
let clientAuth = null;

function clientSupabase() {
  if (clientAuth) return clientAuth;
  const { createClient } = require('@supabase/supabase-js');
  clientAuth = createClient(
    config.authentification.supabaseUrl,
    config.authentification.supabaseCle,
    // Le backend n'a pas de session a maintenir : il verifie un jeton
    // fourni a chaque requete, et rien d'autre.
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return clientAuth;
}

/**
 * Demande a Supabase a qui appartient ce jeton.
 * @returns {Promise<string|null>} l'identifiant utilisateur, ou null si le
 *          jeton est invalide, expire ou revoque.
 */
async function verifierJetonSupabase(jeton) {
  const { data, error } = await clientSupabase().auth.getUser(jeton);
  if (error || !data || !data.user || !data.user.id) return null;
  return data.user.id;
}

const refuser = (res, message) => res.status(401).json({ success: false, error: message });

/**
 * Fabrique le middleware.
 *
 * Les options servent aux tests (mode force, verification simulee) : en
 * production on utilise l'export `auth`, qui lit la configuration.
 *
 * @param {Object} [options]
 * @param {string} [options.mode] - 'local' ou 'supabase'
 * @param {Function} [options.verifierJeton] - (jeton) => Promise<string|null>
 */
function creerAuth(options = {}) {
  const mode = options.mode || config.authentification.mode;
  const verifierJeton = options.verifierJeton || verifierJetonSupabase;
  const verificationInjectee = Boolean(options.verifierJeton);

  return async function auth(req, res, next) {
    // Ce middleware est monte a DEUX endroits : sur le routeur (pour qu'aucune
    // route ne puisse etre oubliee) et sur les routes dont l'identifiant est
    // dans l'URL — parce qu'a l'echelle du routeur, Express n'a pas encore
    // rempli req.params. On ne refait donc pas le travail deux fois : ce
    // serait un appel reseau de plus a Supabase pour le meme resultat.
    if (req.identiteVerifiee === true) return next();
    if (mode === 'local' && req.userId) return next();

    // --- Mode local -------------------------------------------------------
    if (mode === 'local') {
      // On fait confiance au client. C'est documente dans SECURITY.md, et
      // c'est la raison pour laquelle le serveur n'ecoute que sur 127.0.0.1.
      req.userId = identifiantPropose(req);
      req.identiteVerifiee = false;
      return next();
    }

    // --- Mode inconnu -----------------------------------------------------
    // Une faute de frappe dans AUTH_MODE ne doit pas ouvrir les donnees en
    // grand : on refuse, en expliquant quoi corriger.
    if (!MODES_CONNUS.includes(mode)) {
      log.error(`AUTH_MODE=« ${mode} » n'existe pas. Valeurs possibles : local, supabase.`);
      return res.status(503).json({
        success: false,
        error: `Configuration invalide : AUTH_MODE=« ${mode} » n'existe pas. `
          + 'Mets AUTH_MODE=local (usage personnel) ou AUTH_MODE=supabase (plusieurs utilisateurs).'
      });
    }

    // --- Mode supabase ----------------------------------------------------
    if (!verificationInjectee && !config.capacites.authentificationVerifiee) {
      // Fail closed : mieux vaut tout refuser que laisser croire que les
      // donnees sont protegees alors qu'aucune verification n'est possible.
      return res.status(503).json({
        success: false,
        error: 'AUTH_MODE=supabase mais SUPABASE_URL ou SUPABASE_ANON_KEY est absente de '
          + 'backend/.env. Aucune verification n\'est possible, toutes les requetes sont refusees.'
      });
    }

    const jeton = jetonDeLEntete(req);
    if (!jeton) {
      return refuser(res, 'Authentification requise : ajoute l\'en-tete '
        + '« Authorization: Bearer <jeton> » a ta requete. Reconnecte-toi si le probleme persiste.');
    }

    let identifiant;
    try {
      identifiant = await verifierJeton(jeton);
    } catch (erreur) {
      // Supabase injoignable : c'est une panne, pas un refus. On ne dit
      // surtout pas « jeton invalide », ce serait envoyer l'utilisateur
      // chercher un probleme qui n'existe pas chez lui.
      log.error('Verification du jeton impossible:', erreur.message);
      return res.status(503).json({
        success: false,
        error: 'Impossible de verifier ton identite pour le moment (service '
          + 'd\'authentification injoignable). Reessaie dans quelques instants.'
      });
    }

    if (!identifiant) {
      return refuser(res, 'Jeton invalide ou expire. Reconnecte-toi pour continuer.');
    }

    // L'identifiant vient du jeton verifie. Celui envoye dans le corps de la
    // requete est ignore : c'est tout l'interet de ce mode.
    req.userId = identifiant;
    req.identiteVerifiee = true;
    return next();
  };
}

module.exports = {
  auth: creerAuth(),
  creerAuth,
  jetonDeLEntete,
  verifierJetonSupabase
};
