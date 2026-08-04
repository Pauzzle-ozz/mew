import { API_URL as API_BASE_URL } from './config';

/**
 * Envoyer une candidature spontanee
 */
export async function sendSpontaneousApplication(cvFile, recipientEmail, targetPosition, company, contactName, userId) {
  const formData = new FormData();
  formData.append('cv', cvFile);
  formData.append('recipientEmail', recipientEmail);
  formData.append('targetPosition', targetPosition);
  if (company) formData.append('company', company);
  if (contactName) formData.append('contactName', contactName);
  if (userId) formData.append('userId', userId);

  const response = await fetch(`${API_BASE_URL}/api/candidature-spontanee/envoyer`, {
    method: 'POST',
    body: formData
  });

  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Erreur envoi candidature');
  return json.data;
}

/**
 * Generer un email de relance (ne l'envoie pas)
 */
export async function generateFollowUp(applicationId, userId) {
  const response = await fetch(`${API_BASE_URL}/api/candidature-spontanee/generer-relance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ applicationId, userId })
  });

  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Erreur generation relance');
  return json.data;
}

/**
 * Marquer la relance comme envoyee
 */
export async function markFollowUpSent(applicationId, userId) {
  const response = await fetch(`${API_BASE_URL}/api/candidature-spontanee/${applicationId}/relance-envoyee`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });

  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Erreur mise a jour relance');
  return json.data;
}
