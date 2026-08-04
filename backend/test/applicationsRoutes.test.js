const test = require('node:test');
const assert = require('node:assert');
const express = require('express');

const applicationService = require('../src/services/applicationService');
const { creerAuth } = require('../src/middleware/auth');

/**
 * Test de la route de statistiques, montee dans un vrai serveur Express.
 *
 * Le stockage est remplace par une liste en memoire : ce test ne doit
 * JAMAIS toucher au fichier backend/data/mew.json, qui contient les vraies
 * candidatures de la personne qui fait tourner Mew.
 *
 * Ce qui est verifie ici, c'est le branchement : les fonctions de calcul
 * (core/suivi/relances.js) ont deja leurs propres tests. Elles existaient
 * depuis le debut sans qu'aucune route ne les expose.
 */

const JOUR = 24 * 60 * 60 * 1000;
const ilYA = (jours) => new Date(Date.now() - jours * JOUR).toISOString();

const CANDIDATURES = [
  // Envoyee il y a 20 jours et jamais relancee : elle doit remonter.
  {
    id: 'c1', user_id: 'moi', offer_title: 'Developpeur', company: 'Acme',
    status: 'postule', applied_at: ilYA(20), follow_up_sent: false
  },
  // Deja relancee : elle ne doit PAS remonter.
  {
    id: 'c2', user_id: 'moi', offer_title: 'Integrateur', company: 'Beta',
    status: 'postule', applied_at: ilYA(30), follow_up_sent: true
  },
  // Une reponse recue : elle compte dans le taux de reponse.
  {
    id: 'c3', user_id: 'moi', offer_title: 'Technicien', company: 'Gamma',
    status: 'entretien', applied_at: ilYA(15), updated_at: ilYA(5)
  },
  // Pas encore envoyee : elle ne compte ni dans les envois ni dans les relances.
  {
    id: 'c4', user_id: 'moi', offer_title: 'Assistant', company: 'Delta',
    status: 'a_postuler'
  }
];

/** Demarre un serveur jetable qui monte le routeur des candidatures. */
async function serveurDeTest() {
  const app = express();
  app.use(express.json());
  app.use('/api/applications', creerAuth({ mode: 'local' }), require('../src/routes/applications'));

  const serveur = app.listen(0);
  await new Promise((resoudre) => serveur.once('listening', resoudre));
  const url = `http://127.0.0.1:${serveur.address().port}`;

  return { url, fermer: () => new Promise((resoudre) => serveur.close(resoudre)) };
}

test('GET /user/:userId/statistiques renvoie le tableau de bord et les relances', async () => {
  const original = applicationService.getByUser;
  let utilisateurDemande = null;
  applicationService.getByUser = async (userId) => {
    utilisateurDemande = userId;
    return CANDIDATURES;
  };

  const { url, fermer } = await serveurDeTest();

  try {
    const reponse = await fetch(`${url}/api/applications/user/moi/statistiques`);
    const corps = await reponse.json();

    assert.equal(reponse.status, 200);
    assert.equal(corps.success, true);
    assert.equal(utilisateurDemande, 'moi');

    const { statistiques, relancesAFaire } = corps.data;

    assert.equal(statistiques.total, 4);
    assert.equal(statistiques.parStatut.postule, 2);
    assert.equal(statistiques.parStatut.entretien, 1);
    assert.equal(statistiques.parStatut.a_postuler, 1);
    // 3 candidatures parties, 1 reponse recue.
    assert.equal(statistiques.tauxReponse, 33.3);

    assert.equal(relancesAFaire.length, 1, 'seule la candidature non relancee remonte');
    assert.equal(relancesAFaire[0].candidature.id, 'c1');
    assert.equal(typeof relancesAFaire[0].dateRelance, 'string');
    assert.ok(relancesAFaire[0].joursDepuisEnvoi >= 19);
  } finally {
    applicationService.getByUser = original;
    await fermer();
  }
});

/** Serveur de test en mode « supabase », avec une verification simulee. */
async function serveurAvecJeton(verifierJeton) {
  const app = express();
  app.use(express.json());
  app.use('/api/applications', creerAuth({ mode: 'supabase', verifierJeton }),
    require('../src/routes/applications'));

  const serveur = app.listen(0);
  await new Promise((resoudre) => serveur.once('listening', resoudre));
  return {
    url: `http://127.0.0.1:${serveur.address().port}`,
    fermer: () => new Promise((resoudre) => serveur.close(resoudre))
  };
}

test('mode supabase : sans jeton, la route repond 401 et ne lit aucune donnee', async () => {
  const original = applicationService.getByUser;
  let appele = false;
  applicationService.getByUser = async () => { appele = true; return CANDIDATURES; };

  const { url, fermer } = await serveurAvecJeton(async () => null);

  try {
    const reponse = await fetch(`${url}/api/applications/user/quelquun/statistiques`);
    assert.equal(reponse.status, 401);
    assert.equal(appele, false, 'aucune donnee ne doit etre lue sans identite verifiee');
  } finally {
    applicationService.getByUser = original;
    await fermer();
  }
});

test('mode supabase : l\'URL d\'un autre utilisateur ne donne pas ses donnees', async () => {
  // Le scenario que cette route rendait possible avant : demander
  // /user/<identifiant-de-quelqu-un-d-autre>/statistiques. Le jeton doit
  // gagner sur l'URL, sinon l'authentification ne sert a rien.
  const original = applicationService.getByUser;
  let utilisateurDemande = null;
  applicationService.getByUser = async (userId) => {
    utilisateurDemande = userId;
    return CANDIDATURES;
  };

  const { url, fermer } = await serveurAvecJeton(async () => 'moi');

  try {
    const reponse = await fetch(`${url}/api/applications/user/quelquun-dautre/statistiques`, {
      headers: { Authorization: 'Bearer jeton-valide' }
    });

    assert.equal(reponse.status, 200);
    assert.equal(utilisateurDemande, 'moi');
  } finally {
    applicationService.getByUser = original;
    await fermer();
  }
});
