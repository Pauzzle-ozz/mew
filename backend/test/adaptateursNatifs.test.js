const test = require('node:test');
const assert = require('node:assert');

const anthropic = require('../src/llm/adapters/anthropic');
const google = require('../src/llm/adapters/google');

/**
 * Ces tests ne touchent PAS au reseau.
 *
 * Un adaptateur ne fait que deux choses : fabriquer une requete HTTP, et
 * decouper la reponse. Les deux se verifient sans cle API et sans internet,
 * en remplacant `fetch` par une fausse implementation qui note ce qu'on lui
 * demande et rend ce qu'on lui dit de rendre.
 *
 * Ce qui est verifie ici :
 *  - la FORME de la requete (URL, en-tetes, corps) — une en-tete oubliee
 *    donne une erreur incomprehensible en production ;
 *  - le DECOUPAGE de la reponse, y compris les reponses vides que Google
 *    renvoie quand son filtre de securite bloque un CV ;
 *  - la TRADUCTION des erreurs vers les codes du contrat commun ;
 *  - le fait qu'une cle API ne fuit jamais dans un message d'erreur.
 */

const fetchOriginal = globalThis.fetch;

/** Remplace fetch, note les appels, rend la reponse fabriquee. */
function espionner(repondre) {
  const appels = [];
  globalThis.fetch = async (url, options) => {
    appels.push({ url: String(url), options: options || {} });
    return repondre(url, options);
  };
  return appels;
}

/** Fabrique une vraie Response, comme celle que renverrait le reseau. */
function reponseJson(corps, statut = 200) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json' }
  });
}

/** Recupere l'erreur levee au lieu de faire tomber le test. */
async function capturer(promesse) {
  try {
    await promesse;
    return null;
  } catch (err) {
    return err;
  }
}

/** Lit le corps JSON reellement envoye par l'adaptateur. */
function corpsEnvoye(appel) {
  return JSON.parse(appel.options.body);
}

const CLE_ANTHROPIC = 'sk-ant-api03-secret-a-ne-jamais-afficher-4f2a';
const CLE_GOOGLE = 'AIzaSyD-secret-a-ne-jamais-afficher-9x7b';

/** Reponse Anthropic minimale mais realiste. */
const REPONSE_CLAUDE = {
  id: 'msg_01ABC',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-4-6',
  content: [{ type: 'text', text: 'Bonjour, voici votre lettre.' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 1200, output_tokens: 340 }
};

/** Reponse Gemini minimale mais realiste. */
const REPONSE_GEMINI = {
  candidates: [{
    content: { role: 'model', parts: [{ text: 'Bonjour, voici votre lettre.' }] },
    finishReason: 'STOP'
  }],
  usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 340, totalTokenCount: 1540 },
  modelVersion: 'gemini-2.5-flash-002'
};

test.afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

// ===========================================================================
// Contrat commun
// ===========================================================================

test('les deux adaptateurs exposent le meme contrat', () => {
  for (const adaptateur of [anthropic, google]) {
    assert.equal(typeof adaptateur.id, 'string');
    assert.equal(typeof adaptateur.completer, 'function');
    assert.equal(typeof adaptateur.listerModeles, 'function');
  }
  assert.equal(anthropic.id, 'anthropic');
  assert.equal(google.id, 'google');
});

// ===========================================================================
// Anthropic — construction de la requete
// ===========================================================================

test('anthropic : la requete respecte le dialecte de Claude', async () => {
  const appels = espionner(() => reponseJson(REPONSE_CLAUDE));

  await anthropic.completer({
    cleApi: CLE_ANTHROPIC,
    modele: 'claude-sonnet-4-6',
    prompt: 'Ecris une lettre de motivation.',
    temperature: 0.7,
    maxTokens: 2000
  });

  assert.equal(appels.length, 1);
  const [appel] = appels;

  assert.equal(appel.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(appel.options.method, 'POST');

  // Les trois en-tetes sans lesquelles l'API refuse tout.
  assert.equal(appel.options.headers['x-api-key'], CLE_ANTHROPIC);
  assert.equal(appel.options.headers['anthropic-version'], '2023-06-01');
  assert.equal(appel.options.headers['content-type'], 'application/json');

  const corps = corpsEnvoye(appel);
  assert.equal(corps.model, 'claude-sonnet-4-6');
  assert.equal(corps.max_tokens, 2000);
  assert.equal(corps.temperature, 0.7);
  assert.deepEqual(corps.messages, [
    { role: 'user', content: 'Ecris une lettre de motivation.' }
  ]);
});

test('anthropic : max_tokens est toujours envoye, meme sans consigne', async () => {
  // Anthropic repond 400 si max_tokens manque. C'est la difference la plus
  // facile a oublier avec le dialecte d'OpenAI.
  const appels = espionner(() => reponseJson(REPONSE_CLAUDE));

  await anthropic.completer({
    cleApi: CLE_ANTHROPIC, modele: 'claude-sonnet-4-6', prompt: 'Bonjour'
  });

  const corps = corpsEnvoye(appels[0]);
  assert.ok(Number.isInteger(corps.max_tokens) && corps.max_tokens > 0);
});

test('anthropic : la temperature est ramenee dans la plage acceptee', async () => {
  // OpenAI accepte 0 a 2, Anthropic seulement 0 a 1. Un appelant qui envoie
  // 1.8 doit obtenir une reponse, pas une erreur 400.
  const appels = espionner(() => reponseJson(REPONSE_CLAUDE));

  await anthropic.completer({
    cleApi: CLE_ANTHROPIC, modele: 'claude-sonnet-4-6', prompt: 'Bonjour', temperature: 1.8
  });

  assert.equal(corpsEnvoye(appels[0]).temperature, 1);
});

test('anthropic : sans temperature, le champ n\'est pas envoye du tout', async () => {
  const appels = espionner(() => reponseJson(REPONSE_CLAUDE));

  await anthropic.completer({
    cleApi: CLE_ANTHROPIC, modele: 'claude-sonnet-4-6', prompt: 'Bonjour'
  });

  assert.ok(!('temperature' in corpsEnvoye(appels[0])));
});

test('anthropic : jsonMode ajoute une consigne au prompt', async () => {
  // Claude n'a pas d'interrupteur « JSON ». La consigne texte est le choix
  // d'architecture du projet : elle marche aussi sur un petit modele local.
  const appels = espionner(() => reponseJson(REPONSE_CLAUDE));

  await anthropic.completer({
    cleApi: CLE_ANTHROPIC, modele: 'claude-sonnet-4-6', prompt: 'Extrais le profil.', jsonMode: true
  });

  const corps = corpsEnvoye(appels[0]);
  assert.match(corps.messages[0].content, /^Extrais le profil\./);
  assert.match(corps.messages[0].content, /JSON valide/i);
});

test('anthropic : un baseURL personnalise avec slash final ne casse pas l\'URL', async () => {
  const appels = espionner(() => reponseJson(REPONSE_CLAUDE));

  await anthropic.completer({
    baseURL: 'http://localhost:8080/proxy/v1/',
    cleApi: CLE_ANTHROPIC,
    modele: 'claude-sonnet-4-6',
    prompt: 'Bonjour'
  });

  assert.equal(appels[0].url, 'http://localhost:8080/proxy/v1/messages');
});

test('anthropic : l\'adresse nue du catalogue recoit son segment de version', async () => {
  // Le catalogue stocke « https://api.anthropic.com » sans /v1. Sans ce
  // rattrapage, chaque requete partirait sur un 404 sans explication.
  const appels = espionner(() => reponseJson(REPONSE_CLAUDE));

  await anthropic.completer({
    baseURL: 'https://api.anthropic.com',
    cleApi: CLE_ANTHROPIC,
    modele: 'claude-sonnet-4-6',
    prompt: 'Bonjour'
  });
  await anthropic.listerModeles({ baseURL: 'https://api.anthropic.com', cleApi: CLE_ANTHROPIC });

  assert.equal(appels[0].url, 'https://api.anthropic.com/v1/messages');
  assert.match(appels[1].url, /^https:\/\/api\.anthropic\.com\/v1\/models/);
});

// ===========================================================================
// Anthropic — decoupage de la reponse
// ===========================================================================

test('anthropic : les blocs de texte sont recolles, le raisonnement est ignore', async () => {
  espionner(() => reponseJson({
    model: 'claude-opus-4-6',
    content: [
      { type: 'thinking', thinking: 'reflexion interne a ne pas rendre' },
      { type: 'text', text: 'Premiere partie. ' },
      { type: 'text', text: 'Seconde partie.' }
    ],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5 }
  }));

  const sortie = await anthropic.completer({
    cleApi: CLE_ANTHROPIC, modele: 'claude-sonnet-4-6', prompt: 'Bonjour'
  });

  assert.equal(sortie.texte, 'Premiere partie. Seconde partie.');
  assert.ok(!sortie.texte.includes('reflexion interne'));
  // Le modele reellement utilise peut differer de celui demande (alias).
  assert.equal(sortie.modele, 'claude-opus-4-6');
});

test('anthropic : les compteurs de tokens sont traduits dans le vocabulaire du projet', async () => {
  espionner(() => reponseJson(REPONSE_CLAUDE));

  const sortie = await anthropic.completer({
    cleApi: CLE_ANTHROPIC, modele: 'claude-sonnet-4-6', prompt: 'Bonjour'
  });

  assert.deepEqual(sortie.usage, { tokensEntree: 1200, tokensSortie: 340 });
});

test('anthropic : un usage absent donne zero, jamais NaN', async () => {
  espionner(() => reponseJson({
    model: 'claude-sonnet-4-6',
    content: [{ type: 'text', text: 'Reponse.' }]
  }));

  const sortie = await anthropic.completer({
    cleApi: CLE_ANTHROPIC, modele: 'claude-sonnet-4-6', prompt: 'Bonjour'
  });

  assert.deepEqual(sortie.usage, { tokensEntree: 0, tokensSortie: 0 });
  assert.equal(sortie.modele, 'claude-sonnet-4-6');
});

test('anthropic : une reponse sans texte leve au lieu de rendre une chaine vide', async () => {
  espionner(() => reponseJson({
    model: 'claude-sonnet-4-6',
    content: [],
    stop_reason: 'refusal'
  }));

  const err = await capturer(anthropic.completer({
    cleApi: CLE_ANTHROPIC, modele: 'claude-sonnet-4-6', prompt: 'Bonjour'
  }));

  assert.equal(err.code, 'FOURNISSEUR');
  assert.match(err.message, /refus/i);
});

test('anthropic : une reponse qui n\'est pas du JSON est signalee', async () => {
  espionner(() => new Response('<html>502 Bad Gateway</html>', { status: 200 }));

  const err = await capturer(anthropic.completer({
    cleApi: CLE_ANTHROPIC, modele: 'claude-sonnet-4-6', prompt: 'Bonjour'
  }));

  assert.equal(err.code, 'FOURNISSEUR');
  assert.match(err.message, /illisible/i);
});

// ===========================================================================
// Anthropic — traduction des erreurs
// ===========================================================================

test('anthropic : chaque code HTTP donne le bon code d\'erreur du contrat', async () => {
  const cas = [
    { statut: 401, attendu: 'CLE_INVALIDE' },
    { statut: 403, attendu: 'CLE_INVALIDE' },
    { statut: 429, attendu: 'QUOTA_DEPASSE' },
    { statut: 402, attendu: 'QUOTA_DEPASSE' },
    { statut: 404, attendu: 'MODELE_INTROUVABLE' },
    { statut: 400, attendu: 'FOURNISSEUR' },
    { statut: 500, attendu: 'FOURNISSEUR' },
    { statut: 529, attendu: 'FOURNISSEUR' }
  ];

  for (const { statut, attendu } of cas) {
    espionner(() => reponseJson(
      { type: 'error', error: { type: 'invalid_request_error', message: 'something went wrong' } },
      statut
    ));

    const err = await capturer(anthropic.completer({
      cleApi: CLE_ANTHROPIC, modele: 'claude-sonnet-4-6', prompt: 'Bonjour'
    }));

    assert.equal(err.code, attendu, `HTTP ${statut}`);
    // Le message doit etre comprehensible par quelqu'un qui ne programme pas.
    assert.ok(err.message.length > 20, `HTTP ${statut} : message trop court`);
  }
});

test('anthropic : le modele introuvable est nomme dans le message', async () => {
  espionner(() => reponseJson({ error: { message: 'model not found' } }, 404));

  const err = await capturer(anthropic.completer({
    cleApi: CLE_ANTHROPIC, modele: 'claude-inexistant-9', prompt: 'Bonjour'
  }));

  assert.equal(err.code, 'MODELE_INTROUVABLE');
  assert.match(err.message, /claude-inexistant-9/);
});

test('anthropic : un delai depasse donne TIMEOUT, une panne reseau donne RESEAU', async () => {
  espionner(() => {
    const e = new Error('The operation was aborted due to timeout');
    e.name = 'TimeoutError';
    throw e;
  });
  const expire = await capturer(anthropic.completer({
    cleApi: CLE_ANTHROPIC, modele: 'claude-sonnet-4-6', prompt: 'Bonjour', timeoutMs: 5000
  }));
  assert.equal(expire.code, 'TIMEOUT');
  assert.match(expire.message, /5 secondes/);

  espionner(() => {
    const e = new TypeError('fetch failed');
    e.cause = { code: 'ECONNREFUSED' };
    throw e;
  });
  const coupe = await capturer(anthropic.completer({
    baseURL: 'http://localhost:11434/v1',
    cleApi: CLE_ANTHROPIC,
    modele: 'claude-sonnet-4-6',
    prompt: 'Bonjour'
  }));
  assert.equal(coupe.code, 'RESEAU');
  // L'adresse injoignable doit apparaitre : c'est l'information utile.
  assert.match(coupe.message, /localhost:11434/);
});

test('anthropic : sans cle, on le dit avant meme d\'appeler le reseau', async () => {
  const appels = espionner(() => reponseJson(REPONSE_CLAUDE));

  const err = await capturer(anthropic.completer({
    modele: 'claude-sonnet-4-6', prompt: 'Bonjour'
  }));

  assert.equal(err.code, 'CLE_INVALIDE');
  assert.equal(appels.length, 0, 'aucune requete ne doit partir sans cle');
});

// ===========================================================================
// Anthropic — liste des modeles
// ===========================================================================

test('anthropic : la liste des modeles est traduite en {id, nom}', async () => {
  const appels = espionner(() => reponseJson({
    data: [
      { type: 'model', id: 'claude-opus-4-6', display_name: 'Claude Opus 4.6' },
      { type: 'model', id: 'claude-sonnet-4-6' },
      { type: 'model' }
    ],
    has_more: false
  }));

  const modeles = await anthropic.listerModeles({ cleApi: CLE_ANTHROPIC });

  assert.match(appels[0].url, /\/v1\/models/);
  assert.equal(appels[0].options.headers['x-api-key'], CLE_ANTHROPIC);
  assert.deepEqual(modeles, [
    { id: 'claude-opus-4-6', nom: 'Claude Opus 4.6' },
    // Sans display_name, on retombe sur l'identifiant plutot que « undefined ».
    { id: 'claude-sonnet-4-6', nom: 'claude-sonnet-4-6' }
  ]);
});

test('anthropic : un echec de listage rend null, sans jamais lever', async () => {
  // Le catalogue statique prend le relais : ce n'est pas une panne, juste
  // une liste qu'on n'a pas pu enrichir.
  espionner(() => reponseJson({ error: { message: 'invalid api key' } }, 401));
  assert.equal(await anthropic.listerModeles({ cleApi: CLE_ANTHROPIC }), null);

  espionner(() => { throw new TypeError('fetch failed'); });
  assert.equal(await anthropic.listerModeles({ cleApi: CLE_ANTHROPIC }), null);

  espionner(() => reponseJson({ data: [] }));
  assert.equal(await anthropic.listerModeles({ cleApi: CLE_ANTHROPIC }), null);

  assert.equal(await anthropic.listerModeles({ cleApi: '' }), null);
});

// ===========================================================================
// Google — construction de la requete
// ===========================================================================

test('google : le modele est dans l\'URL et la cle dans une en-tete', async () => {
  const appels = espionner(() => reponseJson(REPONSE_GEMINI));

  await google.completer({
    cleApi: CLE_GOOGLE,
    modele: 'gemini-2.5-flash',
    prompt: 'Ecris une lettre de motivation.',
    temperature: 0.4,
    maxTokens: 1500
  });

  const [appel] = appels;
  assert.equal(
    appel.url,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
  );
  assert.equal(appel.options.headers['x-goog-api-key'], CLE_GOOGLE);

  const corps = corpsEnvoye(appel);
  assert.deepEqual(corps.contents, [
    { role: 'user', parts: [{ text: 'Ecris une lettre de motivation.' }] }
  ]);
  assert.equal(corps.generationConfig.temperature, 0.4);
  assert.equal(corps.generationConfig.maxOutputTokens, 1500);
});

test('google : l\'adresse nue du catalogue recoit son segment de version', async () => {
  // Le catalogue stocke « https://generativelanguage.googleapis.com », sans
  // /v1beta. Les deux formes doivent aboutir a la meme URL.
  const appels = espionner(() => reponseJson(REPONSE_GEMINI));

  await google.completer({
    baseURL: 'https://generativelanguage.googleapis.com',
    cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Bonjour'
  });
  await google.completer({
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/',
    cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Bonjour'
  });

  const attendue = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
  assert.equal(appels[0].url, attendue);
  assert.equal(appels[1].url, attendue);
});

test('google : la cle n\'apparait JAMAIS dans l\'URL', async () => {
  // Google accepte « ?key=... », mais une URL finit toujours dans un log.
  const appels = espionner(() => reponseJson(REPONSE_GEMINI));

  await google.completer({
    cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Bonjour'
  });
  await google.listerModeles({ cleApi: CLE_GOOGLE });

  for (const appel of appels) {
    assert.ok(!appel.url.includes(CLE_GOOGLE), `cle trouvee dans l'URL : ${appel.url}`);
    assert.ok(!appel.url.includes('key='), `parametre key= trouve : ${appel.url}`);
  }
});

test('google : un modele ecrit « models/... » n\'est pas duplique dans l\'URL', async () => {
  // C'est la forme que Google renvoie dans sa propre liste de modeles.
  const appels = espionner(() => reponseJson(REPONSE_GEMINI));

  await google.completer({
    cleApi: CLE_GOOGLE, modele: 'models/gemini-2.5-pro', prompt: 'Bonjour'
  });

  assert.ok(appels[0].url.endsWith('/models/gemini-2.5-pro:generateContent'), appels[0].url);
  assert.ok(!appels[0].url.includes('models/models'));
});

test('google : la temperature est bornee a 2 et generationConfig disparait s\'il est vide', async () => {
  const appels = espionner(() => reponseJson(REPONSE_GEMINI));

  await google.completer({
    cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Bonjour', temperature: 5
  });
  assert.equal(corpsEnvoye(appels[0]).generationConfig.temperature, 2);

  await google.completer({
    cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Bonjour'
  });
  assert.ok(!('generationConfig' in corpsEnvoye(appels[1])));
});

test('google : jsonMode ajoute une consigne au prompt', async () => {
  const appels = espionner(() => reponseJson(REPONSE_GEMINI));

  await google.completer({
    cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Extrais le profil.', jsonMode: true
  });

  const texte = corpsEnvoye(appels[0]).contents[0].parts[0].text;
  assert.match(texte, /^Extrais le profil\./);
  assert.match(texte, /JSON valide/i);
});

// ===========================================================================
// Google — decoupage de la reponse
// ===========================================================================

test('google : les parties du premier candidat sont recollees', async () => {
  espionner(() => reponseJson({
    candidates: [
      {
        content: { role: 'model', parts: [{ text: 'Premiere partie. ' }, { text: 'Seconde partie.' }] },
        finishReason: 'STOP'
      },
      { content: { parts: [{ text: 'candidat ignore' }] }, finishReason: 'STOP' }
    ],
    usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 120 },
    modelVersion: 'gemini-2.5-flash-002'
  }));

  const sortie = await google.completer({
    cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Bonjour'
  });

  assert.equal(sortie.texte, 'Premiere partie. Seconde partie.');
  assert.ok(!sortie.texte.includes('candidat ignore'));
  assert.deepEqual(sortie.usage, { tokensEntree: 800, tokensSortie: 120 });
  assert.equal(sortie.modele, 'gemini-2.5-flash-002');
});

test('google : sans usageMetadata ni modelVersion, on retombe sur des valeurs sures', async () => {
  espionner(() => reponseJson({
    candidates: [{ content: { parts: [{ text: 'Reponse.' }] }, finishReason: 'STOP' }]
  }));

  const sortie = await google.completer({
    cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Bonjour'
  });

  assert.deepEqual(sortie.usage, { tokensEntree: 0, tokensSortie: 0 });
  assert.equal(sortie.modele, 'gemini-2.5-flash');
});

test('google : une reponse tronquee par maxOutputTokens reste une reponse valide', async () => {
  // MAX_TOKENS n'est pas un blocage : il reste du texte, on le rend.
  espionner(() => reponseJson({
    candidates: [{ content: { parts: [{ text: 'Debut de lettre' }] }, finishReason: 'MAX_TOKENS' }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 }
  }));

  const sortie = await google.completer({
    cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Bonjour'
  });

  assert.equal(sortie.texte, 'Debut de lettre');
});

// --- Le cas qui arrivera : le filtre de securite ---------------------------

test('google : une demande bloquee en amont leve, avec une explication', async () => {
  // Reponse reelle quand le filtre refuse le PROMPT : 200 OK, zero candidat.
  espionner(() => reponseJson({
    promptFeedback: { blockReason: 'SAFETY', safetyRatings: [] }
  }));

  const err = await capturer(google.completer({
    cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Voici mon CV : ...'
  }));

  assert.equal(err.code, 'FOURNISSEUR');
  assert.match(err.message, /securite/i);
  assert.match(err.message, /SAFETY/);
  // L'utilisateur doit savoir quoi faire, pas seulement que ca a rate.
  assert.match(err.message, /CV|personnelles/i);
});

test('google : une reponse bloquee en cours de generation leve aussi', async () => {
  // La ou le piege est vicieux : il Y A un candidat, mais il est vide.
  for (const raison of ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'SPII', 'BLOCKLIST']) {
    espionner(() => reponseJson({
      candidates: [{ content: { role: 'model', parts: [] }, finishReason: raison }],
      usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 0 }
    }));

    const err = await capturer(google.completer({
      cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Voici mon CV : ...'
    }));

    assert.equal(err.code, 'FOURNISSEUR', raison);
    assert.match(err.message, /securite/i, raison);
    assert.match(err.message, new RegExp(raison), raison);
  }
});

test('google : un texte vide pour une autre raison leve quand meme', async () => {
  // Jamais de chaine vide rendue comme si tout allait bien : l'appelant
  // ecrirait un email de candidature sans corps.
  espionner(() => reponseJson({
    candidates: [{ content: { role: 'model', parts: [{ text: '   ' }] }, finishReason: 'OTHER' }]
  }));

  const err = await capturer(google.completer({
    cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Bonjour'
  }));

  assert.equal(err.code, 'FOURNISSEUR');
  assert.match(err.message, /aucun texte/i);
});

test('google : aucun candidat du tout leve une erreur explicite', async () => {
  espionner(() => reponseJson({ candidates: [] }));

  const err = await capturer(google.completer({
    cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Bonjour'
  }));

  assert.equal(err.code, 'FOURNISSEUR');
  assert.match(err.message, /aucune reponse/i);
});

// ===========================================================================
// Google — traduction des erreurs
// ===========================================================================

test('google : chaque erreur HTTP donne le bon code du contrat', async () => {
  const cas = [
    { statut: 401, corps: { error: { code: 401, message: 'Unauthenticated', status: 'UNAUTHENTICATED' } }, attendu: 'CLE_INVALIDE' },
    { statut: 403, corps: { error: { code: 403, message: 'Forbidden', status: 'PERMISSION_DENIED' } }, attendu: 'CLE_INVALIDE' },
    { statut: 429, corps: { error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } }, attendu: 'QUOTA_DEPASSE' },
    { statut: 404, corps: { error: { code: 404, message: 'models/x is not found', status: 'NOT_FOUND' } }, attendu: 'MODELE_INTROUVABLE' },
    { statut: 500, corps: { error: { code: 500, message: 'Internal error', status: 'INTERNAL' } }, attendu: 'FOURNISSEUR' },
    { statut: 503, corps: { error: { code: 503, message: 'Overloaded', status: 'UNAVAILABLE' } }, attendu: 'FOURNISSEUR' },
    { statut: 400, corps: { error: { code: 400, message: 'Invalid JSON payload', status: 'INVALID_ARGUMENT' } }, attendu: 'FOURNISSEUR' }
  ];

  for (const { statut, corps, attendu } of cas) {
    espionner(() => reponseJson(corps, statut));

    const err = await capturer(google.completer({
      cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Bonjour'
    }));

    assert.equal(err.code, attendu, `HTTP ${statut}`);
    assert.ok(err.message.length > 20, `HTTP ${statut} : message trop court`);
  }
});

test('google : une cle invalide annoncee en HTTP 400 est quand meme reconnue', async () => {
  // Piege bien reel : Google ne repond pas 401 pour une mauvaise cle, il
  // repond 400 INVALID_ARGUMENT. Sans ce cas, l'utilisateur lirait
  // « erreur 400 » au lieu de « ta cle est refusee ».
  espionner(() => reponseJson({
    error: {
      code: 400,
      message: 'API key not valid. Please pass a valid API key.',
      status: 'INVALID_ARGUMENT',
      details: [{ reason: 'API_KEY_INVALID' }]
    }
  }, 400));

  const err = await capturer(google.completer({
    cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Bonjour'
  }));

  assert.equal(err.code, 'CLE_INVALIDE');
});

test('google : delai depasse et panne reseau sont distingues', async () => {
  espionner(() => {
    const e = new Error('aborted');
    e.name = 'TimeoutError';
    throw e;
  });
  const expire = await capturer(google.completer({
    cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Bonjour', timeoutMs: 30000
  }));
  assert.equal(expire.code, 'TIMEOUT');
  assert.match(expire.message, /30 secondes/);

  espionner(() => { throw new TypeError('fetch failed'); });
  const coupe = await capturer(google.completer({
    cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Bonjour'
  }));
  assert.equal(coupe.code, 'RESEAU');
  assert.match(coupe.message, /generativelanguage\.googleapis\.com/);
});

test('google : sans cle ni modele, rien ne part sur le reseau', async () => {
  const appels = espionner(() => reponseJson(REPONSE_GEMINI));

  assert.equal(
    (await capturer(google.completer({ modele: 'gemini-2.5-flash', prompt: 'Bonjour' }))).code,
    'CLE_INVALIDE'
  );
  assert.equal(
    (await capturer(google.completer({ cleApi: CLE_GOOGLE, prompt: 'Bonjour' }))).code,
    'MODELE_INTROUVABLE'
  );
  assert.equal(
    (await capturer(google.completer({ cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: '  ' }))).code,
    'FOURNISSEUR'
  );
  assert.equal(appels.length, 0);
});

// ===========================================================================
// Google — liste des modeles
// ===========================================================================

test('google : la liste ne garde que les modeles qui savent generer du texte', async () => {
  const appels = espionner(() => reponseJson({
    models: [
      {
        name: 'models/gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        supportedGenerationMethods: ['generateContent', 'countTokens']
      },
      {
        name: 'models/text-embedding-004',
        displayName: 'Text Embedding 004',
        supportedGenerationMethods: ['embedContent']
      },
      // Relais qui ne renvoie pas le champ : on garde, dans le doute.
      { name: 'models/gemini-2.5-pro' }
    ]
  }));

  const modeles = await google.listerModeles({ cleApi: CLE_GOOGLE });

  assert.equal(appels[0].options.headers['x-goog-api-key'], CLE_GOOGLE);
  assert.deepEqual(modeles, [
    { id: 'gemini-2.5-flash', nom: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', nom: 'gemini-2.5-pro' }
  ]);
});

test('google : un echec de listage rend null, sans jamais lever', async () => {
  espionner(() => reponseJson({ error: { message: 'API key not valid' } }, 400));
  assert.equal(await google.listerModeles({ cleApi: CLE_GOOGLE }), null);

  espionner(() => { throw new TypeError('fetch failed'); });
  assert.equal(await google.listerModeles({ cleApi: CLE_GOOGLE }), null);

  espionner(() => reponseJson({ models: [] }));
  assert.equal(await google.listerModeles({ cleApi: CLE_GOOGLE }), null);

  assert.equal(await google.listerModeles({}), null);
});

// ===========================================================================
// Regle absolue : une cle API ne sort jamais d'ici
// ===========================================================================

test('aucune cle API n\'apparait en clair dans un message d\'erreur', async () => {
  const scenarios = [
    // Cas ordinaire : la cle est refusee.
    { corps: { error: { message: 'invalid key' } }, statut: 401 },
    // Cas mechant : le fournisseur recopie la cle dans son propre message.
    { corps: { error: { message: `The key ${CLE_ANTHROPIC} is not valid` } }, statut: 400 }
  ];

  for (const { corps, statut } of scenarios) {
    espionner(() => reponseJson(corps, statut));
    const err = await capturer(anthropic.completer({
      cleApi: CLE_ANTHROPIC, modele: 'claude-sonnet-4-6', prompt: 'Bonjour'
    }));
    assert.ok(!err.message.includes(CLE_ANTHROPIC), `cle en clair : ${err.message}`);
  }

  for (const { corps, statut } of scenarios) {
    espionner(() => reponseJson(
      { error: { message: String(corps.error.message).replace(CLE_ANTHROPIC, CLE_GOOGLE) } },
      statut
    ));
    const err = await capturer(google.completer({
      cleApi: CLE_GOOGLE, modele: 'gemini-2.5-flash', prompt: 'Bonjour'
    }));
    assert.ok(!err.message.includes(CLE_GOOGLE), `cle en clair : ${err.message}`);
  }
});

test('la cle refusee est identifiable sans etre lisible', async () => {
  // « sk-...4f2a » : assez pour reconnaitre laquelle de ses cles pose
  // probleme, pas assez pour s'en servir.
  espionner(() => reponseJson({ error: { message: 'unauthorized' } }, 401));

  const err = await capturer(anthropic.completer({
    cleApi: CLE_ANTHROPIC, modele: 'claude-sonnet-4-6', prompt: 'Bonjour'
  }));

  assert.match(err.message, /sk-\.\.\.4f2a/);
});
