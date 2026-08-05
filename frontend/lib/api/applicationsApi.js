/**
 * Client API des candidatures.
 *
 * CE FICHIER A BEAUCOUP MAIGRI, ET C'EST VOULU.
 *
 * Mew avait un tableau de suivi ou l'utilisateur saisissait ses candidatures
 * a la main. On l'a retire : personne ne tient un tableau de bord de sa
 * recherche d'emploi, et les plateformes de recrutement suivent deja les
 * candidatures envoyees depuis chez elles.
 *
 * Ce qu'elles ne font PAS, en revanche, c'est suivre une candidature
 * spontanee partie par email. C'est le seul cas que Mew garde : quand Mew
 * envoie l'email pour toi, il l'enregistre tout seul, et il sait donc te
 * rappeler de relancer huit jours ouvres plus tard.
 *
 * D'ou ce qui reste ici : de la LECTURE uniquement. Plus rien ne se cree ni
 * ne se modifie depuis l'interface — l'enregistrement se fait cote serveur,
 * au moment de l'envoi.
 */

import { API_URL as API_BASE_URL, lireReponse, messageErreurReseau } from './config';

/**
 * Les relances a faire, et quelques statistiques sur les candidatures
 * spontanees envoyees par Mew.
 *
 * Repond `null` si la route n'existe pas sur le backend installe.
 *
 * POURQUOI CE `null` PLUTOT QU'UNE ERREUR
 * Le bandeau de relances est un BONUS affiche en haut de la page. Si quelqu'un
 * tourne avec un backend plus ancien qui n'expose pas encore cette route,
 * l'outil doit continuer a marcher normalement : perdre la page entiere pour
 * un encart serait une regression, pas une securite. On distingue donc « la
 * fonctionnalite n'est pas la » (404 -> null, on n'affiche rien) de « quelque
 * chose s'est mal passe » (on laisse remonter).
 *
 * @returns {Promise<{ statistiques: Object, relancesAFaire: Array }|null>}
 */
export async function getRelancesAFaire(userId) {
  let reponse;
  try {
    reponse = await fetch(`${API_BASE_URL}/api/applications/user/${userId}/statistiques`);
  } catch (erreur) {
    throw new Error(messageErreurReseau(erreur));
  }

  if (reponse.status === 404) return null;

  const json = await lireReponse(reponse, 'Erreur recuperation des relances');
  return json.data;
}
