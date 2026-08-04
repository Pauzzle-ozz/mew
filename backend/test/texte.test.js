const test = require('node:test');
const assert = require('node:assert');

const { sansAccents, normaliser, nettoyerPdf } = require('../src/core/texte/normaliser');
const { tokeniser, motsUniques, ngrammes, estStopword } = require('../src/core/texte/tokeniser');
const { lemmatiser } = require('../src/core/texte/lemmatiserFr');
const { levenshtein, jaroWinkler, dice, jaccard, tfIdf, cosinus } = require('../src/core/texte/similarite');

/**
 * Ces tests protegent le socle sur lequel tout le calcul local de Mew repose.
 *
 * Deux choses valent particulierement le detour :
 *   - le test « chef de projet vs chef de produit » : il verrouille le choix
 *     de dice plutot que Jaro-Winkler pour comparer des intitules ;
 *   - les tests « profil non-tech » : la boite a outils doit marcher aussi
 *     bien pour un infirmier ou un plombier que pour un developpeur.
 */

// ---------------------------------------------------------------------------
// normaliser.js
// ---------------------------------------------------------------------------

test('sansAccents enleve les diacritiques sans toucher a la casse', () => {
  assert.equal(sansAccents('Développeuse Sénior'), 'Developpeuse Senior');
  assert.equal(sansAccents('Élève à Nîmes, garçon'), 'Eleve a Nimes, garcon');
  assert.equal(sansAccents('DÉVELOPPEUR'), 'DEVELOPPEUR');
});

test('sansAccents casse aussi les ligatures, que NFD ignore', () => {
  // Sans cette regle, « Cœur » ne matcherait jamais « coeur » tape au clavier.
  assert.equal(sansAccents('Cœur de métier'), 'Coeur de metier');
  assert.equal(sansAccents('ﬁnance et ﬂux'), 'finance et flux');
});

test('normaliser met en minuscules et ecrase les espaces', () => {
  assert.equal(normaliser('  Chef   de\tPROJET \n Digital  '), 'chef de projet digital');
  assert.equal(normaliser('Infirmière D.E.'), 'infirmiere d.e.');
  // La ponctuation est conservee : c'est le tokeniseur qui tranchera.
  assert.equal(normaliser('Node.js, C++'), 'node.js, c++');
});

test('nettoyerPdf repare un extrait de CV realiste', () => {
  const brut = [
    'EXPÉRIENCE PROFESSIONNELLE',
    '',
    '',
    '',
    '•  Aide-soignante — EHPAD Les Tilleuls   ,  2019 - 2023',
    '▪ Toilettes et soins d\'hygiène',
    '',
    '',
    '   Cœur de métier : ﬁn de vie'
  ].join('\r\n');

  const propre = nettoyerPdf(brut);

  assert.ok(!propre.includes(' '), 'plus aucun espace insecable');
  assert.ok(!propre.includes('•') && !propre.includes('▪'), 'puces retirees');
  assert.ok(!propre.includes('\r'), 'fins de ligne uniformisees');
  assert.ok(!/\n{3,}/.test(propre), 'au plus une ligne vide d\'affilee');
  assert.ok(propre.includes('Tilleuls, 2019'), 'espace avant la virgule retire');
  assert.ok(propre.includes('Coeur de métier'), 'ligature oe reparee, accents conserves');
  assert.ok(propre.includes('fin de vie'), 'ligature fi reparee');
  // Les accents et la casse, eux, doivent survivre : ce texte reste lisible.
  assert.ok(propre.startsWith('EXPÉRIENCE PROFESSIONNELLE'));
});

test('nettoyerPdf ne mange pas un tiret qui n\'est pas une puce', () => {
  assert.equal(nettoyerPdf('2019 - 2023'), '2019 - 2023');
  assert.equal(nettoyerPdf('Chiffre en baisse de -5 %'), 'Chiffre en baisse de -5%');
});

// ---------------------------------------------------------------------------
// tokeniser.js
// ---------------------------------------------------------------------------

test('tokeniser garde les noms techniques que la ponctuation casserait', () => {
  const jetons = tokeniser('Je maitrise le C++, le C# et Node.js depuis 2020.');
  assert.deepEqual(jetons, ['maitrise', 'c++', 'c#', 'node.js', '2020']);
});

test('tokeniser retire la ponctuation collee aux bords mais garde les chiffres', () => {
  assert.deepEqual(tokeniser('Paris. Lyon, Marseille ; 2024'), ['paris', 'lyon', 'marseille', '2024']);
  assert.deepEqual(tokeniser('R&D et .NET'), ['r&d', 'net']);
});

test('les stopwords partent, les mots porteurs de sens restent', () => {
  const jetons = tokeniser(
    'Responsable de la gestion et du suivi des travaux, permis B, anglais courant.'
  );
  for (const attendu of ['responsable', 'gestion', 'suivi', 'travaux', 'permis', 'anglais']) {
    assert.ok(jetons.includes(attendu), `« ${attendu} » ne doit JAMAIS etre traite comme un mot vide`);
  }
  for (const vide of ['de', 'la', 'et', 'du', 'des']) {
    assert.ok(!jetons.includes(vide), `« ${vide} » aurait du etre retire`);
  }
});

test('un CV non-tech garde tout son vocabulaire metier', () => {
  const jetons = tokeniser(
    'Infirmiere au bloc operatoire, prise en charge des patients et conduite d\'entretiens.'
  );
  for (const attendu of ['infirmiere', 'bloc', 'operatoire', 'charge', 'patients', 'conduite']) {
    assert.ok(jetons.includes(attendu), `« ${attendu} » manque : le tokeniseur appauvrit ce profil`);
  }
});

test('estStopword ne se trompe pas sur les mots de metier', () => {
  assert.equal(estStopword('de'), true);
  assert.equal(estStopword('POUR'), true);
  assert.equal(estStopword('à'), true);
  assert.equal(estStopword('responsable'), false);
  assert.equal(estStopword('chef'), false);
  assert.equal(estStopword('permis'), false);
});

test('motsUniques dedoublonne', () => {
  const uniques = motsUniques('soudure soudure TIG soudure');
  assert.ok(uniques instanceof Set);
  assert.deepEqual([...uniques].sort(), ['soudure', 'tig']);
});

test('ngrammes reconstruit des expressions', () => {
  const jetons = tokeniser('chef de projet digital', { garderStopwords: true });
  assert.deepEqual(ngrammes(jetons, 3), ['chef de projet', 'de projet digital']);
  assert.deepEqual(ngrammes(['bloc', 'operatoire'], 1), ['bloc', 'operatoire']);
  assert.deepEqual(ngrammes(['bloc'], 2), [], 'moins de mots que demande');
});

// ---------------------------------------------------------------------------
// lemmatiserFr.js
// ---------------------------------------------------------------------------

test('lemmatiser ramene les feminins de metiers au masculin', () => {
  assert.equal(lemmatiser('developpeuse'), 'developpeur');
  assert.equal(lemmatiser('Développeuses'), 'developpeur');
  assert.equal(lemmatiser('infirmiere'), 'infirmier');
  assert.equal(lemmatiser('infirmieres'), 'infirmier');
  assert.equal(lemmatiser('directrice'), 'directeur');
  assert.equal(lemmatiser('technicienne'), 'technicien');
  assert.equal(lemmatiser('boulangere'), 'boulanger');
  assert.equal(lemmatiser('soudeuse'), 'soudeur');
});

test('lemmatiser gere les pluriels, y compris les irreguliers', () => {
  assert.equal(lemmatiser('competences'), 'competence');
  assert.equal(lemmatiser('journaux'), 'journal');
  assert.equal(lemmatiser('commerciaux'), 'commercial');
  assert.equal(lemmatiser('bureaux'), 'bureau', 'pas « bureal »');
  assert.equal(lemmatiser('reseaux'), 'reseau', 'pas « reseal »');
  assert.equal(lemmatiser('travaux'), 'travail', 'pas « traval »');
});

test('lemmatiser laisse tranquilles les mots invariables', () => {
  const invariables = [
    'bus', 'pays', 'souris', 'corps', 'temps', 'prix', 'cours', 'acces',
    'processus', 'cas', 'fois', 'mois', 'os', 'univers', 'succes'
  ];
  for (const mot of invariables) {
    assert.equal(lemmatiser(mot), mot, `« ${mot} » doit rester intact`);
  }
});

test('lemmatiser protege les mots pleins d\'un CV non-tech', () => {
  // Un -s ou un -euse mal enleve ici, et le candidat perd une competence.
  assert.equal(lemmatiser('permis'), 'permis');
  assert.equal(lemmatiser('anglais'), 'anglais');
  assert.equal(lemmatiser('matrices'), 'matrice', 'pas « mateur »');
  assert.equal(lemmatiser('pelouses'), 'pelouse', 'pas « pelour »');
});

test('lemmatiser ne touche pas aux noms techniques', () => {
  assert.equal(lemmatiser('node.js'), 'node.js');
  assert.equal(lemmatiser('c++'), 'c++');
  assert.equal(lemmatiser('chef de projet'), 'chef de projet');
});

test('un mot deja au masculin singulier est un point fixe', () => {
  for (const mot of ['developpeur', 'infirmier', 'plombier', 'cuisinier', 'technicien']) {
    assert.equal(lemmatiser(mot), mot);
    assert.equal(lemmatiser(lemmatiser(mot)), mot, 'lemmatiser deux fois ne change rien');
  }
});

// ---------------------------------------------------------------------------
// similarite.js
// ---------------------------------------------------------------------------

test('levenshtein compte les corrections', () => {
  assert.equal(levenshtein('chat', 'chat'), 0);
  assert.equal(levenshtein('chat', 'chien'), 3);
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('Développeur', 'developpeur'), 0, 'accents et casse normalises');
});

test('LE PIEGE : Jaro-Winkler ment sur les expressions, pas dice', () => {
  // Sur DEUX MOTS, le bonus de prefixe est une aide : ces deux formes
  // designent bien le meme metier.
  assert.ok(
    jaroWinkler('developpeur', 'developpeuse') > 0.9,
    'jaroWinkler doit rapprocher deux formes du meme mot'
  );

  // Sur des EXPRESSIONS, ce meme bonus rapproche deux metiers differents.
  const jw = jaroWinkler('chef de projet', 'chef de produit');
  assert.ok(jw > 0.9, `piege attendu autour de 0.93, obtenu ${jw}`);

  // dice, lui, compte les mots reellement partages : 2 sur 3.
  const d = dice('chef de projet', 'chef de produit');
  assert.ok(d < 0.7, `dice doit rester honnete, obtenu ${d}`);
  assert.ok(Math.abs(d - 2 / 3) < 1e-9, 'dice = 2 x 2 mots communs / (3 + 3)');

  // Conclusion verrouillee : pour comparer des intitules, dice < jaroWinkler.
  assert.ok(d < jw);
});

test('dice reconnait deux ecritures du meme poste', () => {
  assert.equal(dice('aide soignante', 'aide soignante'), 1);
  assert.ok(dice('infirmier de bloc operatoire', 'infirmier bloc operatoire') > 0.8);
  assert.equal(dice('plombier chauffagiste', 'developpeur web'), 0);
});

test('jaccard sur deux ensembles connus', () => {
  const a = new Set(['soudure', 'lecture de plan', 'caces']);
  const b = new Set(['soudure', 'caces', 'permis c', 'habilitation']);
  // 2 en commun, 5 au total dans l'union.
  assert.equal(jaccard(a, b), 2 / 5);
  // Les tableaux sont acceptes et donnent le meme resultat.
  assert.equal(jaccard([...a], [...b]), 2 / 5);
  assert.equal(jaccard(a, a), 1);
  assert.equal(jaccard(new Set(), new Set()), 0, 'rien extrait n\'est pas un match parfait');
});

test('tfIdf donne plus de poids aux mots rares', () => {
  const vecteurs = tfIdf([
    'infirmiere bloc operatoire',
    'infirmiere scolaire',
    'plombier chauffagiste'
  ]);
  assert.equal(vecteurs.length, 3);
  assert.ok(vecteurs[0] instanceof Map);
  // « infirmiere » apparait dans 2 documents sur 3, « bloc » dans un seul.
  assert.ok(vecteurs[0].get('bloc') > vecteurs[0].get('infirmiere'));
  // Aucun poids nul, meme pour un mot present partout.
  assert.ok(vecteurs[0].get('infirmiere') > 0);
});

test('cosinus rapproche les documents qui partagent du vocabulaire', () => {
  const vecteurs = tfIdf([
    'infirmiere bloc operatoire',
    'infirmiere scolaire',
    'plombier chauffagiste'
  ]);
  const proche = cosinus(vecteurs[0], vecteurs[1]);
  const lointain = cosinus(vecteurs[0], vecteurs[2]);
  assert.ok(proche > lointain);
  assert.equal(lointain, 0, 'aucun mot en commun');
  assert.ok(Math.abs(cosinus(vecteurs[0], vecteurs[0]) - 1) < 1e-9, 'un document est identique a lui-meme');
});

// ---------------------------------------------------------------------------
// robustesse : ces fonctions tournent sur du texte sorti d'un PDF,
// c'est-a-dire sur n'importe quoi.
// ---------------------------------------------------------------------------

test('aucune fonction ne plante sur une entree absurde', () => {
  const absurdes = [null, undefined, 42, NaN, Infinity, {}, [], true, new Date()];

  for (const valeur of absurdes) {
    assert.equal(sansAccents(valeur), '');
    assert.equal(normaliser(valeur), '');
    assert.equal(nettoyerPdf(valeur), '');
    assert.deepEqual(tokeniser(valeur), []);
    assert.equal(motsUniques(valeur).size, 0);
    assert.equal(lemmatiser(valeur), '');

    assert.equal(typeof levenshtein(valeur, 'test'), 'number');
    assert.equal(typeof jaroWinkler(valeur, 'test'), 'number');
    assert.equal(dice(valeur, 'test'), 0);
    assert.equal(jaccard(valeur, ['test']), 0);
    assert.deepEqual(tfIdf(valeur), []);
    assert.equal(cosinus(valeur, new Map([['a', 1]])), 0);
  }
});

test('les scores restent bornes entre 0 et 1', () => {
  const couples = [
    ['', ''], ['a', ''], ['a', 'a'], ['abc', 'xyz'],
    ['chef de projet', 'chef de projet'], ['x'.repeat(200), 'y'.repeat(200)]
  ];
  for (const [a, b] of couples) {
    for (const mesure of [jaroWinkler, dice]) {
      const score = mesure(a, b);
      assert.ok(score >= 0 && score <= 1, `${mesure.name}(${a}, ${b}) = ${score}`);
    }
    assert.ok(Number.isInteger(levenshtein(a, b)), 'levenshtein renvoie un entier');
  }
});
