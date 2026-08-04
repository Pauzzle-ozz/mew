const test = require('node:test');
const assert = require('node:assert');

const { scoreMatching, detecterNiveau } = require('../src/core/score/matching');
const { extraireExigences } = require('../src/core/offre/extraireExigences');

/**
 * Ces tests protegent le chiffre le plus visible de l'application : le cercle
 * de correspondance affiche apres une analyse d'offre.
 *
 * Avant, ce chiffre etait produit par le modele de langage, avec un prompt qui
 * lui demandait d'atteindre « au minimum 80/100 ». Autant dire qu'il ne
 * mesurait rien. Ici il est calcule, donc il doit rester stable, explicable,
 * et surtout juste pour TOUS les metiers : le dernier test de ce fichier
 * compare un aide-soignant a une offre d'aide-soignant, et il doit scorer
 * aussi bien qu'un developpeur face a une offre de developpeur.
 */

// --- Jeux de donnees partages ---------------------------------------------

const cvDeveloppeur = {
  titre_poste: 'Developpeur Front-End React',
  competences_techniques: 'React, JavaScript, TypeScript, Redux, HTML, CSS, Git, Jest',
  experiences: [
    {
      titre: 'Developpeur React',
      entreprise: 'Acme',
      dates: '2021 - 2026',
      description: 'Developpement d\'applications React avec Redux, tests Jest, integration continue GitLab, conteneurs Docker'
    }
  ],
  formations: [{ diplome: 'Master informatique', etablissement: 'Universite de Lille' }],
  anneesExperience: 5
};

const offreReact = {
  intitule: 'Developpeur Front-End React (H/F)',
  competences: ['React', 'JavaScript', 'TypeScript', 'Redux', 'Jest', 'Git', 'Docker', 'CSS', 'Kubernetes'],
  anneesExperience: 3,
  niveauDiplome: 'Bac+5'
};

const cvComptable = {
  titre_poste: 'Comptable general',
  competences_techniques: 'Sage 100, Excel, TVA, rapprochements bancaires, bilan, liasse fiscale, immobilisations',
  experiences: [
    {
      titre: 'Comptable general',
      entreprise: 'Cabinet Durand',
      description: 'Tenue de la comptabilite generale, declarations de TVA, revision des comptes, preparation du bilan annuel'
    }
  ],
  formations: [{ diplome: 'BTS Comptabilite et Gestion', etablissement: 'Lycee Pasteur' }],
  anneesExperience: 8
};

const offreDeveloppeurJava = {
  intitule: 'Developpeur Back-End Java (H/F)',
  competences: ['Java', 'Spring Boot', 'SQL', 'Docker', 'Kubernetes', 'Git', 'API REST'],
  anneesExperience: 3,
  niveauDiplome: 'Bac+5'
};

// --- Cas nominal -----------------------------------------------------------

test('un CV React face a une offre React obtient un score eleve', () => {
  const resultat = scoreMatching(cvDeveloppeur, offreReact, {});

  assert.ok(resultat.score >= 75, `score attendu >= 75, obtenu ${resultat.score}`);
  assert.ok(resultat.score <= 100);
  assert.ok(
    resultat.competencesManquantes.includes('Kubernetes'),
    'Kubernetes n\'est pas dans le CV : il doit apparaitre dans les manquantes'
  );
  assert.ok(resultat.competencesCommunes.includes('React'));
  assert.equal(resultat.competencesCommunes.length + resultat.competencesManquantes.length, 9);
});

test('les actions nomment precisement ce qui manque', () => {
  const { actions } = scoreMatching(cvDeveloppeur, offreReact, {});

  assert.ok(actions.length > 0, 'un score sans conseil n\'aide personne');
  const action = actions.find((a) => a.critere === 'competences');
  assert.ok(action, 'il manque une competence : une action doit le dire');
  assert.match(action.message, /Kubernetes/);
  assert.ok(typeof action.gain === 'number' && action.gain >= 0);
  assert.ok(['haute', 'moyenne', 'basse'].includes(action.priorite));
});

// --- Cas oppose ------------------------------------------------------------

test('un CV de comptable face a une offre de developpeur obtient un score bas', () => {
  const resultat = scoreMatching(cvComptable, offreDeveloppeurJava, {});

  assert.ok(resultat.score < 35, `score attendu < 35, obtenu ${resultat.score}`);
  assert.equal(resultat.competencesCommunes.length, 0, 'aucune competence Java dans un CV de comptable');

  // Le score n'est pas zero, et c'est normal : l'anciennete demandee est bien
  // la. Le detail des criteres doit permettre de le comprendre.
  const experience = resultat.criteres.find((c) => c.id === 'experience');
  assert.equal(experience.applicable, true);
  assert.equal(experience.obtenu, experience.poids, '8 ans pour 3 demandes : critere plein');
});

// --- Determinisme ----------------------------------------------------------

test('le meme couple donne exactement le meme resultat', () => {
  const premier = scoreMatching(cvDeveloppeur, offreReact, {});
  const second = scoreMatching(cvDeveloppeur, offreReact, {});

  assert.deepStrictEqual(premier, second);
  assert.equal(premier.score, second.score);
});

// --- Neutralisation et redistribution --------------------------------------

test('une offre laconique redistribue les poids au lieu d\'ecraser le score', () => {
  const offreLaconique = {
    intitule: 'Chef de projet digital',
    competences: ['gestion de projet', 'planning', 'budget', 'coordination']
    // ni annees d'experience, ni diplome : ces deux criteres sont indecidables
  };
  const cvChefDeProjet = {
    titre_poste: 'Chef de projet digital',
    competences_techniques: 'Gestion de projet, planning, budget, coordination d\'equipe, Jira',
    experiences: [{ titre: 'Chef de projet', description: 'Pilotage du planning et du budget, coordination des prestataires' }],
    anneesExperience: 4
  };

  const resultat = scoreMatching(cvChefDeProjet, offreLaconique, {});
  const parId = Object.fromEntries(resultat.criteres.map((c) => [c.id, c]));

  assert.equal(parId.experience.applicable, false, 'l\'offre ne demande aucune anciennete');
  assert.equal(parId.diplome.applicable, false, 'l\'offre ne demande aucun diplome');
  assert.equal(parId.experience.poids, 0, 'un critere neutralise ne pese plus rien');
  assert.equal(parId.diplome.poids, 0);

  // 50 et 20 redevienent 71.4 et 28.6 : la somme des poids fait toujours 100.
  const sommePoids = resultat.criteres.reduce((total, c) => total + c.poids, 0);
  assert.ok(Math.abs(sommePoids - 100) < 0.5, `somme des poids = ${sommePoids}`);
  assert.ok(parId.competences.poids > 65 && parId.competences.poids < 75);

  // Sans redistribution, ce candidat plafonnerait a 70/100 quoi qu'il fasse.
  assert.ok(resultat.score >= 80, `score attendu >= 80, obtenu ${resultat.score}`);
});

test('une offre sans rien de mesurable ne pretend pas savoir', () => {
  const resultat = scoreMatching(cvDeveloppeur, {}, {});

  assert.equal(resultat.score, 0);
  assert.ok(resultat.criteres.every((c) => c.applicable === false));
  assert.ok(
    resultat.actions.some((a) => /pas exploitable/i.test(a.message)),
    'il faut prevenir l\'utilisateur que le chiffre ne veut rien dire'
  );
});

// --- Le profil non-tech ----------------------------------------------------

test('un aide-soignant face a une offre d\'aide-soignant score aussi bien qu\'un developpeur', () => {
  const cvAideSoignante = {
    titre_poste: 'Aide-soignante',
    competences_techniques: 'Aide a la toilette, prise de constantes, transmissions ciblees, hygiene hospitaliere',
    experiences: [
      {
        titre: 'Aide-soignante',
        entreprise: 'EHPAD Les Tilleuls',
        dates: '2020 - 2026',
        description: 'Accompagnement des residents dans les actes de la vie quotidienne, aide a la toilette et a l\'habillage, '
          + 'manutention et transferts, distribution des repas, surveillance de l\'etat general, transmissions ecrites et orales'
      }
    ],
    formations: [{ diplome: 'Diplome d\'Etat d\'Aide-Soignant (DEAS)', etablissement: 'IFAS de Roubaix' }],
    anneesExperience: 6
  };

  const offreAideSoignant = {
    intitule: 'Aide-soignant H/F',
    competences: [
      'aide a la toilette', 'distribution des repas', 'transmissions', 'manutention',
      'accompagnement des residents', 'hygiene', 'travail en equipe'
    ],
    anneesExperience: 2,
    niveauDiplome: 'Diplome d\'Etat d\'aide-soignant'
  };

  const resultat = scoreMatching(cvAideSoignante, offreAideSoignant, {});
  const reference = scoreMatching(cvDeveloppeur, offreReact, {});

  assert.ok(resultat.score >= 80, `score attendu >= 80, obtenu ${resultat.score}`);
  assert.ok(
    resultat.score >= reference.score - 15,
    `l'aide-soignante (${resultat.score}) ne doit pas etre desavantagee face au developpeur (${reference.score})`
  );
  assert.ok(resultat.competencesCommunes.includes('aide a la toilette'));
  assert.ok(resultat.competencesCommunes.includes('manutention'));
});

// --- Details des signaux ---------------------------------------------------

test('une faute de frappe dans le CV ne fait pas perdre la competence', () => {
  const cvAvecFaute = {
    titre_poste: 'Developpeur',
    competences_techniques: 'kubernets, docker, terrafrom'
  };
  const offre = { intitule: 'Developpeur', competences: ['Kubernetes', 'Docker', 'Terraform'] };

  const resultat = scoreMatching(cvAvecFaute, offre, {});
  assert.deepStrictEqual(resultat.competencesManquantes, [], 'kubernets doit rattraper kubernetes');
});

test('les mots trop courts ne sont pas rapproches a l\'aveugle', () => {
  // Sans garde-fou, une comparaison approximative rapproche php et pdf,
  // ou sql et ssl : le candidat croirait avoir une competence qu'il n'a pas.
  const cv = { titre_poste: 'Assistant', competences_techniques: 'pdf, ssl, gestion' };
  const offre = { intitule: 'Assistant', competences: ['php', 'sql', 'gestion'] };

  const resultat = scoreMatching(cv, offre, {});
  assert.ok(resultat.competencesManquantes.includes('php'));
  assert.ok(resultat.competencesManquantes.includes('sql'));
  assert.ok(resultat.competencesCommunes.includes('gestion'));
});

test('chef de projet et chef de produit restent deux metiers differents', () => {
  // C'est la raison d'etre du Dice sur les mots : Jaro-Winkler donnerait 0.93
  // a ces deux intitules, comme s'il s'agissait d'une faute de frappe.
  const cv = { titre_poste: 'Chef de produit' };
  const offre = { intitule: 'Chef de projet' };

  const { criteres } = scoreMatching(cv, offre, {});
  const intitule = criteres.find((c) => c.id === 'intitule');

  assert.ok(intitule.ratio > 0.6 && intitule.ratio < 0.75, `ratio obtenu : ${intitule.ratio}`);
});

test('l\'intitule de l\'offre peut venir des options', () => {
  const resultat = scoreMatching({ titre_poste: 'Plombier chauffagiste' }, { competences: [] }, { intituleOffre: 'Plombier chauffagiste' });
  const intitule = resultat.criteres.find((c) => c.id === 'intitule');

  assert.equal(intitule.applicable, true);
  assert.equal(intitule.ratio, 1);
});

test('un candidat surqualifie n\'est pas penalise', () => {
  const offre = {
    intitule: 'Developpeur Front-End React',
    competences: ['React', 'JavaScript', 'CSS'],
    anneesExperience: 2,
    niveauDiplome: 'BTS'
  };
  const { criteres } = scoreMatching(cvDeveloppeur, offre, {});
  const parId = Object.fromEntries(criteres.map((c) => [c.id, c]));

  assert.equal(parId.experience.obtenu, parId.experience.poids, '5 ans pour 2 demandes : plein');
  assert.equal(parId.diplome.obtenu, parId.diplome.poids, 'un master vaut mieux qu\'un BTS demande');
});

test('un diplome inferieur coute des points sans tout perdre', () => {
  const offre = {
    intitule: 'Developpeur Back-End Java',
    competences: ['Java', 'SQL', 'Git'],
    niveauDiplome: 'Bac+5'
  };
  const cvBts = {
    titre_poste: 'Developpeur Back-End Java',
    competences_techniques: 'Java, SQL, Git',
    formations: [{ diplome: 'BTS SIO' }]
  };
  const { criteres } = scoreMatching(cvBts, offre, {});
  const diplome = criteres.find((c) => c.id === 'diplome');

  assert.equal(diplome.applicable, true);
  assert.ok(diplome.ratio > 0.3 && diplome.ratio < 1, `ratio obtenu : ${diplome.ratio}`);
});

test('l\'echelle des diplomes est ordonnee', () => {
  assert.ok(detecterNiveau('Doctorat', 'max') > detecterNiveau('Master 2', 'max'));
  assert.ok(detecterNiveau('Master 2', 'max') > detecterNiveau('Licence pro', 'max'));
  assert.ok(detecterNiveau('Licence pro', 'max') > detecterNiveau('BTS SIO', 'max'));
  assert.ok(detecterNiveau('BTS SIO', 'max') > detecterNiveau('Bac pro', 'max'));
  assert.ok(detecterNiveau('Bac pro', 'max') > detecterNiveau('CAP cuisine', 'max'));
  assert.equal(detecterNiveau('Bac+5', 'min'), detecterNiveau('Master', 'min'), 'bac+5 ne doit pas etre lu comme un bac');
  assert.equal(detecterNiveau('experience significative', 'min'), null);
});

// --- Robustesse ------------------------------------------------------------

test('un profil partiel ou absent ne fait pas planter le calcul', () => {
  const entrees = [
    [undefined, undefined],
    [null, offreReact],
    [{}, offreReact],
    [cvDeveloppeur, null],
    ['pas un objet', 'pas un objet'],
    [{ competences_techniques: 'React' }, { competences: 'React, Vue, Angular' }]
  ];

  for (const [profil, exigences] of entrees) {
    const resultat = scoreMatching(profil, exigences);
    assert.ok(Number.isInteger(resultat.score), 'le score est toujours un entier');
    assert.ok(resultat.score >= 0 && resultat.score <= 100);
    assert.equal(resultat.criteres.length, 4);
    assert.ok(Array.isArray(resultat.actions));
    assert.ok(Array.isArray(resultat.competencesCommunes));
    assert.ok(Array.isArray(resultat.competencesManquantes));
  }
});

test('les competences peuvent arriver en chaine ou en objets', () => {
  const chaine = scoreMatching(cvDeveloppeur, {
    intitule: 'Developpeur React',
    competences: 'React, Redux, Kubernetes'
  });
  const objets = scoreMatching(cvDeveloppeur, {
    intitule: 'Developpeur React',
    competences: [{ libelle: 'React' }, { libelle: 'Redux' }, { libelle: 'Kubernetes' }]
  });

  assert.deepStrictEqual(chaine.competencesManquantes, ['Kubernetes']);
  assert.deepStrictEqual(objets.competencesManquantes, ['Kubernetes']);
  assert.equal(chaine.score, objets.score);
});

test('une competence obligatoire pese plus qu\'une competence appreciee', () => {
  const cv = { titre_poste: 'Developpeur', competences_techniques: 'React' };

  const reactObligatoire = scoreMatching(cv, {
    intitule: 'Developpeur',
    competences: [
      { libelle: 'React', obligatoire: true },
      { libelle: 'Kubernetes' },
      { libelle: 'Terraform' }
    ]
  });
  const toutEgal = scoreMatching(cv, {
    intitule: 'Developpeur',
    competences: ['React', 'Kubernetes', 'Terraform']
  });

  assert.ok(reactObligatoire.score > toutEgal.score);
});

// --- Bout en bout, avec le vrai extracteur d'offre -------------------------

/**
 * Les tests precedents fabriquent des exigences propres. Celui-ci part du
 * texte brut d'une annonce et passe par core/offre/extraireExigences.js, comme
 * en production. C'est la que se voit le vrai comportement : l'extracteur
 * produit une trentaine de termes qui se chevauchent (« transferts des
 * personnes », « personnes a mobilite »...), et le score doit rester juste
 * malgre ce bruit.
 */
const ANNONCE_AIDE_SOIGNANT = `Aide-soignant (H/F) - EHPAD Les Tilleuls
CDI - Roubaix

Vos missions :
Accompagnement des residents dans les actes de la vie quotidienne.
Aide a la toilette et a l'habillage.
Distribution des repas et surveillance des prises alimentaires.
Manutention et transferts des personnes a mobilite reduite.
Transmissions ecrites et orales aupres de l'equipe soignante.

Profil recherche :
Diplome d'Etat d'Aide-Soignant exige.
Une experience de 2 ans minimum en EHPAD est souhaitee.
Sens du contact, rigueur et travail en equipe.`;

test('bout en bout : une vraie annonce non-tech separe bien les deux profils', () => {
  const exigences = extraireExigences(ANNONCE_AIDE_SOIGNANT);
  const options = { intituleOffre: 'Aide-soignant (H/F)' };

  const cvAideSoignante = {
    titre_poste: 'Aide-soignante',
    competences_techniques: 'Aide a la toilette, prise de constantes, transmissions ciblees, hygiene hospitaliere, manutention',
    experiences: [{
      titre: 'Aide-soignante',
      entreprise: 'EHPAD Bellevue',
      description: 'Accompagnement des residents en EHPAD, aide a la toilette et a l\'habillage, distribution des repas, '
        + 'transferts des personnes a mobilite reduite, transmissions ecrites et orales, travail en equipe, sens du contact et rigueur'
    }],
    formations: [{ diplome: 'Diplome d\'Etat d\'Aide-Soignant' }],
    anneesExperience: 6
  };

  const bonProfil = scoreMatching(cvAideSoignante, exigences, options);
  const mauvaisProfil = scoreMatching(cvDeveloppeur, exigences, options);

  assert.ok(bonProfil.score >= 70, `l'aide-soignante devrait bien scorer, obtenu ${bonProfil.score}`);
  assert.ok(mauvaisProfil.score < 40, `le developpeur ne devrait pas scorer ici, obtenu ${mauvaisProfil.score}`);
  assert.ok(
    bonProfil.score - mauvaisProfil.score >= 30,
    `ecart trop faible : ${bonProfil.score} contre ${mauvaisProfil.score}`
  );

  // L'extracteur ne renvoie pas d'intitule : il vient des options.
  const intitule = bonProfil.criteres.find((c) => c.id === 'intitule');
  assert.equal(intitule.applicable, true);
});

test('une exigence en plusieurs mots donne un credit partiel', () => {
  // « transferts des personnes » quand le CV dit seulement « transferts » :
  // c'est a moitie couvert, pas absent. En tout ou rien, un candidat perdrait
  // toute une serie de lignes pour une simple difference de formulation.
  const cv = { titre_poste: 'Manutentionnaire', competences_techniques: 'transferts, port de charges' };
  const partiel = scoreMatching(cv, {
    intitule: 'Manutentionnaire',
    competences: ['transferts des personnes', 'port de charges', 'conduite de chariot']
  });
  const absent = scoreMatching({ titre_poste: 'Manutentionnaire' }, {
    intitule: 'Manutentionnaire',
    competences: ['transferts des personnes', 'port de charges', 'conduite de chariot']
  });

  const ratioPartiel = partiel.criteres.find((c) => c.id === 'competences').ratio;
  const ratioAbsent = absent.criteres.find((c) => c.id === 'competences').ratio;

  assert.ok(ratioPartiel > ratioAbsent);
  assert.ok(ratioPartiel > 0 && ratioPartiel < 1, `ratio obtenu : ${ratioPartiel}`);
});

test('le jargon d\'annonce n\'est jamais demande au candidat', () => {
  // « h/f » et « cdi » traversent parfois l'extraction des competences.
  // Les reclamer dans un CV n'a de sens pour aucun metier.
  const resultat = scoreMatching(
    { titre_poste: 'Plombier', competences_techniques: 'soudure cuivre' },
    { intitule: 'Plombier', competences: ['soudure cuivre', 'h/f', 'cdi', 'pose de sanitaires'] }
  );

  assert.ok(!resultat.competencesManquantes.includes('h/f'));
  assert.ok(!resultat.competencesManquantes.includes('cdi'));
  assert.ok(resultat.competencesManquantes.includes('pose de sanitaires'));
});

test('le score suit bien la somme des criteres', () => {
  const resultat = scoreMatching(cvDeveloppeur, offreReact, {});
  const somme = resultat.criteres.reduce((total, c) => total + c.obtenu, 0);

  assert.equal(resultat.score, Math.round(somme));
  for (const critere of resultat.criteres) {
    assert.ok(critere.obtenu <= critere.poids + 0.01, `${critere.id} depasse son poids`);
    assert.ok(typeof critere.detail === 'string' && critere.detail.length > 0);
    assert.ok(typeof critere.libelle === 'string' && critere.libelle.length > 0);
  }
});
