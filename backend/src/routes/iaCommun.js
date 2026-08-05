/**
 * CE QUE PARTAGENT LES ROUTES DE REGLAGES DU MOTEUR D'IA.
 *
 * Extrait de routes/ia.js le jour ou ces routes se sont dedoublees (le
 * catalogue et le test d'un cote, l'ecriture des reglages de l'autre). Rien
 * de nouveau ici : uniquement ce que les deux fichiers utilisaient deja.
 *
 * DEUX REGLES QUI GOUVERNENT CES TROIS FICHIERS
 *
 * 1. La cle API ne repart JAMAIS vers le navigateur. Seules
 *    configUtilisateur.lireMasquee() et lireEtat() ont le droit de decrire la
 *    configuration vers l'exterieur. On ne journalise pas non plus le corps
 *    des requetes : il contient la cle en clair.
 *
 * 2. Le limiteur de requetes IA n'est PAS applique globalement. Lire le
 *    catalogue ou enregistrer un choix ne coute rien et n'appelle personne :
 *    les brider empecherait de reparer une configuration au pire moment. Seul
 *    /tester, qui fait un vrai appel au fournisseur, passe par le limiteur.
 */

const configUtilisateur = require('../llm/configUtilisateur');
const config = require('../config');
const { creer } = require('../lib/logger');

const log = creer('IA');

/** Statut HTTP correspondant a un code d'erreur du contrat des adaptateurs. */
const STATUT_PAR_CODE = {
  CLE_INVALIDE: 401,
  QUOTA_DEPASSE: 429,
  MODELE_INTROUVABLE: 404,
  TIMEOUT: 504,
  RESEAU: 502,
  FOURNISSEUR: 502
};

const statutPour = (code) => (
  Object.prototype.hasOwnProperty.call(STATUT_PAR_CODE, code) ? STATUT_PAR_CODE[code] : 502
);

const echouer = (res, statut, message, code) => res.status(statut).json({
  success: false,
  error: message,
  ...(code ? { code } : {})
});

/**
 * Le filet de securite. On journalise le MESSAGE, jamais l'objet d'erreur
 * complet ni le corps de la requete : la cle de l'utilisateur s'y trouve.
 */
const erreurServeur = (res, erreur, ou) => {
  log.error(`${ou} :`, erreur && erreur.message);
  return echouer(res, 500, 'Erreur serveur inattendue pendant la configuration du moteur d\'IA.');
};

/**
 * La configuration masquee a l'ANCIENNE forme, plus quelques alias de noms.
 *
 * POURQUOI DES ALIAS : l'ecran de reglages lit `cleMasquee` / `cleEnregistree`
 * la ou on ecrit `cleApi` / `aUneCle`. Envoyer les deux ecritures coute trois
 * lignes et evite un ecran qui affiche « aucune cle » alors qu'une cle est
 * bien enregistree.
 */
function configPourInterface() {
  const masquee = configUtilisateur.lireMasquee();
  return {
    ...masquee,
    cleMasquee: masquee.cleApi,
    cleEnregistree: masquee.aUneCle
  };
}

/**
 * D'ou vient la configuration reellement utilisee, et l'interface a-t-elle le
 * droit de la modifier ?
 *
 * Quand backend/.env impose une cle, le fichier de l'utilisateur existe
 * peut-etre encore mais il ne sert a rien : il faut le dire, sinon on
 * enregistre un choix qui n'a aucun effet et personne ne comprend pourquoi.
 */
function etatDeLaConfiguration() {
  const verrouilleParEnv = config.ia.source === 'env';

  return {
    source: config.ia.source,             // 'env' | 'fichier' | 'aucune'
    verrouilleParEnv,
    active: config.capacites.ia,
    ...(verrouilleParEnv ? {
      note: 'Le moteur d\'IA est impose par le fichier backend/.env de cette installation. '
        + 'Pour choisir toi-meme, retire OPENAI_API_KEY de ce fichier puis relance le serveur.'
    } : {})
  };
}

/**
 * Vide la configuration que aiService garde resolue en memoire.
 *
 * POURQUOI : sans ce coup de balai, changer de fournisseur depuis l'interface
 * n'aurait aucun effet avant un redemarrage du serveur — un bug
 * particulierement deroutant, puisque l'ecran de reglages afficherait bien la
 * nouvelle valeur.
 */
function oublierLeClientIa() {
  try {
    const aiService = require('../services/aiService');
    if (aiService && aiService._client) aiService._client = null;
  } catch (_) {
    // aiService peut ne pas etre chargeable (dependance absente) : ce n'est
    // pas une raison pour faire echouer l'enregistrement du choix.
  }
}

module.exports = {
  log,
  statutPour,
  echouer,
  erreurServeur,
  configPourInterface,
  etatDeLaConfiguration,
  oublierLeClientIa
};
