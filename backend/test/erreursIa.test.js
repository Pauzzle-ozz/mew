/**
 * Traduction des pannes du moteur d'IA en reponses HTTP.
 *
 * POURQUOI CE FICHIER EXISTE
 * Quand le choix libre du fournisseur est arrive, les adaptateurs ont commence
 * a lever des erreurs d'une forme NOUVELLE : un `.code` parmi six valeurs, et
 * un `.statut` (en francais) la ou l'ancien SDK mettait `.status`. Le
 * traducteur, lui, ne connaissait que l'ancienne forme. Resultat : une cle
 * refusee ou un Ollama eteint ne donnait plus le 503 explicatif mais un
 * « Erreur serveur inattendue » — le message le plus inutile possible, pour
 * un probleme que le serveur connaissait parfaitement.
 *
 * Ces tests verrouillent les deux formes a la fois.
 */

const test = require('node:test');
const assert = require('node:assert');

const { repondreErreurIa } = require('../src/routes/erreursIa');

/** Une fausse reponse Express qui retient ce qu'on lui a demande d'envoyer. */
function fausseReponse() {
  const res = {
    statut: null,
    corps: null,
    status(code) { this.statut = code; return this; },
    json(donnees) { this.corps = donnees; return this; }
  };
  return res;
}

/** Les six codes du contrat des adaptateurs (src/llm/adapters/). */
const CODES_DU_CONTRAT = [
  'CLE_INVALIDE', 'QUOTA_DEPASSE', 'MODELE_INTROUVABLE',
  'TIMEOUT', 'RESEAU', 'FOURNISSEUR'
];

/* ------------------------------------------------------------------ */
/* La forme moderne : les erreurs des adaptateurs                      */
/* ------------------------------------------------------------------ */

test('les six codes du contrat sont tous reconnus et donnent un 503', () => {
  for (const code of CODES_DU_CONTRAT) {
    const erreur = new Error(`Message d'origine pour ${code}.`);
    erreur.code = code;

    const res = fausseReponse();
    const gere = repondreErreurIa(res, erreur);

    assert.equal(gere, true, `${code} doit etre pris en charge`);
    assert.equal(res.statut, 503, `${code} doit repondre 503`);
    assert.equal(res.corps.success, false);
    assert.equal(res.corps.code, code, 'le code est relaye au frontend');
  }
});

test('le message de l adaptateur est conserve, pas remplace', () => {
  // L'adaptateur est le seul a savoir QUEL service et QUEL modele ont echoue.
  // Si on reecrivait le message, on perdrait cette information.
  const erreur = new Error('Le modele « llama3.2 » est introuvable sur http://localhost:11434/v1.');
  erreur.code = 'MODELE_INTROUVABLE';

  const res = fausseReponse();
  repondreErreurIa(res, erreur);

  assert.ok(res.corps.error.includes('llama3.2'), 'le nom du modele survit');
  assert.ok(res.corps.error.includes('localhost:11434'), 'l adresse survit');
});

test('chaque reponse dit QUOI FAIRE, pas seulement ce qui s est passe', () => {
  for (const code of CODES_DU_CONTRAT) {
    const erreur = new Error('Quelque chose a echoue.');
    erreur.code = code;

    const res = fausseReponse();
    repondreErreurIa(res, erreur);

    // Toutes les pannes se reparent au meme endroit, sauf le quota et le
    // reseau qui ont leur propre conseil : dans tous les cas, on ne laisse
    // jamais l'utilisateur sans piste.
    assert.ok(
      res.corps.error.length > erreur.message.length,
      `${code} doit ajouter un conseil au message d'origine`
    );
  }
});

test('LA REGLE : le detail technique du fournisseur ne sort jamais', () => {
  // `erreur.detail` contient le texte brut renvoye par le fournisseur. Il est
  // utile dans les journaux, mais il n'a rien a faire dans une reponse HTTP :
  // c'est du bruit pour l'utilisateur, et une surface de fuite en plus.
  const erreur = new Error('OpenAI refuse ta cle API (sk-p...4f2a).');
  erreur.code = 'CLE_INVALIDE';
  erreur.detail = 'Incorrect API key provided: sk-VRAIECLESECRETE1234567890';

  const res = fausseReponse();
  repondreErreurIa(res, erreur);

  const brut = JSON.stringify(res.corps);
  assert.ok(!brut.includes('VRAIECLESECRETE'), 'aucune cle en clair dans la reponse');
  assert.ok(!brut.includes('Incorrect API key provided'), 'le detail brut ne sort pas');
});

test('IA_NON_CONFIGUREE passe tel quel : il nomme deja l ecran Parametres', () => {
  const erreur = new Error('Aucun fournisseur d\'IA n\'est configure. Ouvre l\'ecran Parametres.');
  erreur.code = 'IA_NON_CONFIGUREE';

  const res = fausseReponse();
  assert.equal(repondreErreurIa(res, erreur), true);
  assert.equal(res.statut, 503);
  assert.equal(res.corps.error, erreur.message);
});

/* ------------------------------------------------------------------ */
/* L ancienne forme : statuts bruts du SDK OpenAI                      */
/* ------------------------------------------------------------------ */

test('les anciennes formes d erreur restent reconnues', () => {
  const cas = [
    [{ status: 401 }, 'CLE_INVALIDE'],
    [{ code: 'invalid_api_key' }, 'CLE_INVALIDE'],
    [{ status: 403 }, 'CLE_INVALIDE'],
    [{ status: 402 }, 'QUOTA_DEPASSE'],
    [{ code: 'insufficient_quota' }, 'QUOTA_DEPASSE'],
    [{ status: 429 }, 'QUOTA_DEPASSE'],
    [{ code: 'ECONNREFUSED' }, 'RESEAU'],
    [{ name: 'APIConnectionError' }, 'RESEAU']
  ];

  for (const [forme, codeAttendu] of cas) {
    const erreur = Object.assign(new Error('panne'), forme);
    const res = fausseReponse();

    assert.equal(repondreErreurIa(res, erreur), true, JSON.stringify(forme));
    assert.equal(res.statut, 503);
    assert.equal(res.corps.code, codeAttendu, JSON.stringify(forme));
  }
});

test('plus aucun message ne renvoie l utilisateur vers un fichier .env', () => {
  // La configuration se fait desormais dans l'interface. Un message qui parle
  // de OPENAI_API_KEY envoie l'utilisateur editer un fichier qui, la plupart
  // du temps, n'existe meme pas chez lui.
  const formes = [
    { code: 'CLE_INVALIDE' }, { code: 'QUOTA_DEPASSE' }, { code: 'RESEAU' },
    { status: 401 }, { status: 403 }, { status: 429 }, { code: 'ECONNREFUSED' }
  ];

  for (const forme of formes) {
    const erreur = Object.assign(new Error('panne'), forme);
    const res = fausseReponse();
    repondreErreurIa(res, erreur);

    const texte = res.corps.error;
    assert.ok(!/OPENAI_API_KEY|OPENAI_BASE_URL|AI_MODEL_/.test(texte),
      `${JSON.stringify(forme)} ne doit plus citer une variable de .env : ${texte}`);
  }
});

/* ------------------------------------------------------------------ */
/* Ce qui ne doit PAS etre attrape                                     */
/* ------------------------------------------------------------------ */

test('une erreur qui n a rien a voir avec l IA n est pas capturee', () => {
  // Sinon un vrai bug du projet serait maquille en « probleme de fournisseur »,
  // et on chercherait la panne au mauvais endroit.
  const res = fausseReponse();

  assert.equal(repondreErreurIa(res, new TypeError('x.map is not a function')), false);
  assert.equal(res.statut, null, 'aucune reponse ne doit avoir ete envoyee');
});

test('une erreur absente ne fait rien', () => {
  const res = fausseReponse();
  assert.equal(repondreErreurIa(res, null), false);
  assert.equal(res.statut, null);
});

test('un code inconnu qui ressemble a un code du contrat n est pas capture', () => {
  // On veut une liste fermee, pas une correspondance approximative.
  const erreur = new Error('panne');
  erreur.code = 'CLE_INVALIDE_PEUT_ETRE';

  const res = fausseReponse();
  assert.equal(repondreErreurIa(res, erreur), false);
});

test('un code herite d Object.prototype ne passe pas pour un code du contrat', () => {
  const erreur = new Error('panne');
  erreur.code = 'constructor';

  const res = fausseReponse();
  assert.equal(repondreErreurIa(res, erreur), false);
});
