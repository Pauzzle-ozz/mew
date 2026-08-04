const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const configUtilisateur = require('../src/llm/configUtilisateur');
const { testerConnexion } = require('../src/llm/testConnexion');

/**
 * Tests de la configuration choisie par l'utilisateur.
 *
 * REGLE ABSOLUE DE CE FICHIER : on ne touche JAMAIS a
 * backend/data/config-ia.json. Ce fichier contient la vraie cle API de la
 * personne qui fait tourner Mew. Chaque test travaille dans un dossier
 * temporaire, redirige par configUtilisateur.interne.definirFichier().
 */

const CLE = 'sk-proj-CetteCleNeDoitJamaisSortir4f2a';

/** Un dossier jetable, et le fichier de configuration qui va avec. */
function dossierJetable() {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-config-ia-'));
  const fichier = path.join(dossier, 'config-ia.json');
  configUtilisateur.interne.definirFichier(fichier);
  return {
    fichier,
    nettoyer: () => fs.rmSync(dossier, { recursive: true, force: true })
  };
}

/**
 * Cherche une chaine dans TOUTES les valeurs d'un objet, aussi profond
 * soit-il. C'est ainsi qu'on prouve qu'une cle ne fuit pas : pas en
 * inspectant les champs qu'on connait, mais en fouillant tout.
 */
function contientQuelquePart(valeur, aiguille) {
  if (typeof valeur === 'string') return valeur.includes(aiguille);
  if (valeur && typeof valeur === 'object') {
    return Object.values(valeur).some((v) => contientQuelquePart(v, aiguille));
  }
  return false;
}

const CONFIG_VALIDE = {
  fournisseur: 'openai',
  cleApi: CLE,
  baseURL: '',
  modeles: { redaction: 'gpt-5.6-terra', extraction: 'gpt-4o-mini' }
};

/* ------------------------------------------------------------------ */
/* Ecriture, lecture, effacement                                       */
/* ------------------------------------------------------------------ */

test('ecrire puis lire rend exactement ce qui a ete enregistre', async () => {
  const { fichier, nettoyer } = dossierJetable();

  try {
    await configUtilisateur.ecrire(CONFIG_VALIDE);

    const relu = configUtilisateur.lire();
    assert.equal(relu.fournisseur, 'openai');
    assert.equal(relu.cleApi, CLE);
    assert.equal(relu.modeles.redaction, 'gpt-5.6-terra');
    assert.equal(relu.modeles.extraction, 'gpt-4o-mini');
    // L'adresse manquante est completee depuis le catalogue.
    assert.equal(relu.baseURL, 'https://api.openai.com/v1');
    assert.equal(configUtilisateur.estConfigure(), true);

    // Et le fichier sur le disque doit etre du JSON relisible.
    const surDisque = JSON.parse(fs.readFileSync(fichier, 'utf8'));
    assert.equal(surDisque.fournisseur, 'openai');
  } finally {
    nettoyer();
  }
});

test('la configuration survit a un redemarrage (relecture depuis le disque)', async () => {
  const { nettoyer } = dossierJetable();

  try {
    await configUtilisateur.ecrire(CONFIG_VALIDE);
    // On simule un redemarrage : le cache memoire est vide, tout doit venir
    // du fichier.
    configUtilisateur.interne.viderCache();

    assert.equal(configUtilisateur.lire().cleApi, CLE);
    assert.equal(configUtilisateur.estConfigure(), true);
  } finally {
    nettoyer();
  }
});

test('effacer supprime le fichier et la cle avec lui', async () => {
  const { fichier, nettoyer } = dossierJetable();

  try {
    await configUtilisateur.ecrire(CONFIG_VALIDE);
    assert.equal(fs.existsSync(fichier), true);

    assert.equal(await configUtilisateur.effacer(), true);
    assert.equal(fs.existsSync(fichier), false);
    assert.equal(configUtilisateur.estConfigure(), false);
    assert.equal(configUtilisateur.lire().cleApi, '');

    // Effacer deux fois n'est pas une erreur.
    assert.equal(await configUtilisateur.effacer(), false);
  } finally {
    nettoyer();
  }
});

test('un seul modele suffit : il sert pour les deux roles', async () => {
  const { nettoyer } = dossierJetable();

  try {
    await configUtilisateur.ecrire({
      fournisseur: 'anthropic',
      cleApi: 'sk-ant-abcdefghijklmnop',
      modeles: { redaction: 'claude-sonnet-5' }
    });

    const relu = configUtilisateur.lire();
    assert.equal(relu.modeles.redaction, 'claude-sonnet-5');
    assert.equal(relu.modeles.extraction, 'claude-sonnet-5');
  } finally {
    nettoyer();
  }
});

/* ------------------------------------------------------------------ */
/* Masquage : le test le plus important du fichier                     */
/* ------------------------------------------------------------------ */

test('lireMasquee ne laisse JAMAIS passer la cle en clair', async () => {
  const { nettoyer } = dossierJetable();

  try {
    await configUtilisateur.ecrire(CONFIG_VALIDE);
    const masquee = configUtilisateur.lireMasquee();

    // Le test qui compte : la cle n'apparait nulle part, a aucune profondeur.
    assert.equal(contientQuelquePart(masquee, CLE), false,
      'la cle en clair ne doit apparaitre dans AUCUN champ de la sortie masquee');
    // Meme un fragment significatif ne doit pas sortir.
    assert.equal(contientQuelquePart(masquee, 'CetteCleNeDoitJamaisSortir'), false);

    // Ce qui doit sortir : de quoi reconnaitre la cle, pas de quoi s'en servir.
    assert.equal(masquee.cleApi, 'sk-p...4f2a');
    assert.equal(masquee.aUneCle, true);
    assert.equal(masquee.fournisseur, 'openai');
  } finally {
    nettoyer();
  }
});

test('masquerCle cache tout quand la cle est trop courte pour etre coupee', () => {
  assert.equal(configUtilisateur.masquerCle('sk-court'), '...');
  assert.equal(configUtilisateur.masquerCle(''), '');
  assert.equal(configUtilisateur.masquerCle(null), '');
  assert.equal(configUtilisateur.masquerCle(undefined), '');
  assert.equal(configUtilisateur.masquerCle('sk-1234567890abcd'), 'sk-1...abcd');
});

test('sans cle enregistree, lireMasquee le dit sans inventer de masque', () => {
  const { nettoyer } = dossierJetable();

  try {
    const masquee = configUtilisateur.lireMasquee();
    assert.equal(masquee.cleApi, '');
    assert.equal(masquee.aUneCle, false);
    assert.equal(masquee.configure, false);
  } finally {
    nettoyer();
  }
});

/* ------------------------------------------------------------------ */
/* Robustesse : le serveur doit TOUJOURS demarrer                      */
/* ------------------------------------------------------------------ */

test('fichier absent : lire() rend une configuration vide, sans lever', () => {
  const { nettoyer } = dossierJetable();

  try {
    const config = configUtilisateur.lire();
    assert.deepEqual(config, {
      fournisseur: '', cleApi: '', baseURL: '', modeles: { redaction: '', extraction: '' }
    });
    assert.equal(configUtilisateur.estConfigure(), false);
  } finally {
    nettoyer();
  }
});

test('fichier corrompu : aucune exception, et le fichier abime est conserve', () => {
  const { fichier, nettoyer } = dossierJetable();

  try {
    fs.writeFileSync(fichier, '{ ceci n\'est pas du JSON', 'utf8');

    const config = configUtilisateur.lire();
    assert.equal(config.fournisseur, '');
    assert.equal(configUtilisateur.estConfigure(), false);

    // Le fichier casse contenait peut-etre une cle : il est mis de cote,
    // jamais supprime.
    const dossier = path.dirname(fichier);
    const misDeCote = fs.readdirSync(dossier).filter((n) => n.includes('.corrompu-'));
    assert.equal(misDeCote.length, 1);
  } finally {
    nettoyer();
  }
});

test('fichier au contenu inattendu (tableau, champs absents) : rien ne casse', () => {
  const { fichier, nettoyer } = dossierJetable();

  try {
    fs.writeFileSync(fichier, '["openai", 42]', 'utf8');
    assert.deepEqual(configUtilisateur.lire().modeles, { redaction: '', extraction: '' });

    fs.writeFileSync(fichier, '{"fournisseur": 7, "modeles": "gpt"}', 'utf8');
    configUtilisateur.interne.viderCache();
    assert.equal(configUtilisateur.lire().fournisseur, '');
    assert.equal(configUtilisateur.estConfigure(), false);
  } finally {
    nettoyer();
  }
});

test('une configuration a moitie remplie n\'est pas consideree comme configuree', () => {
  const { fichier, nettoyer } = dossierJetable();

  try {
    // Fournisseur qui exige une cle, mais aucune cle enregistree.
    fs.writeFileSync(fichier, JSON.stringify({
      fournisseur: 'openai', cleApi: '', baseURL: 'https://api.openai.com/v1',
      modeles: { redaction: 'gpt-4o-mini', extraction: 'gpt-4o-mini' }
    }), 'utf8');

    assert.equal(configUtilisateur.estConfigure(), false);
  } finally {
    nettoyer();
  }
});

test('sous Linux et macOS, le fichier n\'est lisible que par son proprietaire', async (t) => {
  if (process.platform === 'win32') {
    t.skip('les droits POSIX n\'existent pas sous Windows');
    return;
  }

  const { fichier, nettoyer } = dossierJetable();
  try {
    await configUtilisateur.ecrire(CONFIG_VALIDE);
    const mode = fs.statSync(fichier).mode & 0o777;
    assert.equal(mode, 0o600, 'une cle API ne doit pas etre lisible par les autres comptes');
  } finally {
    nettoyer();
  }
});

/* ------------------------------------------------------------------ */
/* Validation des entrees                                             */
/* ------------------------------------------------------------------ */

test('validation : un fournisseur inconnu est refuse avec un message clair', () => {
  const resultat = configUtilisateur.valider({
    fournisseur: 'chatgpt-maison', modeles: { redaction: 'x' }
  });

  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /n'existe pas/);
  assert.equal(resultat.config, null);
});

test('validation : une cle vide est refusee quand le fournisseur en exige une', () => {
  const resultat = configUtilisateur.valider({
    fournisseur: 'openai', cleApi: '   ', modeles: { redaction: 'gpt-4o-mini' }
  });

  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /cle API/);
  // Le message dit ou aller la chercher.
  assert.match(resultat.erreur, /platform\.openai\.com/);
});

test('validation : Ollama n\'exige aucune cle', () => {
  const resultat = configUtilisateur.valider({
    fournisseur: 'ollama', modeles: { redaction: 'llama3.2' }
  });

  assert.equal(resultat.ok, true);
  assert.equal(resultat.config.baseURL, 'http://localhost:11434/v1');
  assert.equal(resultat.config.cleApi, '');
});

test('validation : une adresse qui n\'est pas en http(s) est refusee', () => {
  ['file:///etc/passwd', 'pas une url', 'ftp://exemple.fr'].forEach((mauvaise) => {
    const resultat = configUtilisateur.valider({
      fournisseur: 'personnalise', baseURL: mauvaise, modeles: { redaction: 'x' }
    });
    assert.equal(resultat.ok, false, `« ${mauvaise} » aurait du etre refusee`);
  });
});

test('validation : le fournisseur personnalise exige une adresse', () => {
  const sansAdresse = configUtilisateur.valider({
    fournisseur: 'personnalise', modeles: { redaction: 'mon-modele' }
  });
  assert.equal(sansAdresse.ok, false);

  const avecAdresse = configUtilisateur.valider({
    fournisseur: 'personnalise', baseURL: 'http://192.168.1.20:8000/v1/', modeles: { redaction: 'mon-modele' }
  });
  assert.equal(avecAdresse.ok, true);
  // Le slash final est retire : sans ca, on obtient des URL a double slash.
  assert.equal(avecAdresse.config.baseURL, 'http://192.168.1.20:8000/v1');
});

test('validation : aucun modele choisi est refuse', () => {
  const resultat = configUtilisateur.valider({ fournisseur: 'ollama', modeles: {} });
  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /modele/);
});

test('validation : un modele hors catalogue passe, avec un avertissement', () => {
  const resultat = configUtilisateur.valider({
    fournisseur: 'openai',
    cleApi: 'sk-abcdefghijklmnop',
    modeles: { redaction: 'gpt-7-du-futur' }
  });

  // On n'interdit pas : notre catalogue vieillit plus vite que les
  // fournisseurs ne sortent des modeles.
  assert.equal(resultat.ok, true);
  assert.equal(resultat.avertissements.length >= 1, true);
  assert.match(resultat.avertissements.join(' '), /gpt-7-du-futur/);
});

test('validation : un prefixe de cle inhabituel avertit sans bloquer', () => {
  const resultat = configUtilisateur.valider({
    fournisseur: 'anthropic',
    cleApi: 'sk-jai-colle-une-cle-openai',
    modeles: { redaction: 'claude-sonnet-5' }
  });

  assert.equal(resultat.ok, true);
  assert.match(resultat.avertissements.join(' '), /sk-ant-/);
});

test('ecrire refuse une configuration invalide sans creer de fichier', async () => {
  const { fichier, nettoyer } = dossierJetable();

  try {
    await assert.rejects(
      () => configUtilisateur.ecrire({ fournisseur: 'inconnu', modeles: { redaction: 'x' } }),
      (erreur) => erreur.code === 'CONFIG_INVALIDE'
    );
    assert.equal(fs.existsSync(fichier), false);
  } finally {
    nettoyer();
  }
});

/* ------------------------------------------------------------------ */
/* Priorite du .env                                                    */
/* ------------------------------------------------------------------ */

/**
 * Recharge src/config avec un environnement choisi. On ne vide QUE le cache de
 * ce module : configUtilisateur doit rester le meme objet, sinon il perdrait
 * le fichier temporaire qu'on lui a donne.
 */
function configAvec(variables) {
  const sauvegarde = {};
  const cles = ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'AI_MODEL_REDACTION', 'AI_MODEL_EXTRACTION'];

  cles.forEach((cle) => {
    sauvegarde[cle] = process.env[cle];
    if (variables[cle] === undefined) delete process.env[cle];
    else process.env[cle] = variables[cle];
  });

  delete require.cache[require.resolve('../src/config')];
  const config = require('../src/config');

  const restaurer = () => {
    cles.forEach((cle) => {
      if (sauvegarde[cle] === undefined) delete process.env[cle];
      else process.env[cle] = sauvegarde[cle];
    });
    delete require.cache[require.resolve('../src/config')];
  };

  return { config, restaurer };
}

test('le .env garde la priorite sur le choix de l\'utilisateur', async () => {
  const { nettoyer } = dossierJetable();
  await configUtilisateur.ecrire(CONFIG_VALIDE);

  const { config, restaurer } = configAvec({
    OPENAI_API_KEY: 'sk-cle-imposee-par-le-serveur',
    AI_MODEL_REDACTION: 'gpt-4o'
  });

  try {
    assert.equal(config.ia.source, 'env');
    assert.equal(config.ia.cleApi, 'sk-cle-imposee-par-le-serveur');
    assert.equal(config.ia.modeles.redaction, 'gpt-4o');
    assert.equal(config.capacites.ia, true);
  } finally {
    restaurer();
    nettoyer();
  }
});

test('sans OPENAI_API_KEY, c\'est le choix de l\'utilisateur qui sert', async () => {
  const { nettoyer } = dossierJetable();
  await configUtilisateur.ecrire(CONFIG_VALIDE);

  const { config, restaurer } = configAvec({});

  try {
    assert.equal(config.ia.source, 'fichier');
    assert.equal(config.ia.cleApi, CLE);
    assert.equal(config.ia.fournisseur, 'openai');
    assert.equal(config.ia.adaptateur, 'openai-compatible');
    assert.equal(config.ia.baseURL, 'https://api.openai.com/v1');
    assert.equal(config.ia.modeles.redaction, 'gpt-5.6-terra');
    assert.equal(config.capacites.ia, true);
    // Le resume affiche au demarrage ne doit pas trahir la cle.
    assert.equal(contientQuelquePart(config.resume(), CLE), false);
  } finally {
    restaurer();
    nettoyer();
  }
});

test('aucune configuration du tout : le serveur reste utilisable', () => {
  const { nettoyer } = dossierJetable();
  const { config, restaurer } = configAvec({});

  try {
    assert.equal(config.ia.source, 'aucune');
    assert.equal(config.capacites.ia, false);
    // Les valeurs par defaut restent presentes : aucun appelant existant ne
    // doit recevoir undefined.
    assert.equal(config.ia.modeles.redaction, 'gpt-4o');
    assert.equal(config.ia.modeles.extraction, 'gpt-4.1-mini');
    assert.equal(config.ia.baseURL, undefined);
    // Et le resume se genere sans lever.
    assert.equal(Array.isArray(config.resume()), true);
  } finally {
    restaurer();
    nettoyer();
  }
});

test('OPENAI_BASE_URL seul (Ollama via .env) active toujours l\'IA', () => {
  const { nettoyer } = dossierJetable();
  const { config, restaurer } = configAvec({ OPENAI_BASE_URL: 'http://localhost:11434/v1' });

  try {
    assert.equal(config.ia.source, 'env');
    assert.equal(config.ia.baseURL, 'http://localhost:11434/v1');
    assert.equal(config.capacites.ia, true);
  } finally {
    restaurer();
    nettoyer();
  }
});

/* ------------------------------------------------------------------ */
/* Test de connexion                                                   */
/* ------------------------------------------------------------------ */

/** Un faux adaptateur : aucun reseau, aucune cle, aucun cout. */
const adaptateurQuiRepond = (texte, usage) => ({
  id: 'faux',
  async completer(options) {
    return {
      texte,
      usage: usage || { tokensEntree: 40, tokensSortie: 30 },
      // Comme un vrai fournisseur : on renvoie le modele demande.
      modele: options.modele
    };
  },
  async listerModeles() { return null; }
});

const adaptateurQuiEchoue = (code, message) => ({
  id: 'faux',
  async completer() {
    const erreur = new Error(message);
    erreur.code = code;
    throw erreur;
  },
  async listerModeles() { return null; }
});

test('test de connexion : un modele qui respecte le format est valide', async () => {
  const resultat = await testerConnexion(
    { fournisseur: 'ollama', modele: 'llama3.2' },
    { adaptateur: adaptateurQuiRepond('SUBJECT: Candidature spontanee jardinier\n---\nBonjour. Je vous ecris.') }
  );

  assert.equal(resultat.ok, true);
  assert.equal(resultat.etape, 'format');
  assert.equal(resultat.suitLesConsignes, true);
  assert.equal(resultat.avertissements.length, 0);
  assert.equal(resultat.apercu.objet, 'Candidature spontanee jardinier');
  assert.equal(typeof resultat.latenceMs, 'number');
});

test('test de connexion : un modele qui ignore le format n\'est PAS une panne', async () => {
  const resultat = await testerConnexion(
    { fournisseur: 'ollama', modele: 'tout-petit-modele' },
    { adaptateur: adaptateurQuiRepond('Bien sur ! Voici votre email :\n\nBonjour, je postule.') }
  );

  // Le point central de la fonctionnalite : ca marche, mais on previent.
  assert.equal(resultat.ok, true);
  assert.equal(resultat.suitLesConsignes, false);
  assert.equal(resultat.avertissements.length >= 1, true);
  assert.match(resultat.message, /format|reperes/i);
});

test('test de connexion : une cle refusee s\'arrete a l\'authentification', async () => {
  const resultat = await testerConnexion(
    { fournisseur: 'openai', cleApi: 'sk-fausse-cle-mais-longue', modele: 'gpt-4o-mini' },
    { adaptateur: adaptateurQuiEchoue('CLE_INVALIDE', 'OpenAI refuse ta cle API.') }
  );

  assert.equal(resultat.ok, false);
  assert.equal(resultat.etape, 'authentification');
  assert.equal(resultat.code, 'CLE_INVALIDE');
  assert.equal(resultat.suitLesConsignes, false);
});

test('test de connexion : Ollama eteint s\'arrete a la connexion', async () => {
  const resultat = await testerConnexion(
    { fournisseur: 'ollama', modele: 'llama3.2' },
    { adaptateur: adaptateurQuiEchoue('RESEAU', 'Ollama ne repond pas sur http://localhost:11434/v1.') }
  );

  assert.equal(resultat.ok, false);
  assert.equal(resultat.etape, 'connexion');
  assert.match(resultat.message, /Ollama/);
});

test('test de connexion : une cle manquante est refusee sans appeler personne', async () => {
  let appele = false;
  const resultat = await testerConnexion(
    { fournisseur: 'openai', cleApi: '', modele: 'gpt-4o-mini' },
    {
      adaptateur: {
        id: 'faux',
        async completer() { appele = true; return { texte: '', usage: {}, modele: '' }; },
        async listerModeles() { return null; }
      }
    }
  );

  assert.equal(resultat.ok, false);
  assert.equal(resultat.etape, 'authentification');
  assert.equal(appele, false, 'inutile de faire attendre l\'utilisateur pour un 401 certain');
});

test('test de connexion : le cout est estime a partir du catalogue', async () => {
  const resultat = await testerConnexion(
    { fournisseur: 'openai', cleApi: 'sk-une-cle-assez-longue', modele: 'gpt-4o-mini' },
    {
      adaptateur: adaptateurQuiRepond(
        'SUBJECT: Un objet\n---\nDeux phrases. Vraiment deux.',
        { tokensEntree: 1000000, tokensSortie: 1000000 }
      )
    }
  );

  // gpt-4o-mini : 0,15 $ en entree et 0,60 $ en sortie par million de tokens.
  assert.equal(resultat.coutEstime.usd, 0.75);
  assert.equal(resultat.usage.tokensEntree, 1000000);
});

test('test de connexion : un modele inconnu du catalogue est compte a zero', async () => {
  const resultat = await testerConnexion(
    { fournisseur: 'ollama', modele: 'llama3.2' },
    { adaptateur: adaptateurQuiRepond('SUBJECT: Objet\n---\nCorps.') }
  );

  assert.equal(resultat.coutEstime.usd, 0);
  assert.equal(resultat.coutEstime.eur, 0);
});

test('test de connexion : sans modele, on le dit avant de tester', async () => {
  const resultat = await testerConnexion({ fournisseur: 'ollama', modele: '' });
  assert.equal(resultat.ok, false);
  assert.equal(resultat.etape, 'connexion');
  assert.match(resultat.message, /modele/);
});

/* ------------------------------------------------------------------ */
/* Les routes /api/ia                                                  */
/* ------------------------------------------------------------------ */

/** Serveur jetable qui monte le routeur des reglages. */
async function serveurDeTest() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/ia', require('../src/routes/ia'));

  const serveur = app.listen(0);
  await new Promise((resoudre) => serveur.once('listening', resoudre));

  const base = `http://127.0.0.1:${serveur.address().port}/api/ia`;

  return {
    /** Renvoie le statut ET le texte brut : c'est le texte qu'on fouille. */
    appel: async (methode, chemin, corps) => {
      const reponse = await fetch(base + chemin, {
        method: methode,
        headers: { 'Content-Type': 'application/json' },
        body: corps === undefined ? undefined : JSON.stringify(corps)
      });
      return { statut: reponse.status, texte: await reponse.text() };
    },
    fermer: () => new Promise((resoudre) => serveur.close(resoudre))
  };
}

test('LA REGLE : la cle API ne repart JAMAIS vers le navigateur', async () => {
  const { nettoyer } = dossierJetable();
  const { appel, fermer } = await serveurDeTest();

  try {
    const enregistrement = await appel('PUT', '/config', {
      fournisseur: 'openai', cleApi: CLE, modeles: { redaction: 'gpt-4o-mini' }
    });
    assert.equal(enregistrement.statut, 200);

    // On fouille le TEXTE BRUT des reponses, pas des champs choisis : c'est la
    // seule facon de prouver qu'aucun chemin ne laisse passer la cle.
    const relecture = await appel('GET', '/config');
    const catalogue = await appel('GET', '/fournisseurs');
    const suppression = await appel('DELETE', '/config');

    [enregistrement, relecture, catalogue, suppression].forEach(({ texte }) => {
      assert.equal(texte.includes(CLE), false, 'une reponse HTTP contient la cle en clair');
      assert.equal(texte.includes('CetteCleNeDoitJamaisSortir'), false);
    });

    assert.match(relecture.texte, /sk-p\.\.\.4f2a/);
  } finally {
    await fermer();
    nettoyer();
  }
});

test('les routes refusent une configuration invalide avec un 400 explicite', async () => {
  const { nettoyer } = dossierJetable();
  const { appel, fermer } = await serveurDeTest();

  try {
    const cas = [
      ['fournisseur inconnu', { fournisseur: 'chatgpt-maison', modeles: { redaction: 'x' } }],
      ['cle vide', { fournisseur: 'openai', cleApi: '', modeles: { redaction: 'gpt-4o-mini' } }],
      ['adresse file://', { fournisseur: 'personnalise', baseURL: 'file:///etc/passwd', modeles: { redaction: 'x' } }],
      ['aucun modele', { fournisseur: 'ollama', modeles: {} }]
    ];

    for (const [nom, corps] of cas) {
      const { statut, texte } = await appel('PUT', '/config', corps);
      assert.equal(statut, 400, `« ${nom} » aurait du etre refuse`);
      // Un refus doit expliquer, pas seulement refuser.
      assert.equal(JSON.parse(texte).error.length > 20, true, `message trop court pour « ${nom} »`);
    }
  } finally {
    await fermer();
    nettoyer();
  }
});

test('le catalogue est lisible sans aucune configuration', async () => {
  const { nettoyer } = dossierJetable();
  const { appel, fermer } = await serveurDeTest();

  try {
    const { statut, texte } = await appel('GET', '/fournisseurs');
    const data = JSON.parse(texte).data;

    assert.equal(statut, 200);
    assert.equal(data.fournisseurs.length > 10, true);
    assert.deepEqual(data.roles, ['redaction', 'extraction']);
    // Aucune cle ne doit trainer dans de la donnee publique.
    assert.equal(texte.includes('cleApi'), false);
  } finally {
    await fermer();
    nettoyer();
  }
});

test('les modeles d\'un fournisseur inconnu repondent 404, pas une erreur serveur', async () => {
  const { nettoyer } = dossierJetable();
  const { appel, fermer } = await serveurDeTest();

  try {
    const { statut } = await appel('GET', '/modeles/nexiste-pas');
    assert.equal(statut, 404);
  } finally {
    await fermer();
    nettoyer();
  }
});
