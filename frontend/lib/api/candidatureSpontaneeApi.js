/**
 * Client API pour la candidature spontanee.
 */

import { API_URL as API_BASE_URL, lireReponse, messageErreurReseau } from './config';

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
 * Envoyer une candidature spontanee.
 *
 * POURQUOI UN OBJET ET NON UNE LISTE D'ARGUMENTS
 * La fonction prenait six parametres positionnels, et il fallait en ajouter
 * deux. A ce stade, un appel du type `envoyer(cv, a, b, '', '', id)` ne se
 * relit plus : intervertir deux chaines vides ne produit aucune erreur, juste
 * un email envoye au mauvais endroit. Avec un objet, chaque valeur porte son
 * nom et l'ordre n'a plus d'importance.
 *
 * @param {Object}  champs
 * @param {File}    champs.cvFile          CV au format PDF (obligatoire)
 * @param {string}  champs.recipientEmail  email du recruteur (obligatoire)
 * @param {string}  champs.targetPosition  poste vise (obligatoire)
 * @param {string} [champs.company]        entreprise
 * @param {string} [champs.contactName]    nom du contact chez le recruteur
 * @param {string} [champs.candidateName]  prenom et nom du candidat : sert a
 *        nommer la piece jointe. Sans lui, le backend devait le deviner a
 *        partir du texte du CV, et beaucoup de CV commencent par l'intitule du
 *        poste en capitales : on obtenait « CV_Infirmier_Diplome_D_Etat.pdf ».
 * @param {string} [champs.candidateEmail] email du candidat : alimente le
 *        champ « repondre a » de l'email. Sans lui, la reponse du recruteur
 *        part vers une adresse technique et se perd.
 * @param {string} [champs.userId]         pour enregistrer la candidature dans le suivi
 */
export async function sendSpontaneousApplication({
  cvFile,
  recipientEmail,
  targetPosition,
  company = '',
  contactName = '',
  candidateName = '',
  candidateEmail = '',
  userId = null,
}) {
  const formData = new FormData();
  formData.append('cv', cvFile);
  formData.append('recipientEmail', recipientEmail);
  formData.append('targetPosition', targetPosition);
  if (company) formData.append('company', company);
  if (contactName) formData.append('contactName', contactName);
  if (candidateName) formData.append('candidateName', candidateName);
  if (candidateEmail) formData.append('candidateEmail', candidateEmail);
  if (userId) formData.append('userId', userId);

  // Pas d'en-tete Content-Type ici : le navigateur doit poser lui-meme
  // « multipart/form-data » AVEC la frontiere generee pour ce FormData.
  return appeler(
    `${API_BASE_URL}/api/candidature-spontanee/envoyer`,
    { method: 'POST', body: formData },
    'Erreur envoi candidature'
  );
}

/**
 * Generer un email de relance (ne l'envoie pas).
 */
export async function generateFollowUp(applicationId, userId) {
  return appeler(
    `${API_BASE_URL}/api/candidature-spontanee/generer-relance`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, userId }),
    },
    'Erreur generation relance'
  );
}

/**
 * Marquer la relance comme envoyee.
 */
export async function markFollowUpSent(applicationId, userId) {
  return appeler(
    `${API_BASE_URL}/api/candidature-spontanee/${applicationId}/relance-envoyee`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    },
    'Erreur mise a jour relance'
  );
}
