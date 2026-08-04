/**
 * API centralisée pour les appels backend CV
 * Toutes les requêtes HTTP passent par ici
 */

import { API_URL } from './config';

const API_BASE_URL = `${API_URL}/api/solutions`;

export const cvApi = {
  /**
   * Analyser un CV avec formulaire structuré
   */
  async analyzeCV(cvData) {
    const response = await fetch(`${API_BASE_URL}/analyse-cv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cvData)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Erreur lors de l\'analyse');
    }

    return response.json();
  },

  /**
   * Analyser un CV PDF complet
   */
  async analyzePDF(file, userId) {
    const formData = new FormData();
    formData.append('cv', file);
    formData.append('userId', userId);

    const response = await fetch(`${API_BASE_URL}/analyse-cv-pdf-complete`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Erreur lors de l\'analyse du PDF');
    }

    return response.json();
  },

  /**
   * Optimiser un CV via upload PDF
   */
  async optimizeCVPDF(file, userId, posteCible) {
    const formData = new FormData();
    formData.append('cv', file);
    formData.append('userId', userId);
    if (posteCible) formData.append('posteCible', posteCible);

    const response = await fetch(`${API_BASE_URL}/optimiser-cv-pdf`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Erreur lors de l\'optimisation du PDF');
    }

    return response.json();
  }
};
