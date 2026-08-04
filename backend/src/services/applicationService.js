const storage = require('../storage');

/**
 * Service de gestion des candidatures (table/collection job_applications).
 *
 * Ce service ne sait plus OU les donnees sont rangees : il delegue a la
 * couche storage, qui choisit entre le fichier local et Supabase selon la
 * configuration. C'est ce qui permet a Mew de fonctionner sans aucun
 * compte cloud.
 */
class ApplicationService {
  create(userId, data) {
    return storage.applications.create(userId, data);
  }

  getByUser(userId) {
    return storage.applications.getByUser(userId);
  }

  /**
   * Recupere une candidature precise en verifiant qu'elle appartient bien
   * a l'utilisateur. Avant, cette requete etait ecrite directement au
   * milieu d'une route : c'etait le seul acces aux donnees hors de cette
   * couche, donc le seul endroit qu'on risquait d'oublier lors d'un
   * changement de stockage.
   */
  getById(id, userId) {
    return storage.applications.getById(id, userId);
  }

  update(id, userId, data) {
    return storage.applications.update(id, userId, data);
  }

  delete(id, userId) {
    return storage.applications.delete(id, userId);
  }
}

module.exports = new ApplicationService();
