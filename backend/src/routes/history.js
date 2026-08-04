const express = require('express');
const router = express.Router();
const historyService = require('../services/historyService');
const { auth } = require('../middleware/auth');

/**
 * ========================================
 * ROUTES HISTORIQUE DES OUTILS
 * ========================================
 *
 * Comme pour les candidatures, l'identifiant utilisateur vient de
 * `req.userId` (middleware/auth.js) et jamais du corps de la requete :
 * un `userId` ecrit par le client ne prouve pas qui il est.
 */

const utilisateurManquant = (res) => res.status(400).json({
  success: false,
  error: 'Utilisateur non identifie'
});

/**
 * POST /api/historique/sauvegarder
 * Sauvegarder une entrée d'historique
 */
router.post('/sauvegarder', async (req, res) => {
  try {
    const { toolType, title, inputSummary, resultSummary, status } = req.body || {};

    if (!req.userId) return utilisateurManquant(res);
    if (!toolType) {
      return res.status(400).json({ success: false, error: '"toolType" requis' });
    }

    const entry = await historyService.saveEntry(
      req.userId, toolType, title || 'Sans titre', inputSummary, resultSummary, status
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
 *
 * Le :userId de l'URL n'est utilise qu'en mode local. En mode supabase,
 * seul le jeton decide de l'historique renvoye.
 */
router.get('/:userId', auth, async (req, res) => {
  try {
    if (!req.userId) return utilisateurManquant(res);

    const { toolType, limit } = req.query;

    const entries = await historyService.getUserHistory(req.userId, {
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

    if (!req.userId) return utilisateurManquant(res);

    await historyService.deleteEntry(entryId, req.userId);
    res.json({ success: true, message: 'Entree supprimee' });
  } catch (error) {
    console.error('[Historique] Erreur suppression:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
