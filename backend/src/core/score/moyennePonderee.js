'use strict';

/**
 * Moyenne ponderee.
 *
 * POURQUOI CE FICHIER EXISTE
 * prompts/jsonSchemas.js ligne 66 demande aujourd'hui a GPT-4.1-mini :
 *   "moyenne ponderee des 3 scores (adequation x 0.4 + marche x 0.35 + potentiel x 0.25),
 *    arrondie"
 * On paie un modele de langage, avec sa latence et son droit a se tromper, pour faire
 * une multiplication et une addition. La voici.
 *
 * Le resultat est ARRONDI A L'ENTIER, parce que c'est ce que l'appelant historique
 * attend (un score sur 100 affiche dans une jauge). Si un jour un appelant a besoin du
 * detail decimal, il faudra ajouter une fonction soeur plutot que changer celle-ci :
 * des scores archives dans tool_usage_history seraient sinon rejoues differemment.
 *
 * @param {number[]} valeurs  les notes a moyenner
 * @param {number[]} poids    leur importance respective (meme longueur, meme ordre)
 * @returns {number} la moyenne ponderee, arrondie a l'entier
 */
function moyennePonderee(valeurs, poids) {
  if (!Array.isArray(valeurs) || !Array.isArray(poids) || valeurs.length !== poids.length) {
    throw new TypeError('moyennePonderee : valeurs et poids doivent etre deux tableaux de meme longueur');
  }
  if (valeurs.some((v) => !Number.isFinite(v)) || poids.some((p) => !Number.isFinite(p))) {
    throw new TypeError('moyennePonderee : toutes les valeurs et tous les poids doivent etre des nombres');
  }
  const totalPoids = poids.reduce((somme, p) => somme + p, 0);
  if (totalPoids === 0) return 0; // aucun critere ne compte : rien a moyenner
  const somme = valeurs.reduce((total, valeur, i) => total + valeur * poids[i], 0);
  return Math.round(somme / totalPoids);
}

module.exports = { moyennePonderee };
