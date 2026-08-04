const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { proposerMetiers, chercherMetier, categoriePourScore } = require('../src/core/score/metiers');
const { construireProfil } = require('../src/core/cv/profil');

/**
 * Ces tests remplacent l'invention de metiers par un modele de langage.
 *
 * Avant : on envoyait le CV a GPT en lui demandant de proposer des metiers ET
 * de leur donner des notes. Les notes changeaient a chaque appel, le modele
 * pouvait citer comme atout une competence absente du CV, et on lui demandait
 * meme d'evaluer « le marche de l'emploi » et « le potentiel salarial », deux
 * chiffres qu'il ne peut pas connaitre.
 *
 * Maintenant : tout vient du referentiel ROME de France Travail.
 */

const cv = (nom) => fs.readFileSync(
  path.join(__dirname, 'fixtures', 'cv', nom),
  'utf8'
);

const PLOMBIER = {
  titre_poste: 'Plombier chauffagiste',
  competences: ['soudure au chalumeau', 'PER multicouche', 'pose de sanitaires', 'depannage de chaudiere']
};

const COMPTABLE = {
  titre_poste: 'Comptable',
  competences: ['saisie comptable', 'declaration de TVA', 'bilan', 'logiciel Sage']
};

// ---------------------------------------------------------------------------
// La propriete qui justifie tout le projet
// ---------------------------------------------------------------------------

test('LE MEME PROFIL DONNE EXACTEMENT LE MEME RESULTAT', () => {
  // C'est precisement ce qu'un modele de langage ne garantit pas : sans
  // temperature fixee, le meme CV donnait 78, puis 85, puis 81.
  const a = proposerMetiers(PLOMBIER);
  const b = proposerMetiers(PLOMBIER);
  assert.deepEqual(a, b);
});

test('les scores sont classes par ordre decroissant', () => {
  // Une liste dont les nombres remontent passe pour un bug aux yeux
  // de l'utilisateur, meme si le classement interne est defendable.
  const { metiers_proposes: metiers } = proposerMetiers(COMPTABLE, { limite: 5 });
  for (let i = 1; i < metiers.length; i++) {
    assert.ok(
      metiers[i].scores.global <= metiers[i - 1].scores.global,
      `rang ${i} (${metiers[i].scores.global}) au-dessus du rang ${i - 1} (${metiers[i - 1].scores.global})`
    );
    assert.equal(metiers[i].priorite, i + 1);
  }
});

// ---------------------------------------------------------------------------
// Pertinence, tous secteurs
// ---------------------------------------------------------------------------

test('un CV d infirmiere propose des metiers du soin', () => {
  const { metiers_proposes: metiers } = proposerMetiers(construireProfil(cv('infirmiere.txt')), { limite: 3 });
  const codes = metiers.map((m) => m.code_rome);

  // La famille J du ROME regroupe la sante.
  assert.ok(codes.every((c) => c.startsWith('J')), `metiers hors sante : ${codes.join(', ')}`);
  assert.ok(metiers[0].scores.adequation_profil >= 60, 'adequation trop faible pour un profil pourtant clair');
});

test('un CV de developpeuse propose des metiers du numerique', () => {
  const { metiers_proposes: metiers } = proposerMetiers(construireProfil(cv('developpeuse.txt')), { limite: 3 });
  const intitules = metiers.map((m) => m.intitule.toLowerCase()).join(' ');
  assert.match(intitules, /developpeu|web|informatique|numerique/);
});

test('UN PLOMBIER OBTIENT DES METIERS DU BATIMENT', () => {
  // Le test qui prouve que Mew ne s adresse pas qu aux developpeurs.
  // Un dictionnaire de technos ecrit a la main aurait renvoye une liste vide.
  const { metiers_proposes: metiers } = proposerMetiers(PLOMBIER, { limite: 3 });
  const intitules = metiers.map((m) => m.intitule.toLowerCase()).join(' ');
  assert.match(intitules, /plombi|chauffagiste|batiment|sanitaire/);
});

test('un comptable obtient des metiers de la comptabilite', () => {
  const { metiers_proposes: metiers } = proposerMetiers(COMPTABLE, { limite: 3 });
  assert.match(metiers[0].intitule.toLowerCase(), /comptab/);
});

// ---------------------------------------------------------------------------
// Honnetete des notes
// ---------------------------------------------------------------------------

test('la note « marche emploi » vaut null tant qu aucune source ne la fournit', () => {
  // Repondre « je ne sais pas » est infiniment plus utile qu inventer un
  // chiffre plausible. C est tout le probleme qu on corrige ici.
  const { metiers_proposes: metiers } = proposerMetiers(COMPTABLE, { limite: 2 });
  for (const metier of metiers) {
    assert.equal(metier.scores.marche_emploi, null);
    assert.match(metier.justifications.marche_emploi, /non disponible/i);
  }
});

test('la note « marche emploi » est calculee quand une source est branchee', () => {
  const { metiers_proposes: metiers } = proposerMetiers(COMPTABLE, {
    limite: 2,
    volumeOffres: () => 1000
  });
  // Echelle logarithmique : 1 000 offres donnent 72.
  assert.equal(metiers[0].scores.marche_emploi, 72);
  assert.match(metiers[0].justifications.marche_emploi, /France Travail/);
});

test('les competences citees comme demontrees sont vraiment dans le profil', () => {
  // Le modele pouvait lister comme point fort une competence absente du CV,
  // sans que rien ne le detecte. Ici c est exact par construction.
  const { metiers_proposes: metiers } = proposerMetiers(PLOMBIER, { limite: 1 });
  const { competencesDemontrees, competencesManquantes, totalCompetencesCles } = metiers[0].detail;

  assert.equal(competencesDemontrees.length + competencesManquantes.length, totalCompetencesCles);
  for (const competence of competencesDemontrees) {
    assert.ok(!competencesManquantes.includes(competence), 'competence a la fois acquise et manquante');
  }
});

test('la categorie decoule d un seuil, pas du choix d un modele', () => {
  assert.equal(categoriePourScore(90), 'ideal');
  assert.equal(categoriePourScore(65), 'ideal');
  assert.equal(categoriePourScore(64), 'accessible');
  assert.equal(categoriePourScore(40), 'accessible');
  assert.equal(categoriePourScore(39), 'reconversion');
  assert.equal(categoriePourScore(0), 'reconversion');
});

// ---------------------------------------------------------------------------
// Contrat de sortie et robustesse
// ---------------------------------------------------------------------------

test('le contrat attendu par l interface est respecte', () => {
  // L historique rejoue des resultats archives tels quels : changer la forme
  // de cet objet casserait l affichage des analyses passees.
  const resultat = proposerMetiers(COMPTABLE, { limite: 2 });

  assert.ok(Array.isArray(resultat.metiers_proposes));
  assert.ok(Array.isArray(resultat.competences_cles));
  assert.ok(Array.isArray(resultat.mots_cles_recherche));
  assert.equal(resultat.source.referentiel, 'ROME 4.0 - France Travail');

  for (const metier of resultat.metiers_proposes) {
    for (const champ of ['intitule', 'code_rome', 'categorie', 'priorite', 'scores', 'justifications', 'conseils', 'mots_cles']) {
      assert.ok(metier[champ] !== undefined, `champ manquant : ${champ}`);
    }
    for (const note of ['adequation_profil', 'potentiel_evolution', 'global']) {
      assert.ok(Number.isInteger(metier.scores[note]), `${note} n est pas un entier`);
      assert.ok(metier.scores[note] >= 0 && metier.scores[note] <= 100, `${note} hors bornes`);
    }
  }
});

test('un profil vide ou absurde ne fait jamais planter', () => {
  for (const profil of [{}, null, undefined, { competences: [] }, { titre_poste: '' }]) {
    assert.doesNotThrow(() => proposerMetiers(profil), `profil : ${JSON.stringify(profil)}`);
  }
});

test('recherche un metier par appellation, accents indifferents', () => {
  assert.ok(chercherMetier('plombier').length > 0);
  assert.ok(chercherMetier('infirmiere').length > 0, 'la recherche sans accent doit fonctionner');
  assert.deepEqual(chercherMetier(''), []);
  assert.deepEqual(chercherMetier(null), []);
});
