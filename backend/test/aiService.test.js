/**
 * Le service qui appelle le modele, teste SANS reseau et SANS aucune cle.
 *
 * POURQUOI CE FICHIER
 * aiService est le seul point du projet qui parle a un fournisseur d'IA.
 * Depuis que l'utilisateur choisit lui-meme son fournisseur et son modele,
 * ce fichier doit repondre a des questions qui n'ont rien d'evident :
 *   - le role « redaction » designe-t-il bien le modele choisi pour ecrire ?
 *   - que se passe-t-il quand rien n'est configure (le cas de tout nouvel
 *     utilisateur) : est-ce qu'on explique ou aller, ou est-ce qu'on plante ?
 *   - le cout est-il calcule avec les tarifs du BON fournisseur ?
 *   - si l'utilisateur change de modele pendant que le serveur tourne, le
 *     changement est-il pris en compte sans redemarrage ?
 *
 * Tout passe par un FAUX adaptateur : ces tests doivent tourner en
 * integration continue, ou il n'y a ni cle ni internet.
 */

// Avant tout require : le service peut retomber sur le .env, et un
// OPENAI_API_KEY trainant dans le shell du developpeur rendrait les tests
// « rien n'est configure » verts chez l'un et rouges chez l'autre.
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_BASE_URL;

// Le service journalise le cout de chaque appel : utile en vrai, bruyant ici.
process.env.LOG_LEVEL = 'error';

const test = require('node:test');
const assert = require('node:assert');

const fs = require('fs');
const os = require('os');
const path = require('path');

const ai = require('../src/services/aiService');
const cout = require('../src/llm/cout');
const config = require('../src/config');
const configUtilisateur = require('../src/llm/configUtilisateur');

/* ------------------------------------------------------------------ */
/* Outillage                                                           */
/* ------------------------------------------------------------------ */

/**
 * Un adaptateur qui n'appelle personne : il note ce qu'on lui demande et
 * rend les reponses prevues d'avance, dans l'ordre.
 */
function fauxAdaptateur(reponses = ['reponse du modele']) {
  const file = [...reponses];
  const appels = [];

  return {
    id: 'faux',
    appels,
    async completer(options) {
      appels.push(options);
      const prevu = file.length > 1 ? file.shift() : file[0];

      if (prevu instanceof Error) throw prevu;
      if (typeof prevu === 'string') {
        return { texte: prevu, usage: { tokensEntree: 0, tokensSortie: 0 }, modele: options.modele };
      }
      return {
        texte: prevu.texte !== undefined ? prevu.texte : '',
        usage: prevu.usage || { tokensEntree: 0, tokensSortie: 0 },
        modele: prevu.modele || options.modele
      };
    },
    async listerModeles() {
      return null;
    }
  };
}

/** Branche une configuration et un faux adaptateur, et rend l'adaptateur. */
function brancher(configuration, reponses) {
  const faux = fauxAdaptateur(reponses);
  ai._utiliserConfiguration(() => configuration);
  ai._utiliserAdaptateur(faux);
  return faux;
}

const CONFIG_ANTHROPIC = {
  fournisseur: 'anthropic',
  cleApi: 'sk-ant-cle-de-test-0123456789',
  modeles: { redaction: 'claude-opus-5', extraction: 'claude-haiku-4-5' }
};

test.beforeEach(() => {
  cout.reinitialiser();
});

test.afterEach(() => {
  // On rend le service a son etat normal : les tests suivants partagent le
  // meme processus.
  ai._utiliserConfiguration(null);
  ai._utiliserAdaptateur(null);
});

/* ------------------------------------------------------------------ */
/* 1. Le role est bien traduit en modele                               */
/* ------------------------------------------------------------------ */

test('le role « redaction » appelle le modele choisi pour ecrire', async () => {
  const faux = brancher(CONFIG_ANTHROPIC, ['une belle lettre']);

  const texte = await ai.generate('Ecris une lettre', { role: 'redaction', temperature: 0.7 });

  assert.equal(texte, 'une belle lettre');
  assert.equal(faux.appels.length, 1);
  assert.equal(faux.appels[0].modele, 'claude-opus-5');
  assert.equal(faux.appels[0].temperature, 0.7);
  assert.equal(faux.appels[0].baseURL, 'https://api.anthropic.com', 'adresse issue du catalogue');
  assert.equal(faux.appels[0].jsonMode, false);
});

test('le role « extraction » appelle le modele rapide', async () => {
  const faux = brancher(CONFIG_ANTHROPIC, ['ok']);

  await ai.generate('Structure ce CV', { role: 'extraction' });

  assert.equal(faux.appels[0].modele, 'claude-haiku-4-5');
  assert.equal(faux.appels[0].temperature, 0.2, 'stabilite par defaut, pas 1.0');
});

test('un role farfelu retombe sur le modele economique', async () => {
  // « constructor » existe sur tout objet JavaScript : interroge naivement,
  // un dictionnaire de modeles rendrait une fonction en guise de nom.
  const faux = brancher(CONFIG_ANTHROPIC, ['ok']);

  await ai.generate('Bonjour', { role: 'constructor' });

  assert.equal(faux.appels[0].modele, 'claude-haiku-4-5');
});

test('un nom de modele explicite l emporte sur le role', async () => {
  const faux = brancher(CONFIG_ANTHROPIC, ['ok']);

  await ai.generate('Bonjour', { role: 'redaction', model: 'claude-sonnet-5' });

  assert.equal(faux.appels[0].modele, 'claude-sonnet-5');
});

test('sans role precise, on retombe sur le modele d extraction', async () => {
  const faux = brancher(CONFIG_ANTHROPIC, ['ok']);

  await ai.generate('Bonjour');

  assert.equal(faux.appels[0].modele, 'claude-haiku-4-5');
});

test('un fournisseur qui n a qu un seul modele configure le sert pour tout', async () => {
  const faux = brancher({
    fournisseur: 'mistral',
    cleApi: 'cle-mistral',
    modeles: { extraction: 'mistral-small-4' }
  }, ['ok']);

  await ai.generate('Ecris', { role: 'redaction' });

  assert.equal(faux.appels[0].modele, 'mistral-small-4');
  assert.equal(faux.appels[0].baseURL, 'https://api.mistral.ai/v1');
});

/* ------------------------------------------------------------------ */
/* 2. Rien n'est configure : le cas de tout nouvel utilisateur         */
/* ------------------------------------------------------------------ */

test('sans aucune configuration, estDisponible dit non au lieu de planter', () => {
  ai._utiliserConfiguration(() => null);
  ai._utiliserAdaptateur(null);

  assert.equal(ai.estDisponible(), false);
});

test('sans configuration, l erreur dit OU aller la faire', async () => {
  ai._utiliserConfiguration(() => null);

  await assert.rejects(
    () => ai.generate('Bonjour'),
    (erreur) => {
      assert.equal(erreur.code, 'IA_NON_CONFIGUREE', 'code attendu par routes/erreursIa.js');
      assert.match(erreur.message, /Parametres/, 'on nomme l ecran ou aller');
      assert.match(erreur.message, /fournisseur/i);
      // Un message lisible par quelqu'un qui ne programme pas : pas de
      // nom de variable d'environnement, pas de trace de pile.
      assert.doesNotMatch(erreur.message, /undefined|null|Error:/);
      return true;
    }
  );
});

test('une cle manquante chez un fournisseur qui en exige une est expliquee', async () => {
  ai._utiliserConfiguration(() => ({
    fournisseur: 'openai',
    modeles: { extraction: 'gpt-5.6-luna' }
  }));

  assert.equal(ai.estDisponible(), false);
  await assert.rejects(() => ai.generate('Bonjour'), (erreur) => {
    assert.equal(erreur.code, 'IA_NON_CONFIGUREE');
    assert.match(erreur.message, /cle API/i);
    assert.match(erreur.message, /OpenAI/);
    return true;
  });
});

test('un fournisseur local marche sans la moindre cle', async () => {
  const faux = brancher({
    fournisseur: 'ollama',
    modeles: { redaction: 'llama3.2', extraction: 'llama3.2' }
  }, ['ok']);

  assert.equal(ai.estDisponible(), true);
  await ai.generate('Bonjour', { role: 'redaction' });

  assert.equal(faux.appels[0].baseURL, 'http://localhost:11434/v1');
  assert.equal(faux.appels[0].cleApi, '', 'aucune cle inventee');
});

test('un fournisseur inconnu du catalogue est signale sans planter', async () => {
  ai._utiliserConfiguration(() => ({
    fournisseur: 'fournisseur-imaginaire',
    cleApi: 'cle',
    modeles: { extraction: 'modele-x' }
  }));

  assert.equal(ai.estDisponible(), false);
  await assert.rejects(() => ai.generate('Bonjour'), /n'existe pas dans la liste de Mew/);
});

test('un fournisseur inconnu MAIS avec une adresse reste utilisable', async () => {
  // Un proxy d'entreprise, un service tout neuf, un serveur perso : aucun
  // modele ne doit etre hors de portee.
  const faux = brancher({
    fournisseur: 'mon-proxy-maison',
    adaptateur: 'openai-compatible',
    baseURL: 'https://ia.mon-entreprise.fr/v1',
    modeles: { extraction: 'modele-maison' }
  }, ['ok']);

  assert.equal(ai.estDisponible(), true);
  await ai.generate('Bonjour');

  assert.equal(faux.appels[0].baseURL, 'https://ia.mon-entreprise.fr/v1');
  assert.equal(faux.appels[0].modele, 'modele-maison');
  assert.equal(cout.cumul().eur, 0, 'tarif inconnu : zero, pas une invention');
});

test('un fournisseur configure mais sans modele choisi est signale', () => {
  // Ollama sans modele : le catalogue ne peut pas deviner ce qui est
  // telecharge sur la machine de l'utilisateur.
  ai._utiliserConfiguration(() => ({ fournisseur: 'ollama' }));
  assert.equal(ai.estDisponible(), false);
});

/* ------------------------------------------------------------------ */
/* 3. Le cout, avec les tarifs du BON fournisseur                       */
/* ------------------------------------------------------------------ */

test('le cout utilise les tarifs du fournisseur reellement appele', async () => {
  brancher({
    fournisseur: 'anthropic',
    cleApi: 'sk-ant-test',
    modeles: { redaction: 'claude-sonnet-5' }
  }, [{ texte: 'ok', usage: { tokensEntree: 1_000_000, tokensSortie: 0 } }]);

  await ai.generate('Ecris', { role: 'redaction' });

  const total = cout.cumul();
  assert.equal(total.appels, 1);
  assert.equal(total.tokensEntree, 1_000_000);
  // claude-sonnet-5 : 3,00 $ / million en entree -> 3 x 0,92 = 2,76 EUR
  assert.equal(total.eur, 2.76);
});

test('deux fournisseurs, deux grilles de prix', async () => {
  brancher({
    fournisseur: 'groq',
    cleApi: 'gsk_test',
    modeles: { extraction: 'llama-3.1-8b-instant' }
  }, [{ texte: 'ok', usage: { tokensEntree: 1_000_000, tokensSortie: 1_000_000 } }]);

  await ai.generate('Analyse', { role: 'extraction' });

  // 0,05 $ en entree + 0,08 $ en sortie = 0,13 $ -> 0,1196 EUR
  assert.equal(cout.cumul().eur, 0.1196);
});

test('un modele local ne coute rien, meme s il porte un nom connu ailleurs', async () => {
  // « gpt-oss-120b » est facture chez Cerebras. Sur la machine de
  // l'utilisateur, il ne coute rien : zero est la bonne reponse.
  brancher({
    fournisseur: 'ollama',
    modeles: { extraction: 'gpt-oss-120b' }
  }, [{ texte: 'ok', usage: { tokensEntree: 500_000, tokensSortie: 500_000 } }]);

  await ai.generate('Analyse', { role: 'extraction' });

  const total = cout.cumul();
  assert.equal(total.appels, 1, 'l appel est compte');
  assert.equal(total.tokensEntree, 500_000, 'les tokens aussi');
  assert.equal(total.eur, 0, 'mais il ne coute rien');
});

test('un modele absent du catalogue coute zero sans faire echouer l appel', async () => {
  brancher({
    fournisseur: 'anthropic',
    cleApi: 'sk-ant-test',
    modeles: { extraction: 'claude-modele-de-demain' }
  }, [{ texte: 'ok', usage: { tokensEntree: 100_000, tokensSortie: 100_000 } }]);

  const texte = await ai.generate('Analyse', { role: 'extraction' });

  assert.equal(texte, 'ok');
  assert.equal(cout.cumul().eur, 0);
});

test('le nom precis renvoye par le fournisseur sert au calcul', async () => {
  // On demande « claude-sonnet-5 », le fournisseur repond
  // « claude-sonnet-5-20260214 » : sans rattrapage, l appel serait compte
  // a zero alors qu il a bien ete facture.
  brancher({
    fournisseur: 'anthropic',
    cleApi: 'sk-ant-test',
    modeles: { redaction: 'claude-sonnet-5' }
  }, [{
    texte: 'ok',
    modele: 'claude-sonnet-5-20260214',
    usage: { tokensEntree: 1_000_000, tokensSortie: 0 }
  }]);

  await ai.generate('Ecris', { role: 'redaction' });

  assert.equal(cout.cumul().eur, 2.76);
});

/* ------------------------------------------------------------------ */
/* 4. Reconfiguration a chaud                                          */
/* ------------------------------------------------------------------ */

test('changer de modele pendant que le serveur tourne est pris en compte', async () => {
  const reglages = {
    fournisseur: 'anthropic',
    cleApi: 'sk-ant-test',
    modeles: { redaction: 'claude-opus-5', extraction: 'claude-haiku-4-5' }
  };
  const faux = fauxAdaptateur(['ok']);
  ai._utiliserConfiguration(() => reglages);
  ai._utiliserAdaptateur(faux);

  await ai.generate('Un', { role: 'redaction' });
  assert.equal(faux.appels[0].modele, 'claude-opus-5');

  // L'utilisateur ouvre les Parametres et choisit autre chose.
  reglages.modeles.redaction = 'claude-sonnet-5';
  await ai.generate('Deux', { role: 'redaction' });

  assert.equal(faux.appels[1].modele, 'claude-sonnet-5', 'aucun redemarrage necessaire');
});

test('changer de fournisseur pendant que le serveur tourne est pris en compte', async () => {
  let reglages = {
    fournisseur: 'anthropic',
    cleApi: 'sk-ant-test',
    modeles: { extraction: 'claude-haiku-4-5' }
  };
  const faux = fauxAdaptateur(['ok']);
  ai._utiliserConfiguration(() => reglages);
  ai._utiliserAdaptateur(faux);

  await ai.generate('Un');
  assert.equal(faux.appels[0].baseURL, 'https://api.anthropic.com');

  reglages = {
    fournisseur: 'mistral',
    cleApi: 'cle-mistral',
    modeles: { extraction: 'mistral-small-4' }
  };
  await ai.generate('Deux');

  assert.equal(faux.appels[1].baseURL, 'https://api.mistral.ai/v1');
  assert.equal(faux.appels[1].modele, 'mistral-small-4');
  assert.equal(faux.appels[1].cleApi, 'cle-mistral', 'la cle suit le fournisseur');
});

test('la route des reglages peut demander d oublier ce qui est en memoire', async () => {
  // routes/ia.js ecrit « aiService._client = null » apres un enregistrement.
  const faux = brancher({ fournisseur: 'ollama', modeles: { extraction: 'llama3.2' } }, ['ok']);
  await ai.generate('Bonjour');

  assert.doesNotThrow(() => { if (ai._client) ai._client = null; });
  await ai.generate('Encore');
  assert.equal(faux.appels.length, 2, 'le service continue de fonctionner apres l oubli');
});

test('couper la configuration en cours de route rebascule en mode degrade', async () => {
  let reglages = { fournisseur: 'ollama', modeles: { extraction: 'llama3.2' } };
  ai._utiliserConfiguration(() => reglages);
  ai._utiliserAdaptateur(fauxAdaptateur(['ok']));

  assert.equal(ai.estDisponible(), true);
  reglages = null;
  assert.equal(ai.estDisponible(), false);
});

/* ------------------------------------------------------------------ */
/* 5. La cle ne fuit nulle part                                        */
/* ------------------------------------------------------------------ */

test('la cle n apparait jamais dans ce que le service laisse voir', async () => {
  const CLE = 'sk-ant-secret-a-ne-jamais-afficher-4f2a';
  ai._utiliserConfiguration(() => ({
    fournisseur: 'anthropic',
    cleApi: CLE,
    modeles: {}
  }));
  ai._utiliserAdaptateur(fauxAdaptateur(['ok']));

  const decrit = ai.decrireConfiguration();
  assert.equal(decrit.fournisseur, 'anthropic');
  assert.equal(decrit.cleEnregistree, true);
  assert.doesNotMatch(JSON.stringify(decrit), /secret/, 'aucune trace de la cle');

  // Et la meme chose sur le chemin d'erreur.
  ai._utiliserConfiguration(() => ({ fournisseur: 'inconnu', cleApi: CLE }));
  await assert.rejects(() => ai.generate('Bonjour'), (erreur) => {
    assert.doesNotMatch(erreur.message, /secret/);
    return true;
  });
});

/* ------------------------------------------------------------------ */
/* 6. Le JSON : reparation locale avant tout nouvel appel              */
/* ------------------------------------------------------------------ */

test('generateJSON demande le mode JSON et rend un objet', async () => {
  const faux = brancher(CONFIG_ANTHROPIC, ['{"score": 72}']);

  const resultat = await ai.generateJSON('Donne un score', { role: 'extraction' });

  assert.deepEqual(resultat, { score: 72 });
  assert.equal(faux.appels[0].jsonMode, true);
});

test('un JSON entoure de markdown est repare sans nouvel appel', async () => {
  const faux = brancher(CONFIG_ANTHROPIC, ['```json\n{"score": 72,}\n```']);

  const resultat = await ai.generateJSON('Donne un score');

  assert.deepEqual(resultat, { score: 72 });
  assert.equal(faux.appels.length, 1, 'aucun appel payant supplementaire');
});

test('un JSON irrecuperable declenche un second appel, plus insistant', async () => {
  const faux = brancher(CONFIG_ANTHROPIC, ['je ne sais pas faire de JSON', '{"score": 50}']);

  const resultat = await ai.generateJSON('Donne un score');

  assert.deepEqual(resultat, { score: 50 });
  assert.equal(faux.appels.length, 2);
  assert.match(faux.appels[1].prompt, /UNIQUEMENT avec du JSON valide/);
  assert.match(faux.appels[1].prompt, /Donne un score/, 'la demande d origine est conservee');
});

test('generateThenConvert enchaine redaction puis structuration', async () => {
  const faux = brancher(CONFIG_ANTHROPIC, [
    { texte: 'Salaire vise : 45 000 $ & plus' },
    { texte: '{"ok": true}' }
  ]);

  const resultat = await ai.generateThenConvert(
    'Ecris le CV',
    'Convertis ceci en JSON :\n{{GENERATED_TEXT}}',
    { role: 'redaction' },
    { role: 'extraction' }
  );

  assert.deepEqual(resultat, { ok: true });
  assert.equal(faux.appels.length, 2);
  assert.equal(faux.appels[0].modele, 'claude-opus-5');
  assert.equal(faux.appels[1].modele, 'claude-haiku-4-5');
  // Les motifs $& et $' d'une chaine de remplacement ne doivent pas etre
  // interpretes : le texte doit arriver tel quel dans le second prompt.
  assert.match(faux.appels[1].prompt, /Salaire vise : 45 000 \$ & plus/);
});

/* ------------------------------------------------------------------ */
/* 7. La configuration reelle, telle que config/index.js la fournit    */
/* ------------------------------------------------------------------ */

test('la forme exposee par config.ia est comprise telle quelle', async () => {
  // C'est litteralement ce que rend config.ia quand le .env impose une
  // adresse personnalisee : on verifie qu'aucune traduction n'est necessaire.
  const faux = brancher({
    source: 'env',
    fournisseur: 'personnalise',
    adaptateur: 'openai-compatible',
    cleApi: 'sk-cle-du-env',
    baseURL: 'http://localhost:8080/v1',
    modeles: { redaction: 'mon-modele', extraction: 'mon-modele' }
  }, ['ok']);

  await ai.generate('Bonjour', { role: 'redaction' });

  assert.equal(faux.appels[0].baseURL, 'http://localhost:8080/v1');
  assert.equal(faux.appels[0].modele, 'mon-modele');
  assert.equal(faux.appels[0].cleApi, 'sk-cle-du-env');
});

test('sans injection, le service lit la configuration reelle du projet', () => {
  // Aucune cle dans l'environnement de test : le service doit dire non,
  // proprement. C'est exactement la situation de l'integration continue.
  ai._utiliserConfiguration(null);
  ai._utiliserAdaptateur(null);

  assert.equal(config.ia.source, 'aucune');
  assert.equal(ai.estDisponible(), false);
});

test('le fichier de reglages est relu sans redemarrer le serveur', async (t) => {
  // Le test le plus important du fichier : il verifie la chaine entiere,
  // du fichier ou l'utilisateur enregistre son choix jusqu'a l'appel.
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-ia-'));
  const fichier = path.join(dossier, 'config-ia.json');
  const origine = configUtilisateur.interne.fichier();
  configUtilisateur.interne.definirFichier(fichier);

  t.after(() => {
    configUtilisateur.interne.definirFichier(origine);
    fs.rmSync(dossier, { recursive: true, force: true });
  });

  const faux = fauxAdaptateur(['ok']);
  ai._utiliserConfiguration(null);
  ai._utiliserAdaptateur(faux);

  assert.equal(ai.estDisponible(), false, 'rien d enregistre pour l instant');

  await configUtilisateur.ecrire({
    fournisseur: 'mistral',
    cleApi: 'cle-mistral-de-test',
    modeles: { redaction: 'mistral-medium-3.5', extraction: 'mistral-small-4' }
  });

  assert.equal(ai.estDisponible(), true);
  await ai.generate('Ecris', { role: 'redaction' });
  assert.equal(faux.appels[0].modele, 'mistral-medium-3.5');
  assert.equal(faux.appels[0].baseURL, 'https://api.mistral.ai/v1');

  // L'utilisateur change d'avis, serveur toujours en marche.
  await configUtilisateur.ecrire({
    fournisseur: 'anthropic',
    cleApi: 'sk-ant-de-test',
    modeles: { redaction: 'claude-opus-5', extraction: 'claude-haiku-4-5' }
  });

  await ai.generate('Ecris encore', { role: 'redaction' });
  assert.equal(faux.appels[1].modele, 'claude-opus-5');
  assert.equal(faux.appels[1].baseURL, 'https://api.anthropic.com');
  assert.equal(faux.appels[1].cleApi, 'sk-ant-de-test', 'la cle suit le fournisseur');

  // Et le retrait de la cle rebascule proprement en mode degrade.
  await configUtilisateur.effacer();
  assert.equal(ai.estDisponible(), false);
});
