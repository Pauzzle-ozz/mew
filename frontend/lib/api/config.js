/**
 * Adresse du backend.
 *
 * Le repli sur http://localhost:5000 est important : sans lui, un fichier
 * .env.local absent produisait des appels vers « undefined/api/... » qui
 * echouaient sans que rien n'explique pourquoi. Comme c'est aussi la valeur
 * par defaut du backend, l'application fonctionne desormais sans aucune
 * configuration.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

/**
 * Traduit une erreur reseau en phrase comprehensible.
 *
 * `fetch` echoue avec un « Failed to fetch » identique que le serveur soit
 * eteint, injoignable ou bloque par le navigateur. C'est le message le plus
 * frequent que verra quelqu'un qui vient de cloner le projet, et c'est aussi
 * le moins utile : autant lui donner la commande a taper.
 */
export function messageErreurReseau(erreur) {
  const estCoupureReseau = erreur instanceof TypeError
    || /fetch|network|load failed/i.test(erreur?.message || '');

  if (estCoupureReseau) {
    return `Impossible de joindre le serveur Mew (${API_URL}). `
      + 'Verifie qu\'il tourne : ouvre un terminal et lance `cd backend && npm run dev`.';
  }
  return erreur?.message || 'Une erreur inattendue est survenue';
}

/**
 * Lit la reponse du backend et leve une erreur parlante si besoin.
 * Centralise aussi la protection du parsing : trois clients sur cinq
 * appelaient `.json()` sans filet et affichaient « Unexpected token '<' »
 * a l'utilisateur des que le serveur repondait une page HTML d'erreur.
 */
export async function lireReponse(response, messageParDefaut) {
  if (!response.ok) {
    const corps = await response.json().catch(() => ({}));

    if (response.status === 401) {
      throw new Error(corps.error || "Cle API refusee. Verifie OPENAI_API_KEY dans backend/.env.");
    }
    if (response.status === 503) {
      throw new Error(corps.error || 'Le service IA est momentanement surcharge. Reessaie dans un instant.');
    }
    throw new Error(corps.error || messageParDefaut);
  }

  return response.json().catch(() => {
    throw new Error('Reponse illisible du serveur');
  });
}
