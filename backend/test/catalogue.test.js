const test = require('node:test');
const assert = require('node:assert');

const {
  verifieLe,
  ROLES,
  ADAPTATEURS,
  fournisseurs,
  fournisseur,
  modele,
  tarif,
  modelesPourRole
} = require('../src/llm/providers');

/**
 * Ces tests ne verifient pas du code : ils verifient de la DONNEE.
 *
 * Le catalogue est le fichier qu'on modifiera le plus souvent — a chaque
 * nouveau fournisseur, a chaque changement de tarif. Une faute de frappe dans
 * un identifiant d'adaptateur ou un tarif oublie ne se voit pas a la lecture,
 * mais donne une erreur incomprehensible a l'utilisateur en pleine candidature.
 * Ces tests sont le filet.
 */

const TOUS = fournisseurs();

// Un fournisseur local (Ollama, LM Studio) ne peut pas connaitre ses modeles a
// l'avance : ils dependent de ce que l'utilisateur a telecharge. Idem pour
// l'entree « personnalise », ou l'utilisateur saisit tout lui-meme. Ces deux
// cas sont exemptes des regles portant sur la liste de modeles.
const sansListeStatique = (f) => f.local || f.id === 'personnalise';

// ---------------------------------------------------------------------------
// Le module lui-meme
// ---------------------------------------------------------------------------

test('la date de verification des tarifs est presente et lisible', () => {
  // Sans cette date, personne ne sait si les prix affiches datent d'hier ou
  // d'il y a deux ans.
  assert.match(verifieLe, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!Number.isNaN(Date.parse(verifieLe)), `date invalide : ${verifieLe}`);
});

test('le catalogue n\'est pas vide et couvre les fournisseurs attendus', () => {
  assert.ok(TOUS.length >= 15, `seulement ${TOUS.length} fournisseurs`);

  const attendus = [
    'openai', 'anthropic', 'google', 'moonshot', 'mistral', 'deepseek',
    'xai', 'groq', 'together', 'fireworks', 'cerebras', 'openrouter',
    'ollama', 'lmstudio', 'llamacpp', 'personnalise'
  ];
  const presents = TOUS.map((f) => f.id);
  attendus.forEach((id) => {
    assert.ok(presents.includes(id), `fournisseur manquant : ${id}`);
  });
});

test('le catalogue est gele : personne ne peut l\'abimer en cours de route', () => {
  // Le module est un singleton. Une mutation accidentelle contaminerait tout
  // le processus jusqu'au redemarrage.
  assert.ok(Object.isFrozen(TOUS));
  TOUS.forEach((f) => {
    assert.ok(Object.isFrozen(f), `${f.id} n'est pas gele`);
    assert.ok(Object.isFrozen(f.modeles), `les modeles de ${f.id} ne sont pas geles`);
    f.modeles.forEach((m) => {
      assert.ok(Object.isFrozen(m), `${f.id}/${m.id} n'est pas gele`);
    });
  });
});

// ---------------------------------------------------------------------------
// Chaque entree du catalogue est complete
// ---------------------------------------------------------------------------

test('aucune entree n\'a de champ manquant', () => {
  const CHAMPS = [
    'id', 'nom', 'adaptateur', 'baseURL', 'cleRequise', 'urlCle',
    'prefixeCle', 'local', 'paliergratuit', 'listageDynamique', 'note', 'modeles'
  ];

  TOUS.forEach((f) => {
    CHAMPS.forEach((champ) => {
      // hasOwnProperty et pas `f[champ] !== undefined` : un champ present mais
      // volontairement a null (prefixeCle, urlCle) est valide, un champ oublie
      // ne l'est pas. La distinction compte.
      assert.ok(
        Object.prototype.hasOwnProperty.call(f, champ),
        `${f.id} : champ « ${champ} » manquant`
      );
    });
  });
});

test('les champs des fournisseurs ont le bon type', () => {
  TOUS.forEach((f) => {
    assert.equal(typeof f.id, 'string', `${f.id} : id doit etre une chaine`);
    assert.ok(f.id.length > 0, 'un id vide');
    assert.equal(typeof f.nom, 'string', `${f.id} : nom doit etre une chaine`);
    assert.ok(f.nom.length > 0, `${f.id} : nom vide`);
    assert.equal(typeof f.cleRequise, 'boolean', `${f.id} : cleRequise`);
    assert.equal(typeof f.local, 'boolean', `${f.id} : local`);
    assert.equal(typeof f.paliergratuit, 'boolean', `${f.id} : paliergratuit`);
    assert.equal(typeof f.listageDynamique, 'boolean', `${f.id} : listageDynamique`);
    assert.equal(typeof f.note, 'string', `${f.id} : note doit etre une chaine (vide si rien a dire)`);
    assert.ok(Array.isArray(f.modeles), `${f.id} : modeles doit etre un tableau`);

    // null est une valeur legitime : un fournisseur local n'a pas de page de
    // creation de cle, et tous n'imposent pas un prefixe.
    assert.ok(
      f.urlCle === null || typeof f.urlCle === 'string',
      `${f.id} : urlCle doit etre une chaine ou null`
    );
    assert.ok(
      f.prefixeCle === null || typeof f.prefixeCle === 'string',
      `${f.id} : prefixeCle doit etre une chaine ou null`
    );
  });
});

test('les identifiants de fournisseurs sont uniques', () => {
  // Deux entrees avec le meme id : la seconde serait invisible, silencieusement.
  const ids = TOUS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, `doublon parmi : ${ids.join(', ')}`);
});

test('tous les adaptateurs references existent parmi les trois prevus', () => {
  // C'est LE test qui rattrape la faute de frappe la plus couteuse :
  // "openai-compatibl" donnerait un plantage au premier appel, pas ici.
  TOUS.forEach((f) => {
    assert.ok(
      ADAPTATEURS.includes(f.adaptateur),
      `${f.id} reference un adaptateur inconnu : « ${f.adaptateur} »`
    );
  });
});

test('les adresses de base sont des URL exploitables', () => {
  TOUS.forEach((f) => {
    if (f.baseURL === null) {
      // Seule l'entree « personnalise » a le droit de ne pas avoir d'adresse :
      // c'est l'utilisateur qui la saisit.
      assert.equal(f.id, 'personnalise', `${f.id} : baseURL a null sans raison`);
      return;
    }

    assert.equal(typeof f.baseURL, 'string', `${f.id} : baseURL`);
    const url = new URL(f.baseURL); // leve si l'adresse est malformee
    assert.ok(['http:', 'https:'].includes(url.protocol), `${f.id} : protocole ${url.protocol}`);
    assert.ok(!f.baseURL.endsWith('/'), `${f.id} : baseURL ne doit pas finir par « / »`);

    if (f.local) {
      // Un fournisseur declare local qui pointe vers Internet serait un
      // mensonge grave : l'utilisateur choisit « local » precisement pour que
      // son CV ne sorte pas de sa machine.
      assert.ok(
        ['localhost', '127.0.0.1', '::1'].includes(url.hostname),
        `${f.id} est declare local mais pointe vers ${url.hostname}`
      );
    } else {
      // A l'inverse, une cle API envoyee en clair sur du HTTP serait une fuite.
      assert.equal(url.protocol, 'https:', `${f.id} : un fournisseur distant doit etre en HTTPS`);
    }
  });
});

test('une cle n\'est facultative que chez les locaux et le personnalise', () => {
  TOUS.forEach((f) => {
    if (!f.cleRequise) {
      assert.ok(
        sansListeStatique(f),
        `${f.id} : cleRequise a false alors que le fournisseur est distant`
      );
    } else {
      // Si on exige une cle, on doit dire ou la creer, sinon l'utilisateur est
      // bloque sans savoir quoi faire.
      assert.ok(
        typeof f.urlCle === 'string' && f.urlCle.startsWith('https://'),
        `${f.id} exige une cle mais n'indique pas ou la creer`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Les modeles
// ---------------------------------------------------------------------------

test('aucun modele n\'a de champ manquant', () => {
  const CHAMPS = ['id', 'nom', 'entree', 'sortie', 'contexte', 'roles'];

  TOUS.forEach((f) => {
    f.modeles.forEach((m) => {
      CHAMPS.forEach((champ) => {
        assert.ok(
          Object.prototype.hasOwnProperty.call(m, champ),
          `${f.id}/${m.id} : champ « ${champ} » manquant`
        );
      });
      assert.equal(typeof m.id, 'string', `${f.id} : un id de modele non-chaine`);
      assert.ok(m.id.length > 0, `${f.id} : un id de modele vide`);
      assert.equal(typeof m.nom, 'string', `${f.id}/${m.id} : nom`);
      assert.ok(m.nom.length > 0, `${f.id}/${m.id} : nom vide`);
    });
  });
});

test('les identifiants de modeles sont uniques chez chaque fournisseur', () => {
  TOUS.forEach((f) => {
    const ids = f.modeles.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length, `${f.id} : doublon dans ${ids.join(', ')}`);
  });
});

test('les tarifs sont des nombres positifs', () => {
  TOUS.forEach((f) => {
    f.modeles.forEach((m) => {
      [['entree', m.entree], ['sortie', m.sortie]].forEach(([nom, valeur]) => {
        assert.equal(typeof valeur, 'number', `${f.id}/${m.id} : ${nom} n'est pas un nombre`);
        // Number.isFinite ecarte NaN et Infinity, qui contamineraient tout
        // calcul de cout en aval sans jamais lever d'erreur.
        assert.ok(Number.isFinite(valeur), `${f.id}/${m.id} : ${nom} vaut ${valeur}`);
        assert.ok(valeur > 0, `${f.id}/${m.id} : ${nom} doit etre strictement positif`);
      });

      // Un tarif de sortie inferieur au tarif d'entree existe (Ministral), mais
      // un ecart de plus de 100x trahit presque toujours une virgule mal placee.
      assert.ok(
        m.sortie / m.entree < 100,
        `${f.id}/${m.id} : ecart entree/sortie suspect (${m.entree} / ${m.sortie})`
      );
    });
  });
});

test('les fenetres de contexte sont des entiers plausibles', () => {
  TOUS.forEach((f) => {
    f.modeles.forEach((m) => {
      assert.ok(Number.isInteger(m.contexte), `${f.id}/${m.id} : contexte non entier`);
      // 8k est le plancher raisonnable : un CV plus une offre d'emploi ne
      // tiennent pas en dessous. 10M est un plafond de garde-fou.
      assert.ok(m.contexte >= 8000, `${f.id}/${m.id} : contexte trop petit (${m.contexte})`);
      assert.ok(m.contexte <= 10000000, `${f.id}/${m.id} : contexte invraisemblable (${m.contexte})`);
    });
  });
});

test('chaque modele declare au moins un role, et uniquement des roles connus', () => {
  TOUS.forEach((f) => {
    f.modeles.forEach((m) => {
      assert.ok(Array.isArray(m.roles), `${f.id}/${m.id} : roles doit etre un tableau`);
      assert.ok(m.roles.length > 0, `${f.id}/${m.id} : aucun role — le modele serait inutilisable`);
      m.roles.forEach((role) => {
        assert.ok(ROLES.includes(role), `${f.id}/${m.id} : role inconnu « ${role} »`);
      });
      assert.equal(new Set(m.roles).size, m.roles.length, `${f.id}/${m.id} : role en double`);
    });
  });
});

test('chaque fournisseur a au moins un modele par role', () => {
  // Sinon l'interface afficherait un menu vide pour l'un des deux usages, et
  // l'utilisateur croirait que le fournisseur est casse.
  TOUS.forEach((f) => {
    if (sansListeStatique(f)) return;

    ROLES.forEach((role) => {
      const dispos = f.modeles.filter((m) => m.roles.includes(role));
      assert.ok(dispos.length > 0, `${f.id} : aucun modele pour le role « ${role} »`);
    });
  });
});

test('un fournisseur sans liste statique sait lister ses modeles en direct', () => {
  // C'est la contrepartie indispensable : si le catalogue ne peut pas connaitre
  // les modeles, l'adaptateur DOIT pouvoir aller les demander. Sinon
  // l'utilisateur se retrouve devant un menu vide, sans recours.
  TOUS.forEach((f) => {
    if (f.modeles.length === 0) {
      assert.ok(
        f.listageDynamique,
        `${f.id} n'a aucun modele et ne sait pas les lister : impasse pour l'utilisateur`
      );
    }
  });
});

test('les fournisseurs locaux sont annonces comme gratuits', () => {
  // Un modele qui tourne sur la machine de l'utilisateur ne coute rien par
  // requete. C'est l'argument principal pour proteger un CV : il doit etre vrai.
  TOUS.forEach((f) => {
    if (f.local) {
      assert.equal(f.paliergratuit, true, `${f.id} est local mais pas marque gratuit`);
      assert.equal(f.cleRequise, false, `${f.id} est local mais reclame une cle`);
    }
  });
});

// ---------------------------------------------------------------------------
// Les fonctions de lecture
// ---------------------------------------------------------------------------

test('fournisseur() retrouve une entree par son identifiant', () => {
  const openai = fournisseur('openai');
  assert.ok(openai);
  assert.equal(openai.nom, 'OpenAI');
  assert.equal(openai.adaptateur, 'openai-compatible');
});

test('les trois adaptateurs sont effectivement utilises', () => {
  // Anthropic et Google ont des adaptateurs natifs ecrits a part : si personne
  // ne les reference, c'est que le catalogue les a rates.
  assert.equal(fournisseur('anthropic').adaptateur, 'anthropic');
  assert.equal(fournisseur('google').adaptateur, 'google');
  assert.equal(fournisseur('mistral').adaptateur, 'openai-compatible');
});

test('modele() retrouve un modele precis', () => {
  const m = modele('anthropic', 'claude-opus-5');
  assert.ok(m);
  assert.equal(m.entree, 5.00);
  assert.equal(m.sortie, 25.00);
});

test('tarif() renvoie les deux prix, ou null si on ne les connait pas', () => {
  assert.deepEqual(tarif('openai', 'gpt-5.6-luna'), { entree: 0.20, sortie: 1.20 });

  // Modele inconnu chez un fournisseur connu.
  assert.equal(tarif('openai', 'gpt-inexistant'), null);
  // Fournisseur inconnu.
  assert.equal(tarif('fournisseur-imaginaire', 'gpt-5.6-luna'), null);
  // Fournisseur local : la liste statique est vide, donc aucun tarif connu.
  // C'est le comportement attendu, pas un bug.
  assert.equal(tarif('ollama', 'llama3.2'), null);
});

test('modelesPourRole() filtre correctement', () => {
  const redaction = modelesPourRole('anthropic', 'redaction');
  const extraction = modelesPourRole('anthropic', 'extraction');

  assert.ok(redaction.length > 0);
  assert.ok(extraction.length > 0);
  redaction.forEach((m) => assert.ok(m.roles.includes('redaction')));
  extraction.forEach((m) => assert.ok(m.roles.includes('extraction')));

  // Sonnet porte les deux roles : il doit apparaitre dans les deux listes.
  const dansLesDeux = redaction.filter((m) => extraction.some((x) => x.id === m.id));
  assert.ok(dansLesDeux.length > 0, 'aucun modele polyvalent chez Anthropic');
});

test('modelesPourRole() renvoie un tableau vide plutot que de lever', () => {
  assert.deepEqual(modelesPourRole('openai', 'traduction'), []);
  assert.deepEqual(modelesPourRole('fournisseur-imaginaire', 'redaction'), []);
  assert.deepEqual(modelesPourRole('ollama', 'redaction'), []);
});

// ---------------------------------------------------------------------------
// Robustesse : ces identifiants viennent du navigateur
// ---------------------------------------------------------------------------

test('les lectures ne levent jamais, quoi qu\'on leur passe', () => {
  // Ces valeurs arrivent d'un formulaire ou d'une requete HTTP. Une exception
  // ici ferait tomber la route entiere ; on veut un null poli.
  const HOSTILES = [
    undefined, null, '', 0, 42, true, {}, [], () => {},
    // Les cles heritees d'Object.prototype : sur une recherche par cle
    // (`MAP[id]`) elles remonteraient une fonction au lieu de rien.
    '__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty'
  ];

  HOSTILES.forEach((valeur) => {
    assert.equal(fournisseur(valeur), null, `fournisseur(${String(valeur)})`);
    assert.equal(modele(valeur, valeur), null, `modele(${String(valeur)})`);
    assert.equal(tarif(valeur, valeur), null, `tarif(${String(valeur)})`);
    assert.deepEqual(modelesPourRole(valeur, valeur), [], `modelesPourRole(${String(valeur)})`);

    // Et avec un fournisseur valide mais un modele/role hostile.
    assert.equal(modele('openai', valeur), null, `modele('openai', ${String(valeur)})`);
    assert.equal(tarif('openai', valeur), null, `tarif('openai', ${String(valeur)})`);
    assert.deepEqual(modelesPourRole('openai', valeur), [], `modelesPourRole('openai', ${String(valeur)})`);
  });
});

test('aucune cle API ni secret ne traine dans le catalogue', () => {
  // Le catalogue part vers le navigateur pour remplir les menus. On verifie
  // qu'il ne contient que des adresses publiques et des tarifs — jamais une
  // cle collee la par erreur pendant un test.
  const brut = JSON.stringify(TOUS);
  assert.ok(!/sk-[A-Za-z0-9]{16,}/.test(brut), 'une cle OpenAI/Anthropic semble presente');
  assert.ok(!/AIza[A-Za-z0-9_-]{20,}/.test(brut), 'une cle Google semble presente');
  assert.ok(!/gsk_[A-Za-z0-9]{16,}/.test(brut), 'une cle Groq semble presente');
  assert.ok(!/xai-[A-Za-z0-9]{16,}/.test(brut), 'une cle xAI semble presente');
});
