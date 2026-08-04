const express = require('express');
const router = express.Router();
const applicationService = require('../services/applicationService');
const { statistiques, relancesAFaire } = require('../core/suivi/relances');
const { auth } = require('../middleware/auth');

/**
 * ========================================
 * ROUTES SUIVI DE CANDIDATURES
 * ========================================
 *
 * L'identifiant utilisateur vient TOUJOURS de `req.userId`, pose par le
 * middleware d'authentification (voir middleware/auth.js). On ne lit plus
 * jamais `req.body.userId` ni `req.params.userId` ici : une donnee envoyee
 * par le client ne prouve pas son identite.
 */

const erreurServeur = (res, error) => res.status(500).json({
  success: false,
  error: 'Erreur serveur',
  ...(process.env.NODE_ENV === 'development' && { details: error.message })
});

const utilisateurManquant = (res) => res.status(400).json({
  success: false,
  error: 'Utilisateur non identifie'
});

/**
 * Créer une nouvelle candidature
 * POST /api/applications
 * Body: { offer_title, company, offer_url, location, contract_type, status, notes }
 */
router.post('/', async (req, res) => {
  try {
    // On retire userId du corps : il n'est plus une source d'identite, et
    // le laisser passer l'enregistrerait comme un champ de la candidature.
    const { userId: _userIdClient, ...data } = req.body || {};
    const userId = req.userId;

    if (!userId) return utilisateurManquant(res);
    if (!data.offer_title) {
      return res.status(400).json({ success: false, error: 'Titre du poste requis' });
    }

    const application = await applicationService.create(userId, data);
    res.json({ success: true, data: application });

  } catch (error) {
    console.error('❌ [Applications] Erreur création:', error.message);
    erreurServeur(res, error);
  }
});

/**
 * Lister les candidatures d'un utilisateur
 * GET /api/applications/user/:userId
 *
 * Le :userId de l'URL sert au mode local. En mode supabase, c'est le jeton
 * qui decide : demander l'URL de quelqu'un d'autre ne renvoie rien de plus.
 */
router.get('/user/:userId', auth, async (req, res) => {
  try {
    if (!req.userId) return utilisateurManquant(res);
    const applications = await applicationService.getByUser(req.userId);
    res.json({ success: true, data: applications });

  } catch (error) {
    console.error('❌ [Applications] Erreur liste:', error.message);
    erreurServeur(res, error);
  }
});

/**
 * Tableau de bord de la recherche d'emploi
 * GET /api/applications/user/:userId/statistiques
 *
 * Repond { statistiques, relancesAFaire }.
 *
 * Tout est calcule en local a partir des candidatures deja enregistrees :
 * aucun appel a un modele, aucun cout, aucune donnee qui sort de la machine.
 * Ces deux fonctions existaient et etaient testees depuis le debut, mais
 * aucune route ne les exposait : le travail etait fait et invisible.
 */
router.get('/user/:userId/statistiques', auth, async (req, res) => {
  try {
    if (!req.userId) return utilisateurManquant(res);

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
    console.error('❌ [Applications] Erreur statistiques:', error.message);
    erreurServeur(res, error);
  }
});

/**
 * Mettre à jour une candidature
 * PUT /api/applications/:id
 * Body: { status?, notes?, applied_at?, ... }
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId: _userIdClient, ...data } = req.body || {};

    if (!req.userId) return utilisateurManquant(res);

    const updated = await applicationService.update(id, req.userId, data);
    res.json({ success: true, data: updated });

  } catch (error) {
    console.error('❌ [Applications] Erreur mise à jour:', error.message);
    erreurServeur(res, error);
  }
});

/**
 * Supprimer une candidature
 * DELETE /api/applications/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.userId) return utilisateurManquant(res);

    await applicationService.delete(id, req.userId);
    res.json({ success: true, message: 'Candidature supprimée' });

  } catch (error) {
    console.error('❌ [Applications] Erreur suppression:', error.message);
    erreurServeur(res, error);
  }
});

module.exports = router;
