const express = require('express');

const configUtilisateur = require('../llm/configUtilisateur');
const { testerConnexion } = require('../llm/testConnexion');
const { adaptateur: chargerAdaptateur } = require('../llm/adapters');
const {
  fournisseurs, fournisseur: fournisseurDuCatalogue, ROLES, verifieLe
} = require('../llm/providers');
const { aiRateLimiter } = require('../middleware/rateLimiter');
const config = require('../config');
const { creer } = require('../lib/logger');

const router = express.Router();
const log = creer('IA');

/**
 * ========================================
 * REGLAGES DU MOTEUR D'IA
 * ========================================
 *
 * Ces routes servent une seule idee : c'est l'UTILISATEUR qui choisit son
 * fournisseur et son modele, depuis l'interface, avec sa propre cle. Plus
 * besoin d'ouvrir un fichier .env dans un editeur de texte.
 *
 * DEUX REGLES QUI GOUVERNENT TOUT CE FICHIER
 *
 * 1. La cle API ne repart JAMAIS vers le navigateur. Une seule fonction a le
 *    droit de decrire la configuration ici : configUtilisateur.lireMasquee().
 *    Elle rend « sk-p...4f2a ». On ne journalise pas non plus le corps des
 *    requetes : il contient la cle en clair.
 *
 * 2. Le limiteur de requetes IA n'est PAS applique globalement. Lire le
 *    catalogue ou enregistrer un choix ne coute rien et n'appelle personne :
 *    les brider n'aurait aucun sens, et empecherait de reparer une
 *    configuration au pire moment. Seul /tester, qui fait un vrai appel au
 *    fournisseur, passe par le limiteur.
 *
 * NOTE SUR L'AUTHENTIFICATION : comme /api/capacites, ces routes ne sont pas
 * derriere le middleware d'authentification. Mew est concu pour tourner sur la
 * machine de son utilisateur, en ecoute sur 127.0.0.1 (voir SECURITY.md). Si
 * un jour Mew est expose a plusieurs personnes, ces routes devront etre
 * protegees en premier : elles manipulent une cle API.
 */

/* ------------------------------------------------------------------ */
/* Reponses                                                            */
/* ------------------------------------------------------------------ */

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

/**
 * La configuration masquee, plus quelques alias de noms.
 *
 * POURQUOI DES ALIAS : l'ecran de reglages a ete ecrit en parallele de ces
 * routes, et il lit `cleMasquee` / `cleEnregistree` la ou on ecrit `cleApi` /
 * `aUneCle`. Envoyer les deux ecritures coute trois lignes et evite un ecran
 * qui affiche « aucune cle » alors qu'une cle est bien enregistree. A
 * supprimer le jour ou les deux cotes seront alignes.
 */
function configPourInterface() {
  const masquee = configUtilisateur.lireMasquee();
  return {
    ...masquee,
    cleMasquee: masquee.cleApi,
    cleEnregistree: masquee.aUneCle
  };
}

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

/* ------------------------------------------------------------------ */
/* Etat courant                                                        */
/* ------------------------------------------------------------------ */

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
 * Vide le client OpenAI garde en memoire par aiService.
 *
 * POURQUOI : aiService construit son client au premier appel et le conserve.
 * Sans ce coup de balai, changer de fournisseur depuis l'interface n'aurait
 * aucun effet avant un redemarrage du serveur — un bug particulierement
 * deroutant, puisque l'ecran de reglages afficherait la nouvelle valeur.
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

/* ------------------------------------------------------------------ */
/* GET /api/ia/fournisseurs                                            */
/* ------------------------------------------------------------------ */

/**
 * Le catalogue complet : de la donnee publique, aucune cle nulle part.
 * L'interface s'en sert pour construire ses deux menus deroulants.
 */
router.get('/fournisseurs', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        // Les tarifs vieillissent : la date permet a l'interface de prevenir
        // honnetement que ce sont des ordres de grandeur.
        verifieLe,
        roles: ROLES,
        fournisseurs: fournisseurs(),
        etat: etatDeLaConfiguration()
      }
    });
  } catch (erreur) {
    erreurServeur(res, erreur, 'Lecture du catalogue');
  }
});

/* ------------------------------------------------------------------ */
/* GET /api/ia/config                                                  */
/* ------------------------------------------------------------------ */

/**
 * La configuration enregistree, MASQUEE.
 * `aUneCle` permet a l'interface d'afficher « cle enregistree » sans jamais
 * recevoir la cle : l'utilisateur n'a pas a la ressaisir pour changer de
 * modele.
 */
router.get('/config', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        ...configPourInterface(),
        etat: etatDeLaConfiguration()
      }
    });
  } catch (erreur) {
    erreurServeur(res, erreur, 'Lecture de la configuration');
  }
});

/* ------------------------------------------------------------------ */
/* PUT /api/ia/config                                                  */
/* ------------------------------------------------------------------ */

/**
 * Enregistre le choix de l'utilisateur.
 * Body : { fournisseur, cleApi, baseURL, modeles: { redaction, extraction } }
 *
 * Toute la validation vit dans configUtilisateur.valider() : fournisseur
 * connu, adresse en http/https, cle presente si le fournisseur l'exige,
 * modeles coherents. Les avertissements (prefixe de cle inhabituel, modele
 * absent du catalogue) n'empechent pas l'enregistrement, ils accompagnent la
 * reponse.
 */
router.put('/config', async (req, res) => {
  try {
    const corps = req.body || {};

    // Une cle vide alors qu'une cle est deja enregistree veut dire « je ne
    // change pas ma cle », pas « efface-la » : l'interface ne l'a jamais
    // recue, elle ne peut pas la renvoyer.
    const existante = configUtilisateur.lire();
    const memeFournisseur = existante.fournisseur !== ''
      && existante.fournisseur === String(corps.fournisseur || '').trim();
    const cleApi = (typeof corps.cleApi === 'string' && corps.cleApi.trim() !== '')
      ? corps.cleApi
      : (memeFournisseur ? existante.cleApi : '');

    // Les modeles peuvent arriver imbriques (modeles.redaction, le vocabulaire
    // des roles) ou a plat (modeleRedaction). On accepte les deux plutot que
    // de perdre silencieusement le choix de l'utilisateur.
    const modelesRecus = (corps.modeles && typeof corps.modeles === 'object') ? corps.modeles : {};

    const { configMasquee, avertissements } = await configUtilisateur.ecrire({
      fournisseur: corps.fournisseur,
      cleApi,
      baseURL: corps.baseURL,
      modeles: {
        redaction: modelesRecus.redaction || corps.modeleRedaction,
        extraction: modelesRecus.extraction || corps.modeleExtraction
      }
    });

    oublierLeClientIa();
    // On journalise le fait, jamais la cle.
    log.info(`Moteur d'IA enregistre : ${configMasquee.fournisseur}`);

    res.json({
      success: true,
      data: {
        ...configMasquee,
        cleMasquee: configMasquee.cleApi,
        cleEnregistree: configMasquee.aUneCle,
        etat: etatDeLaConfiguration(),
        avertissements
      }
    });
  } catch (erreur) {
    if (erreur && erreur.code === 'CONFIG_INVALIDE') {
      return echouer(res, 400, erreur.message, erreur.code);
    }
    return erreurServeur(res, erreur, 'Enregistrement de la configuration');
  }
});

/* ------------------------------------------------------------------ */
/* DELETE /api/ia/config                                               */
/* ------------------------------------------------------------------ */

/**
 * Oublie tout : le fichier est supprime, la cle avec lui.
 * C'est la reponse a « comment je retire ma cle de cette machine ? ».
 */
router.delete('/config', async (req, res) => {
  try {
    const supprime = await configUtilisateur.effacer();
    oublierLeClientIa();
    log.info('Configuration du moteur d\'IA effacee');

    res.json({
      success: true,
      data: {
        supprime,
        message: supprime
          ? 'Configuration effacee : ta cle API n\'est plus enregistree sur cette machine.'
          : 'Il n\'y avait aucune configuration a effacer.',
        ...configPourInterface(),
        etat: etatDeLaConfiguration()
      }
    });
  } catch (erreur) {
    erreurServeur(res, erreur, 'Effacement de la configuration');
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/ia/tester                                                 */
/* ------------------------------------------------------------------ */

/**
 * Teste une configuration SANS l'enregistrer.
 *
 * C'est la seule route de ce fichier qui appelle reellement un fournisseur :
 * c'est donc la seule qui passe par le limiteur de requetes.
 *
 * La reponse est toujours un succes HTTP tant que le test a pu etre CONDUIT.
 * Le verdict est dans data.ok / data.etape / data.suitLesConsignes : un modele
 * qui repond mais ignore le format demande n'est pas une panne, c'est une
 * information que l'utilisateur doit voir avant de choisir.
 */
router.post('/tester', aiRateLimiter, async (req, res) => {
  try {
    const corps = req.body || {};

    // Meme logique que pour l'enregistrement : sans cle dans la requete, on
    // reprend celle deja enregistree pour ce fournisseur. Ca permet de
    // retester apres coup sans jamais renvoyer la cle au navigateur.
    const existante = configUtilisateur.lire();
    const memeFournisseur = existante.fournisseur !== ''
      && existante.fournisseur === String(corps.fournisseur || '').trim();
    const cleApi = (typeof corps.cleApi === 'string' && corps.cleApi.trim() !== '')
      ? corps.cleApi
      : (memeFournisseur ? existante.cleApi : '');

    const resultat = await testerConnexion({
      fournisseur: corps.fournisseur,
      cleApi,
      baseURL: corps.baseURL,
      // On teste par defaut le modele de redaction : c'est celui dont le
      // respect du format compte le plus.
      modele: corps.modele
        || (corps.modeles && corps.modeles.redaction)
        || (memeFournisseur ? existante.modeles.redaction : '')
    });

    log.info(`Test ${resultat.ok ? 'reussi' : 'echoue'} (etape ${resultat.etape})`);
    // `cout` est un alias de `coutEstime`, pour la meme raison que
    // `cleMasquee` plus haut : les deux cotes ont ete ecrits en parallele.
    res.json({ success: true, data: { ...resultat, cout: resultat.coutEstime } });
  } catch (erreur) {
    erreurServeur(res, erreur, 'Test de connexion');
  }
});

/* ------------------------------------------------------------------ */
/* Listage des modeles en direct                                       */
/* ------------------------------------------------------------------ */

/**
 * Demande sa liste de modeles a un fournisseur.
 *
 * Indispensable pour Ollama, LM Studio et llama.cpp : leur catalogue statique
 * est vide par construction, puisqu'il depend de ce que l'utilisateur a
 * telecharge. Tres utile aussi chez OpenRouter (des centaines de modeles) et
 * partout ou les noms changent souvent.
 *
 * @returns la liste normalisee, ou null quand le fournisseur n'expose pas
 *          cette possibilite — auquel cas le catalogue statique fait foi.
 */
async function listerLesModeles(req, res, cleFournie) {
  const idFournisseur = String(req.params.fournisseur || '').trim();
  const f = fournisseurDuCatalogue(idFournisseur);

  // L'adresse peut venir de l'URL (GET) ou du corps (POST). Elle est
  // facultative : sans elle, on prend celle du catalogue.
  const adresseBrute = (req.query && req.query.baseURL) || (req.body && req.body.baseURL);
  const adresseDemandee = typeof adresseBrute === 'string' ? adresseBrute.trim() : '';

  if (!f && adresseDemandee === '') {
    return echouer(res, 404,
      `Le fournisseur « ${idFournisseur || '(vide)'} » n'existe pas dans Mew.`);
  }

  const baseURL = adresseDemandee || (f && f.baseURL) || '';
  if (baseURL === '') {
    return echouer(res, 400,
      'Saisis d\'abord l\'adresse de ton service : sans elle, impossible de lui demander ses modeles.');
  }

  const verification = configUtilisateur.interne.verifierAdresse(baseURL);
  if (!verification.ok) return echouer(res, 400, verification.erreur);

  // La cle : celle fournie dans le corps (POST), sinon celle deja enregistree
  // pour CE fournisseur. On ne lit jamais de cle dans l'URL : elle finirait
  // dans les journaux du serveur et dans l'historique du navigateur.
  const existante = configUtilisateur.lire();
  const cleApi = cleFournie
    || (existante.fournisseur === idFournisseur ? existante.cleApi : '');

  try {
    const adaptateur = chargerAdaptateur((f && f.adaptateur) || 'openai-compatible');
    const modeles = await adaptateur.listerModeles({ baseURL: verification.url, cleApi });

    return res.json({
      success: true,
      data: {
        fournisseur: idFournisseur,
        // null = ce fournisseur ne sait pas lister. Ce n'est pas une erreur :
        // l'interface retombe alors sur les modeles du catalogue.
        modeles,
        catalogue: f ? f.modeles : [],
        source: modeles ? 'direct' : 'catalogue'
      }
    });
  } catch (erreur) {
    const code = erreur && typeof erreur.code === 'string' ? erreur.code : 'FOURNISSEUR';
    return echouer(res, statutPour(code),
      erreur && erreur.message ? erreur.message : 'Impossible de recuperer la liste des modeles.',
      code);
  }
}

/**
 * GET /api/ia/modeles/:fournisseur
 * Utilise la cle deja enregistree, s'il y en a une pour ce fournisseur.
 * C'est le cas d'usage principal : Ollama et LM Studio n'ont pas de cle.
 */
router.get('/modeles/:fournisseur', async (req, res) => {
  try {
    await listerLesModeles(req, res, '');
  } catch (erreur) {
    erreurServeur(res, erreur, 'Listage des modeles');
  }
});

/**
 * POST /api/ia/modeles/:fournisseur
 * Body : { cleApi?, baseURL? }
 *
 * Meme chose, mais avec une cle qui n'est pas encore enregistree : c'est ce
 * qui permet de coller sa cle puis de voir immediatement la liste des modeles
 * disponibles, AVANT de valider quoi que ce soit. Une cle n'a rien a faire
 * dans une URL — d'ou cette variante en POST.
 */
router.post('/modeles/:fournisseur', async (req, res) => {
  try {
    const corps = req.body || {};
    const cleApi = typeof corps.cleApi === 'string' ? corps.cleApi.trim() : '';
    await listerLesModeles(req, res, cleApi);
  } catch (erreur) {
    erreurServeur(res, erreur, 'Listage des modeles');
  }
});

module.exports = router;
