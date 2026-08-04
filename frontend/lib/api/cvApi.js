/**
 * Appels backend des outils CV (analyse et optimisation).
 *
 * Comme les autres clients de lib/api/, celui-ci passe par lireReponse() et
 * messageErreurReseau() : sans eux, un backend eteint donnait « Failed to
 * fetch » et une reponse HTML d'erreur donnait « Unexpected token '<' », deux
 * messages que personne ne peut interpreter.
 */

import { API_URL, lireReponse, messageErreurReseau } from './config';

const API_BASE_URL = `${API_URL}/api/solutions`;

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
  return lireReponse(reponse, messageParDefaut);
}

export const cvApi = {
  /**
   * Analyser un CV a partir du formulaire structure.
   */
  async analyzeCV(cvData) {
    return appeler(
      `${API_BASE_URL}/analyse-cv`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cvData),
      },
      "Erreur lors de l'analyse"
    );
  },

  /**
   * Analyser un CV au format PDF.
   */
  async analyzePDF(file, userId) {
    const formData = new FormData();
    formData.append('cv', file);
    formData.append('userId', userId);

    return appeler(
      `${API_BASE_URL}/analyse-cv-pdf-complete`,
      { method: 'POST', body: formData },
      "Erreur lors de l'analyse du PDF"
    );
  },

  /**
   * Score ATS et reecriture d'un CV au format PDF.
   */
  async optimizeCVPDF(file, userId, posteCible) {
    const formData = new FormData();
    formData.append('cv', file);
    formData.append('userId', userId);
    if (posteCible) formData.append('posteCible', posteCible);

    return appeler(
      `${API_BASE_URL}/optimiser-cv-pdf`,
      { method: 'POST', body: formData },
      "Erreur lors de l'optimisation du PDF"
    );
  },
};
