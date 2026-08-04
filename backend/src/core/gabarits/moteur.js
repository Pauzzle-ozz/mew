/**
 * Moteur de gabarits (texte a trous) minimaliste.
 *
 * POURQUOI ce fichier existe : plusieurs textes du projet (relance de
 * candidature, phrases de justification) etaient rediges par un modele de
 * langage a chaque appel. Or ces textes ne changent que par quelques mots.
 * Un gabarit relu et valide une fois pour toutes bat un texte different a
 * chaque envoi, que personne ne relit avant qu'il parte chez un recruteur.
 * En prime : instantane, gratuit, et testable.
 *
 * La syntaxe est volontairement reduite a deux formes, pas une de plus :
 *
 *   {{nom}}                -> la valeur de la variable, chaine vide si absente
 *   {{#nom}}...{{/nom}}    -> affiche seulement si la variable est remplie
 *
 * Pas d'echappement HTML : ce moteur ne produit que du texte brut (emails,
 * phrases d'interface). Ne t'en sers pas pour fabriquer du HTML.
 */

// Un bloc conditionnel : {{#nom}} contenu {{/nom}}.
// Le \1 (retour arriere) impose que la balise fermante porte le meme nom que
// l'ouvrante, sinon on melangerait deux blocs voisins.
const MOTIF_BLOC = /\{\{#\s*([\w.]+)\s*\}\}([\s\S]*?)\{\{\/\s*\1\s*\}\}/;

// Une variable simple : {{nom}} ou {{ profil.nom }}.
const MOTIF_VARIABLE = /\{\{\s*([\w.]+)\s*\}\}/g;

// Tout marqueur qui aurait survecu (balise mal fermee, nom exotique).
// La regle est stricte : un gabarit rendu ne doit JAMAIS laisser voir
// d'accolades a un recruteur.
const MOTIF_RESTANT = /\{\{[^{}]*\}\}/g;

// Une balise de bloc seule sur sa ligne : on lui retire son saut de ligne
// avant tout traitement. Sans ca, un bloc masque laisserait une ligne vide
// en plein milieu du texte.
const MOTIF_BALISE_SEULE = /^[ \t]*(\{\{[#/][\w.\s]*\}\})[ \t]*\n/gm;

// Garde-fou : un gabarit pathologique ne doit pas boucler indefiniment.
const MAX_PASSES = 200;

/**
 * Une variable est-elle "vide" au sens des blocs conditionnels ?
 *
 * On considere vide : null, undefined, false, une chaine blanche, un tableau
 * vide et le nombre 0. Le 0 est volontaire : dans nos textes, une variable
 * numerique a zero produit toujours une phrase absurde ("il y a 0 jours").
 */
function estVide(valeur) {
  if (valeur === null || valeur === undefined || valeur === false) return true;
  if (typeof valeur === 'number') return valeur === 0 || Number.isNaN(valeur);
  if (Array.isArray(valeur)) return valeur.length === 0;
  return String(valeur).trim() === '';
}

/**
 * Lit une variable, en acceptant les chemins pointes ({{profil.nom}}).
 */
function lireVariable(variables, chemin) {
  if (!variables) return undefined;
  if (!chemin.includes('.')) return variables[chemin];

  let courant = variables;
  for (const morceau of chemin.split('.')) {
    if (courant === null || typeof courant !== 'object') return undefined;
    courant = courant[morceau];
  }
  return courant;
}

/**
 * Convertit une valeur en texte affichable. Les tableaux sont joints par des
 * virgules : c'est ce qu'on attend d'une liste de competences dans une phrase.
 */
function enTexte(valeur) {
  if (estVide(valeur)) return '';
  if (Array.isArray(valeur)) return valeur.filter((e) => !estVide(e)).join(', ');
  return String(valeur);
}

/**
 * Remet les espaces d'aplomb apres le rendu.
 *
 * Une variable vide laisse forcement des cicatrices : deux espaces qui se
 * suivent, un espace avant une virgule, une ligne vide de trop. C'est ici
 * qu'on les efface, sinon le destinataire les verrait.
 *
 * Consequence a connaitre : chaque ligne est degagee de ses espaces de bord.
 * Ce moteur est fait pour de la prose, pas pour du texte indente.
 */
function nettoyerEspaces(texte) {
  return texte
    .replace(/[ \t]{2,}/g, ' ')      // espaces doubles -> un seul
    .replace(/ +([,.])/g, '$1')      // " ," et " ." orphelins laisses par un trou
    .replace(/^[ \t]+/gm, '')        // bord gauche de chaque ligne
    .replace(/[ \t]+$/gm, '')        // bord droit de chaque ligne
    .replace(/\n{3,}/g, '\n\n')      // au plus une ligne vide d'affilee
    .trim();
}

/**
 * Rend un gabarit avec ses variables.
 *
 * @param {string} gabarit   le texte a trous
 * @param {object} variables les valeurs a injecter
 * @returns {string} le texte final, sans aucun marqueur residuel
 */
function rendre(gabarit, variables = {}) {
  if (typeof gabarit !== 'string' || gabarit === '') return '';
  const valeurs = variables && typeof variables === 'object' ? variables : {};

  // 1. Les balises seules sur leur ligne deviennent des balises "en ligne".
  let resultat = gabarit.replace(MOTIF_BALISE_SEULE, '$1');

  // 2. Les blocs conditionnels, du plus exterieur au plus interieur.
  //    On remplace un bloc a la fois : les blocs imbriques reapparaissent
  //    naturellement au tour suivant.
  let passes = 0;
  while (MOTIF_BLOC.test(resultat) && passes < MAX_PASSES) {
    resultat = resultat.replace(MOTIF_BLOC, (_correspondance, nom, contenu) =>
      estVide(lireVariable(valeurs, nom)) ? '' : contenu
    );
    passes += 1;
  }

  // 3. Les variables simples.
  resultat = resultat.replace(MOTIF_VARIABLE, (_correspondance, nom) =>
    enTexte(lireVariable(valeurs, nom))
  );

  // 4. Filet de securite : plus aucune accolade ne doit sortir d'ici.
  resultat = resultat.replace(MOTIF_RESTANT, '');

  return nettoyerEspaces(resultat);
}

module.exports = { rendre, estVide };
