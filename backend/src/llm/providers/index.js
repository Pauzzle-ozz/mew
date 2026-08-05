/**
 * L'ACCES AU CATALOGUE.
 *
 * catalogue.js est de la donnee brute. Ce fichier est la seule porte d'entree :
 * cinq fonctions de lecture, aucune ecriture. Le reste du projet n'importe
 * jamais catalogue.js directement — il passe par ici.
 *
 * POURQUOI CETTE SEPARATION
 * Le jour ou le catalogue changera de forme (fichier JSON, base de donnees,
 * catalogue enrichi par le listage en direct), seul ce fichier bougera. Les
 * appelants continueront d'ecrire `fournisseur('openai')`.
 *
 * REGLE DE ROBUSTESSE : ces fonctions recoivent des identifiants venant du
 * navigateur. Elles ne doivent JAMAIS lever, quoi qu'on leur passe — un id
 * absent, `null`, un nombre, `"__proto__"`. Elles renvoient null ou un tableau
 * vide. C'est la couche appelante qui decide quoi dire a l'utilisateur.
 */

const { verifieLe, ROLES, ADAPTATEURS, FOURNISSEURS } = require('./catalogue');
const guides = require('./guides');

/**
 * Compare un identifiant fourni par l'exterieur.
 *
 * On refuse tout ce qui n'est pas une chaine AVANT de comparer : sans ce garde,
 * `fournisseur(['openai'])` ferait passer un tableau par la comparaison et
 * `modele('openai', {})` produirait des resultats surprenants. On ne cherche
 * jamais dans un objet par cle (pas de `MAP[id]`), donc `"__proto__"` ou
 * `"constructor"` ne remontent rien : ce sont des chaines comme les autres,
 * qui ne correspondent simplement a aucune entree.
 */
const memeId = (attendu) => (
  (entree) => typeof attendu === 'string' && entree.id === attendu
);

/**
 * Tout le catalogue, dans l'ordre d'affichage.
 *
 * Le tableau renvoye est gele (voir catalogue.js) : le modifier ne casse rien
 * ailleurs. Si vous avez besoin de le trier ou de le filtrer, faites-en une
 * copie avec [...fournisseurs()].
 *
 * @returns {Array<object>}
 */
function fournisseurs() {
  return FOURNISSEURS;
}

/**
 * Une entree du catalogue.
 *
 * @param {string} id
 * @returns {object|null} null si l'identifiant est inconnu
 */
function fournisseur(id) {
  return FOURNISSEURS.find(memeId(id)) || null;
}

/**
 * Un modele precis chez un fournisseur precis.
 *
 * Renvoie null si le fournisseur est inconnu, OU si le modele n'est pas dans
 * sa liste statique. Attention : chez un fournisseur local (Ollama, LM Studio)
 * la liste statique est vide par construction — un null ne veut donc pas dire
 * "ce modele n'existe pas", seulement "le catalogue ne le connait pas".
 * C'est au listage en direct de repondre dans ce cas.
 *
 * @param {string} idFournisseur
 * @param {string} idModele
 * @returns {object|null}
 */
function modele(idFournisseur, idModele) {
  const f = fournisseur(idFournisseur);
  if (!f) return null;
  return f.modeles.find(memeId(idModele)) || null;
}

/**
 * Le tarif d'un modele, en dollars par million de tokens.
 *
 * @param {string} idFournisseur
 * @param {string} idModele
 * @returns {{entree: number, sortie: number}|null} null si le tarif est inconnu
 */
function tarif(idFournisseur, idModele) {
  const m = modele(idFournisseur, idModele);
  if (!m) return null;
  return { entree: m.entree, sortie: m.sortie };
}

/**
 * Les modeles d'un fournisseur adaptes a un role donne.
 *
 * Sert a remplir les deux menus de l'interface : « modele de redaction » et
 * « modele d'extraction ». Un meme modele peut apparaitre dans les deux.
 *
 * @param {string} idFournisseur
 * @param {'redaction'|'extraction'} role
 * @returns {Array<object>} vide si le fournisseur ou le role est inconnu
 */
function modelesPourRole(idFournisseur, role) {
  const f = fournisseur(idFournisseur);
  if (!f || !ROLES.includes(role)) return [];
  return f.modeles.filter((m) => m.roles.includes(role));
}

/**
 * Le catalogue tel que l'INTERFACE en a besoin : chaque fournisseur augmente
 * de son guide (atouts, limites, confidentialite, comment obtenir la cle),
 * chaque modele de sa note, et le tout trie — les fournisseurs mis en avant
 * d'abord.
 *
 * Fonction separee de fournisseurs() a dessein : le code qui appelle un modele
 * n'a que faire de ces textes, et il ne doit pas payer leur assemblage a
 * chaque resolution.
 *
 * @returns {Array<object>} une copie neuve ; le catalogue reste gele
 */
function fournisseursAvecGuides() {
  return guides.enrichir(FOURNISSEURS);
}

module.exports = {
  verifieLe,
  ROLES,
  ADAPTATEURS,
  fournisseurs,
  fournisseur,
  modele,
  tarif,
  modelesPourRole,
  fournisseursAvecGuides,
  guideFournisseur: guides.guideFournisseur,
  noteModele: guides.noteModele,
  MISE_EN_AVANT: guides.MISE_EN_AVANT
};
