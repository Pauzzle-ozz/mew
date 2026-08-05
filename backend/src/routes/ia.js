const express = require('express');

const configUtilisateur = require('../llm/configUtilisateur');
const { testerConnexion } = require('../llm/testConnexion');
const { adaptateur: chargerAdaptateur } = require('../llm/adapters');
const {
  fournisseursAvecGuides, fournisseur: fournisseurDuCatalogue, ROLES, verifieLe
} = require('../llm/providers');
const { OUTILS, TACHES } = require('../llm/taches');
const { aiRateLimiter } = require('../middleware/rateLimiter');
const reglages = require('./iaReglages');
const { log, statutPour, echouer, erreurServeur, etatDeLaConfiguration } = require('./iaCommun');

const router = express.Router();

/**
 * ========================================
 * REGLAGES DU MOTEUR D'IA
 * ========================================
 *
 * Ces routes servent une seule idee : c'est l'UTILISATEUR qui choisit ses
 * fournisseurs et ses modeles, depuis l'interface, avec ses propres cles.
 * Plus besoin d'ouvrir un fichier .env dans un editeur de texte.
 *
 * Ce fichier porte ce qui LIT ou ESSAIE (le catalogue, la liste des modeles,
 * le test de connexion). Tout ce qui ECRIT vit dans ./iaReglages.js, monte
 * juste en dessous. Les regles communes aux deux sont dans ./iaCommun.js.
 *
 * NOTE SUR L'AUTHENTIFICATION : comme /api/capacites, ces routes ne sont pas
 * derriere le middleware d'authentification. Mew est concu pour tourner sur la
 * machine de son utilisateur, en ecoute sur 127.0.0.1 (voir SECURITY.md). Si
 * un jour Mew est expose a plusieurs personnes, ces routes devront etre
 * protegees en premier : elles manipulent des cles API.
 */

/* ------------------------------------------------------------------ */
/* GET /api/ia/fournisseurs                                            */
/* ------------------------------------------------------------------ */

/**
 * Tout ce qu'il faut pour construire l'ecran Parametres, en un appel.
 *
 * De la donnee publique, aucune cle nulle part :
 *   fournisseurs : le catalogue, chaque entree augmentee de son guide
 *                  (atouts, limites, confidentialite, comment obtenir la cle)
 *                  et chaque modele de sa note. Les mis en avant d'abord.
 *   outils       : les cinq outils de Mew, et ce que chacun calcule TOUT SEUL.
 *   taches       : les points ou un modele est appele, et a quel outil ils
 *                  appartiennent. C'est ce qui permet a l'interface de dire,
 *                  outil par outil, ce qui passe par l'IA et ce qui n'y passe
 *                  pas — et de laisser couper l'un sans perdre l'autre.
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
        fournisseurs: fournisseursAvecGuides(),
        outils: OUTILS,
        taches: TACHES,
        etat: etatDeLaConfiguration()
      }
    });
  } catch (erreur) {
    erreurServeur(res, erreur, 'Lecture du catalogue');
  }
});

/* ------------------------------------------------------------------ */
/* Lecture et ecriture des reglages                                    */
/* ------------------------------------------------------------------ */

// Monte /etat, /comptes/:fournisseur, /taches et /config.
router.use(reglages);

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
    const idFournisseur = String(corps.fournisseur || '').trim();

    // Sans cle dans la requete, on reprend celle deja enregistree POUR CE
    // FOURNISSEUR. Ca permet de retester apres coup sans jamais renvoyer la
    // cle au navigateur. Depuis le multi-comptes, on la cherche dans la liste
    // des acces : la cle Anthropic ne doit pas servir a tester OpenAI.
    const comptes = configUtilisateur.lireV2().comptes;
    const enregistre = comptes.find((c) => c.fournisseur === idFournisseur) || null;

    const cleApi = (typeof corps.cleApi === 'string' && corps.cleApi.trim() !== '')
      ? corps.cleApi
      : (enregistre ? enregistre.cleApi : '');

    const resultat = await testerConnexion({
      fournisseur: idFournisseur,
      cleApi,
      baseURL: corps.baseURL || (enregistre ? enregistre.baseURL : ''),
      // On teste par defaut le modele de redaction : c'est celui dont le
      // respect du format compte le plus.
      modele: corps.modele || (corps.modeles && corps.modeles.redaction) || ''
    });

    log.info(`Test ${resultat.ok ? 'reussi' : 'echoue'} (etape ${resultat.etape})`);
    // `cout` est un alias de `coutEstime` : les deux cotes du projet ont ete
    // ecrits en parallele.
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

  // La cle : celle fournie dans le corps (POST), sinon celle deja enregistree
  // pour CE fournisseur. On ne lit jamais de cle dans l'URL : elle finirait
  // dans les journaux du serveur et dans l'historique du navigateur.
  const enregistre = configUtilisateur.lireV2().comptes
    .find((c) => c.fournisseur === idFournisseur) || null;

  const baseURL = adresseDemandee
    || (enregistre && enregistre.baseURL)
    || (f && f.baseURL)
    || '';

  if (baseURL === '') {
    return echouer(res, 400,
      'Saisis d\'abord l\'adresse de ton service : sans elle, impossible de lui demander ses modeles.');
  }

  const verification = configUtilisateur.interne.verifierAdresse(baseURL);
  if (!verification.ok) return echouer(res, 400, verification.erreur);

  const cleApi = cleFournie || (enregistre ? enregistre.cleApi : '');

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
