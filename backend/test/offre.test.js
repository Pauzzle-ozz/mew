const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { extraireBlocsJsonLd, trouverJobPosting } = require('../src/core/offre/extraireJsonLd');
const { extraireOffre } = require('../src/core/offre/extraireOffre');
const { extraireExigences } = require('../src/core/offre/extraireExigences');

/**
 * Ces tests remplacent deux appels a GPT-4o par du parsing.
 *
 * Avant, le HTML d'une offre etait transforme en texte brut et envoye
 * entier a un modele de langage pour qu'il en extraie le titre, l'entreprise
 * et le lieu. La quasi-totalite des sites d'emploi publient pourtant deja ces
 * champs en JSON dans leur page, au format schema.org/JobPosting, parce
 * qu'ils en ont besoin pour Google for Jobs.
 */

const fixture = (nom) => fs.readFileSync(
  path.join(__dirname, 'fixtures', 'offres', nom),
  'utf8'
);

// ---------------------------------------------------------------------------
// Niveau 1 : JSON-LD
// ---------------------------------------------------------------------------

test('trouve le bloc JobPosting dans une page standard', () => {
  const offre = trouverJobPosting(fixture('jsonld-complet.html'));
  assert.ok(offre, 'aucun JobPosting trouve');
  assert.equal(offre['@type'], 'JobPosting');
});

test('trouve le JobPosting meme enferme dans un @graph', () => {
  const offre = trouverJobPosting(fixture('jsonld-graph.html'));
  assert.ok(offre, 'le @graph n a pas ete parcouru');
});

test('un bloc JSON invalide ne fait pas tomber toute la page', () => {
  // Le site est mal fichu, ce n'est pas une raison pour planter :
  // on ignore le bloc casse et on continue avec les niveaux suivants.
  assert.doesNotThrow(() => extraireBlocsJsonLd(fixture('jsonld-invalide.html')));
  assert.equal(trouverJobPosting(fixture('jsonld-invalide.html')), null);
});

// ---------------------------------------------------------------------------
// La cascade complete
// ---------------------------------------------------------------------------

test('JSON-LD : extraction complete et confiance haute', () => {
  const offre = extraireOffre(fixture('jsonld-complet.html'), 'https://exemple.fr/offre');

  assert.equal(offre.source, 'jsonld');
  assert.equal(offre.confiance, 'haute');
  assert.match(offre.titre, /Node\.js/);
  // Le nom de l'entreprise etait declare « trop difficile a extraire par
  // regex » dans l'ancien code, qui renvoyait donc toujours null.
  assert.equal(offre.entreprise, 'Acme Industries');
  assert.ok(offre.description.length > 50, 'description vide ou tronquee');
  assert.ok(offre.champsTrouves.includes('titre'));
  assert.ok(offre.champsTrouves.includes('entreprise'));
});

test('pas de JSON-LD exploitable : on retombe sur les balises meta', () => {
  const offre = extraireOffre(fixture('og-seulement.html'), 'https://exemple.fr/offre');

  assert.equal(offre.source, 'meta');
  assert.equal(offre.confiance, 'moyenne');
  assert.ok(offre.titre.length > 0, 'titre non recupere depuis og:title');
  assert.ok(offre.entreprise.length > 0, 'entreprise non recuperee');
});

test('page sans aucune donnee structuree : heuristique, confiance faible', () => {
  const offre = extraireOffre(fixture('page-brute.html'), 'https://exemple.fr/offre');

  assert.equal(offre.source, 'heuristique');
  assert.equal(offre.confiance, 'faible');
  // Une confiance faible sert a declencher un filet (relecture humaine ou
  // appel au modele) : elle doit rester honnete, pas optimiste.
  assert.ok(offre.titre.length > 0, 'le h1 aurait du etre lu');
});

test('aucun champ ne vaut jamais null ni undefined', () => {
  for (const nom of ['jsonld-complet.html', 'og-seulement.html', 'page-brute.html']) {
    const offre = extraireOffre(fixture(nom), 'https://exemple.fr');
    for (const champ of ['titre', 'entreprise', 'lieu', 'contrat', 'salaire', 'description']) {
      assert.equal(typeof offre[champ], 'string', `${nom} : ${champ} n est pas une chaine`);
    }
  }
});

test('ne plante sur aucune entree absurde', () => {
  for (const entree of ['', null, undefined, '<html></html>', '<<<>>>', 42]) {
    assert.doesNotThrow(() => extraireOffre(entree, 'https://exemple.fr'), `entree : ${entree}`);
  }
});

test('deux appels sur la meme page donnent exactement le meme resultat', () => {
  const html = fixture('jsonld-complet.html');
  assert.deepEqual(
    extraireOffre(html, 'https://exemple.fr'),
    extraireOffre(html, 'https://exemple.fr')
  );
});

// ---------------------------------------------------------------------------
// Les exigences, y compris hors informatique
// ---------------------------------------------------------------------------

test('extrait les exigences d une offre technique', () => {
  const offre = extraireOffre(fixture('jsonld-complet.html'), 'https://exemple.fr');
  const exigences = extraireExigences(offre.description);

  assert.ok(Array.isArray(exigences.competences));
  assert.ok(exigences.competences.length > 0, 'aucune competence extraite');
});

test('UNE OFFRE NON-TECH RESSORT AVEC DE VRAIES COMPETENCES', () => {
  // Le test qui prouve que Mew n est pas un outil reserve aux developpeurs.
  // Un dictionnaire de technos aurait renvoye une liste vide, en silence.
  const offre = extraireOffre(fixture('aide-soignant.html'), 'https://exemple.fr');
  const exigences = extraireExigences(offre.description);

  assert.ok(exigences.competences.length >= 5,
    `seulement ${exigences.competences.length} competences pour une offre de soin`);

  const tout = exigences.competences.join(' ');
  assert.ok(/toilette|soin|hygiene|resident|patient/.test(tout),
    `vocabulaire du soin absent : ${tout.slice(0, 120)}`);
});

test('lit les annees d experience et le niveau de diplome', () => {
  const exigences = extraireExigences(
    "Nous recherchons un profil avec 3 ans d'experience minimum, titulaire d'un Bac+5 "
    + "en informatique. Anglais courant exige. Poste en CDI, teletravail partiel possible."
  );

  assert.equal(exigences.anneesExperience, 3);
  assert.ok(exigences.niveauDiplome, 'niveau de diplome non detecte');
  assert.ok(exigences.langues.includes('anglais'));
});

test('une description vide ne produit pas d exigences inventees', () => {
  for (const entree of ['', null, undefined]) {
    const exigences = extraireExigences(entree);
    assert.deepEqual(exigences.competences, []);
    assert.equal(exigences.anneesExperience, null);
  }
});
