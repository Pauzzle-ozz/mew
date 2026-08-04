const test = require('node:test');
const assert = require('node:assert');

const { scoreAts, puceCommenceParVerbe, motCleTrouve } = require('../src/core/score/ats');
const { recommandations } = require('../src/core/score/recommandations');
const { moyennePonderee } = require('../src/core/score/moyennePonderee');
const bareme = require('../src/data/fr/ats-bareme.json');

/**
 * Ce fichier verrouille la promesse centrale du projet : le score ATS est un CALCUL.
 *
 * Avant, il sortait d'une ligne de prompt sans aucun critere (optimiseCvPdf.js:66) et le
 * meme CV pouvait donner 78 puis 85. Le premier test ci-dessous est celui qui compte :
 * si un jour il echoue, c'est qu'on a reintroduit du hasard dans le score.
 */

// L'annee de reference est figee : sinon le critere "dates coherentes" changerait de
// verdict au 1er janvier, et les tests seraient faux une fois par an.
const ANNEE = 2026;

// ---------------------------------------------------------------------------
// Profils de test, ecrits a la main (aucune dependance au parseur de CV)
// ---------------------------------------------------------------------------

/** Un CV de developpeuse qui coche tout : il doit approcher 100. */
function cvParfait() {
  return {
    contact: { email: 'claire.martin@example.fr', telephone: '06 12 34 56 78', ville: 'Nantes' },
    resume:
      "Developpeuse full-stack avec huit annees d'experience sur des applications React et Node. "
      + 'Specialiste des architectures microservices et de la performance web. '
      + "A conduit la refonte d'une plateforme utilisee par 40 000 personnes chaque mois, "
      + 'avec un gain de 35 % sur le temps de chargement des pages principales du produit.',
    competences: ['React', 'Node.js', 'PostgreSQL', 'Docker', 'TypeScript', 'Tests automatises'],
    formations: ['Master informatique, Universite de Nantes, 2016'],
    experiences: [
      {
        intitule: 'Lead developpeuse',
        dateDebut: '2021-03',
        dateFin: null,
        enCours: true,
        puces: [
          'Pilote une equipe de 6 developpeurs sur la refonte du portail client',
          'Reduit de 35 % le temps de chargement des pages en repensant le cache',
          'Deploye 120 mises en production par an sans interruption de service',
          "Forme 4 alternants aux tests automatises et a la revue de code d'equipe"
        ]
      },
      {
        intitule: 'Developpeuse back-end',
        dateDebut: '2018-01',
        dateFin: '2021-02',
        puces: [
          'Concu une API REST servant 2 millions de requetes par jour en pointe',
          'Migre 14 services vers Docker et divise par 3 le temps de deploiement',
          'Optimise les requetes SQL les plus lentes, 60 % de latence en moins'
        ]
      },
      {
        intitule: 'Developpeuse junior',
        dateDebut: '2016-09',
        dateFin: '2017-12',
        puces: [
          'Developpe 9 ecrans du back-office utilise par 30 gestionnaires',
          'Corrige 210 anomalies remontees par le support en un an'
        ]
      }
    ]
  };
}

/**
 * Le CV qui casse tout : une infirmiere. Aucune competence technique, aucun mot-cle
 * d'offre fourni. Il doit obtenir un resultat aussi juste qu'un CV de developpeur.
 */
function cvInfirmiere() {
  return {
    contact: { email: 'sophie.bernard@example.fr', telephone: '07 88 99 00 11', ville: 'Rennes' },
    resume:
      'Infirmiere diplomee d Etat, douze ans en service de medecine polyvalente et en '
      + 'unite de soins continus. Referente douleur et tutrice de stage. Habituee aux '
      + 'services a forte rotation et aux transmissions ciblees en equipe pluridisciplinaire.',
    competences: [
      'Pose de voie veineuse peripherique',
      'Transmissions ciblees',
      'Prise en charge de la douleur',
      'Preparation et administration des traitements',
      'Education therapeutique du patient'
    ],
    formations: ['Diplome d Etat infirmier, IFSI de Rennes, 2013'],
    experiences: [
      {
        intitule: 'Infirmiere en soins continus',
        dateDebut: '2019-05',
        dateFin: null,
        enCours: true,
        puces: [
          'Assure la surveillance de 12 patients par poste en unite de soins continus',
          'Realise les prelevements et les poses de voie veineuse peripherique',
          'Transmet les observations ciblees au medecin lors des releves quotidiennes',
          'Encadre 3 etudiants infirmiers par semestre en qualite de tutrice de stage'
        ]
      },
      {
        intitule: 'Infirmiere en medecine polyvalente',
        dateDebut: '2013-09',
        dateFin: '2019-04',
        puces: [
          'Administre les traitements de 25 patients hospitalises chaque matin',
          'Anime 20 seances d education therapeutique par an aupres des diabetiques',
          'Applique les protocoles d hygiene, zero infection nosocomiale sur le service'
        ]
      }
    ]
  };
}

/** Texte de CV plausible, pour les criteres de longueur et de compatibilite technique. */
function texteBrut(profil, repetitions) {
  const bloc = [
    profil.resume,
    profil.competences.join(', '),
    profil.formations.join('\n'),
    profil.experiences
      .map((e) => `${e.intitule}\n${e.puces.map((p) => `- ${p}`).join('\n')}`)
      .join('\n\n')
  ].join('\n\n');
  return Array.from({ length: repetitions || 1 }, () => bloc).join('\n\n');
}

function noter(profil, options) {
  return scoreAts(profil, Object.assign({ anneeReference: ANNEE }, options));
}

function critere(resultat, id) {
  return resultat.criteres.find((c) => c.id === id);
}

// ---------------------------------------------------------------------------
// LE test : le determinisme
// ---------------------------------------------------------------------------

test('le meme CV donne exactement le meme score, appel apres appel', () => {
  const profil = cvParfait();
  const options = { texteBrut: texteBrut(profil, 3), motsClesPoste: ['React', 'Docker', 'SQL'] };

  const premier = noter(profil, options);
  for (let i = 0; i < 20; i++) {
    const suivant = noter(profil, options);
    assert.equal(suivant.score, premier.score, 'le score a bouge entre deux appels');
    assert.deepEqual(suivant, premier, 'le detail du bareme a bouge entre deux appels');
  }
});

test('deux objets profils identiques mais distincts donnent le meme score', () => {
  const options = { texteBrut: texteBrut(cvParfait(), 3) };
  assert.equal(noter(cvParfait(), options).score, noter(cvParfait(), options).score);
});

// ---------------------------------------------------------------------------
// Le bareme lui-meme
// ---------------------------------------------------------------------------

test('le bareme fait bien 100 points, familles comprises', () => {
  const totalCriteres = bareme.criteres.reduce((somme, c) => somme + c.poids, 0);
  assert.equal(totalCriteres, 100, 'la somme des criteres doit faire 100');

  const totalFamilles = bareme.familles.reduce((somme, f) => somme + f.points, 0);
  assert.equal(totalFamilles, 100, 'la somme des familles doit faire 100');

  for (const famille of bareme.familles) {
    const somme = bareme.criteres
      .filter((c) => c.famille === famille.id)
      .reduce((total, c) => total + c.poids, 0);
    assert.equal(somme, famille.points, `la famille ${famille.id} n'a pas le bon total`);
  }
});

test('chaque critere du bareme a un mesureur, une facilite et ses deux messages', () => {
  const resultat = noter(cvParfait(), { texteBrut: 'x'.repeat(500), motsClesPoste: ['React'] });
  for (const c of bareme.criteres) {
    assert.ok(c.messageOk, `${c.id} : messageOk manquant`);
    assert.ok(c.messageAction, `${c.id} : messageAction manquant`);
    assert.ok(c.facilite >= 1 && c.facilite <= 5, `${c.id} : facilite hors de 1-5`);
    assert.ok(critere(resultat, c.id), `${c.id} : absent de la sortie`);
    assert.ok(
      critere(resultat, c.id).applicable,
      `${c.id} : devrait etre mesurable sur un CV complet`
    );
  }
});

test('la sortie respecte le contrat annonce', () => {
  const profil = cvParfait();
  const resultat = noter(profil, { texteBrut: texteBrut(profil, 3), motsClesPoste: ['React'] });

  assert.ok(Number.isInteger(resultat.score));
  assert.ok(resultat.score >= 0 && resultat.score <= 100);
  assert.ok(resultat.pointsObtenus <= resultat.pointsMaxApplicables);

  for (const c of resultat.criteres) {
    for (const champ of ['id', 'famille', 'libelle', 'poids', 'obtenu', 'applicable', 'mesure', 'message', 'facilite']) {
      assert.ok(champ in c, `le critere ${c.id} n'expose pas ${champ}`);
    }
  }
  for (const f of resultat.familles) {
    for (const champ of ['nom', 'obtenu', 'max']) {
      assert.ok(champ in f, `la famille ${f.nom} n'expose pas ${champ}`);
    }
  }
});

test('le detail affiche fait toujours le total annonce', () => {
  const profil = cvInfirmiere();
  const resultat = noter(profil, { texteBrut: texteBrut(profil, 3) });

  const sommeCriteres = resultat.criteres
    .filter((c) => c.applicable)
    .reduce((total, c) => total + c.obtenu, 0);
  assert.ok(Math.abs(sommeCriteres - resultat.pointsObtenus) < 0.05);

  const sommeFamilles = resultat.familles.reduce((total, f) => total + f.obtenu, 0);
  assert.ok(Math.abs(sommeFamilles - resultat.pointsObtenus) < 0.05);

  const maxFamilles = resultat.familles.reduce((total, f) => total + f.max, 0);
  assert.equal(maxFamilles, resultat.pointsMaxApplicables);
});

test('aucun message ne laisse de variable non remplie', () => {
  const profils = [cvParfait(), cvInfirmiere(), { experiences: [] }];
  for (const profil of profils) {
    for (const options of [{}, { texteBrut: '', motsClesPoste: ['React', 'Kubernetes'] }]) {
      for (const c of noter(profil, options).criteres) {
        assert.ok(!/\{\w+\}/.test(c.message), `variable non remplie dans ${c.id} : ${c.message}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Un CV complet approche 100
// ---------------------------------------------------------------------------

test('un CV soigne approche 100', () => {
  const profil = cvParfait();
  const resultat = noter(profil, {
    texteBrut: texteBrut(profil, 3),
    motsClesPoste: ['React', 'Node.js', 'Docker', 'API REST']
  });
  assert.ok(
    resultat.score >= 95,
    `attendu >= 95, obtenu ${resultat.score}. Criteres rates : `
      + resultat.criteres.filter((c) => c.applicable && c.obtenu < c.poids).map((c) => `${c.id}=${c.obtenu}/${c.poids}`).join(', ')
  );
});

test('le CV d une infirmiere obtient un bon score, sans mots-cles techniques', () => {
  const profil = cvInfirmiere();
  const resultat = noter(profil, { texteBrut: texteBrut(profil, 4) });
  assert.ok(
    resultat.score >= 90,
    `un CV non-tech bien redige doit bien scorer, obtenu ${resultat.score}`
  );
});

// ---------------------------------------------------------------------------
// La regle de neutralisation
// ---------------------------------------------------------------------------

test('sans mots-cles de poste, la famille correspondante sort du denominateur', () => {
  const profil = cvInfirmiere();
  const options = { texteBrut: texteBrut(profil, 4) };

  const sans = noter(profil, options);
  const avec = noter(profil, Object.assign({ motsClesPoste: ['soins', 'douleur'] }, options));

  assert.equal(avec.pointsMaxApplicables, 100, 'avec des mots-cles, tout est mesurable');
  assert.equal(sans.pointsMaxApplicables, 86, 'sans mots-cles, le total tombe a 86');
  assert.equal(avec.pointsMaxApplicables - sans.pointsMaxApplicables, 14);

  for (const id of ['motscles_couverture', 'motscles_resume']) {
    assert.equal(critere(sans, id).applicable, false);
    assert.equal(critere(sans, id).obtenu, 0);
  }
  assert.equal(sans.familles.find((f) => f.nom === 'motsCles').max, 0);
});

test('la neutralisation ne penalise pas : le score reste plein', () => {
  const profil = cvInfirmiere();
  const resultat = noter(profil, { texteBrut: texteBrut(profil, 4) });
  // Aucun point perdu sur des criteres qu'on n'a pas pu mesurer.
  const perdusNonApplicables = resultat.criteres
    .filter((c) => !c.applicable)
    .reduce((total, c) => total + c.poids, 0);
  assert.ok(perdusNonApplicables > 0, 'ce CV doit bien avoir des criteres neutralises');
  assert.equal(resultat.pointsMaxApplicables, 100 - perdusNonApplicables);
});

test('sans texte brut, les 12 points de compatibilite technique sont neutralises', () => {
  const profil = cvParfait();
  const resultat = noter(profil, {}); // pas de texteBrut du tout
  for (const id of ['technique_texte_extractible', 'technique_mise_en_page', 'technique_caracteres']) {
    assert.equal(critere(resultat, id).applicable, false, `${id} devrait etre neutralise`);
  }
  assert.equal(resultat.familles.find((f) => f.nom === 'technique').max, 0);
});

test('un CV sans aucune puce neutralise redaction et resultats chiffres', () => {
  const profil = {
    contact: { email: 'a@b.fr', telephone: '0612345678', ville: 'Lyon' },
    resume: 'Conducteur de travaux, quinze ans de chantiers en gros oeuvre et second oeuvre.',
    competences: ['Lecture de plans', 'Coordination de sous-traitants'],
    formations: ['BTS batiment, 2009'],
    experiences: [{ intitule: 'Conducteur de travaux', dateDebut: '2015-01', dateFin: null }]
  };
  const resultat = noter(profil, {});
  for (const id of ['redaction_verbes', 'redaction_longueur_puces', 'resultats_chiffres', 'resultats_impact']) {
    assert.equal(critere(resultat, id).applicable, false, `${id} devrait etre neutralise`);
  }
});

// ---------------------------------------------------------------------------
// Les criteres, un par un
// ---------------------------------------------------------------------------

test('un CV sans email perd les points correspondants, et le message le dit', () => {
  const profil = cvParfait();
  const complet = noter(profil, {});
  delete profil.contact.email;
  const ampute = noter(profil, {});

  const c = critere(ampute, 'contact_email');
  assert.equal(c.obtenu, 0);
  assert.equal(c.applicable, true, 'un email manquant se mesure : il ne se neutralise pas');
  assert.match(c.message, /e-mail/i);
  assert.equal(complet.pointsObtenus - ampute.pointsObtenus, c.poids);
  assert.equal(complet.pointsMaxApplicables, ampute.pointsMaxApplicables);
});

test('un email mal forme est signale differemment d un email absent', () => {
  const profil = cvParfait();
  profil.contact.email = 'claire.martin(at)example.fr';
  const c = critere(noter(profil, {}), 'contact_email');
  assert.equal(c.obtenu, 0);
  assert.match(c.message, /claire\.martin\(at\)example\.fr/);
});

test('un telephone absent coute exactement son poids', () => {
  const profil = cvParfait();
  delete profil.contact.telephone;
  const c = critere(noter(profil, {}), 'contact_telephone');
  assert.equal(c.obtenu, 0);
  assert.match(c.message, /telephone/i);
});

test('les formats de telephone francais courants sont acceptes', () => {
  for (const numero of ['06 12 34 56 78', '0612345678', '+33 6 12 34 56 78', '06.12.34.56.78']) {
    const profil = cvParfait();
    profil.contact.telephone = numero;
    assert.equal(critere(noter(profil, {}), 'contact_telephone').obtenu, 4, numero);
  }
});

test('une fin d experience anterieure a son debut est detectee', () => {
  const profil = cvParfait();
  profil.experiences[1].dateDebut = '2021-02';
  profil.experiences[1].dateFin = '2018-01';
  const c = critere(noter(profil, {}), 'dates_coherentes');
  assert.ok(c.obtenu < c.poids);
  assert.equal(c.mesure.z, 1, 'une seule experience incoherente');
  assert.match(c.message, /1 experience/);
});

test('une chronologie a l endroit perd les points d ordre', () => {
  const profil = cvParfait();
  profil.experiences.reverse();
  assert.equal(critere(noter(profil, {}), 'dates_ordre').obtenu, 0);
  assert.equal(critere(noter(cvParfait(), {}), 'dates_ordre').obtenu, 2);
});

test('un PDF scanne fait tomber la compatibilite technique a zero', () => {
  const resultat = noter(cvParfait(), { texteBrut: '' });
  assert.equal(critere(resultat, 'technique_texte_extractible').applicable, true);
  assert.equal(critere(resultat, 'technique_texte_extractible').obtenu, 0);
  assert.match(critere(resultat, 'technique_texte_extractible').message, /scanne/i);
});

test('un CV en tableau est repere', () => {
  const tableau = Array.from({ length: 20 }, (_, i) => `| Poste ${i} | 2020 | Paris |`).join('\n');
  const c = critere(noter(cvParfait(), { texteBrut: tableau }), 'technique_mise_en_page');
  assert.equal(c.obtenu, 0);
  assert.match(c.message, /tableau/i);
});

test('des caracteres illisibles sont comptes', () => {
  const abime = 'Developpeuse ��� full-stack �� chez Acme';
  const c = critere(noter(cvParfait(), { texteBrut: abime }), 'technique_caracteres');
  assert.equal(c.mesure.x, 5);
  assert.ok(c.obtenu < c.poids);
});

test('les puces sans verbe d action et sans chiffre sont chiffrees dans le message', () => {
  const profil = cvParfait();
  profil.experiences = [
    {
      intitule: 'Charge de mission',
      dateDebut: '2020-01',
      dateFin: '2024-01',
      puces: [
        'Responsable de la relation avec les partenaires du territoire',
        'En charge du suivi administratif des dossiers de subvention',
        'Participation aux reunions du comite de pilotage regional',
        'Realise le bilan annuel de 30 dossiers'
      ]
    }
  ];
  const resultat = noter(profil, {});

  const verbes = critere(resultat, 'redaction_verbes');
  assert.equal(verbes.mesure.y, 4);
  assert.equal(verbes.mesure.x, 1, 'une seule puce ouvre sur un verbe d action');
  assert.match(verbes.message, /1 de vos 4 puces/);

  const chiffres = critere(resultat, 'resultats_chiffres');
  assert.equal(chiffres.mesure.x, 1);
  assert.match(chiffres.message, /1 de vos 4 puces/);
});

test('une annee dans une puce ne compte pas comme un resultat chiffre', () => {
  const profil = cvParfait();
  profil.experiences = [
    {
      intitule: 'Cuisinier',
      dateDebut: '2020-01',
      dateFin: '2024-01',
      puces: ['Cuisine au poste chaud depuis 2020', 'Dresse 120 couverts par service']
    }
  ];
  assert.equal(critere(noter(profil, {}), 'resultats_chiffres').mesure.x, 1);
});

test('la couverture des mots-cles liste les manquants', () => {
  const profil = cvParfait();
  const resultat = noter(profil, {
    texteBrut: texteBrut(profil, 3),
    motsClesPoste: ['React', 'Docker', 'Kubernetes', 'Terraform']
  });
  const c = critere(resultat, 'motscles_couverture');
  assert.equal(c.mesure.x, 2);
  assert.equal(c.mesure.y, 4);
  assert.match(c.message, /Kubernetes/);
  assert.match(c.message, /Terraform/);
});

test('un mot-cle ne se declenche pas sur un mot qui le contient', () => {
  assert.equal(motCleTrouve('react', 'reacteur nucleaire'), false);
  assert.equal(motCleTrouve('react', 'developpeuse react et node'), true);
  assert.equal(motCleTrouve('React', 'stack : reacts, node'), true, 'pluriel tolere');
  assert.equal(motCleTrouve('C++', 'code en c++ et en rust'), true);
});

test('les verbes d action couvrent les metiers manuels et du soin', () => {
  const puces = [
    'Soude les elements de charpente metallique',
    'Pose 40 radiateurs par chantier',
    'Realise les prelevements sanguins du matin',
    'Cuisine 200 couverts par service',
    'Conduit un poids lourd sur les tournees regionales',
    'Recolte et conditionne 3 tonnes de fruits par saison',
    "J'ai encadre une equipe de 5 personnes",
    'Diagnostique les pannes electriques sur les vehicules'
  ];
  for (const puce of puces) {
    assert.ok(puceCommenceParVerbe(puce), `non reconnue : ${puce}`);
  }
  for (const puce of ['Responsable du parc automobile', 'En charge de la maintenance']) {
    assert.equal(puceCommenceParVerbe(puce), false, `faux positif : ${puce}`);
  }
});

test('un profil vide ne fait pas planter et ne rend pas un score negatif', () => {
  for (const profil of [null, undefined, {}, { experiences: null }]) {
    const resultat = scoreAts(profil, { anneeReference: ANNEE });
    assert.ok(resultat.score >= 0 && resultat.score <= 100);
    assert.ok(resultat.pointsMaxApplicables > 0);
  }
});

// ---------------------------------------------------------------------------
// Recommandations
// ---------------------------------------------------------------------------

test('le tri des ameliorations met les corrections faciles en premier', () => {
  const profil = cvParfait();
  delete profil.contact.telephone; // 4 pts, facilite 1 -> rendement 4
  profil.experiences.forEach((experience) => {
    // puces sans verbe ni chiffre : beaucoup de points, mais une heure de travail
    experience.puces = experience.puces.map((p) => `Responsable de ${p.toLowerCase()}`);
  });

  const { ameliorations } = recommandations(noter(profil, {}));

  const rangTelephone = ameliorations.findIndex((a) => a.critereId === 'contact_telephone');
  const rangVerbes = ameliorations.findIndex((a) => a.critereId === 'redaction_verbes');
  assert.ok(rangTelephone >= 0 && rangVerbes >= 0);
  assert.ok(
    rangTelephone < rangVerbes,
    'ajouter un telephone (10 s) doit passer avant reecrire toutes les puces (1 h)'
  );

  // Et le classement est bien un rendement, pas un simple tri par points perdus.
  const perduTelephone = ameliorations[rangTelephone].pointsPerdus;
  const perduVerbes = ameliorations[rangVerbes].pointsPerdus;
  assert.ok(perduVerbes > perduTelephone, 'les puces coutent pourtant plus de points');
});

test('les recommandations sont identiques a chaque appel', () => {
  const profil = cvInfirmiere();
  delete profil.contact.ville;
  const resultat = noter(profil, { texteBrut: 'court' });
  assert.deepEqual(recommandations(resultat), recommandations(resultat));
});

test('les messages d amelioration portent la mesure reelle, pas un conseil generique', () => {
  const profil = cvParfait();
  profil.experiences = [
    {
      intitule: 'Agent de maintenance',
      dateDebut: '2020-01',
      dateFin: '2024-01',
      puces: [
        'Responsable du parc de machines de l atelier',
        'En charge des rondes de controle quotidiennes',
        'Suivi des interventions des prestataires exterieurs',
        'Remplace 12 courroies sur la ligne de production'
      ]
    }
  ];
  const { ameliorations } = recommandations(noter(profil, {}));
  const chiffres = ameliorations.find((a) => a.critereId === 'resultats_chiffres');
  assert.ok(chiffres, 'le critere des chiffres devrait apparaitre');
  assert.match(chiffres.message, /\d+ de vos \d+ puces/);
  assert.match(chiffres.message, /%/);
});

test('les criteres non applicables n apparaissent ni en fort ni en amelioration', () => {
  const profil = cvInfirmiere();
  const resultat = noter(profil, { texteBrut: texteBrut(profil, 4) });
  const { pointsForts, ameliorations } = recommandations(resultat);
  const neutralises = resultat.criteres.filter((c) => !c.applicable).map((c) => c.id);
  assert.ok(neutralises.length > 0);
  for (const id of neutralises) {
    assert.equal(pointsForts.some((p) => p.critereId === id), false, id);
    assert.equal(ameliorations.some((a) => a.critereId === id), false, id);
  }
});

test('un CV soigne remonte des points forts et peu d ameliorations', () => {
  const profil = cvParfait();
  const { pointsForts, ameliorations } = recommandations(
    noter(profil, { texteBrut: texteBrut(profil, 3) })
  );
  assert.ok(pointsForts.length >= 5);
  assert.ok(ameliorations.length <= 2);
});

test('recommandations survit a une entree vide', () => {
  assert.deepEqual(recommandations(null), { pointsForts: [], ameliorations: [] });
  assert.deepEqual(recommandations({}), { pointsForts: [], ameliorations: [] });
});

// ---------------------------------------------------------------------------
// Moyenne ponderee
// ---------------------------------------------------------------------------

test('moyennePonderee reproduit la formule confiee a GPT', () => {
  // jsonSchemas.js:66 : adequation x 0.4 + marche x 0.35 + potentiel x 0.25, arrondi
  assert.equal(moyennePonderee([80, 60, 40], [0.4, 0.35, 0.25]), 63);
  assert.equal(moyennePonderee([100, 100, 100], [0.4, 0.35, 0.25]), 100);
  assert.equal(moyennePonderee([0, 0, 0], [0.4, 0.35, 0.25]), 0);
});

test('moyennePonderee accepte des poids qui ne font pas 1', () => {
  assert.equal(moyennePonderee([10, 20], [1, 1]), 15);
  assert.equal(moyennePonderee([10, 20], [40, 35]), 15); // meme resultat, poids non normalises
  assert.equal(moyennePonderee([90, 10], [3, 1]), 70);
});

test('moyennePonderee rend 0 si aucun poids ne compte', () => {
  assert.equal(moyennePonderee([10, 20], [0, 0]), 0);
  assert.equal(moyennePonderee([], []), 0);
});

test('moyennePonderee refuse des entrees incoherentes', () => {
  assert.throws(() => moyennePonderee([1, 2], [1]), TypeError);
  assert.throws(() => moyennePonderee('80', [1]), TypeError);
  assert.throws(() => moyennePonderee([1, null], [1, 1]), TypeError);
  assert.throws(() => moyennePonderee([1, 2], [1, undefined]), TypeError);
});
