/**
 * Client API de l'historique des outils.
 *
 * Comme les autres clients de lib/api/, il passe par lireReponse() et
 * messageErreurReseau() : un backend eteint donne une phrase qui dit quoi
 * lancer, et une reponse HTML d'erreur ne produit plus « Unexpected
 * token '<' ».
 */

import { API_URL as API_BASE_URL, lireReponse, messageErreurReseau } from './config';

/**
 * Envoie la requete et traduit les pannes reseau.
 * Le fetch est isole dans son propre try : une erreur levee par lireReponse
 * (message deja lisible) ne doit pas etre reecrite en erreur reseau.
 */
async function appeler(url, options, messageParDefaut) {
  let reponse;
  try {
    reponse = await fetch(url, options);
  } catch (erreur) {
    throw new Error(messageErreurReseau(erreur));
  }
  const json = await lireReponse(reponse, messageParDefaut);
  return json.data;
}

/**
 * Enregistrer une entree d'historique.
 */
export async function saveHistoryEntry(data) {
  return appeler(
    `${API_BASE_URL}/api/historique/sauvegarder`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
    'Erreur sauvegarde historique'
  );
}

/**
 * Recuperer l'historique d'un utilisateur.
 */
export async function getHistory(userId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.toolType) params.set('toolType', filters.toolType);
  if (filters.limit) params.set('limit', filters.limit);

  return appeler(
    `${API_BASE_URL}/api/historique/${userId}?${params}`,
    undefined,
    'Erreur historique'
  );
}

/**
 * Supprimer une entree d'historique.
 */
export async function deleteHistoryEntry(entryId, userId) {
  return appeler(
    `${API_BASE_URL}/api/historique/${entryId}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    },
    'Erreur suppression'
  );
}
