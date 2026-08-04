const test = require('node:test');
const assert = require('node:assert');

const { verifierUrlPublique, raisonInterdiction } = require('../src/lib/urlSecurity');

/**
 * Ce test garde fermee une faille reelle : sans lui, l'outil « analyser une
 * offre depuis son URL » permettait de faire lire a Mew n'importe quelle
 * page du reseau local de la machine qui l'heberge, et d'en renvoyer le
 * contenu a l'utilisateur.
 *
 * Si tu modifies lib/urlSecurity.js, ce fichier doit rester vert.
 */

test('les adresses du reseau prive sont reconnues', () => {
  assert.ok(raisonInterdiction('127.0.0.1'), 'loopback');
  assert.ok(raisonInterdiction('10.0.0.1'), 'reseau prive 10.x');
  assert.ok(raisonInterdiction('172.16.0.1'), 'reseau prive 172.16-31');
  assert.ok(raisonInterdiction('172.31.255.255'), 'haut de la plage 172');
  assert.ok(raisonInterdiction('192.168.1.1'), 'reseau prive 192.168');
  assert.ok(raisonInterdiction('169.254.169.254'), 'metadonnees cloud');
  assert.ok(raisonInterdiction('::1'), 'loopback IPv6');
  assert.ok(raisonInterdiction('fd00::1'), 'reseau prive IPv6');
  assert.ok(raisonInterdiction('::ffff:127.0.0.1'), 'IPv4 encapsulee dans IPv6');
});

test('les adresses publiques restent autorisees', () => {
  assert.equal(raisonInterdiction('8.8.8.8'), null);
  assert.equal(raisonInterdiction('172.32.0.1'), null, 'juste au-dessus de la plage privee');
  assert.equal(raisonInterdiction('172.15.0.1'), null, 'juste en dessous de la plage privee');
  assert.equal(raisonInterdiction('93.184.216.34'), null);
});

test('verifierUrlPublique refuse les cibles internes', async () => {
  const cibles = [
    'http://127.0.0.1:5000/api/historique',
    'http://localhost:3000/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]:8080/'
  ];

  for (const url of cibles) {
    await assert.rejects(
      () => verifierUrlPublique(url),
      (erreur) => erreur.code === 'URL_INTERDITE',
      `${url} aurait du etre refusee`
    );
  }
});

test('verifierUrlPublique refuse les protocoles autres que http et https', async () => {
  for (const url of ['file:///etc/passwd', 'ftp://exemple.fr/', 'gopher://exemple.fr/']) {
    await assert.rejects(
      () => verifierUrlPublique(url),
      (erreur) => erreur.code === 'URL_INTERDITE',
      `${url} aurait du etre refusee`
    );
  }
});

test('verifierUrlPublique refuse une URL vide ou mal formee', async () => {
  for (const url of ['', null, undefined, 'pas une url', 'http://']) {
    await assert.rejects(
      () => verifierUrlPublique(url),
      (erreur) => erreur.code === 'URL_INTERDITE'
    );
  }
});
