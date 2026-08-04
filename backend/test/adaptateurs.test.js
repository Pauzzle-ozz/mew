const test = require('node:test');
const assert = require('node:assert');

const openaiCompatible = require('../src/llm/adapters/openaiCompatible');
const { adaptateur, adaptateursDisponibles } = require('../src/llm/adapters');

const {
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
  nomDuService
} = openaiCompatible.interne;

/**
 * AUCUN APPEL RESEAU DANS CE FICHIER.
 *
 * Ces tests doivent tourner sur une machine sans cle API et sans connexion :
 * on fabrique donc des objets qui IMITENT les erreurs et les reponses du SDK,
 * et on verifie ce que l'adaptateur en fait.
 *
 * Ce qui est verifie ici est exactement ce qui casse en vrai : un utilisateur
 * qui se trompe de cle, un Ollama eteint, un petit modele local qui ne connait
 * pas le mode JSON.
 */

/* ------------------------------------------------------------------ */
/* Faux objets                                                         */
/* ------------------------------------------------------------------ */

/** Imite une erreur HTTP du SDK OpenAI (APIError et ses sous-classes). */
function erreurHttp(status, message, extra = {}) {
  const e = new Error(`${status} ${message}`);
  e.status = status;
  Object.assign(e, extra);
  return e;
}

/** Imite une APIConnectionError du SDK : pas de statut, un `cause` systeme. */
function erreurTransport(codeSysteme, message = 'Connection error.') {
  const e = new Error(message);
  e.cause = Object.assign(new Error(codeSysteme), { code: codeSysteme });
  return e;
}

/**
 * Faux client : enregistre les requetes recues et repond selon un scenario.
 * @param {Function} reponse (params, numeroAppel) => reponse, ou leve une erreur
 */
function fauxClient(reponse) {
  const appels = [];
  return {
    appels,
    chat: {
      completions: {
        create: async (params) => {
          appels.push(params);
          return reponse(params, appels.length);
        }
      }
    }
  };
}

/* ------------------------------------------------------------------ */
/* Traduction des erreurs                                              */
/* ------------------------------------------------------------------ */

test('une cle refusee donne CLE_INVALIDE', () => {
  const traduite = traduireErreur(erreurHttp(401, 'Incorrect API key provided'), {
    baseURL: 'https://api.openai.com/v1',
    modele: 'gpt-4o'
  });
  assert.equal(traduite.code, 'CLE_INVALIDE');
  assert.match(traduite.message, /cle API/i);
});

test('un acces interdit donne aussi CLE_INVALIDE', () => {
  assert.equal(traduireErreur(erreurHttp(403, 'Forbidden'), {}).code, 'CLE_INVALIDE');
});

test('un 429 donne QUOTA_DEPASSE', () => {
  const traduite = traduireErreur(erreurHttp(429, 'Rate limit reached'), {
    baseURL: 'https://api.groq.com/openai/v1'
  });
  assert.equal(traduite.code, 'QUOTA_DEPASSE');
});

test('un 402 donne QUOTA_DEPASSE', () => {
  assert.equal(traduireErreur(erreurHttp(402, 'Payment required'), {}).code, 'QUOTA_DEPASSE');
});

test('un credit epuise est reconnu meme avec un statut inattendu', () => {
  // DeepSeek et consorts ne renvoient pas tous 429 : le code applicatif prime.
  const traduite = traduireErreur(erreurHttp(400, 'You exceeded your quota', { code: 'insufficient_quota' }), {});
  assert.equal(traduite.code, 'QUOTA_DEPASSE');
});

test('un 404 donne MODELE_INTROUVABLE et nomme le modele', () => {
  const traduite = traduireErreur(erreurHttp(404, 'The model does not exist'), {
    baseURL: 'https://api.mistral.ai/v1',
    modele: 'mistral-inexistant'
  });
  assert.equal(traduite.code, 'MODELE_INTROUVABLE');
  assert.match(traduite.message, /mistral-inexistant/);
});

test('un 500 donne FOURNISSEUR et deculpabilise l\'utilisateur', () => {
  const traduite = traduireErreur(erreurHttp(503, 'Service unavailable'), {
    baseURL: 'https://api.openai.com/v1'
  });
  assert.equal(traduite.code, 'FOURNISSEUR');
  assert.match(traduite.message, /pas ta faute/i);
});

test('un timeout donne TIMEOUT', () => {
  const timeoutSdk = new Error('Request timed out.');
  assert.equal(traduireErreur(timeoutSdk, {}).code, 'TIMEOUT');

  const timeoutSysteme = erreurTransport('ETIMEDOUT', 'socket timeout');
  assert.equal(traduireErreur(timeoutSysteme, {}).code, 'TIMEOUT');
});

test('un Ollama eteint donne RESEAU, et le message le nomme', () => {
  const traduite = traduireErreur(erreurTransport('ECONNREFUSED'), {
    baseURL: 'http://localhost:11434/v1'
  });
  assert.equal(traduite.code, 'RESEAU');
  assert.match(traduite.message, /Ollama/);
  assert.match(traduite.message, /localhost:11434/);
  assert.match(traduite.message, /lance/i);
});

test('LM Studio est reconnu a son port', () => {
  const traduite = traduireErreur(erreurTransport('ECONNREFUSED'), {
    baseURL: 'http://localhost:1234/v1'
  });
  assert.equal(traduite.code, 'RESEAU');
  assert.match(traduite.message, /LM Studio/);
});

test('un domaine introuvable donne RESEAU', () => {
  const traduite = traduireErreur(erreurTransport('ENOTFOUND'), {
    baseURL: 'https://api.inexistant-xyz.com/v1'
  });
  assert.equal(traduite.code, 'RESEAU');
  assert.match(traduite.message, /connexion internet/i);
});

test('une erreur inconnue retombe sur FOURNISSEUR', () => {
  assert.equal(traduireErreur(new Error('quelque chose de bizarre'), {}).code, 'FOURNISSEUR');
  assert.equal(traduireErreur(null, {}).code, 'FOURNISSEUR');
  assert.equal(traduireErreur(undefined, {}).code, 'FOURNISSEUR');
});

test('toute erreur traduite porte un code du contrat et un message non vide', () => {
  const CODES = ['CLE_INVALIDE', 'QUOTA_DEPASSE', 'MODELE_INTROUVABLE', 'TIMEOUT', 'RESEAU', 'FOURNISSEUR'];
  const echantillon = [
    erreurHttp(400, 'Bad request'),
    erreurHttp(401, 'nope'),
    erreurHttp(402, 'nope'),
    erreurHttp(403, 'nope'),
    erreurHttp(404, 'nope'),
    erreurHttp(408, 'nope'),
    erreurHttp(422, 'nope'),
    erreurHttp(429, 'nope'),
    erreurHttp(500, 'nope'),
    erreurHttp(504, 'nope'),
    erreurHttp(418, 'je suis une theiere'),
    erreurTransport('ECONNRESET'),
    new Error('rien de reconnaissable'),
    'meme pas une erreur'
  ];

  echantillon.forEach((brute) => {
    const traduite = traduireErreur(brute, { baseURL: 'https://api.openai.com/v1', modele: 'gpt-4o' });
    assert.ok(CODES.includes(traduite.code), `code inattendu : ${traduite.code}`);
    assert.ok(traduite.message.length > 10, 'message trop court pour etre utile');
  });
});

test('une erreur deja traduite n\'est pas retraduite', () => {
  const premiere = traduireErreur(erreurHttp(401, 'nope'), { baseURL: 'https://api.openai.com/v1' });
  const seconde = traduireErreur(premiere, { baseURL: 'http://localhost:11434/v1' });
  assert.equal(seconde, premiere);
});

/* ------------------------------------------------------------------ */
/* Aucune cle ne sort d'ici                                            */
/* ------------------------------------------------------------------ */

test('la cle n\'apparait jamais dans le message ni dans le detail', () => {
  const cle = 'sk-proj-ABCDEFGH1234567890ijklmnop4f2a';
  const traduite = traduireErreur(
    erreurHttp(401, `Incorrect API key provided: ${cle}. You can find your API key at...`),
    { baseURL: 'https://api.openai.com/v1', cleApi: cle }
  );

  assert.ok(!traduite.message.includes(cle), 'la cle fuit dans le message');
  assert.ok(!String(traduite.detail).includes(cle), 'la cle fuit dans le detail');
  assert.match(traduite.message, /sk-\.\.\.4f2a/, 'la cle masquee reste reconnaissable');
});

test('masquerCle ne garde que les extremites', () => {
  assert.equal(masquerCle('sk-proj-abcdefgh4f2a'), 'sk-...4f2a');
  assert.equal(masquerCle(''), '(aucune cle)');
  assert.equal(masquerCle(undefined), '(aucune cle)');
  assert.equal(masquerCle('court'), '...');
});

test('masquerTexte attrape aussi une cle inconnue', () => {
  // Le fournisseur recopie parfois une cle qu'on ne lui a pas passee.
  const texte = masquerTexte('cle recue : gsk_AbCdEf123456789012345 refusee');
  assert.ok(!texte.includes('gsk_AbCdEf123456789012345'));
});

/* ------------------------------------------------------------------ */
/* Mode JSON : demander, et savoir renoncer                            */
/* ------------------------------------------------------------------ */

test('un refus explicite du mode JSON est reconnu', () => {
  assert.equal(refuseLeModeJson(erreurHttp(400, "'response_format' is not supported by this model")), true);
  assert.equal(refuseLeModeJson(erreurHttp(400, 'Unknown parameter: response_format')), true);
  assert.equal(refuseLeModeJson(erreurHttp(422, 'json_object mode unavailable')), true);
  assert.equal(refuseLeModeJson(erreurHttp(400, 'Unsupported parameter')), true);
});

test('une vraie erreur metier n\'est pas prise pour un refus du mode JSON', () => {
  assert.equal(refuseLeModeJson(erreurHttp(400, "This model's maximum context length is 8192 tokens")), false);
  assert.equal(refuseLeModeJson(erreurHttp(401, 'Incorrect API key')), false);
  assert.equal(refuseLeModeJson(erreurHttp(429, 'Rate limit')), false);
  assert.equal(refuseLeModeJson(erreurHttp(404, 'model not found')), false);
  assert.equal(refuseLeModeJson(null), false);
});

test('jsonMode demande envoie bien response_format', async () => {
  const client = fauxClient(() => ({ choices: [{ message: { content: '{"a":1}' } }] }));
  await appelerAvecRepli(client, { model: 'm', messages: [] }, true);

  assert.equal(client.appels.length, 1);
  assert.deepEqual(client.appels[0].response_format, { type: 'json_object' });
});

test('sans jsonMode, aucun response_format n\'est envoye', async () => {
  const client = fauxClient(() => ({ choices: [{ message: { content: 'bonjour' } }] }));
  await appelerAvecRepli(client, { model: 'm', messages: [] }, false);

  assert.equal(client.appels.length, 1);
  assert.equal(client.appels[0].response_format, undefined);
});

test('un modele local qui refuse le mode JSON declenche un second essai sans l\'option', async () => {
  // C'est le scenario Ollama / llama.cpp : le premier appel echoue, le
  // second passe. L'utilisateur ne doit rien voir de tout ca.
  const client = fauxClient((params, numero) => {
    if (numero === 1) throw erreurHttp(400, "response_format is not supported");
    return { choices: [{ message: { content: '{"score":72}' } }] };
  });

  const reponse = await appelerAvecRepli(client, { model: 'llama3', messages: [] }, true);

  assert.equal(client.appels.length, 2, 'il doit y avoir exactement un second essai');
  assert.deepEqual(client.appels[0].response_format, { type: 'json_object' });
  assert.equal(client.appels[1].response_format, undefined, 'le second essai doit abandonner l\'option');
  assert.equal(reponse.choices[0].message.content, '{"score":72}');
});

test('une cle invalide ne declenche PAS de second essai', async () => {
  const client = fauxClient(() => { throw erreurHttp(401, 'Incorrect API key'); });

  await assert.rejects(
    () => appelerAvecRepli(client, { model: 'm', messages: [] }, true),
    (e) => e.status === 401
  );
  assert.equal(client.appels.length, 1, 'inutile de retenter avec une cle refusee');
});

test('si le second essai echoue aussi, l\'erreur remonte', async () => {
  const client = fauxClient((params, numero) => {
    if (numero === 1) throw erreurHttp(400, 'response_format not supported');
    throw erreurHttp(500, 'boom');
  });

  await assert.rejects(() => appelerAvecRepli(client, { model: 'm', messages: [] }, true));
  assert.equal(client.appels.length, 2);
});

/* ------------------------------------------------------------------ */
/* Verifications faites avant tout appel reseau                        */
/* ------------------------------------------------------------------ */

test('completer refuse un prompt vide sans rien appeler', async () => {
  await assert.rejects(
    () => openaiCompatible.completer({ baseURL: 'http://localhost:11434/v1', modele: 'llama3', prompt: '   ' }),
    (e) => e.code === 'FOURNISSEUR'
  );
});

test('completer refuse un appel sans modele', async () => {
  await assert.rejects(
    () => openaiCompatible.completer({ baseURL: 'http://localhost:11434/v1', prompt: 'bonjour' }),
    (e) => e.code === 'MODELE_INTROUVABLE' && /reglages/i.test(e.message)
  );
});

test('completer refuse un fournisseur distant sans cle, sans attendre le 401', async () => {
  await assert.rejects(
    () => openaiCompatible.completer({ baseURL: 'https://api.openai.com/v1', modele: 'gpt-4o', prompt: 'salut' }),
    (e) => e.code === 'CLE_INVALIDE'
  );
});

/* ------------------------------------------------------------------ */
/* Adresses                                                            */
/* ------------------------------------------------------------------ */

test('normaliserBaseURL complete une adresse sans chemin', () => {
  // Le piege : Ollama affiche « http://localhost:11434 », sans /v1.
  assert.equal(normaliserBaseURL('http://localhost:11434'), 'http://localhost:11434/v1');
  assert.equal(normaliserBaseURL('http://localhost:11434/'), 'http://localhost:11434/v1');
  assert.equal(normaliserBaseURL('https://api.mistral.ai/v1'), 'https://api.mistral.ai/v1');
  assert.equal(normaliserBaseURL('https://api.mistral.ai/v1/'), 'https://api.mistral.ai/v1');
  assert.equal(normaliserBaseURL(''), 'https://api.openai.com/v1');
  assert.equal(normaliserBaseURL(undefined), 'https://api.openai.com/v1');
});

test('estLocal reconnait la machine de l\'utilisateur et son reseau', () => {
  assert.equal(estLocal('http://localhost:11434/v1'), true);
  assert.equal(estLocal('http://127.0.0.1:1234/v1'), true);
  assert.equal(estLocal('http://192.168.1.42:11434/v1'), true);
  assert.equal(estLocal('https://api.openai.com/v1'), false);
  assert.equal(estLocal('pas une url'), false);
});

test('nomDuService parle humain', () => {
  assert.equal(nomDuService('http://localhost:11434/v1'), 'Ollama');
  assert.equal(nomDuService('http://localhost:1234/v1'), 'LM Studio');
  assert.equal(nomDuService('https://api.openai.com/v1'), 'api.openai.com');
});

/* ------------------------------------------------------------------ */
/* Lecture des reponses                                                */
/* ------------------------------------------------------------------ */

test('lireUsage ne renvoie jamais NaN', () => {
  assert.deepEqual(lireUsage({ prompt_tokens: 120, completion_tokens: 40 }), { tokensEntree: 120, tokensSortie: 40 });
  assert.deepEqual(lireUsage({ input_tokens: 5, output_tokens: 7 }), { tokensEntree: 5, tokensSortie: 7 });
  assert.deepEqual(lireUsage(undefined), { tokensEntree: 0, tokensSortie: 0 });
  assert.deepEqual(lireUsage({ prompt_tokens: 'beaucoup' }), { tokensEntree: 0, tokensSortie: 0 });
});

test('lireTexte accepte les variantes des serveurs locaux', () => {
  assert.equal(lireTexte({ choices: [{ message: { content: 'bonjour' } }] }), 'bonjour');
  assert.equal(lireTexte({ choices: [{ text: 'ancien format' }] }), 'ancien format');
  assert.equal(lireTexte({ choices: [{ message: { content: '' } }] }), '');
  assert.equal(lireTexte({ choices: [] }), null);
  assert.equal(lireTexte({}), null);
  assert.equal(lireTexte(null), null);
});

test('normaliserModeles trie, nettoie et sait renoncer', async () => {
  const liste = normaliserModeles({
    data: [
      { id: 'gpt-4o' },
      { id: 'anthropic/claude', name: 'Claude 3.5 Sonnet' },
      { pasDId: true },
      null
    ]
  });

  assert.deepEqual(liste, [
    { id: 'anthropic/claude', nom: 'Claude 3.5 Sonnet' },
    { id: 'gpt-4o', nom: 'gpt-4o' }
  ]);

  assert.equal(normaliserModeles({ data: [] }), null);
  assert.equal(normaliserModeles({ erreur: 'pas de liste' }), null);
  assert.equal(normaliserModeles(null), null);
});

test('listerAvec lit la reponse d\'un faux fournisseur', async () => {
  const client = { models: { list: async () => ({ data: [{ id: 'llama3:8b' }] }) } };
  assert.deepEqual(await listerAvec(client), [{ id: 'llama3:8b', nom: 'llama3:8b' }]);

  const muet = { models: { list: async () => ({}) } };
  assert.equal(await listerAvec(muet), null);
});

/* ------------------------------------------------------------------ */
/* Le repartiteur                                                      */
/* ------------------------------------------------------------------ */

test('le repartiteur declare les trois adaptateurs', () => {
  const ids = adaptateursDisponibles();
  assert.deepEqual(ids.sort(), ['anthropic', 'google', 'openai-compatible']);
});

test('l\'adaptateur compatible OpenAI se charge et respecte le contrat', () => {
  const a = adaptateur('openai-compatible');
  assert.equal(a.id, 'openai-compatible');
  assert.equal(typeof a.completer, 'function');
  assert.equal(typeof a.listerModeles, 'function');
});

test('chaque adaptateur declare se charge, ou echoue proprement en francais', () => {
  // anthropic et google sont ecrits par ailleurs : selon l'avancement du
  // projet, ils sont presents ou pas. Dans les DEUX cas le repartiteur doit
  // se comporter correctement — jamais de « Cannot find module » brut.
  adaptateursDisponibles().forEach((id) => {
    try {
      const a = adaptateur(id);
      assert.equal(typeof a.completer, 'function', `${id} : completer manquant`);
      assert.equal(typeof a.listerModeles, 'function', `${id} : listerModeles manquant`);
    } catch (erreur) {
      assert.equal(erreur.code, 'FOURNISSEUR', `${id} : erreur sans code`);
      assert.ok(!/Cannot find module|require/i.test(erreur.message),
        `${id} : le message doit etre lisible par un humain, pas par un developpeur`);
      assert.match(erreur.message, /connecteur|adaptateur/i);
    }
  });
});

test('un identifiant inconnu leve une erreur claire qui liste les possibilites', () => {
  assert.throws(() => adaptateur('licorne'), (e) => {
    assert.equal(e.code, 'FOURNISSEUR');
    assert.match(e.message, /licorne/);
    assert.match(e.message, /openai-compatible/);
    return true;
  });
});

test('un identifiant vide ou herite d\'Object ne passe pas', () => {
  assert.throws(() => adaptateur(''), (e) => e.code === 'FOURNISSEUR');
  assert.throws(() => adaptateur(undefined), (e) => e.code === 'FOURNISSEUR');
  // Sans hasOwnProperty, celui-ci remonterait une fonction d'Object.prototype.
  assert.throws(() => adaptateur('constructor'), (e) => e.code === 'FOURNISSEUR');
  assert.throws(() => adaptateur('__proto__'), (e) => e.code === 'FOURNISSEUR');
});

test('le repartiteur rend toujours la meme instance', () => {
  assert.equal(adaptateur('openai-compatible'), adaptateur('openai-compatible'));
});
