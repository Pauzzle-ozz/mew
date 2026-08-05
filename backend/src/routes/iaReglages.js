/**
 * TOUT CE QUI ECRIT LES REGLAGES DU MOTEUR D'IA.
 *
 * DEUX GENERATIONS DE ROUTES COHABITENT ICI, et c'est volontaire :
 *
 *   /config  — l'ancienne. Un fournisseur, une cle, deux modeles par role.
 *              Toujours en service : elle documente le cas simple, et des
 *              tests garantissent qu'elle ne laisse pas fuir de cle.
 *   /comptes et /taches — la nouvelle. Les acces d'un cote (une cle par
 *              fournisseur, autant qu'on veut), l'affectation des taches de
 *              l'autre (quelle tache, allumee ou non, quel modele de quel
 *              compte). C'est cette separation qui permet a un modele de lire
 *              les CV pendant qu'un autre, ailleurs, redige les lettres.
 *
 * LA CLE NE REPART JAMAIS VERS LE NAVIGATEUR. Les reponses de ce fichier
 * passent toutes par configUtilisateur.lireEtat() ou lireMasquee().
 */

const express = require('express');

const configUtilisateur = require('../llm/configUtilisateur');
const {
  log, echouer, erreurServeur, configPourInterface, etatDeLaConfiguration, oublierLeClientIa
} = require('./iaCommun');

const router = express.Router();

/** Une erreur de validation se traduit par un 400 explicite, jamais un 500. */
function repondreErreurEcriture(res, erreur, ou) {
  if (erreur && erreur.code === 'CONFIG_INVALIDE') {
    return echouer(res, 400, erreur.message, erreur.code);
  }
  return erreurServeur(res, erreur, ou);
}

/* ------------------------------------------------------------------ */
/* GET /api/ia/etat                                                    */
/* ------------------------------------------------------------------ */

/**
 * TOUT l'etat, masque : les acces enregistres et l'affectation des taches.
 * C'est la seule lecture dont le nouvel ecran Parametres a besoin.
 */
router.get('/etat', (req, res) => {
  try {
    res.json({
      success: true,
      data: { ...configUtilisateur.lireEtat(), etat: etatDeLaConfiguration() }
    });
  } catch (erreur) {
    erreurServeur(res, erreur, 'Lecture de l\'etat des reglages');
  }
});

/* ------------------------------------------------------------------ */
/* Les acces : PUT et DELETE /api/ia/comptes/:fournisseur              */
/* ------------------------------------------------------------------ */

/**
 * Enregistre ou met a jour UN acces.
 * Body : { cleApi?, baseURL? }
 *
 * Une cle absente du corps veut dire « je ne change pas ma cle », pas
 * « efface-la » : l'interface ne l'a jamais recue, elle ne peut pas la
 * renvoyer. C'est configUtilisateur.ecrireCompte qui applique cette regle.
 */
router.put('/comptes/:fournisseur', async (req, res) => {
  try {
    const corps = req.body || {};

    const { etat, avertissements } = await configUtilisateur.ecrireCompte({
      fournisseur: req.params.fournisseur,
      cleApi: corps.cleApi,
      baseURL: corps.baseURL
    });

    oublierLeClientIa();
    // On journalise le fait, jamais la cle.
    log.info(`Acces enregistre : ${String(req.params.fournisseur || '').slice(0, 40)}`);

    res.json({ success: true, data: { ...etat, etat: etatDeLaConfiguration(), avertissements } });
  } catch (erreur) {
    repondreErreurEcriture(res, erreur, 'Enregistrement d\'un acces');
  }
});

/**
 * Retire un acces, cle comprise.
 * Les taches qui pointaient vers lui repassent sur « suivre le reglage
 * general » : elles ne restent pas braquees sur un compte disparu.
 */
router.delete('/comptes/:fournisseur', async (req, res) => {
  try {
    const { supprime, etat } = await configUtilisateur.supprimerCompte(req.params.fournisseur);
    oublierLeClientIa();
    if (supprime) log.info(`Acces retire : ${String(req.params.fournisseur || '').slice(0, 40)}`);

    res.json({
      success: true,
      data: {
        supprime,
        message: supprime
          ? 'Acces retire : cette cle n\'est plus enregistree sur cette machine.'
          : 'Il n\'y avait aucun acces a retirer pour ce fournisseur.',
        ...etat,
        etat: etatDeLaConfiguration()
      }
    });
  } catch (erreur) {
    erreurServeur(res, erreur, 'Retrait d\'un acces');
  }
});

/* ------------------------------------------------------------------ */
/* L'affectation des taches : PUT /api/ia/taches                       */
/* ------------------------------------------------------------------ */

/**
 * Enregistre « quelle tache, allumee ou non, quel modele de quel compte ».
 * Body : { taches: { 'lettre': { actif, fournisseur, modele }, ... } }
 *
 * Les taches absentes du corps sont remises a leur valeur par defaut (allumee,
 * sans modele impose) : ce n'est pas une fusion partielle, c'est l'etat complet
 * de l'ecran qui est envoye. Un enregistrement partiel laisserait l'utilisateur
 * incapable de reveiller une tache qu'il a coupee.
 */
router.put('/taches', async (req, res) => {
  try {
    const corps = req.body || {};
    const recues = (corps.taches && typeof corps.taches === 'object') ? corps.taches : corps;

    const { etat, avertissements } = await configUtilisateur.ecrireTaches(recues);
    oublierLeClientIa();
    log.info('Affectation des taches enregistree');

    res.json({ success: true, data: { ...etat, etat: etatDeLaConfiguration(), avertissements } });
  } catch (erreur) {
    repondreErreurEcriture(res, erreur, 'Enregistrement de l\'affectation des taches');
  }
});

/* ------------------------------------------------------------------ */
/* L'ancienne forme : GET, PUT et DELETE /api/ia/config                */
/* ------------------------------------------------------------------ */

/**
 * La configuration enregistree, MASQUEE, a l'ancienne forme.
 * `aUneCle` permet a l'interface d'afficher « cle enregistree » sans jamais
 * recevoir la cle.
 */
router.get('/config', (req, res) => {
  try {
    res.json({
      success: true,
      data: { ...configPourInterface(), etat: etatDeLaConfiguration() }
    });
  } catch (erreur) {
    erreurServeur(res, erreur, 'Lecture de la configuration');
  }
});

/**
 * Enregistre un moteur a l'ancienne forme.
 * Body : { fournisseur, cleApi, baseURL, modeles: { redaction, extraction } }
 *
 * Ce que cela veut dire aujourd'hui : « voici mon moteur ». L'acces est ajoute
 * ou mis a jour, et toutes les taches sont repointees vers lui.
 */
router.put('/config', async (req, res) => {
  try {
    const corps = req.body || {};

    // Les modeles peuvent arriver imbriques (modeles.redaction, le vocabulaire
    // des roles) ou a plat (modeleRedaction). On accepte les deux plutot que
    // de perdre silencieusement le choix de l'utilisateur.
    const modelesRecus = (corps.modeles && typeof corps.modeles === 'object') ? corps.modeles : {};

    const { configMasquee, avertissements } = await configUtilisateur.ecrire({
      fournisseur: corps.fournisseur,
      cleApi: corps.cleApi,
      baseURL: corps.baseURL,
      modeles: {
        redaction: modelesRecus.redaction || corps.modeleRedaction,
        extraction: modelesRecus.extraction || corps.modeleExtraction
      }
    });

    oublierLeClientIa();
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
    repondreErreurEcriture(res, erreur, 'Enregistrement de la configuration');
  }
});

/**
 * Oublie tout : le fichier est supprime, les cles avec lui.
 * C'est la reponse a « comment je retire mes cles de cette machine ? ».
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
          ? 'Configuration effacee : tes cles API ne sont plus enregistrees sur cette machine.'
          : 'Il n\'y avait aucune configuration a effacer.',
        ...configPourInterface(),
        etat: etatDeLaConfiguration()
      }
    });
  } catch (erreur) {
    erreurServeur(res, erreur, 'Effacement de la configuration');
  }
});

module.exports = router;
