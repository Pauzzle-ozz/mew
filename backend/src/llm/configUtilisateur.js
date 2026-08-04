/**
 * OU VIT LE CHOIX DE L'UTILISATEUR.
 *
 * POURQUOI CE FICHIER EXISTE
 * Jusqu'ici, le fournisseur d'IA se configurait dans backend/.env, un fichier
 * texte edite par la personne qui lance le serveur. C'est parfait pour un
 * developpeur, et infranchissable pour tout le monde d'autre. Mew veut
 * l'inverse : l'utilisateur choisit son fournisseur ET son modele depuis
 * l'interface, avec sa propre cle. Il faut donc un endroit ou ranger ce choix
 * entre deux demarrages du serveur. C'est ce fichier.
 *
 * OU : backend/data/config-ia.json — a cote de mew.json, dans le dossier que
 * .gitignore exclut deja. Les donnees de l'utilisateur restent chez lui.
 *
 * FORME (c'est un contrat, d'autres fichiers l'attendent telle quelle) :
 *   { fournisseur, cleApi, baseURL, modeles: { redaction, extraction } }
 *
 * ORDRE DE PRIORITE (important, et volontaire)
 *   1. backend/.env, s'il definit OPENAI_API_KEY
 *   2. ce fichier
 *   3. rien du tout — et Mew demarre quand meme
 * Le .env garde la main parce que quelqu'un peut installer Mew POUR d'autres
 * (un serveur partage, une association, un centre de formation) et vouloir
 * imposer sa configuration : dans ce cas, l'interface affiche le choix comme
 * verrouille au lieu de laisser croire qu'on peut le changer.
 * L'arbitrage lui-meme est fait dans src/config/index.js, le seul endroit du
 * projet qui a le droit de lire process.env.
 *
 * TROIS REGLES DE SECURITE, NON NEGOCIABLES
 *   1. La cle en clair ne sort JAMAIS d'ici. Les routes n'ont acces qu'a
 *      lireMasquee(), qui rend « sk-p...4f2a ».
 *   2. L'ecriture est atomique (fichier temporaire puis renommage) : une
 *      coupure de courant au mauvais moment ne doit pas laisser un fichier
 *      a moitie ecrit, donc une cle a moitie effacee.
 *   3. Sous Linux et macOS, le fichier est lisible par son seul proprietaire
 *      (mode 0600). Sous Windows, la notion n'existe pas : on echoue en
 *      silence plutot que de faire echouer l'enregistrement.
 */

const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');

const { fournisseur: fournisseurDuCatalogue, ROLES } = require('./providers');

/* ------------------------------------------------------------------ */
/* Emplacement du fichier                                              */
/* ------------------------------------------------------------------ */

const NOM_FICHIER = 'config-ia.json';
const DOSSIER_DEFAUT = path.join(__dirname, '..', '..', 'data');

let FICHIER = path.join(DOSSIER_DEFAUT, NOM_FICHIER);

/** La configuration vide : la forme exacte, avec des valeurs neutres. */
const vide = () => ({
  fournisseur: '',
  cleApi: '',
  baseURL: '',
  modeles: { redaction: '', extraction: '' }
});

/* ------------------------------------------------------------------ */
/* Cache memoire                                                       */
/* ------------------------------------------------------------------ */

/**
 * POURQUOI UN CACHE, ET POURQUOI LA LECTURE EST SYNCHRONE.
 *
 * config/index.js expose la configuration effective sous forme de proprietes
 * lues a la volee (config.ia.cleApi). Ces lectures arrivent au milieu de code
 * qui n'attend pas de promesse : lire() doit donc repondre immediatement.
 * On lit le fichier une seule fois, au premier besoin, et on garde le
 * resultat. Ce processus est le seul a ecrire dans ce fichier : le cache ne
 * peut pas devenir faux dans son dos, et ecrire()/effacer() le remettent a
 * jour eux-memes.
 */
let cache = null;
let cacheCharge = false;

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

const texte = (valeur) => (typeof valeur === 'string' ? valeur.trim() : '');

/**
 * Ramene n'importe quoi a la forme du contrat.
 *
 * Ce que cette fonction recoit vient soit d'un fichier que l'utilisateur a pu
 * editer a la main, soit du navigateur : ce n'est pas forcement un objet, les
 * champs peuvent manquer, etre des nombres ou des tableaux. On ne lit que les
 * cinq champs attendus et on ignore tout le reste — c'est aussi ce qui empeche
 * un champ pirate de se retrouver enregistre puis relu.
 */
function normaliser(brut) {
  const objet = (brut && typeof brut === 'object' && !Array.isArray(brut)) ? brut : {};
  const modeles = (objet.modeles && typeof objet.modeles === 'object' && !Array.isArray(objet.modeles))
    ? objet.modeles
    : {};

  return {
    fournisseur: texte(objet.fournisseur),
    cleApi: texte(objet.cleApi),
    baseURL: texte(objet.baseURL),
    modeles: {
      redaction: texte(modeles.redaction),
      extraction: texte(modeles.extraction)
    }
  };
}

/** Copie defensive : personne ne doit pouvoir modifier le cache par accident. */
const copier = (config) => ({
  fournisseur: config.fournisseur,
  cleApi: config.cleApi,
  baseURL: config.baseURL,
  modeles: { ...config.modeles }
});

/* ------------------------------------------------------------------ */
/* Lecture                                                             */
/* ------------------------------------------------------------------ */

/**
 * Lit le fichier sur le disque. Ne leve JAMAIS.
 *
 * Fichier absent, illisible, JSON casse, droits refuses : dans tous les cas on
 * repart d'une configuration vide. Un serveur qui refuse de demarrer parce que
 * son fichier de reglages a une virgule en trop est un serveur inutilisable —
 * et c'est un invariant du projet : Mew demarre toujours.
 */
function lireLeFichier() {
  let brut;
  try {
    brut = fsSync.readFileSync(FICHIER, 'utf8');
  } catch (_) {
    // Absent (le cas normal au premier lancement) ou illisible : rien a dire.
    return vide();
  }

  try {
    return normaliser(JSON.parse(brut));
  } catch (_) {
    // Fichier corrompu : on le met de cote au lieu de l'ecraser. Il contient
    // peut-etre une cle API que l'utilisateur n'a nulle part ailleurs.
    try {
      fsSync.renameSync(FICHIER, `${FICHIER}.corrompu-${Date.now()}`);
    } catch (__) { /* tant pis : le prochain ecrire() l'ecrasera */ }
    return vide();
  }
}

/**
 * La configuration enregistree par l'utilisateur, CLE EN CLAIR COMPRISE.
 *
 * Reservee au code serveur qui doit reellement appeler un modele. Tout ce qui
 * peut finir dans une reponse HTTP ou dans un log doit passer par
 * lireMasquee(), jamais par ici.
 *
 * @returns {{fournisseur: string, cleApi: string, baseURL: string,
 *            modeles: {redaction: string, extraction: string}}}
 */
function lire() {
  if (!cacheCharge) {
    cache = lireLeFichier();
    cacheCharge = true;
  }
  return copier(cache);
}

/**
 * Une configuration utilisable a-t-elle ete enregistree ?
 *
 * « Utilisable » veut dire : un fournisseur connu, au moins un modele, et une
 * cle si ce fournisseur en exige une. Une configuration a moitie remplie
 * repond false — mieux vaut afficher « non configure » que laisser
 * l'utilisateur decouvrir le probleme au moment ou il clique.
 *
 * @returns {boolean}
 */
function estConfigure() {
  const config = lire();

  if (config.fournisseur === '') return false;
  if (config.modeles.redaction === '' && config.modeles.extraction === '') return false;

  const f = fournisseurDuCatalogue(config.fournisseur);

  // Fournisseur absent du catalogue (entree ecrite a la main, ou catalogue qui
  // a change entre deux versions de Mew) : il reste exploitable si l'adresse
  // de l'API est connue.
  if (!f) return config.baseURL !== '';

  if (f.cleRequise && config.cleApi === '') return false;
  return config.baseURL !== '' || Boolean(f.baseURL);
}

/* ------------------------------------------------------------------ */
/* Masquage                                                            */
/* ------------------------------------------------------------------ */

// En dessous de cette longueur, montrer les extremites reviendrait a montrer
// la cle : on masque tout.
const LONGUEUR_MINIMALE_POUR_MASQUER = 12;

/**
 * Reduit une cle a ses extremites : « sk-proj-abcd...4f2a ».
 *
 * Assez pour que l'utilisateur reconnaisse LAQUELLE de ses cles est
 * enregistree, totalement inutile pour s'en servir.
 *
 * @param {string} cle
 * @returns {string} chaine vide s'il n'y a pas de cle
 */
function masquerCle(cle) {
  const propre = texte(cle);
  if (propre === '') return '';
  if (propre.length < LONGUEUR_MINIMALE_POUR_MASQUER) return '...';
  return `${propre.slice(0, 4)}...${propre.slice(-4)}`;
}

/**
 * La configuration telle qu'on a le droit de l'afficher.
 *
 * C'est la SEULE fonction que les routes ont le droit d'exposer au navigateur.
 * La cle n'y figure que masquee ; `aUneCle` permet a l'interface de savoir
 * qu'une cle existe sans jamais la recevoir, et donc d'afficher « cle
 * enregistree » plutot qu'un champ vide qui donnerait envie de la ressaisir.
 *
 * @returns {{fournisseur: string, cleApi: string, aUneCle: boolean,
 *            baseURL: string, modeles: object, configure: boolean}}
 */
function lireMasquee() {
  const config = lire();
  return {
    fournisseur: config.fournisseur,
    cleApi: masquerCle(config.cleApi),
    aUneCle: config.cleApi !== '',
    baseURL: config.baseURL,
    modeles: { ...config.modeles },
    configure: estConfigure()
  };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Fabrique un refus lisible.
 * Un message de refus s'adresse a quelqu'un qui ne programme pas : il dit ce
 * qui ne va pas ET quoi faire ensuite.
 */
const refuser = (message) => ({ ok: false, erreur: message, avertissements: [], config: null });

/**
 * Verifie une adresse d'API saisie a la main.
 * On n'accepte que http et https : file://, data: ou un chemin local n'ont
 * aucun sens ici et ouvriraient une porte inutile.
 */
function verifierAdresse(valeur) {
  let url;
  try {
    url = new URL(valeur);
  } catch (_) {
    return {
      ok: false,
      erreur: `« ${valeur} » n'est pas une adresse valide. Elle doit commencer par http:// ou https:// `
        + '(par exemple http://localhost:11434/v1).'
    };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      erreur: `L'adresse « ${valeur} » utilise « ${url.protocol} », qui n'est pas gere. `
        + 'Utilise une adresse en http:// ou https://.'
    };
  }

  // On retire le slash final : « .../v1/ » et « .../v1 » doivent produire la
  // meme configuration, sinon on obtient des URL avec un double slash.
  return { ok: true, url: valeur.trim().replace(/\/+$/, '') };
}

/**
 * Valide et complete une configuration proposee par l'utilisateur.
 *
 * Cette fonction est le point de controle unique : ecrire() l'appelle, et la
 * route PUT /api/ia/config s'en sert pour repondre precisement AVANT
 * d'enregistrer quoi que ce soit.
 *
 * Elle ne se contente pas de dire oui ou non : elle complete (l'adresse du
 * fournisseur, le second modele quand un seul est choisi) et elle avertit
 * (prefixe de cle inhabituel, modele absent du catalogue). Un avertissement
 * n'empeche jamais l'enregistrement : notre catalogue vieillit plus vite que
 * les fournisseurs ne sortent des modeles, et refuser un modele qu'on ne
 * connait pas encore serait exactement l'inverse de la liberte promise.
 *
 * @param {object} entree
 * @returns {{ok: boolean, erreur?: string, avertissements: string[], config: object|null}}
 */
function valider(entree) {
  const propose = normaliser(entree);
  const avertissements = [];

  if (propose.fournisseur === '') {
    return refuser('Choisis un fournisseur avant d\'enregistrer.');
  }

  const f = fournisseurDuCatalogue(propose.fournisseur);
  if (!f) {
    return refuser(
      `Le fournisseur « ${propose.fournisseur} » n'existe pas dans Mew. `
      + 'Choisis-en un dans la liste, ou prends « Autre (compatible OpenAI) » '
      + 'pour saisir toi-meme une adresse.'
    );
  }

  // ---- Adresse de l'API -------------------------------------------------
  // Celle du catalogue sert de valeur par defaut ; celle de l'utilisateur
  // gagne toujours (un Ollama sur un autre port, un proxy d'entreprise...).
  const adresseBrute = propose.baseURL || f.baseURL || '';
  if (adresseBrute === '') {
    return refuser(
      `${f.nom} n'a pas d'adresse par defaut : saisis celle de ton service. `
      + 'Elle finit generalement par /v1.'
    );
  }
  const adresse = verifierAdresse(adresseBrute);
  if (!adresse.ok) return refuser(adresse.erreur);

  // ---- Cle API ----------------------------------------------------------
  if (f.cleRequise && propose.cleApi === '') {
    return refuser(
      `${f.nom} exige une cle API. `
      + (f.urlCle ? `Cree-la sur ${f.urlCle}, puis colle-la ici.` : 'Ajoute la tienne pour continuer.')
    );
  }
  if (f.prefixeCle && propose.cleApi !== '' && !propose.cleApi.startsWith(f.prefixeCle)) {
    // Indicatif seulement : les fournisseurs changent leurs prefixes.
    avertissements.push(
      `Les cles ${f.nom} commencent d'habitude par « ${f.prefixeCle} ». `
      + 'Verifie que tu as bien copie la cle en entier.'
    );
  }

  // ---- Modeles ----------------------------------------------------------
  // Un seul modele suffit : on le reutilise pour les deux roles. C'est le
  // choix par defaut de quelqu'un qui ne veut pas se poser de questions.
  const redaction = propose.modeles.redaction || propose.modeles.extraction;
  const extraction = propose.modeles.extraction || propose.modeles.redaction;

  if (redaction === '') {
    return refuser('Choisis au moins un modele. Le meme peut servir pour la redaction et pour l\'extraction.');
  }

  const verifierModele = (id, role) => {
    if (f.modeles.length === 0) return null; // local ou personnalise : rien a verifier

    const connu = f.modeles.find((m) => m.id === id);
    if (connu) {
      if (!connu.roles.includes(role)) {
        avertissements.push(
          `« ${connu.nom} » n'est pas le mieux place pour ${role === 'redaction' ? 'la redaction' : 'l\'extraction'}, `
          + 'mais rien ne t\'empeche de l\'utiliser.'
        );
      }
      return null;
    }

    if (!f.listageDynamique) {
      return `Le modele « ${id} » n'existe pas chez ${f.nom}. `
        + `Modeles connus : ${f.modeles.map((m) => m.id).join(', ')}.`;
    }

    avertissements.push(
      `Le modele « ${id} » n'est pas dans notre liste pour ${f.nom}. `
      + 'Si c\'est un modele recent, c\'est normal ; sinon verifie son nom exact.'
    );
    return null;
  };

  const erreurRedaction = verifierModele(redaction, ROLES[0]);
  if (erreurRedaction) return refuser(erreurRedaction);
  const erreurExtraction = verifierModele(extraction, ROLES[1]);
  if (erreurExtraction) return refuser(erreurExtraction);

  return {
    ok: true,
    avertissements,
    config: {
      fournisseur: f.id,
      cleApi: propose.cleApi,
      baseURL: adresse.url,
      modeles: { redaction, extraction }
    }
  };
}

/* ------------------------------------------------------------------ */
/* Ecriture                                                            */
/* ------------------------------------------------------------------ */

// Toutes les ecritures passent par cette chaine de promesses : deux requetes
// simultanees ne peuvent pas se marcher dessus. Meme principe que
// storage/jsonAdapter.js.
let file = Promise.resolve();

function enFile(operation) {
  const suivante = file.then(operation);
  // La chaine ne doit pas se rompre si une operation echoue.
  file = suivante.catch(() => {});
  return suivante;
}

/**
 * Restreint le fichier a son proprietaire (rw-------).
 *
 * Ce fichier contient une cle API : sur une machine partagee, le mode 0644 par
 * defaut la rendrait lisible par tous les comptes. Windows ignore ces droits
 * POSIX — l'echec y est normal et volontairement silencieux.
 */
async function restreindre(chemin) {
  try {
    await fs.chmod(chemin, 0o600);
  } catch (_) { /* Windows, ou systeme de fichiers sans droits POSIX */ }
}

/**
 * Enregistre le choix de l'utilisateur.
 *
 * @param {object} entree { fournisseur, cleApi, baseURL, modeles }
 * @returns {Promise<{configMasquee: object, avertissements: string[]}>}
 * @throws {Error} avec .code = 'CONFIG_INVALIDE' et un message en francais
 */
async function ecrire(entree) {
  const resultat = valider(entree);
  if (!resultat.ok) {
    const erreur = new Error(resultat.erreur);
    erreur.code = 'CONFIG_INVALIDE';
    throw erreur;
  }

  const contenu = `${JSON.stringify(resultat.config, null, 2)}\n`;

  await enFile(async () => {
    await fs.mkdir(path.dirname(FICHIER), { recursive: true });

    // Ecriture atomique : on ecrit a cote, puis on renomme. Le renommage est
    // instantane pour le systeme de fichiers — a aucun moment config-ia.json
    // n'existe a moitie ecrit. Le fichier temporaire nait deja en 0600 : la
    // cle n'est jamais exposee, meme une fraction de seconde.
    const temporaire = `${FICHIER}.tmp`;
    await fs.writeFile(temporaire, contenu, { encoding: 'utf8', mode: 0o600 });
    await restreindre(temporaire);
    await fs.rename(temporaire, FICHIER);
    await restreindre(FICHIER);
  });

  cache = resultat.config;
  cacheCharge = true;

  return { configMasquee: lireMasquee(), avertissements: resultat.avertissements };
}

/**
 * Oublie la configuration : le fichier est supprime, la cle avec lui.
 *
 * C'est le « je change d'avis » de l'utilisateur, et c'est aussi la reponse la
 * plus honnete a « comment je retire ma cle de cette machine ? ».
 *
 * @returns {Promise<boolean>} true si un fichier a reellement ete supprime
 */
async function effacer() {
  const supprime = await enFile(async () => {
    try {
      await fs.unlink(FICHIER);
      return true;
    } catch (erreur) {
      if (erreur && erreur.code === 'ENOENT') return false; // deja rien : pas une erreur
      throw erreur;
    }
  });

  cache = vide();
  cacheCharge = true;
  return supprime;
}

module.exports = {
  lire,
  ecrire,
  effacer,
  lireMasquee,
  estConfigure,
  valider,
  masquerCle,

  /**
   * Rouages internes, exposes UNIQUEMENT pour les tests : ils permettent de
   * travailler sur un fichier jetable au lieu de la vraie configuration de la
   * personne qui fait tourner Mew. Ne pas utiliser depuis le reste du code.
   */
  interne: {
    fichier: () => FICHIER,
    definirFichier: (chemin) => {
      FICHIER = chemin;
      cache = null;
      cacheCharge = false;
    },
    viderCache: () => { cache = null; cacheCharge = false; },
    normaliser,
    verifierAdresse
  }
};
