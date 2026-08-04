import { API_URL as API_BASE_URL } from './config';

/**
 * Sauvegarder une entrée d'historique
 */
export async function saveHistoryEntry(data) {
  const response = await fetch(`${API_BASE_URL}/api/historique/sauvegarder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Erreur sauvegarde historique');
  return json.data;
}

/**
 * Récupérer l'historique d'un utilisateur
 */
export async function getHistory(userId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.toolType) params.set('toolType', filters.toolType);
  if (filters.limit) params.set('limit', filters.limit);

  const response = await fetch(`${API_BASE_URL}/api/historique/${userId}?${params}`);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Erreur historique');
  return json.data;
}

/**
 * Supprimer une entrée d'historique
 */
export async function deleteHistoryEntry(entryId, userId) {
  const response = await fetch(`${API_BASE_URL}/api/historique/${entryId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Erreur suppression');
  return json.data;
}
