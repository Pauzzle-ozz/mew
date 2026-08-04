import { API_URL } from './config';

/**
 * Ce que cette installation de Mew sait faire.
 *
 * Correspond a GET /api/capacites (backend/src/server.js) :
 * { ia, envoiEmail, franceTravail, scraping, stockage, authentification }
 *
 * PARTICULARITE : ce client ne leve JAMAIS d'erreur, contrairement aux autres
 * clients de lib/api/. Il ne passe donc volontairement pas par lireReponse().
 * La raison : les capacites ne sont qu'un indicateur d'affichage. Un backend
 * eteint doit se traduire par « on ne sait pas » (null), pas par un message
 * d'erreur en travers du tableau de bord, et surtout pas par « tout est
 * desactive » — ce serait annoncer a tort que rien ne marche.
 *
 * @returns {Promise<object|null>} les capacites, ou null si on ne sait pas.
 */
export async function getCapacites() {
  try {
    const reponse = await fetch(`${API_URL}/api/capacites`);
    if (!reponse.ok) return null;

    const corps = await reponse.json();
    return corps?.success ? corps.data : null;
  } catch {
    // Serveur injoignable : on reste silencieux, l'appelant affichera
    // simplement aucun indicateur.
    return null;
  }
}
