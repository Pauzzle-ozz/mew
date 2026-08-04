const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { extraireContact } = require('../src/core/cv/extraireContact');
const { extrairePeriode, totalMois } = require('../src/core/cv/extraireDates');
const { decouperSections } = require('../src/core/cv/decouperSections');
const { extraireCompetences } = require('../src/core/cv/extraireCompetences');
const { decouperExperiences, anneesExperience } = require('../src/core/cv/experience');
const { construireProfil } = require('../src/core/cv/profil');

/**
 * Ces tests protegent deux promesses du projet :
 *
 * 1. Un infirmier, un cuisinier ou un plombier doit obtenir un resultat aussi
 *    bon qu'un developpeur. D'ou les fixtures de metiers non techniques : si
 *    quelqu'un ajoute un jour un filtre par dictionnaire de competences tech,
 *    le test « infirmiere » devient rouge immediatement.
 * 2. Les durees d'experience ne sont pas gonflees. Un profil avec des missions
 *    qui se chevauchent (freelance, cumul d'emplois) ne doit pas se retrouver
 *    avec le double de son anciennete reelle.
 *
 * Les CV de fixtures sont entierement inventes : ce depot est public.
 */

const DOSSIER_FIXTURES = path.join(__dirname, 'fixtures', 'cv');
const lireCv = (nom) => fs.readFileSync(path.join(DOSSIER_FIXTURES, nom), 'utf8');

const CV_DEV = lireCv('developpeuse.txt');
const CV_INFIRMIERE = lireCv('infirmiere.txt');
const CV_MAL_FORMATE = lireCv('mal-formate.txt');

// Date figee : sans elle, tout test portant sur « aujourd'hui » changerait de
// resultat chaque mois.
const MAINTENANT = new Date(2026, 7, 4); // aout 2026

// ---------------------------------------------------------------------------
// extraireContact
// ---------------------------------------------------------------------------

test('le telephone est normalise a 10 chiffres quelle que soit son ecriture', () => {
  const ecritures = [
    '06 12 34 56 78',
    '+33 6 12 34 56 78',
    '+33612345678',
    '06.12.34.56.78',
    '06-12-34-56-78',
    '0612345678',
    '0033 6 12 34 56 78',
    '+33 (0)6 12 34 56 78'
  ];

  for (const ecriture of ecritures) {
    const contact = extraireContact(`Contact : ${ecriture}`);
    assert.equal(contact.telephone, '0612345678', `echec sur « ${ecriture} »`);
  }
});

test('un numero de fixe est accepte lui aussi', () => {
  assert.equal(extraireContact('Tel : 01 42 68 53 00').telephone, '0142685300');
});

test('une date ou un code postal ne sont pas pris pour un telephone', () => {
  assert.equal(extraireContact('Poste occupe de 01/2016 a 08/2019').telephone, '');
  assert.equal(extraireContact('75011 Paris').telephone, '');
});

test('email, linkedin et github sont reconnus', () => {
  const contact = extraireContact(CV_DEV);
  assert.equal(contact.email, 'camille.martin@exemple.fr');
  assert.equal(contact.linkedin, 'https://www.linkedin.com/in/camille-martin-exemple');
  assert.equal(contact.github, 'https://github.com/camille-exemple');
});

test('code postal et ville sont extraits ensemble', () => {
  assert.equal(extraireContact(CV_DEV).codePostal, '75011');
  assert.equal(extraireContact(CV_DEV).ville, 'Paris');
  assert.equal(extraireContact(CV_INFIRMIERE).codePostal, '69003');
  assert.equal(extraireContact(CV_INFIRMIERE).ville, 'Lyon');
});

test('les champs absents sont des chaines vides, jamais null', () => {
  const contact = extraireContact('Rien du tout ici.');
  for (const champ of ['email', 'telephone', 'linkedin', 'github', 'ville', 'codePostal']) {
    assert.equal(contact[champ], '', `${champ} devrait etre une chaine vide`);
  }
});

test('extraireContact ne plante pas sur une entree vide ou invalide', () => {
  for (const entree of ['', null, undefined, 42, {}]) {
    assert.equal(extraireContact(entree).email, '');
  }
});

// ---------------------------------------------------------------------------
// extrairePeriode
// ---------------------------------------------------------------------------

test('extrairePeriode lit une periode ecrite en toutes lettres', () => {
  assert.deepEqual(extrairePeriode('Jan 2022 - Mars 2024'), {
    debut: '2022-01',
    fin: '2024-03',
    mois: 27
  });
});

test('extrairePeriode gere les formats numeriques et les tirets longs', () => {
  assert.deepEqual(extrairePeriode('01/2022 – 03/2024'), { debut: '2022-01', fin: '2024-03', mois: 27 });
  assert.deepEqual(extrairePeriode('01.2022 — 03.2024'), { debut: '2022-01', fin: '2024-03', mois: 27 });
  assert.deepEqual(extrairePeriode('de janvier 2022 a mars 2024'), { debut: '2022-01', fin: '2024-03', mois: 27 });
  assert.deepEqual(extrairePeriode('Janv. 2022 au 15/03/2024'), { debut: '2022-01', fin: '2024-03', mois: 27 });
});

test('extrairePeriode accepte les accents et la casse', () => {
  assert.deepEqual(extrairePeriode('Février 2020 - Août 2021'), { debut: '2020-02', fin: '2021-08', mois: 19 });
  assert.deepEqual(extrairePeriode('DÉCEMBRE 2019 - JANVIER 2020'), { debut: '2019-12', fin: '2020-01', mois: 2 });
});

test('une annee seule en fin de periode couvre toute l annee', () => {
  assert.deepEqual(extrairePeriode('2022 - 2024'), { debut: '2022-01', fin: '2024-12', mois: 36 });
});

test('un poste en cours n a pas de date de fin', () => {
  const attendu = (2026 - 2019) * 12 + (8 - 1) + 1; // de janvier 2019 a aout 2026 inclus

  for (const ligne of ['2019 - aujourd\'hui', '2019 - aujourd hui', 'depuis 2019', '2019 - present', '2019 - en cours', 'Depuis 2019, actuellement en poste']) {
    const periode = extrairePeriode(ligne, MAINTENANT);
    assert.equal(periode.fin, null, `« ${ligne} » devrait etre en cours`);
    assert.equal(periode.debut, '2019-01');
    assert.equal(periode.mois, attendu, `« ${ligne} »`);
  }
});

test('une date isolee vaut un mois, pas une annee entiere', () => {
  // Un diplome date « 2016 » ne doit pas ajouter 12 mois d'experience.
  assert.deepEqual(extrairePeriode('Baccalaureat 2016'), { debut: '2016-01', fin: '2016-01', mois: 1 });
});

test('extrairePeriode renvoie null quand il n y a pas de date', () => {
  for (const ligne of ['Developpeuse Full Stack — Acme SAS', 'Pose de voie veineuse', '', null, undefined, '06.12.34.56.78']) {
    assert.equal(extrairePeriode(ligne), null, `« ${ligne} » ne contient pas de periode`);
  }
});

test('une periode ecrite a l envers est remise dans l ordre', () => {
  const periode = extrairePeriode('Mars 2024 - Jan 2022');
  assert.equal(periode.debut, '2022-01');
  assert.equal(periode.fin, '2024-03');
  assert.equal(periode.mois, 27);
});

// ---------------------------------------------------------------------------
// totalMois : la fusion des chevauchements
// ---------------------------------------------------------------------------

test('deux missions de 12 mois qui se chevauchent de 6 mois font 18 mois', () => {
  const periodes = [
    extrairePeriode('Janvier 2022 - Decembre 2022'),
    extrairePeriode('Juillet 2022 - Juin 2023')
  ];
  assert.equal(periodes[0].mois, 12);
  assert.equal(periodes[1].mois, 12);
  // La somme naive donnerait 24 : c'est exactement le bug qu'on evite.
  assert.equal(totalMois(periodes), 18);
});

test('une mission entierement contenue dans une autre n ajoute rien', () => {
  const periodes = [
    extrairePeriode('Janvier 2020 - Decembre 2023'), // 48 mois
    extrairePeriode('Mars 2021 - Juin 2021')         // dedans
  ];
  assert.equal(totalMois(periodes), 48);
});

test('deux periodes collees forment une seule tranche continue', () => {
  const periodes = [
    extrairePeriode('Janvier 2022 - Decembre 2022'),
    extrairePeriode('Janvier 2023 - Decembre 2023')
  ];
  assert.equal(totalMois(periodes), 24);
});

test('deux periodes separees par un trou ne comblent pas le trou', () => {
  const periodes = [
    extrairePeriode('Janvier 2018 - Decembre 2018'),
    extrairePeriode('Janvier 2022 - Decembre 2022')
  ];
  assert.equal(totalMois(periodes), 24);
});

test('un poste en cours est compte jusqu a la date de reference', () => {
  const periodes = [extrairePeriode('depuis janvier 2026', MAINTENANT)];
  assert.equal(totalMois(periodes, MAINTENANT), 8); // janvier a aout 2026
});

test('totalMois ignore les entrees invalides sans planter', () => {
  assert.equal(totalMois(null), 0);
  assert.equal(totalMois([]), 0);
  assert.equal(totalMois([null, undefined, {}, { debut: 'n importe quoi' }]), 0);
});

// ---------------------------------------------------------------------------
// decouperSections
// ---------------------------------------------------------------------------

test('un CV bien structure donne une confiance haute', () => {
  const sections = decouperSections(CV_DEV);

  assert.equal(sections.confiance.niveau, 'haute');
  for (const attendue of ['resume', 'experiences', 'formations', 'competences', 'langues', 'centresInteret']) {
    assert.ok(sections.confiance.sectionsTrouvees.includes(attendue), `section ${attendue} manquante`);
  }
  assert.ok(sections.entete.includes('Camille Martin'));
  assert.ok(sections.experiences.includes('Acme SAS'));
  assert.ok(sections.formations.includes('Master Informatique'));
  assert.ok(sections.competences.includes('PostgreSQL'));
  // Le titre de section ne doit pas se retrouver dans le contenu.
  assert.ok(!sections.experiences.includes('EXPERIENCE PROFESSIONNELLE'));
});

test('les intitules de section non techniques sont reconnus', () => {
  const sections = decouperSections(CV_INFIRMIERE);
  assert.ok(sections.confiance.sectionsTrouvees.includes('experiences'), '« PARCOURS PROFESSIONNEL » doit valoir experiences');
  assert.ok(sections.confiance.sectionsTrouvees.includes('formations'), '« DIPLOMES » doit valoir formations');
  assert.ok(sections.confiance.sectionsTrouvees.includes('resume'), '« A PROPOS » doit valoir resume');
});

test('un titre suivi de contenu sur la meme ligne n est pas perdu', () => {
  const sections = decouperSections('Jean\n\nCOMPETENCES : soudure, PER multicouche\nLANGUES : francais');
  assert.ok(sections.competences.includes('soudure'));
  assert.ok(sections.langues.includes('francais'));
});

test('un titre en minuscules reste reconnu', () => {
  const sections = decouperSections('Jean\n\ncompetences\nsoudure au chalumeau\n\nlangues\nfrancais');
  assert.ok(sections.confiance.sectionsTrouvees.includes('competences'));
  assert.ok(sections.competences.includes('soudure au chalumeau'));
});

test('un CV sans structure sort en confiance faible sans planter', () => {
  const sections = decouperSections(CV_MAL_FORMATE);

  assert.equal(sections.confiance.niveau, 'faible');
  assert.ok(sections.confiance.raisons.length > 0, 'la raison doit etre explicite');
  assert.equal(sections.experiences, '');
  // Rien n'est perdu pour autant : tout le texte est dans l'entete.
  assert.ok(sections.entete.includes('cuisinier'));
});

test('une seule section reconnue suffit a baisser la confiance', () => {
  const sections = decouperSections('Jean Dupont\n\nCOMPETENCES\nsoudure\nplomberie');
  assert.equal(sections.confiance.niveau, 'faible');
});

test('decouperSections ne plante pas sur une entree vide ou invalide', () => {
  for (const entree of ['', null, undefined, 42]) {
    const sections = decouperSections(entree);
    assert.equal(sections.confiance.niveau, 'faible');
    assert.equal(sections.experiences, '');
  }
});

// ---------------------------------------------------------------------------
// extraireCompetences : le test le plus important du fichier
// ---------------------------------------------------------------------------

test('les competences d une infirmiere ressortent integralement', () => {
  const sections = decouperSections(CV_INFIRMIERE);
  const competences = extraireCompetences(sections.competences);

  const attendues = [
    'Pose de voie veineuse peripherique',
    'Transmissions ciblees',
    'Preparation et administration des traitements',
    'Surveillance post-operatoire',
    'Hygiene hospitaliere et asepsie',
    'Education therapeutique du patient',
    'Gestion des urgences vitales',
    'prise en charge de la douleur',
    'Dossier patient informatise'
  ];

  for (const competence of attendues) {
    assert.ok(
      competences.includes(competence),
      `« ${competence} » a disparu — un filtre par dictionnaire a-t-il ete ajoute ?`
    );
  }
  assert.equal(competences.length, attendues.length);
});

test('les competences d un plombier ressortent aussi', () => {
  const texte = 'Soudure au chalumeau | PER multicouche ; Pose de sanitaires\n- Depannage fuites\n- Lecture de plans';
  const competences = extraireCompetences(texte);

  assert.deepEqual(competences, [
    'Soudure au chalumeau',
    'PER multicouche',
    'Pose de sanitaires',
    'Depannage fuites',
    'Lecture de plans'
  ]);
});

test('les competences d un developpeur ressortent avec les memes regles', () => {
  const competences = extraireCompetences(decouperSections(CV_DEV).competences);
  assert.deepEqual(competences, [
    'JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL',
    'Docker', 'Git', 'Integration continue',
    'Methodologie agile', 'revue de code'
  ]);
});

test('une etiquette de regroupement ne devient pas une competence', () => {
  const competences = extraireCompetences('Langages : Java, Python\nOutils : Git, Jira');
  assert.deepEqual(competences, ['Java', 'Python', 'Git', 'Jira']);
});

test('un deux-points au milieu d une vraie competence ne la coupe pas en deux', () => {
  const competences = extraireCompetences('Gestion de projet : agile');
  assert.deepEqual(competences, ['Gestion de projet', 'agile']);
});

test('les entrees trop courtes, trop longues ou decoratives sont ignorees', () => {
  const trop_longue = 'a'.repeat(61);
  const competences = extraireCompetences(`R, ***, 5, ${trop_longue}, Soudure, ${'b'.repeat(60)}`);
  assert.deepEqual(competences, ['Soudure', 'b'.repeat(60)]);
});

test('les doublons sont supprimes sans tenir compte de la casse ni des accents', () => {
  assert.deepEqual(extraireCompetences('Hygiene, hygiène, HYGIENE, Asepsie'), ['Hygiene', 'Asepsie']);
});

test('extraireCompetences ne plante pas sur une entree vide ou invalide', () => {
  for (const entree of ['', null, undefined, 42, {}]) {
    assert.deepEqual(extraireCompetences(entree), []);
  }
});

// ---------------------------------------------------------------------------
// experience
// ---------------------------------------------------------------------------

test('les postes sont separes avec leur intitule, leur entreprise et leur periode', () => {
  const experiences = decouperExperiences(decouperSections(CV_DEV).experiences);

  assert.equal(experiences.length, 3);
  assert.deepEqual(
    experiences.map((e) => [e.intitule, e.entreprise]),
    [
      ['Developpeuse Full Stack', 'Acme SAS'],
      ['Developpeuse Web (freelance)', ''],
      ['Developpeuse Junior', 'Studio Bleu']
    ]
  );
  assert.deepEqual(experiences[0].periode, { debut: '2022-01', fin: '2024-03', mois: 27 });
  assert.ok(experiences[0].description.includes('Refonte du back-office'));
  assert.ok(!experiences[0].description.includes('Acme SAS'));
});

test('un poste non technique est decoupe aussi bien', () => {
  const experiences = decouperExperiences(decouperSections(CV_INFIRMIERE).experiences);

  assert.equal(experiences.length, 3);
  assert.equal(experiences[0].intitule, 'Infirmiere de bloc operatoire');
  assert.equal(experiences[0].entreprise, 'Clinique du Parc');
  assert.equal(experiences[0].periode.fin, null, 'le poste est toujours occupe');
  assert.equal(experiences[1].periode.debut, '2016-01');
  assert.equal(experiences[1].periode.fin, '2019-08');
  assert.equal(experiences[2].intitule, 'Aide-soignante', 'le tiret d un metier compose ne doit pas servir de separateur');
});

test('un CV compact sans lignes vides est decoupe grace aux dates', () => {
  const texte = [
    'Chef de partie — Bistrot du Port',
    'Mars 2022 - aujourd\'hui',
    'Gestion des entrees et des desserts',
    'Commis de cuisine — Brasserie Centrale',
    '2019 - 2022',
    'Mise en place et service du midi'
  ].join('\n');

  const experiences = decouperExperiences(texte);
  assert.equal(experiences.length, 2);
  assert.equal(experiences[0].intitule, 'Chef de partie');
  assert.equal(experiences[1].intitule, 'Commis de cuisine');
  assert.equal(experiences[1].entreprise, 'Brasserie Centrale');
});

test('anneesExperience ne double pas un cumul de missions', () => {
  const experiences = decouperExperiences([
    'Developpeur freelance — Client A',
    'Janvier 2022 - Decembre 2022',
    '',
    'Developpeur freelance — Client B',
    'Juillet 2022 - Juin 2023'
  ].join('\n'));

  assert.equal(experiences.length, 2);
  // 12 + 12 mois, mais 6 mois en commun : 18 mois = 1,5 an et non 2 ans.
  assert.equal(anneesExperience(experiences), 1.5);
});

test('anneesExperience du CV developpeuse tient compte des recouvrements', () => {
  const experiences = decouperExperiences(decouperSections(CV_DEV).experiences);
  // Somme naive : 27 + 24 + 18 = 69 mois (5,8 ans). Apres fusion : 67 mois.
  assert.equal(anneesExperience(experiences), 5.6);
});

test('decouperExperiences et anneesExperience ne plantent pas sur du vide', () => {
  assert.deepEqual(decouperExperiences(''), []);
  assert.deepEqual(decouperExperiences(null), []);
  assert.equal(anneesExperience([]), 0);
  assert.equal(anneesExperience(null), 0);
  assert.equal(anneesExperience([{ intitule: 'X', periode: null }]), 0);
});

// ---------------------------------------------------------------------------
// construireProfil
// ---------------------------------------------------------------------------

test('le profil complet d une developpeuse', () => {
  const profil = construireProfil(CV_DEV, MAINTENANT);

  assert.equal(profil.contact.email, 'camille.martin@exemple.fr');
  assert.equal(profil.contact.telephone, '0612345678');
  assert.equal(profil.contact.ville, 'Paris');
  assert.ok(profil.resume.startsWith('Developpeuse full stack'));
  assert.equal(profil.experiences.length, 3);
  assert.equal(profil.formations.length, 2);
  assert.equal(profil.formations[0].intitule, 'Master Informatique');
  assert.equal(profil.formations[0].etablissement, 'Universite de Lyon');
  assert.equal(profil.competences.length, 10);
  assert.equal(profil.langues.length, 3);
  assert.equal(profil.anneesExperience, 5.6);
  assert.equal(profil.intitulePrincipal, 'Developpeuse Full Stack');
  assert.equal(profil.confiance.niveau, 'haute');
});

test('le profil complet d une infirmiere est aussi riche que celui d une developpeuse', () => {
  const profil = construireProfil(CV_INFIRMIERE, MAINTENANT);

  assert.equal(profil.contact.email, 'sophie.bernard@exemple.fr');
  assert.equal(profil.contact.telephone, '0698765432');
  assert.equal(profil.contact.codePostal, '69003');
  assert.equal(profil.contact.ville, 'Lyon');
  assert.equal(profil.experiences.length, 3);
  assert.equal(profil.formations.length, 2);
  assert.equal(profil.competences.length, 9, 'aucune competence de soin ne doit disparaitre');
  assert.equal(profil.langues.length, 2);
  assert.equal(profil.intitulePrincipal, 'Infirmiere de bloc operatoire');
  assert.equal(profil.confiance.niveau, 'haute');
  assert.ok(profil.anneesExperience > 8, `anciennete calculee : ${profil.anneesExperience}`);
});

test('un CV mal formate sort en confiance faible, sans planter et sans mentir', () => {
  const profil = construireProfil(CV_MAL_FORMATE, MAINTENANT);

  assert.equal(profil.confiance.niveau, 'faible');
  assert.ok(profil.confiance.raisons.length > 0);
  // Ce qui est mecaniquement identifiable l'est quand meme.
  assert.equal(profil.contact.email, 'jean.d@exemple.fr');
  assert.equal(profil.contact.telephone, '0612345678');
  // Et on n'invente rien : pas de section competences, donc pas de competences.
  assert.deepEqual(profil.competences, []);
  assert.ok(Array.isArray(profil.experiences));
});

test('construireProfil ne plante jamais, quelle que soit l entree', () => {
  for (const entree of ['', null, undefined, 42, {}, '\n\n\n', 'x'.repeat(5000)]) {
    const profil = construireProfil(entree);
    assert.equal(typeof profil.anneesExperience, 'number');
    assert.ok(Array.isArray(profil.competences));
    assert.ok(['haute', 'moyenne', 'faible'].includes(profil.confiance.niveau));
  }
});
