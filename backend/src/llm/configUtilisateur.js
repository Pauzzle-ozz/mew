/**
 * OU VIT LE CHOIX DE L'UTILISATEUR.
 *
 * POURQUOI CE FICHIER EXISTE
 * Le fournisseur d'IA se configurait dans backend/.env, un fichier texte edite
 * par la personne qui lance le serveur. C'est parfait pour un developpeur, et
 * infranchissable pour tout le monde d'autre. Mew veut l'inverse : l'utilisateur
 * choisit ses fournisseurs ET ses modeles depuis l'interface, avec ses propres
 * cles. Il faut donc un endroit ou ranger ce choix entre deux demarrages du
 * serveur. C'est ce fichier.
 *
 * OU : backend/data/config-ia.json — a cote de mew.json, dans le dossier que
 * .gitignore exclut deja. Les donnees de l'utilisateur restent chez lui.
 *
 * FORME : voir config/schema.js. En resume, deux choses separees —
 *   comptes : chez qui j'ai un acces, avec quelle cle (un par fournisseur)
 *   taches  : pour chaque chose demandee a un modele, l'activer ou non, et
 *             quel modele de quel compte
 * C'est cette separation qui permet « tel modele lit mes CV, tel autre redige
 * mes lettres » meme quand les deux ne sont pas chez le meme fournisseur.
 *
 * L'ANCIENNE FORME RESTE LUE ET RESTE ECRITE. Un fichier d'avant est repris
 * tout seul (schema.depuisV1), et lire()/ecrire()/lireMasquee() gardent
 * exactement leur signature d'avant : tout le code qui les appelle continue de
 * fonctionner sans changement.
 *
 * ORDRE DE PRIORITE (important, et volontaire)
 *   1. backend/.env, s'il definit OPENAI_API_KEY
 *   2. ce fichier
 *   3. rien du tout — et Mew demarre quand meme
 * Le .env garde la main parce que quelqu'un peut installer Mew POUR d'autres
 * (un serveur partage, une association, un centre de formation). L'arbitrage
 * lui-meme est fait dans src/config/index.js, le seul endroit du projet qui a
 * le droit de lire process.env.
 *
 * TROIS REGLES DE SECURITE, NON NEGOCIABLES
 *   1. La cle en clair ne sort JAMAIS d'ici vers l'exterieur. Les routes n'ont
 *      acces qu'a lireMasquee() et lireEtat(), qui rendent « sk-p...4f2a ».
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

const { fournisseur: fournisseurDuCatalogue, modelesPourRole } = require('./providers');
const { IDS: IDS_TACHES, roleDe, tache: tacheDuCatalogue } = require('./taches');
const schema = require('./config/schema');
const validation = require('./config/validation');

/* ------------------------------------------------------------------ */
/* Emplacement du fichier                                              */
/* ------------------------------------------------------------------ */

const NOM_FICHIER = 'config-ia.json';
const DOSSIER_DEFAUT = path.join(__dirname, '..', '..', 'data');

let FICHIER = path.join(DOSSIER_DEFAUT, NOM_FICHIER);

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
 * peut pas devenir faux dans son dos, et les ecritures le remettent a jour
 * elles-memes.
 */
let cache = null;
let cacheCharge = false;

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
    return schema.vide();
  }

  try {
    // normaliser() reprend au passage un fichier a l'ancienne forme.
    return schema.normaliser(JSON.parse(brut));
  } catch (_) {
    // Fichier corrompu : on le met de cote au lieu de l'ecraser. Il contient
    // peut-etre une cle API que l'utilisateur n'a nulle part ailleurs.
    try {
      fsSync.renameSync(FICHIER, `${FICHIER}.corrompu-${Date.now()}`);
    } catch (__) { /* tant pis : la prochaine ecriture l'ecrasera */ }
    return schema.vide();
  }
}

/** La configuration complete, CLES EN CLAIR. Reservee au code serveur. */
function lireV2() {
  if (!cacheCharge) {
    cache = lireLeFichier();
    cacheCharge = true;
  }
  return schema.copier(cache);
}

/**
 * La configuration a l'ANCIENNE forme, CLE EN CLAIR COMPRISE.
 *
 * Reservee au code serveur qui doit reellement appeler un modele. Tout ce qui
 * peut finir dans une reponse HTTP ou dans un log doit passer par
 * lireMasquee(), jamais par ici.
 *
 * @returns {{fournisseur: string, cleApi: string, baseURL: string,
 *            modeles: {redaction: string, extraction: string}}}
 */
function lire() {
  return schema.versV1(lireV2());
}

/* ------------------------------------------------------------------ */
/* Ce qui est reellement utilisable                                    */
/* ------------------------------------------------------------------ */

/**
 * Ce compte peut-il servir ?
 * Un fournisseur absent du catalogue (entree ecrite a la main, catalogue qui a
 * change entre deux versions de Mew) reste exploitable si son adresse est
 * connue : refuser serait contraire a la liberte promise.
 */
function compteUtilisable(c) {
  if (!c || c.fournisseur === '') return false;

  const f = fournisseurDuCatalogue(c.fournisseur);
  if (!f) return c.baseURL !== '';

  if (f.cleRequise && c.cleApi === '') return false;
  return c.baseURL !== '' || Boolean(f.baseURL);
}

/**
 * Le compte qui servira a une tache : celui qu'elle designe, ou a defaut le
 * premier compte utilisable. Le repli est ce qui fait qu'ajouter une cle
 * suffit a rendre Mew fonctionnel, sans avoir a regler quoi que ce soit
 * d'autre.
 */
function comptePourTache(config, idTache, utilisables) {
  const reglage = schema.tacheDe(config, idTache);
  if (!reglage.actif) return null;

  if (reglage.fournisseur !== '') {
    return utilisables.find((c) => c.fournisseur === reglage.fournisseur) || null;
  }
  return utilisables[0] || null;
}

/**
 * Cette tache peut-elle nommer un modele ?
 * Soit l'utilisateur en a choisi un, soit le catalogue en propose un pour le
 * role de cette tache — c'est exactement le raisonnement que fera aiService.
 */
function tacheUtilisable(config, idTache, utilisables) {
  const c = comptePourTache(config, idTache, utilisables);
  if (!c) return false;

  const reglage = schema.tacheDe(config, idTache);
  if (reglage.modele !== '') return true;

  return modelesPourRole(c.fournisseur, roleDe(idTache)).length > 0;
}

/**
 * Une configuration utilisable a-t-elle ete enregistree ?
 *
 * « Utilisable » veut dire : au moins un acces exploitable, et au moins une
 * tache active capable de nommer un modele. Une configuration a moitie
 * remplie repond false — mieux vaut afficher « non configure » que laisser
 * l'utilisateur decouvrir le probleme au moment ou il clique.
 *
 * @returns {boolean}
 */
function estConfigure() {
  const config = lireV2();
  const utilisables = config.comptes.filter(compteUtilisable);
  if (utilisables.length === 0) return false;

  return IDS_TACHES.some((id) => tacheUtilisable(config, id, utilisables));
}

/**
 * Tout ce qu'il faut pour executer UNE tache. Cle en clair : usage serveur.
 *
 * SANS TACHE CONNUE — un appelant qui ne precise rien, ou une tache retiree du
 * code — on rend le « reglage general » : exactement la vue a l'ancienne
 * forme, modeles par role compris. C'est ce qui garantit qu'un appel qui ne
 * connait pas les taches se comporte comme avant cette version.
 *
 * @param {string} idTache
 * @returns {{actif: boolean, fournisseur: string, modele: string,
 *            modeles: object, cleApi: string, baseURL: string}|null}
 *   null quand la tache est coupee ou qu'aucun acces ne peut la servir.
 */
function pourTache(idTache) {
  const config = lireV2();

  if (!tacheDuCatalogue(idTache)) {
    const v1 = schema.versV1(config);
    if (v1.fournisseur === '') return null;
    return { actif: true, ...v1, modele: '' };
  }

  const utilisables = config.comptes.filter(compteUtilisable);
  const c = comptePourTache(config, idTache, utilisables);
  if (!c) return null;

  return {
    actif: true,
    fournisseur: c.fournisseur,
    modele: schema.tacheDe(config, idTache).modele
      || modeleDuMemeRole(config, idTache, c, utilisables),
    // Vide a dessein : pour une tache connue, le repli est le catalogue de SON
    // fournisseur. Voir le commentaire de MODELES_VIDES dans config/index.js.
    modeles: { redaction: '', extraction: '' },
    cleApi: c.cleApi,
    baseURL: c.baseURL
  };
}

/**
 * Le repli « mon reglage general » : quand une tache n'a pas de modele a elle,
 * on prend celui d'une autre tache du MEME role servie par le MEME compte.
 *
 * Pourquoi le meme compte : reprendre un modele Anthropic pour une tache
 * servie par une cle OpenAI produirait une erreur « modele introuvable »
 * parfaitement incomprehensible. Mieux vaut ne rien trouver ici et laisser
 * aiService se rabattre sur le catalogue du bon fournisseur.
 */
function modeleDuMemeRole(config, idTache, compteChoisi, utilisables) {
  const role = roleDe(idTache);

  for (const autre of IDS_TACHES) {
    if (autre === idTache || roleDe(autre) !== role) continue;

    const reglage = schema.tacheDe(config, autre);
    if (!reglage.actif || reglage.modele === '') continue;

    const c = comptePourTache(config, autre, utilisables);
    if (c && c.fournisseur === compteChoisi.fournisseur) return reglage.modele;
  }
  return '';
}

/** Cette tache a-t-elle ete explicitement coupee par l'utilisateur ? */
function tacheCoupee(idTache) {
  return schema.tacheDe(lireV2(), idTache).actif === false;
}

/* ------------------------------------------------------------------ */
/* Masquage                                                            */
/* ------------------------------------------------------------------ */

// En dessous de cette longueur, montrer les extremites reviendrait a montrer
// la cle : on masque tout.
const LONGUEUR_MINIMALE_POUR_MASQUER = 12;

/**
 * Reduit une cle a ses extremites : « sk-p...4f2a ».
 *
 * Assez pour que l'utilisateur reconnaisse LAQUELLE de ses cles est
 * enregistree, totalement inutile pour s'en servir.
 *
 * @param {string} cle
 * @returns {string} chaine vide s'il n'y a pas de cle
 */
function masquerCle(cle) {
  const propre = typeof cle === 'string' ? cle.trim() : '';
  if (propre === '') return '';
  if (propre.length < LONGUEUR_MINIMALE_POUR_MASQUER) return '...';
  return `${propre.slice(0, 4)}...${propre.slice(-4)}`;
}

/**
 * La configuration a l'ancienne forme, telle qu'on a le droit de l'afficher.
 *
 * @returns {{fournisseur: string, cleApi: string, aUneCle: boolean,
 *            baseURL: string, modeles: object, configure: boolean}}
 */
function lireMasquee() {
  const v1 = lire();
  return {
    fournisseur: v1.fournisseur,
    cleApi: masquerCle(v1.cleApi),
    aUneCle: v1.cleApi !== '',
    baseURL: v1.baseURL,
    modeles: { ...v1.modeles },
    configure: estConfigure()
  };
}

/**
 * TOUT l'etat, sous la seule forme qu'on a le droit d'envoyer au navigateur.
 *
 * C'est ce que lit le nouvel ecran Parametres : la liste des acces (cles
 * masquees) et l'affectation des taches. `utilisable` dit, compte par compte,
 * si Mew saurait s'en servir — l'interface peut ainsi signaler une cle
 * manquante sans avoir a refaire le raisonnement de son cote.
 *
 * @returns {{comptes: Array, taches: object, configure: boolean}}
 */
function lireEtat() {
  const config = lireV2();
  const utilisables = config.comptes.filter(compteUtilisable);

  const taches = {};
  IDS_TACHES.forEach((id) => {
    const reglage = schema.tacheDe(config, id);
    const c = comptePourTache(config, id, utilisables);
    taches[id] = {
      actif: reglage.actif,
      fournisseur: reglage.fournisseur,
      modele: reglage.modele,
      // Ce qui SERA reellement utilise, repli compris. L'interface s'en sert
      // pour ecrire « suit ton reglage general (OpenAI) » au lieu de laisser
      // un champ vide qui n'explique rien.
      fournisseurEffectif: c ? c.fournisseur : '',
      utilisable: tacheUtilisable(config, id, utilisables)
    };
  });

  return {
    comptes: config.comptes.map((c) => ({
      fournisseur: c.fournisseur,
      cleMasquee: masquerCle(c.cleApi),
      aUneCle: c.cleApi !== '',
      baseURL: c.baseURL,
      utilisable: compteUtilisable(c)
    })),
    taches,
    configure: estConfigure()
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
 * Ce fichier contient des cles API : sur une machine partagee, le mode 0644
 * par defaut les rendrait lisibles par tous les comptes. Windows ignore ces
 * droits POSIX — l'echec y est normal et volontairement silencieux.
 */
async function restreindre(chemin) {
  try {
    await fs.chmod(chemin, 0o600);
  } catch (_) { /* Windows, ou systeme de fichiers sans droits POSIX */ }
}

/** Ecrit la configuration v2 sur le disque, atomiquement, et met le cache a jour. */
async function poser(config) {
  const contenu = `${JSON.stringify(config, null, 2)}\n`;

  await enFile(async () => {
    await fs.mkdir(path.dirname(FICHIER), { recursive: true });

    // Ecriture atomique : on ecrit a cote, puis on renomme. Le renommage est
    // instantane pour le systeme de fichiers — a aucun moment config-ia.json
    // n'existe a moitie ecrit. Le fichier temporaire nait deja en 0600 : les
    // cles ne sont jamais exposees, meme une fraction de seconde.
    const temporaire = `${FICHIER}.tmp`;
    await fs.writeFile(temporaire, contenu, { encoding: 'utf8', mode: 0o600 });
    await restreindre(temporaire);
    await fs.rename(temporaire, FICHIER);
    await restreindre(FICHIER);
  });

  cache = config;
  cacheCharge = true;
}

/** Une erreur de validation, dans la forme que les routes savent traduire. */
function refus(message) {
  const erreur = new Error(message);
  erreur.code = 'CONFIG_INVALIDE';
  return erreur;
}

/**
 * Enregistre UN acces chez UN fournisseur.
 *
 * Une cle vide alors qu'une cle est deja enregistree pour ce fournisseur veut
 * dire « je ne change pas ma cle » : l'interface ne l'a jamais recue, elle ne
 * peut pas la renvoyer.
 *
 * @param {object} entree { fournisseur, cleApi, baseURL }
 * @returns {Promise<{etat: object, avertissements: string[]}>}
 * @throws {Error} .code = 'CONFIG_INVALIDE', message en francais
 */
async function ecrireCompte(entree) {
  const config = lireV2();
  const id = typeof (entree && entree.fournisseur) === 'string' ? entree.fournisseur.trim() : '';
  const existant = schema.compte(config, id);

  const cleApi = (typeof (entree && entree.cleApi) === 'string' && entree.cleApi.trim() !== '')
    ? entree.cleApi
    : (existant ? existant.cleApi : '');

  const resultat = validation.validerCompte({ ...entree, cleApi });
  if (!resultat.ok) throw refus(resultat.erreur);

  const comptes = config.comptes.filter((c) => c.fournisseur !== resultat.compte.fournisseur);
  comptes.push(resultat.compte);

  await poser({ ...config, comptes });
  return { etat: lireEtat(), avertissements: resultat.avertissements };
}

/**
 * Retire un acces, cle comprise.
 *
 * Les taches qui pointaient vers lui sont remises sur « suivre le reglage
 * general » plutot que de rester braquees sur un compte disparu : sinon elles
 * echoueraient a la premiere utilisation, sans que rien ne l'ait annonce.
 *
 * @returns {Promise<{supprime: boolean, etat: object}>}
 */
async function supprimerCompte(idFournisseur) {
  const config = lireV2();
  const id = typeof idFournisseur === 'string' ? idFournisseur.trim() : '';

  const comptes = config.comptes.filter((c) => c.fournisseur !== id);
  if (comptes.length === config.comptes.length) {
    return { supprime: false, etat: lireEtat() };
  }

  const taches = {};
  IDS_TACHES.forEach((idTache) => {
    const reglage = schema.tacheDe(config, idTache);
    taches[idTache] = reglage.fournisseur === id
      ? { ...reglage, fournisseur: '', modele: '' }
      : { ...reglage };
  });

  await poser({ ...config, comptes, taches });
  return { supprime: true, etat: lireEtat() };
}

/**
 * Enregistre l'affectation des taches : pour chacune, active ou non, et quel
 * modele de quel compte.
 *
 * @param {object} tachesBrutes
 * @returns {Promise<{etat: object, avertissements: string[]}>}
 * @throws {Error} .code = 'CONFIG_INVALIDE'
 */
async function ecrireTaches(tachesBrutes) {
  const config = lireV2();
  const resultat = validation.validerTaches(tachesBrutes, config.comptes);
  if (!resultat.ok) throw refus(resultat.erreur);

  await poser({ ...config, taches: resultat.taches });
  return { etat: lireEtat(), avertissements: resultat.avertissements };
}

/**
 * Enregistre une configuration a l'ANCIENNE forme.
 * { fournisseur, cleApi, baseURL, modeles: { redaction, extraction } }
 *
 * Ce que cela veut dire aujourd'hui : « voici mon moteur ». L'acces est
 * ajoute ou mis a jour, et TOUTES les taches sont repointees vers lui. Les
 * autres acces enregistres sont conserves — on ne supprime jamais une cle que
 * l'utilisateur n'a pas demande a retirer.
 *
 * @returns {Promise<{configMasquee: object, avertissements: string[]}>}
 * @throws {Error} avec .code = 'CONFIG_INVALIDE' et un message en francais
 */
async function ecrire(entree) {
  const resultat = validation.validerV1(entree);
  if (!resultat.ok) throw refus(resultat.erreur);

  const config = lireV2();
  const { modeles, ...compte } = resultat.config;

  const comptes = config.comptes.filter((c) => c.fournisseur !== compte.fournisseur);
  comptes.push(compte);

  const taches = {};
  IDS_TACHES.forEach((id) => {
    taches[id] = {
      actif: schema.tacheDe(config, id).actif,
      fournisseur: compte.fournisseur,
      modele: modeles[roleDe(id)] || ''
    };
  });

  await poser({ ...config, comptes, taches });
  return { configMasquee: lireMasquee(), avertissements: resultat.avertissements };
}

/**
 * Oublie tout : le fichier est supprime, les cles avec lui.
 *
 * C'est le « je change d'avis » de l'utilisateur, et c'est aussi la reponse la
 * plus honnete a « comment je retire mes cles de cette machine ? ».
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

  cache = schema.vide();
  cacheCharge = true;
  return supprime;
}

module.exports = {
  // Ancienne forme — signatures inchangees.
  lire,
  ecrire,
  effacer,
  lireMasquee,
  estConfigure,
  valider: validation.validerV1,
  masquerCle,

  // Nouvelle forme.
  lireV2,
  lireEtat,
  pourTache,
  tacheCoupee,
  ecrireCompte,
  supprimerCompte,
  ecrireTaches,

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
    normaliser: (brut) => schema.versV1(schema.normaliser(brut)),
    verifierAdresse: validation.verifierAdresse
  }
};
