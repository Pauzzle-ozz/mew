const test = require('node:test');
const assert = require('node:assert');

const cache = require('../src/lib/cache/pdfCache');
const cout = require('../src/llm/cout');
const relances = require('../src/core/suivi/relances');

/**
 * Trois briques qui font economiser du temps et de l'argent :
 *   - le cache de CV evite de re-extraire dix fois le meme fichier ;
 *   - la mesure de cout rend verifiable la promesse « Mew coute presque rien » ;
 *   - les relances sont du calcul de dates, donc gratuites et locales.
 *
 * Ce fichier existe surtout pour la troisieme : une erreur de date dans un
 * suivi de candidatures ne se voit pas, elle fait juste rater une relance.
 */

// ---------------------------------------------------------------------------
// Cache de CV
// ---------------------------------------------------------------------------

test.beforeEach(() => {
  cache._utiliserHorloge(null);
  cache.vider();
});

test('le meme PDF n est extrait qu une seule fois', async () => {
  const pdf = Buffer.from('%PDF-1.4 CV de quelqu un');
  let appels = 0;
  const extraire = async () => { appels += 1; return { nom: 'resultat' }; };

  const premier = await cache.memoiser(pdf, extraire);
  const second = await cache.memoiser(pdf, extraire);

  assert.equal(appels, 1, 'la fonction de calcul ne doit etre appelee qu une fois');
  assert.deepEqual(second, premier);
  assert.deepEqual(cache.statistiques(), { entrees: 1, succes: 1, echecs: 1 });
});

test('un buffer identique octet pour octet donne la meme empreinte', () => {
  const a = cache.empreinte(Buffer.from('meme contenu'));
  const b = cache.empreinte(Buffer.from('meme contenu'));
  const c = cache.empreinte(Buffer.from('contenu different'));

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/, 'un SHA-256 hexadecimal');
});

test('deux PDF differents declenchent deux extractions', async () => {
  let appels = 0;
  const extraire = async () => { appels += 1; return appels; };

  const un = await cache.memoiser(Buffer.from('CV infirmier'), extraire);
  const deux = await cache.memoiser(Buffer.from('CV plombier'), extraire);

  assert.equal(appels, 2);
  assert.equal(un, 1);
  assert.equal(deux, 2);
  assert.equal(cache.statistiques().entrees, 2);
});

test('une entree perimee est recalculee', async () => {
  // On injecte le temps plutot que d'attendre une heure.
  let instant = 1_000_000;
  cache._utiliserHorloge(() => instant);

  const pdf = Buffer.from('%PDF CV');
  let appels = 0;
  const extraire = async () => { appels += 1; return appels; };

  await cache.memoiser(pdf, extraire);
  instant += cache.DUREE_DE_VIE_MS - 1;
  await cache.memoiser(pdf, extraire);
  assert.equal(appels, 1, 'juste avant l expiration, le cache repond encore');

  instant += 2;
  const apres = await cache.memoiser(pdf, extraire);
  assert.equal(appels, 2, 'apres expiration, on recalcule');
  assert.equal(apres, 2);
});

test('le cache ne depasse jamais sa taille maximale', () => {
  for (let i = 0; i < cache.TAILLE_MAX + 10; i += 1) {
    cache.ecrire(cache.empreinte(Buffer.from(`cv-${i}`)), i);
  }
  assert.equal(cache.statistiques().entrees, cache.TAILLE_MAX);

  // La plus ancienne a bien ete evincee, la plus recente est toujours la.
  assert.equal(cache.lire(cache.empreinte(Buffer.from('cv-0'))), null);
  assert.equal(cache.lire(cache.empreinte(Buffer.from('cv-59'))), 59);
});

test('un buffer inexploitable ne fait pas planter le cache', async () => {
  assert.equal(cache.empreinte(null), null);
  assert.equal(cache.empreinte(Buffer.alloc(0)), null);

  let appels = 0;
  const valeur = await cache.memoiser(null, async () => { appels += 1; return 'calcule'; });
  assert.equal(valeur, 'calcule', 'sans empreinte on calcule quand meme');
  assert.equal(appels, 1);
});

test('une extraction qui echoue n est pas memorisee', async () => {
  const pdf = Buffer.from('%PDF illisible');
  await assert.rejects(() => cache.memoiser(pdf, async () => { throw new Error('boum'); }));

  const valeur = await cache.memoiser(pdf, async () => 'reussi cette fois');
  assert.equal(valeur, 'reussi cette fois');
});

test('deux extraits differents du meme tampon ne se confondent pas', () => {
  // Un Uint8Array ne couvre souvent qu'un MORCEAU de sa memoire sous-jacente.
  // Si l'empreinte est calculee sur le tampon entier, deux CV differents
  // recoivent la meme cle et le cache rend a l'un le CV de l'autre.
  const memoire = Buffer.from('AAAABBBB');
  const debut = new Uint8Array(memoire.buffer, memoire.byteOffset, 4);
  const fin = new Uint8Array(memoire.buffer, memoire.byteOffset + 4, 4);

  assert.notEqual(cache.empreinte(debut), cache.empreinte(fin));
  // Et une vue doit donner la meme empreinte que les memes octets recopies.
  assert.equal(cache.empreinte(debut), cache.empreinte(Buffer.from('AAAA')));
});

test('cinq demandes simultanees sur le meme CV ne font qu une extraction', async () => {
  // C'est le scenario reel du mode Decouverte : l'interface lance les appels
  // en parallele. Sans mise en commun, aucun n'a encore ecrit dans le cache
  // quand les autres demarrent, et on paie cinq fois.
  const pdf = Buffer.from('%PDF CV infirmiere');
  let appels = 0;
  const lente = () => new Promise((resoudre) => {
    appels += 1;
    setTimeout(() => resoudre('texte du CV'), 10);
  });

  const resultats = await Promise.all([
    cache.memoiser(pdf, lente), cache.memoiser(pdf, lente), cache.memoiser(pdf, lente),
    cache.memoiser(pdf, lente), cache.memoiser(pdf, lente)
  ]);

  assert.equal(appels, 1);
  assert.deepEqual(resultats, Array(5).fill('texte du CV'));
});

test('une entree reecrite redevient la plus fraiche', () => {
  for (let i = 0; i < cache.TAILLE_MAX; i += 1) {
    cache.ecrire(cache.empreinte(Buffer.from(`cv-${i}`)), i);
  }
  // On retouche la plus ancienne : elle ne doit plus etre la prochaine victime.
  cache.ecrire(cache.empreinte(Buffer.from('cv-0')), 'reecrit');
  cache.ecrire(cache.empreinte(Buffer.from('cv-neuf')), 'neuf');

  assert.equal(cache.lire(cache.empreinte(Buffer.from('cv-0'))), 'reecrit');
  assert.equal(cache.lire(cache.empreinte(Buffer.from('cv-1'))), null, 'cv-1 est la doyenne');
});

test('memoiser accepte une fonction synchrone, et son echec ne plante pas le cache', async () => {
  const pdf = Buffer.from('%PDF synchrone');
  assert.equal(await cache.memoiser(pdf, () => 'sans async'), 'sans async');

  const autre = Buffer.from('%PDF qui explose');
  await assert.rejects(() => cache.memoiser(autre, () => { throw new Error('boum'); }));
  assert.equal(await cache.memoiser(autre, () => 'rattrape'), 'rattrape');
});

// ---------------------------------------------------------------------------
// Cout des appels au modele
// ---------------------------------------------------------------------------

test.beforeEach(() => cout.reinitialiser());

test('un calcul de cout verifiable a la main', () => {
  // gpt-4.1-mini : 0,40 $ / million en entree, 1,60 $ / million en sortie.
  // 2 840 x 0,40 / 1e6 = 0,001136 $
  // 2 210 x 1,60 / 1e6 = 0,003536 $
  // total 0,004672 $, soit 0,004672 x 0,92 = 0,00429824 EUR
  const { usd, eur } = cout.estimerCout('gpt-4.1-mini', {
    prompt_tokens: 2840,
    completion_tokens: 2210
  });

  assert.equal(usd, 0.004672);
  assert.equal(eur, 0.004298);
});

test('un million de tokens sur gpt-4o coute le tarif affiche', () => {
  const { usd } = cout.estimerCout('gpt-4o', {
    prompt_tokens: 1_000_000,
    completion_tokens: 1_000_000
  });
  assert.equal(usd, 12.5, '2,50 $ en entree + 10,00 $ en sortie');
});

test('le formatage est lisible et independant de la locale', () => {
  const ligne = cout.formater('gpt-4.1-mini', { prompt_tokens: 2840, completion_tokens: 2210 });
  assert.equal(ligne, 'gpt-4.1-mini - 2 840 entree, 2 210 sortie - 0,0043 EUR');
});

test('un modele inconnu coute zero sans planter', () => {
  // Un modele qui tourne sur la machine de l'utilisateur ne coute rien
  // par requete : zero est la bonne reponse, pas une lacune.
  const usage = { prompt_tokens: 50_000, completion_tokens: 10_000 };

  assert.deepEqual(cout.estimerCout('llama-3-local', usage), { usd: 0, eur: 0 });
  assert.deepEqual(cout.estimerCout(undefined, usage), { usd: 0, eur: 0 });
  assert.equal(
    cout.formater('llama-3-local', usage),
    'llama-3-local - 50 000 entree, 10 000 sortie - 0,0000 EUR'
  );
});

test('un usage absent ou farfelu ne casse rien', () => {
  assert.deepEqual(cout.estimerCout('gpt-4o', null), { usd: 0, eur: 0 });
  assert.deepEqual(cout.estimerCout('gpt-4o', {}), { usd: 0, eur: 0 });
  assert.deepEqual(
    cout.estimerCout('gpt-4o', { prompt_tokens: 'beaucoup', completion_tokens: -5 }),
    { usd: 0, eur: 0 }
  );
});

test('le cumul additionne les appels de la session', () => {
  cout.enregistrer('gpt-4.1-mini', { prompt_tokens: 2840, completion_tokens: 2210 });
  cout.enregistrer('gpt-4.1-mini', { prompt_tokens: 1000, completion_tokens: 1000 });
  cout.enregistrer('modele-local', { prompt_tokens: 9000, completion_tokens: 9000 });

  const total = cout.cumul();
  assert.equal(total.appels, 3);
  assert.equal(total.tokensEntree, 2840 + 1000 + 9000);
  assert.equal(total.tokensSortie, 2210 + 1000 + 9000);
  // 0,004672 + 0,002 = 0,006672 $ ; le modele local n'ajoute rien.
  assert.equal(total.eur, Math.round(0.006672 * 0.92 * 1e6) / 1e6);

  cout.reinitialiser();
  assert.deepEqual(cout.cumul(), { appels: 0, tokensEntree: 0, tokensSortie: 0, eur: 0 });
});

test('un nom de modele piege ne contamine pas le compteur', () => {
  // « constructor » et « __proto__ » existent sur tout objet JavaScript par
  // heritage : une table de tarifs interrogee naivement croit les connaitre,
  // trouve des tarifs vides, et rend NaN. Un seul appel suffisait alors a
  // rendre le cumul de la session definitivement illisible.
  for (const piege of ['constructor', '__proto__', 'toString', 'valueOf']) {
    assert.deepEqual(
      cout.estimerCout(piege, { prompt_tokens: 1000, completion_tokens: 1000 }),
      { usd: 0, eur: 0 },
      `${piege} n'est pas un modele`
    );
  }

  cout.enregistrer('constructor', { prompt_tokens: 10, completion_tokens: 10 });
  cout.enregistrer('gpt-4o', { prompt_tokens: 1_000_000, completion_tokens: 0 });
  assert.equal(cout.cumul().eur, 2.3, '2,50 $ x 0,92 : le piege n a rien casse');
});

test('formater ne plante sur aucune entree, meme absurde', () => {
  assert.doesNotThrow(() => cout.formater(undefined, undefined));
  assert.doesNotThrow(() => cout.formater(null, null));
  assert.doesNotThrow(() => cout.formater(42, 'pas un usage'));
  assert.doesNotThrow(() => cout.formater(Symbol('modele'), {}));
  assert.doesNotThrow(() => cout.formater('gpt-4o', { prompt_tokens: [] }));
  assert.equal(cout.formater(null, null), 'modele inconnu - 0 entree, 0 sortie - 0,0000 EUR');
});

test('estimerCout est une fonction pure : elle ne compte rien', () => {
  const usage = { prompt_tokens: 1000, completion_tokens: 1000 };
  const premier = cout.estimerCout('gpt-4o', usage);
  const second = cout.estimerCout('gpt-4o', usage);

  assert.deepEqual(premier, second, 'meme entree, meme sortie');
  assert.equal(cout.cumul().appels, 0, 'estimer n est pas enregistrer');
});

// ---------------------------------------------------------------------------
// Relances et statistiques de candidatures
// ---------------------------------------------------------------------------

const jourLocal = (annee, mois, jour) => new Date(annee, mois - 1, jour, 12, 0, 0);
const ilYa = (jours, reference) => new Date(reference.getTime() - jours * 24 * 3600 * 1000);

test('8 jours ouvres apres un lundi tombent le jeudi de la semaine suivante', () => {
  const lundi = jourLocal(2026, 8, 3);
  const relance = relances.dateRelance(lundi);

  assert.ok(relance instanceof Date);
  assert.equal(relance.getFullYear(), 2026);
  assert.equal(relance.getMonth(), 7);
  assert.equal(relance.getDate(), 13, 'jeudi 13 aout : les deux week-ends sont sautes');
});

test('dateRelance ne plante jamais sur une date absente ou invalide', () => {
  assert.equal(relances.dateRelance(null), null);
  assert.equal(relances.dateRelance(undefined), null);
  assert.equal(relances.dateRelance(''), null);
  assert.equal(relances.dateRelance('pas une date'), null);
  assert.equal(relances.dateRelance({}), null);
});

test('une candidature ancienne remonte, une recente non', () => {
  const aujourdhui = jourLocal(2026, 8, 4);

  const ancienne = {
    id: 'a', status: 'postule', applied_at: ilYa(20, aujourdhui).toISOString(),
    created_at: ilYa(20, aujourdhui).toISOString(), follow_up_sent: false, follow_up_date: null
  };
  const recente = {
    id: 'b', status: 'postule', applied_at: ilYa(2, aujourdhui).toISOString(),
    created_at: ilYa(2, aujourdhui).toISOString(), follow_up_sent: false, follow_up_date: null
  };

  const aFaire = relances.relancesAFaire([ancienne, recente], aujourdhui);

  assert.equal(aFaire.length, 1);
  assert.equal(aFaire[0].candidature.id, 'a');
  assert.equal(aFaire[0].joursDepuisEnvoi, 20);
});

test('on ne relance ni les brouillons, ni les deja relancees, ni les repondues', () => {
  const aujourdhui = jourLocal(2026, 8, 4);
  const vieux = ilYa(40, aujourdhui).toISOString();

  const candidatures = [
    { id: 'brouillon', status: 'a_postuler', created_at: vieux, applied_at: null },
    { id: 'deja', status: 'postule', applied_at: vieux, follow_up_sent: true },
    { id: 'refusee', status: 'refuse', applied_at: vieux, follow_up_sent: false },
    { id: 'entretien', status: 'entretien', applied_at: vieux, follow_up_sent: false },
    { id: 'a_relancer', status: 'postule', applied_at: vieux, follow_up_sent: false }
  ];

  const aFaire = relances.relancesAFaire(candidatures, aujourdhui);
  assert.deepEqual(aFaire.map((r) => r.candidature.id), ['a_relancer']);
});

test('une date de relance fixee a la main fait autorite', () => {
  const aujourdhui = jourLocal(2026, 8, 4);
  const candidature = {
    id: 'plus_tard',
    status: 'postule',
    applied_at: ilYa(30, aujourdhui).toISOString(),
    // L'utilisateur a decide d'attendre : on ne le contredit pas.
    follow_up_date: new Date(aujourdhui.getTime() + 5 * 24 * 3600 * 1000).toISOString(),
    follow_up_sent: false
  };

  assert.equal(relances.relancesAFaire([candidature], aujourdhui).length, 0);
});

test('des candidatures cassees ne font pas tomber la liste', () => {
  const aujourdhui = jourLocal(2026, 8, 4);
  const entrees = [
    null,
    'pas un objet',
    { id: 'sans_date', status: 'postule', applied_at: null, created_at: null },
    { id: 'date_pourrie', status: 'postule', applied_at: 'hier matin' }
  ];

  assert.deepEqual(relances.relancesAFaire(entrees, aujourdhui), []);
  assert.deepEqual(relances.relancesAFaire(null), []);
  assert.deepEqual(relances.relancesAFaire(undefined), []);
});

test('le taux de reponse sur un jeu connu (un refus est une reponse)', () => {
  const aujourdhui = jourLocal(2026, 8, 4);
  const envoi = ilYa(10, aujourdhui).toISOString();

  const candidatures = [
    { id: '1', status: 'a_postuler', created_at: envoi },
    { id: '2', status: 'postule', applied_at: envoi },
    { id: '3', status: 'postule', applied_at: envoi },
    { id: '4', status: 'entretien', applied_at: envoi, updated_at: ilYa(4, aujourdhui).toISOString() },
    { id: '5', status: 'refuse', applied_at: envoi, updated_at: ilYa(2, aujourdhui).toISOString() }
  ];

  const stats = relances.statistiques(candidatures, aujourdhui);

  assert.equal(stats.total, 5);
  assert.equal(stats.parStatut.postule, 2);
  assert.equal(stats.parStatut.a_postuler, 1);
  assert.equal(stats.parStatut.entretien, 1);
  assert.equal(stats.parStatut.refuse, 1);
  // 4 candidatures envoyees, 2 reponses (entretien + refus) -> 50 %
  assert.equal(stats.tauxReponse, 50);
  // Reponses a 6 et 8 jours -> moyenne 7
  assert.equal(stats.delaiMoyenReponseJours, 7);
});

test('une candidature postulee depuis plus de 30 jours est dormante', () => {
  const aujourdhui = jourLocal(2026, 8, 4);

  const candidatures = [
    { id: 'dort', status: 'postule', applied_at: ilYa(45, aujourdhui).toISOString() },
    { id: 'fraiche', status: 'postule', applied_at: ilYa(5, aujourdhui).toISOString() },
    // Repondue : elle n'est pas dormante, elle est finie.
    { id: 'refusee', status: 'refuse', applied_at: ilYa(90, aujourdhui).toISOString() }
  ];

  assert.equal(relances.statistiques(candidatures, aujourdhui).candidaturesDormantes, 1);
});

test('la cadence hebdomadaire compte les candidatures envoyees', () => {
  const aujourdhui = jourLocal(2026, 8, 4);
  // 4 candidatures envoyees, la plus ancienne il y a 13 jours -> 2 semaines.
  const candidatures = [
    { id: '1', status: 'postule', applied_at: ilYa(13, aujourdhui).toISOString() },
    { id: '2', status: 'postule', applied_at: ilYa(9, aujourdhui).toISOString() },
    { id: '3', status: 'entretien', applied_at: ilYa(5, aujourdhui).toISOString() },
    { id: '4', status: 'postule', applied_at: ilYa(1, aujourdhui).toISOString() }
  ];

  assert.equal(relances.statistiques(candidatures, aujourdhui).cadenceHebdomadaire, 2);
});

test('une offre recue compte comme une reponse', () => {
  const aujourdhui = jourLocal(2026, 8, 4);
  const envoi = ilYa(10, aujourdhui).toISOString();

  const stats = relances.statistiques([
    { id: '1', status: 'postule', applied_at: envoi },
    { id: '2', status: 'offre', applied_at: envoi, updated_at: ilYa(3, aujourdhui).toISOString() }
  ], aujourdhui);

  assert.equal(stats.parStatut.offre, 1);
  assert.equal(stats.tauxReponse, 50);
  assert.equal(stats.delaiMoyenReponseJours, 7);
});

test('un statut inconnu est compte sans corrompre le tableau', () => {
  // Une base editee a la main peut contenir n'importe quoi, y compris des
  // noms qui existent deja sur tout objet JavaScript (constructor, __proto__).
  const aujourdhui = jourLocal(2026, 8, 4);
  const stats = relances.statistiques([
    { id: '1', status: 'en_negociation', applied_at: ilYa(5, aujourdhui).toISOString() },
    { id: '2', status: 'constructor', applied_at: ilYa(5, aujourdhui).toISOString() },
    { id: '3', status: '__proto__', applied_at: ilYa(5, aujourdhui).toISOString() },
    { id: '4', status: 'postule', applied_at: ilYa(5, aujourdhui).toISOString() }
  ], aujourdhui);

  assert.equal(stats.total, 4);
  assert.equal(stats.parStatut.en_negociation, 1);
  assert.equal(stats.parStatut.constructor, 1, 'un nombre, pas une fonction heritee');
  assert.equal(stats.parStatut['__proto__'], 1);
  // Les statuts inconnus ne sont pas « envoyes » : le taux ne porte que sur la
  // seule candidature reellement postulee.
  assert.equal(stats.tauxReponse, 0);
  assert.doesNotThrow(() => JSON.stringify(stats));
});

test('les jours se comptent en calendrier, pas en tranches de 24 heures', () => {
  // Candidature envoyee il y a 20 jours a 23 h 30, consultee ce matin a 8 h :
  // il s'est bien ecoule 20 jours. Un simple ecart en millisecondes arrondi
  // vers le bas en annoncerait 19 — et le meme calcul perd une journee a
  // chaque changement d'heure.
  const ceMatin = new Date(2026, 7, 4, 8, 0, 0);
  const envoiTardif = new Date(2026, 6, 15, 23, 30, 0);

  const aFaire = relances.relancesAFaire([
    { id: 'tardive', status: 'postule', applied_at: envoiTardif.toISOString() }
  ], ceMatin);

  assert.equal(aFaire.length, 1);
  assert.equal(aFaire[0].joursDepuisEnvoi, 20);
});

test('la dormance se joue au jour pres', () => {
  const ceMatin = new Date(2026, 7, 4, 8, 0, 0);
  const candidatures = [
    // 31 jours pleins, envoyee tard le soir : dormante malgre les heures.
    { id: 'dort', status: 'postule', applied_at: new Date(2026, 6, 4, 23, 0, 0).toISOString() },
    // Exactement 30 jours : pas encore dormante, le seuil est strict.
    { id: 'limite', status: 'postule', applied_at: new Date(2026, 6, 5, 9, 0, 0).toISOString() }
  ];

  assert.equal(relances.statistiques(candidatures, ceMatin).candidaturesDormantes, 1);
});

test('deux appels identiques donnent exactement le meme resultat', () => {
  const aujourdhui = jourLocal(2026, 8, 4);
  const candidatures = [
    { id: '1', status: 'postule', applied_at: ilYa(40, aujourdhui).toISOString() },
    { id: '2', status: 'refuse', applied_at: ilYa(20, aujourdhui).toISOString(), updated_at: ilYa(5, aujourdhui).toISOString() }
  ];

  assert.deepEqual(
    relances.statistiques(candidatures, aujourdhui),
    relances.statistiques(candidatures, aujourdhui)
  );
  assert.deepEqual(
    relances.dateRelance(aujourdhui),
    relances.dateRelance(aujourdhui)
  );
});

test('un tableau vide donne un tableau de bord vide, pas une erreur', () => {
  const stats = relances.statistiques([], jourLocal(2026, 8, 4));

  assert.equal(stats.total, 0);
  assert.equal(stats.tauxReponse, 0);
  assert.equal(stats.delaiMoyenReponseJours, null, 'aucune reponse n est pas une reponse en 0 jour');
  assert.equal(stats.candidaturesDormantes, 0);
  assert.equal(stats.cadenceHebdomadaire, 0);
  assert.deepEqual(stats.parStatut, {
    a_postuler: 0, postule: 0, entretien: 0, offre: 0, refuse: 0
  });

  assert.doesNotThrow(() => relances.statistiques(null));
  assert.doesNotThrow(() => relances.statistiques(undefined));
});
