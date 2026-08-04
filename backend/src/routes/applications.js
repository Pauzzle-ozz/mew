const express = require('express');
const router = express.Router();
const applicationService = require('../services/applicationService');

/**
 * ========================================
 * ROUTES SUIVI DE CANDIDATURES
 * ========================================
 */

/**
 * Créer une nouvelle candidature
 * POST /api/applications
 * Body: { userId, offer_title, company, offer_url, location, contract_type, status, notes }
 */
router.post('/', async (req, res) => {
  try {
    const { userId, ...data } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId requis' });
    }
    if (!data.offer_title) {
      return res.status(400).json({ success: false, error: 'Titre du poste requis' });
    }

    const application = await applicationService.create(userId, data);
    res.json({ success: true, data: application });

  } catch (error) {
    console.error('❌ [Applications] Erreur création:', error.message);
    res.status(500).json({ success: false, error: 'Erreur serveur', ...(process.env.NODE_ENV === 'development' && { details: error.message }) });
  }
});

/**
 * Lister les candidatures d'un utilisateur
 * GET /api/applications/user/:userId
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const applications = await applicationService.getByUser(userId);
    res.json({ success: true, data: applications });

  } catch (error) {
    console.error('❌ [Applications] Erreur liste:', error.message);
    res.status(500).json({ success: false, error: 'Erreur serveur', ...(process.env.NODE_ENV === 'development' && { details: error.message }) });
  }
});

/**
 * Mettre à jour une candidature
 * PUT /api/applications/:id
 * Body: { userId, status?, notes?, applied_at?, ... }
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, ...data } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId requis' });
    }

    const updated = await applicationService.update(id, userId, data);
    res.json({ success: true, data: updated });

  } catch (error) {
    console.error('❌ [Applications] Erreur mise à jour:', error.message);
    res.status(500).json({ success: false, error: 'Erreur serveur', ...(process.env.NODE_ENV === 'development' && { details: error.message }) });
  }
});

/**
 * Supprimer une candidature
 * DELETE /api/applications/:id
 * Body: { userId }
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId requis' });
    }

    await applicationService.delete(id, userId);
    res.json({ success: true, message: 'Candidature supprimée' });

  } catch (error) {
    console.error('❌ [Applications] Erreur suppression:', error.message);
    res.status(500).json({ success: false, error: 'Erreur serveur', ...(process.env.NODE_ENV === 'development' && { details: error.message }) });
  }
});

module.exports = router;
