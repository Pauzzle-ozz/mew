const test = require('node:test');
const assert = require('node:assert');

const { parseCvOptimise } = require('../src/llm/parseurs/cvOptimise');

/**
 * Ces tests remplacent un appel a un modele de langage.
 *
 * L'optimiseur de CV faisait deux appels : le premier ecrivait le CV, le
 * second le retapait en JSON. Le parseur teste ici fait le second travail
 * gratuitement — a condition d'etre PLUS tolerant que le modele qu'il
 * remplace. D'ou la liste de cas tordus ci-dessous : accents, gras
 * markdown, titres synonymes, sections absentes, en-tete manquant.
 *
 * Si un jour la sortie du modele change de forme, c'est ici que ca doit
 * devenir rouge, pas chez l'utilisateur.
 */

const CV_TYPIQUE = `SCORE ATS: 78
POINTS FORTS:
• Parcours coherent dans le developpement web
• Competences techniques a jour
• Resultats chiffres presents

AMÉLIORATIONS:
• Ajouter des mots-cles du poste vise
• Raccourcir le resume professionnel

Camille Rousseau
Developpeuse Web Full Stack
camille.rousseau@exemple.fr | 06 12 34 56 78 | 75011 Paris
linkedin.com/in/camille-rousseau

PROFIL
Developpeuse full stack avec 6 ans d'experience sur des applications React et
Node. Specialisee en performance web et en accessibilite.

EXPÉRIENCE PROFESSIONNELLE

Developpeuse Front-End Senior — Studio Lumen
Janvier 2021 - Aujourd'hui
• Refonte du site vitrine, temps de chargement reduit de 45%
• Encadrement de 2 developpeurs juniors

Developpeuse Web — Agence Cobalt
Mars 2018 - Decembre 2020
• Developpement de 12 sites clients sous React
• Mise en place des tests automatises

FORMATION

Master Informatique — Universite de Lille
2018

COMPÉTENCES TECHNIQUES
React, Node.js, TypeScript, PostgreSQL, Docker, Git

QUALIFICATIONS CLÉS
• Sait vulgariser un sujet technique aupres d'interlocuteurs non techniques
• Autonome sur la conduite d'un projet du cadrage a la mise en production

LANGUES
Francais (natif), Anglais (C1)`;

// ---------------------------------------------------------------------------
// Cas nominal
// ---------------------------------------------------------------------------

test('un CV au format attendu est entierement lu', () => {
  const cv = parseCvOptimise(CV_TYPIQUE);

  assert.equal(cv.score_ats, 78);
  assert.equal(cv.points_forts.length, 3);
  assert.equal(cv.ameliorations.length, 2);
  assert.match(cv.points_forts[0], /Parcours coherent/);

  assert.equal(cv.prenom, 'Camille');
  assert.equal(cv.nom, 'Rousseau');
  assert.equal(cv.email, 'camille.rousseau@exemple.fr');
  assert.equal(cv.telephone, '0612345678');
  assert.match(cv.adresse, /Paris/);
  assert.match(cv.linkedin, /camille-rousseau/);

  assert.match(cv.resume, /full stack avec 6 ans/);
  assert.equal(cv.titre_poste, 'Developpeuse Web Full Stack');

  assert.equal(cv.experiences.length, 2);
  assert.equal(cv.experiences[0].poste, 'Developpeuse Front-End Senior');
  assert.equal(cv.experiences[0].entreprise, 'Studio Lumen');
  assert.equal(cv.experiences[0].date_debut, '01/2021');
  assert.equal(cv.experiences[0].date_fin, "Aujourd'hui");
  assert.match(cv.experiences[0].description, /45%/);

  assert.equal(cv.formations.length, 1);
  assert.match(cv.formations[0].diplome, /Master Informatique/);
  assert.equal(cv.formations[0].etablissement, 'Universite de Lille');
  // Le CV ecrit « 2018 » : on n'affiche pas « 01/2018 », ce mois n'existe
  // que parce qu'il a fallu en choisir un pour calculer une duree.
  assert.equal(cv.formations[0].date_fin, '2018');

  assert.match(cv.competences_techniques, /React/);
  assert.match(cv.competences_techniques, /PostgreSQL/);
  assert.equal(cv.langues, 'Francais (natif), Anglais (C1)');
});

test('les qualifications restent des phrases entieres', () => {
  const cv = parseCvOptimise(CV_TYPIQUE);
  const lignes = cv.competences_soft.split('\n');

  assert.equal(lignes.length, 2);
  assert.match(lignes[0], /vulgariser un sujet technique/);
  // Le piege : les couper aux virgules comme des competences techniques
  // transformerait chaque phrase en bouillie de mots.
  assert.ok(!cv.competences_soft.includes(', Autonome'));
});

test('les competences techniques ne se melangent pas aux qualifications', () => {
  const cv = parseCvOptimise(CV_TYPIQUE);
  assert.ok(!cv.competences_techniques.includes('vulgariser'));
  assert.ok(!cv.competences_soft.includes('PostgreSQL'));
});

// ---------------------------------------------------------------------------
// Ecarts de forme : c'est la raison d'etre du parseur
// ---------------------------------------------------------------------------

test('le gras et les titres markdown sont ignores', () => {
  const cv = parseCvOptimise(`**SCORE ATS : 64**

**POINTS FORTS**
- **Experience solide** en logistique

## AMÉLIORATIONS
- Ajouter des chiffres

**Karim Benali**
Chef d'equipe logistique

### PROFIL
Chef d'equipe logistique depuis huit ans.

## COMPÉTENCES
Gestion de stock, CACES 3, Planification`);

  assert.equal(cv.score_ats, 64);
  assert.equal(cv.points_forts.length, 1);
  assert.match(cv.points_forts[0], /Experience solide/);
  assert.ok(!cv.points_forts[0].includes('**'), 'le gras ne doit pas rester dans le texte');
  assert.equal(cv.prenom, 'Karim');
  assert.equal(cv.nom, 'Benali');
  assert.match(cv.resume, /huit ans/);
  assert.match(cv.competences_techniques, /CACES 3/);
});

test('la casse et les accents des marqueurs n\'ont pas d\'importance', () => {
  const cv = parseCvOptimise(`Score ATS : 91
Points forts :
• Tres bonne lisibilite
Ameliorations :
• Preciser les dates

Sophie Marin
Infirmiere`);

  assert.equal(cv.score_ats, 91);
  assert.deepEqual(cv.points_forts, ['Tres bonne lisibilite']);
  assert.deepEqual(cv.ameliorations, ['Preciser les dates']);
  assert.equal(cv.prenom, 'Sophie');
});

test('les accents du contenu sont preserves, pas seulement ceux des titres', () => {
  const cv = parseCvOptimise(`SCORE ATS: 70
AMÉLIORATIONS: Préciser les résultats obtenus

Léa Dupré
Chargée de clientèle`);

  assert.deepEqual(cv.ameliorations, ['Préciser les résultats obtenus']);
  assert.equal(cv.prenom, 'Léa');
});

test('les titres de sections synonymes sont reconnus', () => {
  const cv = parseCvOptimise(`Jean Petit
Cuisinier

A propos
Cuisinier de collectivite, 12 ans de metier.

Parcours professionnel

Chef de partie — Restaurant Le Tilleul
2019 - 2024
• Gestion des commandes et des stocks

Cursus

CAP Cuisine — CFA de Rennes
2012

Savoir-faire
Cuisine traditionnelle, HACCP, Gestion des stocks

Langues parlees
Francais, Espagnol (notions)`);

  assert.match(cv.resume, /collectivite/);
  assert.equal(cv.experiences.length, 1);
  assert.equal(cv.experiences[0].poste, 'Chef de partie');
  assert.equal(cv.experiences[0].entreprise, 'Restaurant Le Tilleul');
  assert.equal(cv.formations.length, 1);
  assert.match(cv.formations[0].diplome, /CAP Cuisine/);
  assert.match(cv.competences_techniques, /HACCP/);
  assert.match(cv.langues, /Espagnol/);
});

test('un contenu ecrit sur la meme ligne que le titre n\'est pas perdu', () => {
  const cv = parseCvOptimise(`Nadia Cherif
Assistante de direction

LANGUES : Francais (natif), Anglais (B2), Arabe (courant)
COMPÉTENCES TECHNIQUES : Excel, SAP, Outlook`);

  assert.match(cv.langues, /Arabe \(courant\)/);
  assert.match(cv.competences_techniques, /SAP/);
});

test('un nom ecrit « DUPONT Jean » est remis a l\'endroit', () => {
  const cv = parseCvOptimise(`MOREAU Antoine
Technicien de maintenance`);

  assert.equal(cv.prenom, 'Antoine');
  assert.equal(cv.nom, 'MOREAU');
});

test('les sections absentes donnent des valeurs vides, jamais une erreur', () => {
  const cv = parseCvOptimise(`SCORE ATS: 55

Paul Girard
Magasinier`);

  assert.equal(cv.resume, '');
  assert.deepEqual(cv.experiences, []);
  assert.deepEqual(cv.formations, []);
  assert.equal(cv.competences_techniques, '');
  assert.equal(cv.competences_soft, '');
  assert.equal(cv.langues, '');
  assert.equal(cv.titre_poste, 'Magasinier');
});

test('un CV sans aucun bloc d\'evaluation reste entierement lisible', () => {
  const cv = parseCvOptimise(`Alice Fontaine
Comptable

PROFIL
Comptable generaliste, 10 ans en cabinet.

EXPÉRIENCE
Comptable — Cabinet Vidal
2015 - 2025
• Tenue de 40 dossiers clients`);

  assert.equal(cv.score_ats, null, 'aucun score annonce : on ne l\'invente pas');
  assert.deepEqual(cv.points_forts, []);
  assert.equal(cv.prenom, 'Alice');
  assert.match(cv.resume, /cabinet/);
  assert.equal(cv.experiences.length, 1);
});

test('une reponse enveloppee dans un bloc de code est deballee', () => {
  const cv = parseCvOptimise('```\nSCORE ATS: 80\n\nHugo Lemoine\nElectricien\n```');

  assert.equal(cv.score_ats, 80);
  assert.equal(cv.prenom, 'Hugo');
});

test('« POINTS FORTS » plus bas dans le CV reste une section, pas l\'evaluation', () => {
  // Piege reel : « POINTS FORTS » est aussi un titre de section de CV.
  // Il ne doit etre lu comme evaluation qu'en tete de reponse.
  const cv = parseCvOptimise(`Marie Leroy
Vendeuse

PROFIL
Vendeuse en pret-a-porter.

POINTS FORTS
Sens du contact, Rigueur, Ponctualite`);

  assert.deepEqual(cv.points_forts, [], 'l\'evaluation du modele est absente ici');
  assert.match(cv.competences_soft, /Sens du contact/);
});

test('un marqueur suivi de rien n\'avale pas le debut du CV', () => {
  // Cas degrade : le modele annonce « POINTS FORTS: » puis n'ecrit aucune
  // puce. Le nom du candidat ne doit surtout pas devenir un point fort.
  const cv = parseCvOptimise(`SCORE ATS: 60
POINTS FORTS:

Lucie Barre
Aide-soignante

PROFIL
Aide-soignante en EHPAD.`);

  assert.deepEqual(cv.points_forts, []);
  assert.equal(cv.prenom, 'Lucie');
  assert.equal(cv.nom, 'Barre');
  assert.equal(cv.titre_poste, 'Aide-soignante');
});

test('une liste ecrite sans puces juste sous le marqueur est quand meme lue', () => {
  const cv = parseCvOptimise(`SCORE ATS: 72
AMELIORATIONS:
Ajouter un resume professionnel

Yanis Roche
Chauffeur livreur`);

  assert.deepEqual(cv.ameliorations, ['Ajouter un resume professionnel']);
  assert.equal(cv.prenom, 'Yanis');
});

// ---------------------------------------------------------------------------
// Robustesse : le parseur ne doit jamais faire tomber une requete
// ---------------------------------------------------------------------------

test('une entree absurde renvoie une structure vide, sans exception', () => {
  for (const entree of [null, undefined, '', '   ', 42, {}, [], '\n\n\n']) {
    const cv = parseCvOptimise(entree);
    assert.equal(typeof cv, 'object');
    assert.equal(cv.prenom, '');
    assert.deepEqual(cv.experiences, []);
    assert.deepEqual(cv.points_forts, []);
  }
});

test('toutes les cles attendues par le frontend sont toujours presentes', () => {
  // Le frontend lit cvData_optimise.langues sans se proteger : une cle
  // manquante afficherait « undefined » a l'utilisateur.
  const attendues = [
    'score_ats', 'points_forts', 'ameliorations', 'prenom', 'nom', 'titre_poste',
    'email', 'telephone', 'adresse', 'linkedin', 'resume', 'experiences',
    'formations', 'competences_techniques', 'competences_soft', 'langues', 'interets'
  ];

  for (const entree of [CV_TYPIQUE, '', 'texte sans aucune structure']) {
    const cv = parseCvOptimise(entree);
    for (const cle of attendues) {
      assert.ok(Object.prototype.hasOwnProperty.call(cv, cle), `cle manquante : ${cle}`);
    }
  }
});

test('un score aberrant est ignore plutot que recopie', () => {
  assert.equal(parseCvOptimise('SCORE ATS: 250\n\nZoe Blanc\nPeintre').score_ats, null);
});
