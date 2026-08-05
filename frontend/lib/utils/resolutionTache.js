/**
 * QUEL MODELE VA REELLEMENT ETRE UTILISE POUR CETTE TACHE ?
 *
 * POURQUOI CETTE FONCTION EXISTE
 * L'ecran laisse choisir « suivre mon reglage general » — c'est meme l'option
 * par defaut, parce que personne ne devrait avoir a regler cinq taches pour
 * commencer a utiliser Mew. Mais « suit ton reglage general » tout seul ne
 * dit rien : general, c'est quoi ? Cette fonction repond, et l'interface peut
 * ecrire « suit ton reglage general → Claude Opus 5 chez Anthropic ».
 *
 * Elle sert aussi a reperer le cas ou la reponse est « rien du tout » : une
 * tache allumee qui ne peut nommer aucun modele echouerait au premier clic,
 * et il vaut mieux le dire ici que la.
 *
 * ELLE REJOUE LA REGLE DU BACKEND, ET C'EST ASSUME
 * La resolution reelle vit dans backend/src/llm/configUtilisateur.js et
 * aiService.js — c'est elle qui fait foi. La reecrire ici est une duplication,
 * mais l'alternative serait de faire un aller-retour reseau a chaque frappe
 * dans un brouillon non enregistre. Si la regle change cote backend, changez
 * les deux : les tests backend/test/configIaMultiComptes.test.js decrivent
 * l'ordre attendu.
 *
 * L'ORDRE, DU PLUS PRECIS AU PLUS GENERAL
 *   1. le modele choisi pour CETTE tache ;
 *   2. celui d'une autre tache active du MEME role servie par le MEME compte ;
 *   3. le premier modele du catalogue de ce fournisseur capable de tenir ce role.
 */

/**
 * @param {object} params
 * @param {object} params.tache        la tache decrite par le catalogue
 * @param {object} params.reglages     le brouillon complet { [idTache]: {actif, fournisseur, modele} }
 * @param {Array}  params.taches       toutes les taches du catalogue
 * @param {Array}  params.comptes      les acces enregistres
 * @param {Function} params.modelesDe  (idFournisseur) => modeles connus
 *
 * @returns {{fournisseur: string, modele: string, source: 'tache'|'general'|'catalogue'}|null}
 *   null quand aucun modele ne peut etre nomme.
 */
export function resoudreTache({ tache, reglages, taches, comptes, modelesDe }) {
  const reglage = reglages[tache.id];
  if (!reglage || !reglage.actif) return null;

  const utilisables = comptes.filter((c) => c.utilisable);
  if (utilisables.length === 0) return null;

  // Le compte qui servira : celui que la tache designe, ou a defaut le premier
  // enregistre. Ce repli est ce qui fait qu'ajouter une cle suffit a rendre
  // Mew fonctionnel sans avoir a regler quoi que ce soit d'autre.
  const compte = reglage.fournisseur
    ? utilisables.find((c) => c.fournisseur === reglage.fournisseur)
    : utilisables[0];
  if (!compte) return null;

  // 1. Le modele de cette tache.
  if (reglage.modele) {
    return { fournisseur: compte.fournisseur, modele: reglage.modele, source: 'tache' };
  }

  // 2. Celui d'une voisine du meme role, sur le MEME compte.
  //
  // Le meme compte, et pas n'importe lequel : reprendre un modele Anthropic
  // pour une tache servie par une cle OpenAI donnerait une erreur « modele
  // introuvable » parfaitement incomprehensible.
  for (const autre of taches) {
    if (autre.id === tache.id || autre.role !== tache.role) continue;

    const voisin = reglages[autre.id];
    if (!voisin || !voisin.actif || !voisin.modele) continue;

    const compteVoisin = voisin.fournisseur
      ? utilisables.find((c) => c.fournisseur === voisin.fournisseur)
      : utilisables[0];

    if (compteVoisin && compteVoisin.fournisseur === compte.fournisseur) {
      return { fournisseur: compte.fournisseur, modele: voisin.modele, source: 'general' };
    }
  }

  // 3. Le catalogue de CE fournisseur. Vide chez les locaux et chez
  //    « personnalise », ou la liste depend de ce que l'utilisateur a
  //    telecharge : c'est le cas ou l'on ne peut rien nommer.
  const candidat = modelesDe(compte.fournisseur)
    .find((m) => m.roles.length === 0 || m.roles.includes(tache.role));

  if (candidat) {
    return { fournisseur: compte.fournisseur, modele: candidat.id, source: 'catalogue' };
  }

  return null;
}
