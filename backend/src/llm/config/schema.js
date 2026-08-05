/**
 * LA FORME DU FICHIER DE REGLAGES, ET SA REPRISE DEPUIS L'ANCIENNE.
 *
 * CE QUI A CHANGE, ET POURQUOI
 * Mew n'enregistrait qu'UN fournisseur, UNE cle, DEUX modeles :
 *
 *   { fournisseur, cleApi, baseURL, modeles: { redaction, extraction } }
 *
 * Impossible, avec ca, de repondre a « je veux que tel modele lise mes CV et
 * que tel autre redige mes lettres » des lors que les deux ne sont pas chez le
 * meme fournisseur. La forme v2 separe donc deux choses qui n'avaient aucune
 * raison d'etre melangees :
 *
 *   comptes : chez qui j'ai un acces, et avec quelle cle. Un par fournisseur.
 *   taches  : pour chaque chose que Mew demande a un modele — est-ce que je
 *             l'active, et si oui, quel modele de quel compte.
 *
 *   {
 *     version: 2,
 *     comptes: [ { fournisseur, cleApi, baseURL } ],
 *     taches: { 'lettre': { actif, fournisseur, modele }, ... }
 *   }
 *
 * PERSONNE NE DOIT PERDRE SES REGLAGES
 * Un fichier v1 sur le disque est repris silencieusement (`depuisV1`) : la cle
 * devient un compte, et toutes les taches pointent vers lui avec le modele de
 * leur role historique. Rien a faire pour l'utilisateur, rien a ressaisir.
 *
 * ET DANS L'AUTRE SENS
 * `versV1` reconstruit l'ancienne vue a partir de la nouvelle. Tout le code
 * qui lisait `config.ia.fournisseur` continue de fonctionner sans changement —
 * c'est ce qui permet de faire cette migration sans toucher a la moitie du
 * projet d'un coup.
 *
 * CE FICHIER NE LEVE JAMAIS. Ce qu'il recoit vient d'un fichier que
 * l'utilisateur a pu editer a la main, ou du navigateur.
 */

const { IDS: IDS_TACHES, roleDe } = require('../taches');

const VERSION = 2;

const texte = (valeur) => (typeof valeur === 'string' ? valeur.trim() : '');

/** La configuration vide : la forme exacte, avec des valeurs neutres. */
const vide = () => ({ version: VERSION, comptes: [], taches: {} });

/* ------------------------------------------------------------------ */
/* Comptes                                                             */
/* ------------------------------------------------------------------ */

/** Un compte propre, ou null si son fournisseur est absent. */
function normaliserCompte(brut) {
  if (!brut || typeof brut !== 'object') return null;

  const fournisseur = texte(brut.fournisseur || brut.id);
  if (fournisseur === '') return null;

  return {
    fournisseur,
    cleApi: texte(brut.cleApi || brut.cle),
    // On retire le slash final : « .../v1/ » et « .../v1 » doivent donner la
    // meme configuration, sinon on obtient des URL a double slash.
    baseURL: texte(brut.baseURL || brut.baseUrl).replace(/\/+$/, '')
  };
}

/**
 * Le compte enregistre pour un fournisseur, ou null.
 * Parcours de liste et pas acces par cle : un identifiant venu du navigateur
 * ne doit pas pouvoir aller chercher `__proto__`.
 */
function compte(config, idFournisseur) {
  if (typeof idFournisseur !== 'string') return null;
  return config.comptes.find((c) => c.fournisseur === idFournisseur) || null;
}

/* ------------------------------------------------------------------ */
/* Taches                                                              */
/* ------------------------------------------------------------------ */

/**
 * Le reglage d'une tache.
 *
 * `actif` vaut true par defaut : une tache absente du fichier — parce qu'elle
 * vient d'etre ajoutee a Mew — doit fonctionner, pas rester muette. On ne
 * coupe que ce que l'utilisateur a explicitement coupe.
 */
function normaliserTache(brut) {
  if (!brut || typeof brut !== 'object') return { actif: true, fournisseur: '', modele: '' };

  return {
    actif: brut.actif !== false,
    fournisseur: texte(brut.fournisseur),
    modele: texte(brut.modele)
  };
}

/**
 * Les reglages de toutes les taches CONNUES, et seulement elles.
 *
 * On part de la liste des taches de Mew plutot que des cles du fichier : une
 * tache supprimee du code ne traine pas dans le fichier pour toujours, et une
 * cle inventee (« __proto__ ») ne peut pas s'y glisser.
 */
function normaliserTaches(brut) {
  const source = (brut && typeof brut === 'object' && !Array.isArray(brut)) ? brut : {};
  const taches = {};

  IDS_TACHES.forEach((id) => {
    taches[id] = normaliserTache(
      Object.prototype.hasOwnProperty.call(source, id) ? source[id] : null
    );
  });

  return taches;
}

/**
 * Le reglage d'une tache, jamais null : une tache inconnue rend un reglage
 * neutre plutot que de forcer chaque appelant a se defendre.
 */
function tacheDe(config, idTache) {
  if (typeof idTache !== 'string'
    || !Object.prototype.hasOwnProperty.call(config.taches, idTache)) {
    return { actif: true, fournisseur: '', modele: '' };
  }
  return config.taches[idTache];
}

/* ------------------------------------------------------------------ */
/* Reprise de l'ancienne forme                                         */
/* ------------------------------------------------------------------ */

/** Un fichier v1 est-il devant nous ? Il n'a ni `comptes` ni `version`. */
const estV1 = (brut) => Boolean(
  brut && typeof brut === 'object'
  && !Array.isArray(brut.comptes)
  && (typeof brut.fournisseur === 'string' || typeof brut.cleApi === 'string')
);

/**
 * v1 -> v2 : la cle devient un compte, et TOUTES les taches pointent vers lui
 * avec le modele de leur role historique. L'utilisateur retrouve exactement le
 * comportement qu'il avait, et decouvre les nouveaux reglages deja remplis.
 */
function depuisV1(brut) {
  const objet = (brut && typeof brut === 'object') ? brut : {};
  const modeles = (objet.modeles && typeof objet.modeles === 'object') ? objet.modeles : {};

  const redaction = texte(modeles.redaction || objet.modeleRedaction);
  const extraction = texte(modeles.extraction || objet.modeleExtraction);
  const fournisseur = texte(objet.fournisseur);

  const config = vide();
  const unCompte = normaliserCompte(objet);
  if (unCompte) config.comptes.push(unCompte);

  IDS_TACHES.forEach((id) => {
    // Un seul modele renseigne sert pour les deux roles : c'est deja ce que
    // faisait la v1, et c'est le choix de quelqu'un qui ne veut pas se poser
    // de questions.
    const pourLeRole = roleDe(id) === 'redaction'
      ? (redaction || extraction)
      : (extraction || redaction);

    config.taches[id] = { actif: true, fournisseur, modele: pourLeRole };
  });

  return config;
}

/**
 * v2 -> v1 : la vue que le reste du projet lit encore.
 *
 * Le fournisseur « principal » est celui de la premiere tache de redaction
 * active — c'est celui que l'utilisateur considere comme son moteur — puis,
 * a defaut, le premier compte enregistre. Les deux modeles sont ceux de la
 * premiere tache active de chaque role.
 */
function versV1(config) {
  const active = (id) => {
    const t = tacheDe(config, id);
    return t.actif && t.modele !== '' ? t : null;
  };

  const premiere = (role) => {
    for (const id of IDS_TACHES) {
      if (roleDe(id) !== role) continue;
      const t = active(id);
      if (t) return t;
    }
    return null;
  };

  const enRedaction = premiere('redaction');
  const enExtraction = premiere('extraction');

  const principal = (enRedaction && compte(config, enRedaction.fournisseur))
    || (enExtraction && compte(config, enExtraction.fournisseur))
    || config.comptes[0]
    || null;

  return {
    fournisseur: principal ? principal.fournisseur : '',
    cleApi: principal ? principal.cleApi : '',
    baseURL: principal ? principal.baseURL : '',
    modeles: {
      // On ne remonte le modele que s'il appartient bien au compte principal :
      // sinon la vue v1 annoncerait un modele Anthropic avec une cle OpenAI,
      // ce qui produirait une erreur incomprehensible.
      redaction: enRedaction && principal && enRedaction.fournisseur === principal.fournisseur
        ? enRedaction.modele : '',
      extraction: enExtraction && principal && enExtraction.fournisseur === principal.fournisseur
        ? enExtraction.modele : ''
    }
  };
}

/* ------------------------------------------------------------------ */
/* Normalisation et copie                                              */
/* ------------------------------------------------------------------ */

/**
 * Ramene n'importe quoi a la forme v2.
 * Accepte une v2, une v1 (reprise au passage), ou n'importe quoi d'autre.
 *
 * @param {*} brut
 * @returns {{version: number, comptes: Array, taches: object}}
 */
function normaliser(brut) {
  if (Array.isArray(brut) || !brut || typeof brut !== 'object') return vide();
  if (estV1(brut)) return depuisV1(brut);

  const comptesBruts = Array.isArray(brut.comptes) ? brut.comptes : [];
  const comptes = [];

  comptesBruts.forEach((c) => {
    const propre = normaliserCompte(c);
    // Un fournisseur en double (fichier edite a la main) : le premier gagne.
    if (propre && !comptes.some((existant) => existant.fournisseur === propre.fournisseur)) {
      comptes.push(propre);
    }
  });

  return { version: VERSION, comptes, taches: normaliserTaches(brut.taches) };
}

/** Copie defensive : personne ne doit pouvoir modifier le cache par accident. */
function copier(config) {
  const taches = {};
  Object.keys(config.taches).forEach((id) => { taches[id] = { ...config.taches[id] }; });

  return {
    version: config.version,
    comptes: config.comptes.map((c) => ({ ...c })),
    taches
  };
}

module.exports = {
  VERSION,
  vide,
  normaliser,
  copier,
  compte,
  tacheDe,
  normaliserCompte,
  normaliserTaches,
  depuisV1,
  versV1,
  estV1
};
