const express = require('express');
const router = express.Router();
const historyService = require('../services/historyService');

/**
 * POST /api/historique/sauvegarder
 * Sauvegarder une entrée d'historique
 */
router.post('/sauvegarder', async (req, res) => {
  try {
    const { userId, toolType, title, inputSummary, resultSummary, status } = req.body;

    if (!userId || !toolType) {
      return res.status(400).json({ success: false, error: '"userId" et "toolType" requis' });
    }

    const entry = await historyService.saveEntry(
      userId, toolType, title || 'Sans titre', inputSummary, resultSummary, status
    );

    res.json({ success: true, data: entry });
  } catch (error) {
    console.error('[Historique] Erreur sauvegarde:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/historique/:userId
 * Récupérer l'historique d'un utilisateur
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { toolType, limit } = req.query;

    const entries = await historyService.getUserHistory(userId, {
      toolType,
      limit: limit ? parseInt(limit) : 50
    });

    res.json({ success: true, data: entries });
  } catch (error) {
    console.error('[Historique] Erreur lecture:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/historique/:entryId
 * Supprimer une entrée d'historique
 */
router.delete('/:entryId', async (req, res) => {
  try {
    const { entryId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: '"userId" requis' });
    }

    await historyService.deleteEntry(entryId, userId);
    res.json({ success: true, message: 'Entree supprimee' });
  } catch (error) {
    console.error('[Historique] Erreur suppression:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
