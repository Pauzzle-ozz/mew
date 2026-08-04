const { test, describe } = require('node:test');
const assert = require('node:assert');

const { rendre, estVide } = require('../src/core/gabarits/moteur');
const { parseEmailGenere } = require('../src/llm/parseurs/emailSpontane');
const { genererRelance } = require('../src/core/gabarits/relance');
const {
  justifierAdequation,
  resumerEcart,
  formaterListe,
  formaterEnumeration
} = require('../src/core/gabarits/justifications');
const {
  feriesFrancais,
  estJourOuvre,
  prochainJourOuvre,
  ajouterJoursOuvres,
  calculerPaques
} = require('../src/core/suivi/joursOuvres');

/**
 * Chaque test vert ici, c'est un appel a un modele de langage supprime.
 *
 * Le plus important est la section « parseur » : c'est sa robustesse qui
 * justifie de ne plus payer un second modele pour couper un texte en deux.
 */

// Aucun texte qui part chez un recruteur ne doit contenir d'accolades.
const AUCUN_MARQUEUR = /\{\{|\}\}/;

/* ================================================================== */
describe('moteur de gabarits', () => {
  /* ================================================================ */

  test('remplace les variables presentes', () => {
    assert.equal(rendre('Bonjour {{nom}} !', { nom: 'Camille' }), 'Bonjour Camille !');
    assert.equal(rendre('{{a}}-{{b}}', { a: '1', b: '2' }), '1-2');
    assert.equal(rendre('Il y a {{n}} jours', { n: 8 }), 'Il y a 8 jours');
  });

  test('tolere les espaces dans les accolades et les chemins pointes', () => {
    assert.equal(rendre('Bonjour {{ nom }}', { nom: 'Sam' }), 'Bonjour Sam');
    assert.equal(rendre('{{profil.ville}}', { profil: { ville: 'Lyon' } }), 'Lyon');
  });

  test('une variable absente devient une chaine vide, sans laisser de marqueur', () => {
    const rendu = rendre('Bonjour {{prenom}}{{inconnu}}, ca va ?', { prenom: 'Alex' });
    assert.equal(rendu, 'Bonjour Alex, ca va ?');
    assert.ok(!AUCUN_MARQUEUR.test(rendu));
  });

  test('aucun marqueur ne survit, meme mal forme', () => {
    const rendu = rendre('Debut {{/orphelin}} {{#jamaisFerme}} fin', {});
    assert.ok(!AUCUN_MARQUEUR.test(rendu), rendu);
  });

  test('un bloc conditionnel s affiche si la variable est remplie', () => {
    const gabarit = 'Poste{{#entreprise}} chez {{entreprise}}{{/entreprise}}.';
    assert.equal(rendre(gabarit, { entreprise: 'Decathlon' }), 'Poste chez Decathlon.');
  });

  test('un bloc conditionnel disparait si la variable est vide', () => {
    const gabarit = 'Poste{{#entreprise}} chez {{entreprise}}{{/entreprise}}.';
    for (const vide of [{}, { entreprise: '' }, { entreprise: '   ' }, { entreprise: null }, { entreprise: [] }]) {
      assert.equal(rendre(gabarit, vide), 'Poste.', JSON.stringify(vide));
    }
  });

  test('les blocs imbriques sont geres', () => {
    const gabarit = '{{#a}}A{{#b}}B{{/b}}{{/a}}';
    assert.equal(rendre(gabarit, { a: 1, b: 1 }), 'AB');
    assert.equal(rendre(gabarit, { a: 1, b: '' }), 'A');
    assert.equal(rendre(gabarit, { a: '', b: 1 }), '');
  });

  test('un bloc seul sur sa ligne n abandonne pas une ligne vide', () => {
    const gabarit = 'Debut\n{{#bloc}}\nMilieu\n{{/bloc}}\nFin';
    assert.equal(rendre(gabarit, { bloc: 'oui' }), 'Debut\nMilieu\nFin');
    assert.equal(rendre(gabarit, {}), 'Debut\nFin');
  });

  test('les espaces doubles et les lignes vides multiples sont nettoyes', () => {
    assert.equal(rendre('Bonjour  {{vide}}  Camille', {}), 'Bonjour Camille');
    assert.equal(rendre('a\n\n\n\n\nb', {}), 'a\n\nb');
    assert.equal(rendre('Le poste {{vide}}, chez nous', {}), 'Le poste, chez nous');
    assert.equal(rendre('  Bonjour  ', {}), 'Bonjour');
  });

  test('les cas degeneres ne cassent rien', () => {
    assert.equal(rendre(null, {}), '');
    assert.equal(rendre(undefined), '');
    assert.equal(rendre('', {}), '');
    assert.equal(rendre('Texte fixe', null), 'Texte fixe');
  });

  test('estVide suit les regles annoncees', () => {
    for (const valeur of [null, undefined, false, '', '   ', 0, []]) {
      assert.equal(estVide(valeur), true, String(valeur));
    }
    for (const valeur of ['a', 0.5, 3, true, ['x']]) {
      assert.equal(estVide(valeur), false, String(valeur));
    }
  });
});

/* ================================================================== */
describe('parseur d email genere', () => {
  /* ================================================================ */

  test('le format nominal impose par notre prompt', () => {
    const texte = 'SUBJECT: Candidature spontanee - Infirmier\n---\nMadame, Monsieur,\n\nJe me permets...\n\nCordialement,\nLea Martin';
    const { subject, body } = parseEmailGenere(texte);
    assert.equal(subject, 'Candidature spontanee - Infirmier');
    assert.ok(body.startsWith('Madame, Monsieur,'));
    assert.ok(body.endsWith('Lea Martin'));
    assert.ok(!body.includes('---'));
  });

  test('marqueur en francais, avec ou sans accent, avec ou sans espace', () => {
    const variantes = [
      'SUBJECT: Mon objet\n---\nCorps',
      'Subject : Mon objet\n---\nCorps',
      'subject:Mon objet\n---\nCorps',
      'OBJET : Mon objet\n---\nCorps',
      'Objet: Mon objet\n---\nCorps',
      'objet   :   Mon objet\n---\nCorps',
      'Sujet : Mon objet\n---\nCorps'
    ];
    for (const texte of variantes) {
      assert.deepEqual(parseEmailGenere(texte), { subject: 'Mon objet', body: 'Corps' }, texte);
    }
  });

  test('le gras markdown autour du marqueur est absorbe', () => {
    const variantes = [
      '**SUBJECT:** Mon objet\n---\nCorps',
      '**SUBJECT**: Mon objet\n---\nCorps',
      '**Objet :** Mon objet\n---\nCorps',
      '## SUBJECT: Mon objet\n---\nCorps'
    ];
    for (const texte of variantes) {
      assert.deepEqual(parseEmailGenere(texte), { subject: 'Mon objet', body: 'Corps' }, texte);
    }
  });

  test('separateur absent : premiere ligne = objet, le reste = corps', () => {
    const { subject, body } = parseEmailGenere('Candidature spontanee\n\nMadame, Monsieur,\n\nJe vous ecris.');
    assert.equal(subject, 'Candidature spontanee');
    assert.equal(body, 'Madame, Monsieur,\n\nJe vous ecris.');
  });

  test('separateur absent mais marqueur present : le marqueur gagne', () => {
    const { subject, body } = parseEmailGenere('SUBJECT: Mon objet\nMadame, Monsieur,\nJe vous ecris.');
    assert.equal(subject, 'Mon objet');
    assert.equal(body, 'Madame, Monsieur,\nJe vous ecris.');
  });

  test('plusieurs separateurs : seul le premier compte', () => {
    const { subject, body } = parseEmailGenere('SUBJECT: Mon objet\n---\n---\nMadame,\n\nCordialement');
    assert.equal(subject, 'Mon objet');
    assert.equal(body, 'Madame,\n\nCordialement');
  });

  test('lignes vides autour du separateur', () => {
    const { subject, body } = parseEmailGenere('\n\nSUBJECT: Mon objet\n\n\n---\n\n\nMadame,\n\n');
    assert.equal(subject, 'Mon objet');
    assert.equal(body, 'Madame,');
  });

  test('le marqueur seul sur sa ligne : l objet est juste en dessous', () => {
    const { subject, body } = parseEmailGenere('SUBJECT:\nMon objet\n---\nCorps');
    assert.equal(subject, 'Mon objet');
    assert.equal(body, 'Corps');
  });

  test('texte vide ou absent : des chaines vides, jamais une exception', () => {
    for (const entree of ['', '   ', '\n\n', null, undefined, 42, {}, [], NaN]) {
      assert.deepEqual(parseEmailGenere(entree), { subject: '', body: '' }, String(entree));
    }
  });

  test('un separateur sans rien avant ne fabrique pas un objet bidon', () => {
    assert.deepEqual(parseEmailGenere('---\nMadame,'), { subject: '', body: 'Madame,' });
  });

  test('les retours chariot Windows ne changent rien', () => {
    const { subject, body } = parseEmailGenere('SUBJECT: Mon objet\r\n---\r\nMadame,\r\nCordialement');
    assert.equal(subject, 'Mon objet');
    assert.equal(body, 'Madame,\nCordialement');
    assert.ok(!body.includes('\r'));
  });

  test('un bloc de code markdown enveloppant est retire', () => {
    const { subject, body } = parseEmailGenere('```\nSUBJECT: Mon objet\n---\nCorps\n```');
    assert.equal(subject, 'Mon objet');
    assert.equal(body, 'Corps');
  });

  test('les crochets et guillemets autour de l objet sont retires', () => {
    assert.equal(parseEmailGenere('SUBJECT: [Mon objet]\n---\nC').subject, 'Mon objet');
    assert.equal(parseEmailGenere('SUBJECT: "Mon objet"\n---\nC').subject, 'Mon objet');
    assert.equal(parseEmailGenere('SUBJECT: «Mon objet»\n---\nC').subject, 'Mon objet');
  });

  test('une parenthese legitime dans l objet est preservee', () => {
    assert.equal(
      parseEmailGenere('SUBJECT: Candidature aide-soignante (CDI)\n---\nC').subject,
      'Candidature aide-soignante (CDI)'
    );
  });

  test('l objet garde ses accents et ses majuscules', () => {
    assert.equal(
      parseEmailGenere('Objet : Électricien expérimenté - CDI\n---\nC').subject,
      'Électricien expérimenté - CDI'
    );
  });

  test('une formule d appel n est jamais promue en objet', () => {
    // Sans ce garde-fou, l'email partait avec « Madame, Monsieur, » en objet
    // et un corps ampute de sa salutation.
    const { subject, body } = parseEmailGenere('Madame, Monsieur,\n\nJe me permets de vous ecrire.');
    assert.equal(subject, '');
    assert.equal(body, 'Madame, Monsieur,\n\nJe me permets de vous ecrire.');
  });

  test('une phrase entiere n est jamais promue en objet', () => {
    const phrase = 'Je me permets de vous adresser ma candidature spontanee pour un poste de plombier chauffagiste au sein de votre entreprise familiale.';
    const { subject, body } = parseEmailGenere(`${phrase}\n\nCordialement`);
    assert.equal(subject, '');
    assert.ok(body.startsWith(phrase));
  });

  test('le corps peut contenir un tiret sans etre coupe', () => {
    const { body } = parseEmailGenere('SUBJECT: Objet\n---\nMadame,\n- point un\n- point deux\nCordialement');
    assert.ok(body.includes('- point un'));
    assert.ok(body.includes('- point deux'));
  });
});

/* ================================================================== */
describe('relance de candidature', () => {
  /* ================================================================ */

  const base = {
    candidateName: 'Lea Martin',
    targetPosition: 'infirmier',
    company: 'CHU de Nantes',
    originalSubject: 'Candidature spontanee - Infirmier',
    daysSince: 8
  };

  test('variante standard sous 21 jours', () => {
    const { subject, body } = genererRelance(base);
    assert.equal(subject, 'Re: Candidature spontanee - Infirmier');
    assert.ok(body.startsWith('Madame, Monsieur,'), body);
    assert.ok(body.includes('Je me permets de revenir vers vous'), body);
    assert.ok(body.includes("il y a 8 jours"), body);
    assert.ok(body.includes('CHU de Nantes'), body);
    assert.ok(body.trimEnd().endsWith('Lea Martin'), body);
  });

  test('variante dernier point au-dela de 21 jours', () => {
    const { body } = genererRelance({ ...base, daysSince: 30 });
    assert.ok(body.includes('un dernier message'), body);
    assert.ok(body.includes('bonne continuation'), body);
    assert.ok(!body.includes('Je me permets de revenir vers vous'), body);
  });

  test('la bascule se fait bien a 21 jours', () => {
    assert.ok(genererRelance({ ...base, daysSince: 21 }).body.includes('revenir vers vous'));
    assert.ok(genererRelance({ ...base, daysSince: 22 }).body.includes('dernier message'));
  });

  test('le dernier point est plus bref que la relance standard', () => {
    const standard = genererRelance({ ...base, daysSince: 8 }).body;
    const dernier = genererRelance({ ...base, daysSince: 30 }).body;
    assert.ok(compterMots(dernier) < compterMots(standard));
  });

  test('les deux variantes tiennent sous 80 mots', () => {
    for (const jours of [8, 30]) {
      const { body } = genererRelance({ ...base, daysSince: jours });
      assert.ok(compterMots(body) <= 80, `${jours} jours : ${compterMots(body)} mots`);
    }
  });

  test('aucun marqueur de gabarit ne subsiste, meme sans aucune donnee', () => {
    const cas = [
      base,
      { ...base, daysSince: 40 },
      { candidateName: '', targetPosition: '', company: '', originalSubject: '', daysSince: 0 },
      {},
      undefined
    ];
    for (const params of cas) {
      const { subject, body } = genererRelance(params);
      assert.ok(!AUCUN_MARQUEUR.test(subject), `objet : ${subject}`);
      assert.ok(!AUCUN_MARQUEUR.test(body), `corps : ${body}`);
      assert.ok(body.startsWith('Madame, Monsieur,'));
    }
  });

  test('sans entreprise, la phrase reste naturelle', () => {
    const { body } = genererRelance({ ...base, company: '' });
    assert.ok(body.includes('votre entreprise'), body);
    assert.ok(!body.includes(' pour  '), body);
  });

  test('sans poste ni delai, aucune phrase bancale', () => {
    const { body } = genererRelance({ ...base, targetPosition: '', daysSince: 0 });
    assert.ok(body.includes('ma candidature spontanée.'), body);
    assert.ok(!body.includes('au poste'), body);
    assert.ok(!body.includes('il y a'), body);
  });

  test('l elision suit l intitule du poste', () => {
    assert.ok(genererRelance({ ...base, targetPosition: 'infirmier' }).body.includes("au poste d'infirmier"));
    assert.ok(genererRelance({ ...base, targetPosition: 'plombier' }).body.includes('au poste de plombier'));
  });

  test('un seul jour ne donne pas "1 jours"', () => {
    const { body } = genererRelance({ ...base, daysSince: 1 });
    assert.ok(body.includes('il y a 1 jour.'), body);
    assert.ok(!body.includes('1 jours'), body);
  });

  test('l objet ne devient jamais "Re: Re:"', () => {
    assert.equal(
      genererRelance({ ...base, originalSubject: 'Re: Candidature' }).subject,
      'Re: Candidature'
    );
    assert.equal(
      genererRelance({ ...base, originalSubject: 'RE : Re: Candidature' }).subject,
      'Re: Candidature'
    );
  });

  test('objet de repli quand on ignore l objet initial', () => {
    assert.equal(
      genererRelance({ ...base, originalSubject: '' }).subject,
      "Relance - candidature spontanée au poste d'infirmier - CHU de Nantes"
    );
    assert.equal(
      genererRelance({ originalSubject: '', targetPosition: '', company: '' }).subject,
      'Relance - candidature spontanée'
    );
  });

  test('la relance passe le parseur sans perte (aller-retour)', () => {
    // Les deux briques se rencontrent dans le meme service : mieux vaut
    // verifier ici qu'elles parlent la meme langue.
    const relance = genererRelance(base);
    const relu = parseEmailGenere(`SUBJECT: ${relance.subject}\n---\n${relance.body}`);
    assert.deepEqual(relu, relance);
  });
});

/* ================================================================== */
describe('phrases de justification', () => {
  /* ================================================================ */

  test('cas nominal', () => {
    const phrase = justifierAdequation({
      competencesCommunes: ['react', 'docker'],
      competencesManquantes: ['kubernetes'],
      totalRequises: 12,
      intituleMetier: 'developpeur web'
    });
    assert.equal(phrase, 'Tu maitrises 2 des 12 competences essentielles du metier de developpeur web (react, docker).');
  });

  test('un profil non technique est traite exactement pareil', () => {
    // Le piege du projet : rien ici ne doit dependre d'un vocabulaire tech.
    const phrase = justifierAdequation({
      competencesCommunes: ['prise de sang', 'dossier de soins', 'pansement complexe'],
      competencesManquantes: ['bloc operatoire'],
      totalRequises: 4,
      intituleMetier: 'infirmier'
    });
    assert.equal(
      phrase,
      "Tu maitrises 3 des 4 competences essentielles du metier d'infirmier (prise de sang, dossier de soins, pansement complexe)."
    );
  });

  test('aucune competence commune', () => {
    const phrase = justifierAdequation({
      competencesCommunes: [],
      competencesManquantes: ['soudure', 'plomberie'],
      totalRequises: 10,
      intituleMetier: 'plombier'
    });
    assert.equal(phrase, 'Ton profil ne fait apparaitre aucune des 10 competences essentielles du metier de plombier.');
  });

  test('une seule competence commune : pas de "et" orphelin', () => {
    const phrase = justifierAdequation({
      competencesCommunes: ['caisse'],
      competencesManquantes: ['inventaire'],
      totalRequises: 2,
      intituleMetier: 'vendeur'
    });
    assert.equal(phrase, 'Tu maitrises 1 des 2 competences essentielles du metier de vendeur (caisse).');
  });

  test('au-dela de cinq competences, la liste est tronquee', () => {
    const phrase = justifierAdequation({
      competencesCommunes: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      competencesManquantes: [],
      totalRequises: 8,
      intituleMetier: 'cuisinier'
    });
    assert.ok(phrase.includes('(a, b, c, d, e et 3 autres)'), phrase);
  });

  test('le profil couvre tout', () => {
    const phrase = justifierAdequation({
      competencesCommunes: ['hygiene', 'service'],
      competencesManquantes: [],
      totalRequises: 2,
      intituleMetier: 'serveur'
    });
    assert.equal(phrase, 'Tu maitrises les 2 competences essentielles du metier de serveur (hygiene, service).');
  });

  test('sans intitule de metier, la phrase reste correcte', () => {
    const phrase = justifierAdequation({
      competencesCommunes: ['excel'],
      competencesManquantes: [],
      totalRequises: 3
    });
    assert.equal(phrase, 'Tu maitrises 1 des 3 competences essentielles de ce poste (excel).');
  });

  test('sans reference chiffree, on prefere se taire', () => {
    assert.equal(justifierAdequation({}), '');
    assert.equal(justifierAdequation(), '');
    assert.equal(justifierAdequation({ competencesCommunes: [], competencesManquantes: [], totalRequises: 0 }), '');
  });

  test('un total incoherent est corrige plutot que recopie', () => {
    const phrase = justifierAdequation({
      competencesCommunes: ['a', 'b', 'c'],
      competencesManquantes: ['d'],
      totalRequises: 2
    });
    assert.ok(phrase.includes('des 4 competences'), phrase);
  });

  test('une seule competence attendue et elle manque', () => {
    const phrase = justifierAdequation({
      competencesCommunes: [],
      competencesManquantes: ['caces'],
      totalRequises: 1,
      intituleMetier: 'cariste'
    });
    assert.equal(phrase, "La competence essentielle du metier de cariste (caces) n'apparait pas dans ton profil.");
  });

  test('resumerEcart nomme les priorites', () => {
    assert.equal(
      resumerEcart({ competencesManquantes: ['docker', 'kubernetes'] }),
      'Pour viser ce poste, concentre-toi sur docker et kubernetes.'
    );
    assert.equal(
      resumerEcart({ competencesManquantes: ['habilitation electrique'] }),
      'Pour viser ce poste, concentre-toi sur habilitation electrique.'
    );
  });

  test('resumerEcart ne propose jamais huit priorites', () => {
    const phrase = resumerEcart({ competencesManquantes: ['a', 'b', 'c', 'd', 'e', 'f'] });
    assert.equal(phrase, 'Pour viser ce poste, concentre-toi sur a, b, c et 3 autres.');
  });

  test('resumerEcart sans ecart', () => {
    assert.equal(resumerEcart({ competencesManquantes: [] }), 'Ton profil couvre deja les competences essentielles de ce poste.');
    assert.equal(resumerEcart({}), 'Ton profil couvre deja les competences essentielles de ce poste.');
    assert.equal(resumerEcart(), 'Ton profil couvre deja les competences essentielles de ce poste.');
  });

  test('les entrees sales ne produisent pas de phrase sale', () => {
    const phrase = justifierAdequation({
      competencesCommunes: ['react', '', '  ', null, 'React', 'docker'],
      competencesManquantes: [undefined, 'sql'],
      totalRequises: 3,
      intituleMetier: '  '
    });
    // « React » est un doublon de « react » (casse ignoree), les vides sautent.
    assert.equal(phrase, 'Tu maitrises 2 des 3 competences essentielles de ce poste (react, docker).');
  });

  test('formaterListe couvre les tailles limites', () => {
    assert.equal(formaterListe([]), '');
    assert.equal(formaterListe(['a']), 'a');
    assert.equal(formaterListe(['a', 'b']), 'a et b');
    assert.equal(formaterListe(['a', 'b', 'c']), 'a, b et c');
    // Six elements pour un maximum de cinq : on montre tout plutot que
    // d'ecrire « et 1 autre ».
    assert.equal(formaterListe(['a', 'b', 'c', 'd', 'e', 'f']), 'a, b, c, d, e et f');
    assert.equal(formaterListe(['a', 'b', 'c', 'd', 'e', 'f', 'g']), 'a, b, c, d, e et 2 autres');
  });

  test('formaterEnumeration separe par des virgules, sans "et" final', () => {
    // Entre parentheses on enumere des etiquettes : "(react, docker)".
    assert.equal(formaterEnumeration(['react', 'docker']), 'react, docker');
    assert.equal(formaterEnumeration(['react']), 'react');
    assert.equal(formaterEnumeration([]), '');
    assert.equal(formaterEnumeration(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']), 'a, b, c, d, e et 3 autres');
  });

  test('aucune phrase ne laisse de marqueur de gabarit', () => {
    const phrases = [
      justifierAdequation({ competencesCommunes: ['a'], competencesManquantes: ['b'], totalRequises: 2 }),
      justifierAdequation({ competencesCommunes: [], competencesManquantes: ['b'], totalRequises: 5 }),
      resumerEcart({ competencesManquantes: ['b'] }),
      resumerEcart({})
    ];
    for (const phrase of phrases) {
      assert.ok(!AUCUN_MARQUEUR.test(phrase), phrase);
    }
  });
});

/* ================================================================== */
describe('jours ouvres et feries francais', () => {
  /* ================================================================ */

  test('Paques tombe bien la ou l almanach le dit', () => {
    assert.deepEqual(calculerPaques(2026), new Date(2026, 3, 5));   // 5 avril 2026
    assert.deepEqual(calculerPaques(2027), new Date(2027, 2, 28));  // 28 mars 2027
    assert.deepEqual(calculerPaques(2024), new Date(2024, 2, 31));  // 31 mars 2024
    assert.deepEqual(calculerPaques(2025), new Date(2025, 3, 20));  // 20 avril 2025
  });

  test('il y a exactement 11 feries', () => {
    for (const annee of [2024, 2025, 2026, 2027]) {
      assert.equal(feriesFrancais(annee).length, 11, String(annee));
    }
  });

  test('les feries 2026 sont les bons', () => {
    const attendus = [
      '2026-01-01', // Jour de l'an
      '2026-04-06', // Lundi de Paques (5 avril + 1)
      '2026-05-01', // Fete du travail
      '2026-05-08', // Victoire 1945
      '2026-05-14', // Ascension (5 avril + 39)
      '2026-05-25', // Lundi de Pentecote (5 avril + 50)
      '2026-07-14', // Fete nationale
      '2026-08-15', // Assomption
      '2026-11-01', // Toussaint
      '2026-11-11', // Armistice
      '2026-12-25'  // Noel
    ];
    assert.deepEqual(feriesFrancais(2026).map(enIso), attendus);
  });

  test('la liste renvoyee ne peut pas etre corrompue par l appelant', () => {
    const feries = feriesFrancais(2026);
    feries[0].setFullYear(1900);
    assert.equal(enIso(feriesFrancais(2026)[0]), '2026-01-01');
  });

  test('un week-end n est pas un jour ouvre', () => {
    assert.equal(estJourOuvre(new Date(2026, 7, 8)), false);  // samedi
    assert.equal(estJourOuvre(new Date(2026, 7, 9)), false);  // dimanche
    assert.equal(estJourOuvre(new Date(2026, 7, 10)), true);  // lundi
  });

  test('un ferie n est pas un jour ouvre', () => {
    assert.equal(estJourOuvre(new Date(2026, 6, 14)), false); // 14 juillet, un mardi
    assert.equal(estJourOuvre(new Date(2026, 4, 14)), false); // Ascension, un jeudi
    assert.equal(estJourOuvre(new Date(2026, 6, 13)), true);  // la veille
  });

  test('le 8 aout 2026 est un samedi : prochainJourOuvre renvoie lundi 10', () => {
    const samedi = new Date(2026, 7, 8);
    assert.equal(samedi.getDay(), 6, 'le 8 aout 2026 doit bien etre un samedi');
    assert.equal(enIso(prochainJourOuvre(samedi)), '2026-08-10');
  });

  test('prochainJourOuvre renvoie la date elle-meme si elle est deja ouvree', () => {
    assert.equal(enIso(prochainJourOuvre(new Date(2026, 7, 10))), '2026-08-10');
  });

  test('prochainJourOuvre saute aussi les feries', () => {
    // Vendredi 1er mai 2026 est ferie : le prochain jour ouvre est le lundi 4.
    assert.equal(enIso(prochainJourOuvre(new Date(2026, 4, 1))), '2026-05-04');
  });

  test('prochainJourOuvre ne modifie pas la date qu on lui donne', () => {
    const samedi = new Date(2026, 7, 8);
    prochainJourOuvre(samedi);
    assert.equal(enIso(samedi), '2026-08-08');
  });

  test('ajouterJoursOuvres saute les week-ends', () => {
    // Du vendredi 7 aout 2026, +1 jour ouvre = lundi 10.
    assert.equal(enIso(ajouterJoursOuvres(new Date(2026, 7, 7), 1)), '2026-08-10');
    // +8 jours ouvres depuis le lundi 3 aout = jeudi 13.
    assert.equal(enIso(ajouterJoursOuvres(new Date(2026, 7, 3), 8)), '2026-08-13');
  });

  test('ajouterJoursOuvres saute les feries', () => {
    // Du jeudi 30 avril 2026 : le 1er mai est ferie, le 2 et 3 un week-end.
    assert.equal(enIso(ajouterJoursOuvres(new Date(2026, 3, 30), 1)), '2026-05-04');
  });

  test('ajouterJoursOuvres accepte zero et les valeurs negatives', () => {
    assert.equal(enIso(ajouterJoursOuvres(new Date(2026, 7, 8), 0)), '2026-08-08');
    assert.equal(enIso(ajouterJoursOuvres(new Date(2026, 7, 10), -1)), '2026-08-07');
  });

  test('l heure de la journee est conservee', () => {
    const depart = new Date(2026, 7, 7, 14, 30);
    assert.equal(ajouterJoursOuvres(depart, 1).getHours(), 14);
    assert.equal(prochainJourOuvre(new Date(2026, 7, 8, 9, 15)).getHours(), 9);
  });

  test('le scenario reel : une relance a J+8 ne tombe jamais un jour creux', () => {
    // On balaie une annee entiere d'envois possibles.
    for (let i = 0; i < 365; i += 1) {
      const envoi = new Date(2026, 0, 1 + i);
      const relance = prochainJourOuvre(ajouterJoursOuvres(envoi, 8));
      assert.ok(estJourOuvre(relance), `envoi ${enIso(envoi)} -> relance ${enIso(relance)}`);
    }
  });

  test('une date invalide est refusee franchement', () => {
    assert.throws(() => estJourOuvre('pas une date'), TypeError);
    assert.throws(() => estJourOuvre(null), TypeError);
    assert.throws(() => feriesFrancais(1200), TypeError);
    assert.throws(() => feriesFrancais('2026'), TypeError);
  });

  test('une date ISO en chaine est acceptee', () => {
    assert.equal(enIso(prochainJourOuvre('2026-08-08T10:00:00')), '2026-08-10');
  });
});

/* ------------------------------------------------------------------ */

function compterMots(texte) {
  return texte.split(/\s+/).filter(Boolean).length;
}

/** Jour local au format AAAA-MM-JJ (toISOString basculerait en UTC). */
function enIso(date) {
  const mois = String(date.getMonth() + 1).padStart(2, '0');
  const jour = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mois}-${jour}`;
}
