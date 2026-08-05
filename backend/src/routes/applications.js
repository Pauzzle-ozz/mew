const express = require('express');
const router = express.Router();
const applicationService = require('../services/applicationService');
const { statistiques, relancesAFaire } = require('../core/suivi/relances');
const { auth } = require('../middleware/auth');

/**
 * ========================================
 * RELANCES DES CANDIDATURES SPONTANEES
 * ========================================
 *
 * CE FICHIER NE FAIT PLUS DE CRUD, ET C'EST VOULU.
 *
 * Mew avait un tableau de suivi ou l'utilisateur saisissait ses candidatures
 * a la main : creation, modification, suppression, liste. On l'a retire.
 * Personne ne tient a jour un tableau de bord de sa recherche d'emploi, et
 * les plateformes de recrutement suivent deja les candidatures envoyees
 * depuis chez elles.
 *
 * Ce qu'aucune plateforme ne suit, en revanche, c'est une candidature
 * spontanee partie par email. C'est le seul cas que Mew garde : quand il
 * envoie l'email, il l'enregistre lui-meme (voir candidatureSpontaneeService),
 * et il sait donc rappeler de relancer huit jours ouvres plus tard.
 *
 * D'ou une seule route, en lecture. L'ECRITURE existe toujours, mais elle
 * passe par applicationService, appele cote serveur au moment de l'envoi :
 * elle n'est plus exposee en HTTP, donc plus rien ne peut creer une
 * candidature fantome depuis l'exterieur.
 *
 * L'identifiant utilisateur vient TOUJOURS de `req.userId`, pose par le
 * middleware d'authentification (voir middleware/auth.js). On ne lit jamais
 * `req.body.userId` ni `req.params.userId` : une donnee envoyee par le client
 * ne prouve pas son identite.
 */

/**
 * Relances a faire + statistiques
 * GET /api/applications/user/:userId/statistiques
 */
router.get('/user/:userId/statistiques', auth, async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(400).json({ success: false, error: 'Utilisateur non identifie' });
    }

    const candidatures = await applicationService.getByUser(req.userId);

    res.json({
      success: true,
      data: {
        statistiques: statistiques(candidatures),
        // Chaque entree porte la candidature complete : l'interface peut
        // afficher le poste et l'entreprise sans refaire une requete.
        relancesAFaire: relancesAFaire(candidatures).map((relance) => ({
          candidature: relance.candidature,
          dateRelance: relance.dateRelance.toISOString(),
          joursDepuisEnvoi: relance.joursDepuisEnvoi
        }))
      }
    });

  } catch (error) {
    console.error('[Applications] Erreur statistiques:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur',
      ...(process.env.NODE_ENV !== 'production' && { details: error.message })
    });
  }
});

module.exports = router;
