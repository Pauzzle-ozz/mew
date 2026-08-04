const storage = require('../storage');

/**
 * Service d'historique d'utilisation des outils.
 * Stocke un resume de chaque utilisation (analyse CV, optimisation, matcher).
 *
 * Comme applicationService, il delegue le rangement des donnees a la
 * couche storage : fichier local par defaut, Supabase en option.
 */
class HistoryService {
  saveEntry(userId, toolType, title, inputSummary, resultSummary, status = 'completed') {
    return storage.history.save(userId, toolType, title, inputSummary, resultSummary, status);
  }

  getUserHistory(userId, filters = {}) {
    return storage.history.list(userId, filters);
  }

  deleteEntry(entryId, userId) {
    return storage.history.delete(entryId, userId);
  }
}

module.exports = new HistoryService();
