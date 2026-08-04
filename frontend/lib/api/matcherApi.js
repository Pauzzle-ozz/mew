/**
 * Client API pour le Matcher d'Offres
 * Centralise tous les appels backend pour le matching candidat-offre
 * Retourne du texte structuré (plus de PDF)
 */

import { API_URL as API_BASE_URL } from './config';

/**
 * Analyser une offre d'emploi et générer les documents (texte)
 */
export async function analyzeOffer(offerData, candidateProfile, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/matcher/analyser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offer: offerData,
        candidate: candidateProfile,
        options
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ||'Erreur lors de l\'analyse de l\'offre');
    return data;
  } catch (error) {
    console.error('[matcherApi] Erreur:', error);
    throw error;
  }
}

/**
 * Scraper une URL d'offre d'emploi
 */
export async function scrapeOfferUrl(url) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/matcher/scraper-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.error ||'Impossible d\'analyser cette URL');
      error.code = data?.code ||'UNKNOWN';
      throw error;
    }
    return data;
  } catch (error) {
    console.error('[matcherApi] Erreur scraping:', error);
    throw error;
  }
}

/**
 * Générer les documents à partir du texte brut scrapé (mode URL)
 */
export async function analyzeScrapedOffer(rawText, url, candidateProfile, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/matcher/analyser-scraper`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText,
        url,
        candidate: candidateProfile,
        options
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ||'Erreur lors de la génération des documents');
    return data;
  } catch (error) {
    console.error('[matcherApi] Erreur scraper:', error);
    throw error;
  }
}

/**
 * Mode Rapide : CV PDF + URL de l'offre → texte optimisé
 */
export async function generateComplete(cvFile, offerUrl, options = {}) {
  try {
    const formData = new FormData();
    formData.append('cv', cvFile);
    formData.append('offerUrl', offerUrl);
    formData.append('options', JSON.stringify(options));

    const response = await fetch(`${API_BASE_URL}/api/matcher/generer-complet`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.error ||'Erreur lors de la génération des documents');
      error.code = data?.code ||'UNKNOWN';
      throw error;
    }
    return data;
  } catch (error) {
    console.error('[matcherApi] Erreur mode rapide:', error);
    throw error;
  }
}

/**
 * Extraire le profil candidat depuis un CV PDF
 */
export async function extractCandidateFromCVFile(cvFile) {
  try {
    const formData = new FormData();
    formData.append('cv', cvFile);

    const response = await fetch(`${API_BASE_URL}/api/matcher/extraire-candidat-pdf`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ||'Impossible d\'extraire les données du CV');
    return data;
  } catch (error) {
    console.error('[matcherApi] Erreur extraction PDF:', error);
    throw error;
  }
}

/**
 * Mode Découverte : analyser le CV pour trouver les offres correspondantes
 */
export async function discoverJobs(cvFile, sources = [], filters = {}) {
  try {
    const formData = new FormData();
    formData.append('cv', cvFile);
    if (sources.length > 0) formData.append('sources', JSON.stringify(sources));
    if (filters.localisation) formData.append('localisation', filters.localisation);
    if (filters.typeContrat) formData.append('typeContrat', filters.typeContrat);

    const response = await fetch(`${API_BASE_URL}/api/matcher/decouvrir-offres`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ||'Erreur lors de la découverte d\'offres');
    return data;
  } catch (error) {
    console.error('[matcherApi] Erreur découverte:', error);
    throw error;
  }
}

/**
 * Adaptation rapide : CV PDF + offre structurée → texte optimisé
 */
export async function rapidAdaptCV(cvFile, offer) {
  try {
    const formData = new FormData();
    formData.append('cv', cvFile);
    formData.append('offer', JSON.stringify(offer));

    const response = await fetch(`${API_BASE_URL}/api/matcher/adapter-rapide`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ||'Erreur lors de l\'adaptation rapide du CV');
    return data;
  } catch (error) {
    console.error('[matcherApi] Erreur adaptation rapide:', error);
    throw error;
  }
}

