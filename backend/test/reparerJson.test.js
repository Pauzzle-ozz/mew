const test = require('node:test');
const assert = require('node:assert');

const { reparerJson } = require('../src/services/aiService');

/**
 * Chaque reparation reussie ici, c'est un appel a l'API evite.
 *
 * Avant, un JSON invalide declenchait un nouvel appel complet au modele,
 * avec le prompt entier (jusqu'a 14 000 tokens) — parce qu'il manquait
 * une accolade ou qu'il y avait un bloc markdown autour.
 */

test('accepte un JSON deja valide', () => {
  assert.deepEqual(reparerJson('{"a":1}'), { a: 1 });
});

test('retire un bloc de code markdown', () => {
  assert.deepEqual(reparerJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(reparerJson('```\n{"a":1}\n```'), { a: 1 });
});

test('ignore le bavardage avant et apres', () => {
  assert.deepEqual(reparerJson('Voici le resultat :\n{"a":1}\nJ\'espere que ca aide.'), { a: 1 });
});

test('supprime les virgules qui trainent', () => {
  assert.deepEqual(reparerJson('{"a":1,}'), { a: 1 });
  assert.deepEqual(reparerJson('{"liste":[1,2,3,]}'), { liste: [1, 2, 3] });
});

test('cumule plusieurs defauts a la fois', () => {
  const sortieAbimee = '```json\n{\n  "score": 72,\n  "points": ["a", "b",],\n}\n```';
  assert.deepEqual(reparerJson(sortieAbimee), { score: 72, points: ['a', 'b'] });
});

test('renvoie null quand c\'est irrecuperable', () => {
  assert.equal(reparerJson('pas du json du tout'), null);
  assert.equal(reparerJson(''), null);
  assert.equal(reparerJson(null), null);
  assert.equal(reparerJson('{"a": '), null, 'JSON tronque en plein milieu');
});
