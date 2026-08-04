/**
 * Client API du Matcher d'Offres.
 * Tout est en mode texte : le backend renvoie du JSON structure, pas de PDF.
 *
 * Comme les autres clients de lib/api/, celui-ci passe par lireReponse() et
 * messageErreurReseau(). Les erreurs levees conservent leur champ `code`
 * (AUTH_REQUIRED, SCRAPING_FAILED...), sur lequel UrlScraper s'appuie pour
 * expliquer precisement pourquoi une URL n'a pas pu etre lue.
 *
 * Les console.error qui enveloppaient chaque appel ont ete retires : ils
 * re-levaient l'erreur telle quelle apres l'avoir journalisee, donc ils
 * n'apportaient rien a l'utilisateur et doublaient chaque message dans la
 * console. Les appelants affichent deja l'erreur a l'ecran.
 */

import { API_URL as API_BASE_URL, lireReponse, messageErreurReseau } from './config';

/**
 * Envoie la requete et traduit les pannes reseau.
 * Le fetch est isole dans son propre try : une erreur levee par lireReponse
 * (message deja lisible, champ `code` renseigne) ne doit pas etre reecrite
 * en erreur reseau.
 */
async function appeler(chemin, options, messageParDefaut) {
  let reponse;
  try {
    reponse = await fetch(`${API_BASE_URL}${chemin}`, options);
  } catch (erreur) {
    throw new Error(messageErreurReseau(erreur));
  }
  return lireReponse(reponse, messageParDefaut);
}

const enJson = (corps) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corps),
});

/**
 * Analyser une offre d'emploi saisie a la main et generer les documents.
 */
export async function analyzeOffer(offerData, candidateProfile, options = {}) {
  return appeler(
    '/api/matcher/analyser',
    { method: 'POST', ...enJson({ offer: offerData, candidate: candidateProfile, options }) },
    "Erreur lors de l'analyse de l'offre"
  );
}

/**
 * Lire une offre depuis son URL.
 */
export async function scrapeOfferUrl(url) {
  return appeler(
    '/api/matcher/scraper-url',
    { method: 'POST', ...enJson({ url }) },
    "Impossible d'analyser cette URL"
  );
}

/**
 * Generer les documents a partir du texte brut recupere sur l'offre.
 */
export async function analyzeScrapedOffer(rawText, url, candidateProfile, options = {}) {
  return appeler(
    '/api/matcher/analyser-scraper',
    { method: 'POST', ...enJson({ rawText, url, candidate: candidateProfile, options }) },
    'Erreur lors de la generation des documents'
  );
}

/**
 * Mode Rapide : CV PDF + URL de l'offre.
 */
export async function generateComplete(cvFile, offerUrl, options = {}) {
  const formData = new FormData();
  formData.append('cv', cvFile);
  formData.append('offerUrl', offerUrl);
  formData.append('options', JSON.stringify(options));

  return appeler(
    '/api/matcher/generer-complet',
    { method: 'POST', body: formData },
    'Erreur lors de la generation des documents'
  );
}

/**
 * Extraire le profil candidat depuis un CV PDF.
 */
export async function extractCandidateFromCVFile(cvFile) {
  const formData = new FormData();
  formData.append('cv', cvFile);

  return appeler(
    '/api/matcher/extraire-candidat-pdf',
    { method: 'POST', body: formData },
    "Impossible d'extraire les donnees du CV"
  );
}

/**
 * Mode Decouverte : analyser le CV pour trouver les offres correspondantes.
 */
export async function discoverJobs(cvFile, sources = [], filters = {}) {
  const formData = new FormData();
  formData.append('cv', cvFile);
  if (sources.length > 0) formData.append('sources', JSON.stringify(sources));
  if (filters.localisation) formData.append('localisation', filters.localisation);
  if (filters.typeContrat) formData.append('typeContrat', filters.typeContrat);

  return appeler(
    '/api/matcher/decouvrir-offres',
    { method: 'POST', body: formData },
    "Erreur lors de la decouverte d'offres"
  );
}

/**
 * Adaptation rapide : CV PDF + offre structuree.
 */
export async function rapidAdaptCV(cvFile, offer) {
  const formData = new FormData();
  formData.append('cv', cvFile);
  formData.append('offer', JSON.stringify(offer));

  return appeler(
    '/api/matcher/adapter-rapide',
    { method: 'POST', body: formData },
    "Erreur lors de l'adaptation rapide du CV"
  );
}
