/**
 * Client API pour le suivi de candidatures
 */

import { API_URL as API_BASE_URL } from './config';

/**
 * Créer une nouvelle candidature
 */
export async function createApplication(userId, data) {
  const response = await fetch(`${API_BASE_URL}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...data })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Erreur création candidature');
  return json.data;
}

/**
 * Lister les candidatures d'un utilisateur
 */
export async function getApplications(userId) {
  const response = await fetch(`${API_BASE_URL}/api/applications/user/${userId}`);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Erreur récupération candidatures');
  return json.data;
}

/**
 * Mettre à jour une candidature (statut, notes, etc.)
 */
export async function updateApplication(id, userId, data) {
  const response = await fetch(`${API_BASE_URL}/api/applications/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...data })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Erreur mise à jour candidature');
  return json.data;
}

/**
 * Supprimer une candidature
 */
export async function deleteApplication(id, userId) {
  const response = await fetch(`${API_BASE_URL}/api/applications/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Erreur suppression candidature');
  return json;
}
