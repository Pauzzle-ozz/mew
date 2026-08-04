/**
 * Client API pour le suivi de candidatures.
 */

import { API_URL as API_BASE_URL, lireReponse, messageErreurReseau } from './config';

/**
 * Enveloppe commune a tous les appels de ce fichier.
 *
 * POURQUOI : chaque fonction faisait `await fetch(...)` puis `.json()` sans
 * filet. Quand le backend est eteint, fetch echoue avec un « Failed to fetch »
 * que personne ne peut interpreter, et quand il repond une page HTML d'erreur,
 * `.json()` levait « Unexpected token '<' ». Les deux messages finissaient
 * affiches tels quels a l'utilisateur.
 */
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

const enJson = (corps) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corps),
});

/**
 * Creer une nouvelle candidature.
 */
export async function createApplication(userId, data) {
  return appeler(
    `${API_BASE_URL}/api/applications`,
    { method: 'POST', ...enJson({ userId, ...data }) },
    'Erreur creation candidature'
  );
}

/**
 * Lister les candidatures d'un utilisateur.
 */
export async function getApplications(userId) {
  return appeler(
    `${API_BASE_URL}/api/applications/user/${userId}`,
    undefined,
    'Erreur recuperation candidatures'
  );
}

/**
 * Mettre a jour une candidature (statut, notes, etc.).
 */
export async function updateApplication(id, userId, data) {
  return appeler(
    `${API_BASE_URL}/api/applications/${id}`,
    { method: 'PUT', ...enJson({ userId, ...data }) },
    'Erreur mise a jour candidature'
  );
}

/**
 * Supprimer une candidature.
 */
export async function deleteApplication(id, userId) {
  let reponse;
  try {
    reponse = await fetch(`${API_BASE_URL}/api/applications/${id}`, {
      method: 'DELETE',
      ...enJson({ userId }),
    });
  } catch (erreur) {
    throw new Error(messageErreurReseau(erreur));
  }
  // Cette route repond { success, message } sans champ `data` : on renvoie
  // la reponse entiere, comme avant, plutot qu'un `undefined` trompeur.
  return lireReponse(reponse, 'Erreur suppression candidature');
}

/**
 * Statistiques de la recherche d'emploi + relances a faire.
 *
 * Repond { statistiques, relancesAFaire }, ou `null` si la route n'existe pas
 * encore sur le backend installe.
 *
 * POURQUOI CE `null` PLUTOT QU'UNE ERREUR
 * Le tableau de bord est un BONUS affiche au-dessus de la liste. Si quelqu'un
 * tourne avec un backend plus ancien qui n'expose pas encore cette route, la
 * page doit continuer a montrer ses candidatures : perdre la liste entiere
 * pour un encart de statistiques serait une regression, pas une securite.
 * On distingue donc « la fonctionnalite n'est pas la » (404 -> null, on
 * n'affiche rien) de « quelque chose s'est mal passe » (on laisse remonter).
 */
export async function getStatistiquesCandidatures(userId) {
  let reponse;
  try {
    reponse = await fetch(`${API_BASE_URL}/api/applications/user/${userId}/statistiques`);
  } catch (erreur) {
    throw new Error(messageErreurReseau(erreur));
  }

  if (reponse.status === 404) return null;

  const json = await lireReponse(reponse, 'Erreur recuperation des statistiques');
  return json.data;
}
