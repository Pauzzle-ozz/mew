const test = require('node:test');
const assert = require('node:assert');

const { creerAuth, jetonDeLEntete } = require('../src/middleware/auth');

/**
 * Ce fichier garde une regle simple : en mode « supabase », l'identifiant
 * utilise par le serveur vient du JETON, jamais du corps de la requete.
 *
 * Sans ce test, il suffirait qu'un jour quelqu'un reecrive une route avec
 * `req.body.userId` pour rouvrir la faille sans que personne ne le voie :
 * tout continuerait a fonctionner normalement... y compris pour celui qui
 * demanderait les candidatures de son voisin.
 */

/** Fabrique une fausse requete Express. */
const requete = ({ body, params, query, entete } = {}) => ({
  body: body || {},
  params: params || {},
  query: query || {},
  headers: entete ? { authorization: entete } : {}
});

/** Fabrique une fausse reponse Express qui retient ce qu'on lui donne. */
function reponse() {
  return {
    statut: null,
    corps: null,
    status(code) { this.statut = code; return this; },
    json(donnees) { this.corps = donnees; return this; }
  };
}

/** Execute le middleware et dit s'il a laisse passer la requete. */
async function executer(middleware, req) {
  const res = reponse();
  let passe = false;
  await middleware(req, res, () => { passe = true; });
  return { passe, res };
}

// ---------------------------------------------------------------------------
// Lecture de l'en-tete
// ---------------------------------------------------------------------------

test('le jeton est lu quelle que soit la casse de « Bearer »', () => {
  assert.equal(jetonDeLEntete({ headers: { authorization: 'Bearer abc.def' } }), 'abc.def');
  assert.equal(jetonDeLEntete({ headers: { authorization: 'bearer abc.def' } }), 'abc.def');
  assert.equal(jetonDeLEntete({ headers: { authorization: '  BEARER   abc.def  ' } }), 'abc.def');
});

test('un en-tete absent ou d\'un autre type ne donne aucun jeton', () => {
  assert.equal(jetonDeLEntete({ headers: {} }), '');
  assert.equal(jetonDeLEntete({}), '');
  assert.equal(jetonDeLEntete({ headers: { authorization: 'Basic abcdef' } }), '');
});

// ---------------------------------------------------------------------------
// Mode local
// ---------------------------------------------------------------------------

test('mode local : l\'identifiant du corps de la requete est accepte', async () => {
  const auth = creerAuth({ mode: 'local' });
  const req = requete({ body: { userId: 'utilisateur-1' } });

  const { passe } = await executer(auth, req);

  assert.ok(passe);
  assert.equal(req.userId, 'utilisateur-1');
  assert.equal(req.identiteVerifiee, false, 'rien n\'a ete verifie, et on ne pretend pas le contraire');
});

test('mode local : l\'identifiant peut venir de l\'URL ou de la query', async () => {
  const auth = creerAuth({ mode: 'local' });

  const parUrl = requete({ params: { userId: 'depuis-url' } });
  await executer(auth, parUrl);
  assert.equal(parUrl.userId, 'depuis-url');

  const parQuery = requete({ query: { userId: 'depuis-query' } });
  await executer(auth, parQuery);
  assert.equal(parQuery.userId, 'depuis-query');
});

test('mode local : sans identifiant, la requete passe avec userId null', async () => {
  // C'est la route qui decide si elle en a besoin (la candidature spontanee
  // fonctionne sans compte : elle envoie l'email sans rien enregistrer).
  const auth = creerAuth({ mode: 'local' });
  const req = requete();

  const { passe } = await executer(auth, req);

  assert.ok(passe);
  assert.equal(req.userId, null);
});

// ---------------------------------------------------------------------------
// Mode supabase
// ---------------------------------------------------------------------------

const verificateur = async (jeton) => (jeton === 'jeton-valide' ? 'utilisateur-vrai' : null);

test('mode supabase : sans en-tete Authorization, c\'est 401', async () => {
  const auth = creerAuth({ mode: 'supabase', verifierJeton: verificateur });
  const { passe, res } = await executer(auth, requete({ body: { userId: 'utilisateur-1' } }));

  assert.equal(passe, false);
  assert.equal(res.statut, 401);
  assert.match(res.corps.error, /Authentification requise/);
});

test('mode supabase : un jeton invalide est refuse avec un message clair', async () => {
  const auth = creerAuth({ mode: 'supabase', verifierJeton: verificateur });
  const { passe, res } = await executer(auth, requete({ entete: 'Bearer jeton-bidon' }));

  assert.equal(passe, false);
  assert.equal(res.statut, 401);
  assert.match(res.corps.error, /invalide ou expire/i);
});

test('mode supabase : l\'identifiant vient du jeton, PAS du corps de la requete', async () => {
  // Le coeur du sujet : le client se declare « victime », son jeton dit
  // « utilisateur-vrai ». C'est le jeton qui doit gagner.
  const auth = creerAuth({ mode: 'supabase', verifierJeton: verificateur });
  const req = requete({
    entete: 'Bearer jeton-valide',
    body: { userId: 'victime' },
    params: { userId: 'victime' }
  });

  const { passe } = await executer(auth, req);

  assert.ok(passe);
  assert.equal(req.userId, 'utilisateur-vrai');
  assert.equal(req.identiteVerifiee, true);
});

test('mode supabase : un service d\'authentification en panne donne 503, pas 401', async () => {
  // Distinguer les deux compte : un 401 envoie l'utilisateur se reconnecter
  // en boucle pour un probleme qui n'est pas chez lui.
  const auth = creerAuth({
    mode: 'supabase',
    verifierJeton: async () => { throw new Error('reseau injoignable'); }
  });

  const { passe, res } = await executer(auth, requete({ entete: 'Bearer jeton-valide' }));

  assert.equal(passe, false);
  assert.equal(res.statut, 503);
});

test('un AUTH_MODE inconnu refuse tout au lieu d\'ouvrir les donnees', async () => {
  // Une faute de frappe dans le .env ne doit jamais se traduire par
  // « aucune verification ».
  const auth = creerAuth({ mode: 'supabse' });
  const req = requete({ body: { userId: 'utilisateur-1' } });

  const { passe, res } = await executer(auth, req);

  assert.equal(passe, false);
  assert.equal(res.statut, 503);
  assert.match(res.corps.error, /AUTH_MODE/);
  assert.equal(req.userId, undefined);
});
