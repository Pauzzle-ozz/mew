/**
 * L'ACCES AUX GUIDES.
 *
 * Meme principe que providers/index.js : les deux fichiers de donnees
 * (fournisseurs.js, modeles.js) ne sont jamais importes directement ailleurs.
 * On passe par ici, et ces fonctions NE LEVENT JAMAIS — les identifiants
 * qu'elles recoivent viennent du navigateur ou d'un fichier de reglages que
 * l'utilisateur a pu editer a la main.
 */

const { MISE_EN_AVANT, GUIDES } = require('./fournisseurs');
const { NOTES, note: noteBrute } = require('./modeles');

const CLES_FOURNISSEURS = Object.freeze(Object.keys(GUIDES));

/**
 * Le guide d'un fournisseur, ou null.
 *
 * Recherche dans une liste de cles connues plutot que par GUIDES[id] : ainsi
 * « __proto__ » ou « constructor » sont des chaines comme les autres, qui ne
 * correspondent a aucune entree.
 *
 * @param {string} id
 * @returns {object|null}
 */
function guideFournisseur(id) {
  if (typeof id !== 'string' || !CLES_FOURNISSEURS.includes(id)) return null;
  return GUIDES[id];
}

/**
 * La note d'un modele, ou null.
 *
 * DEUX ESSAIS, ET C'EST VOULU : les revendeurs (OpenRouter, Together,
 * Fireworks) prefixent les identifiants du nom de l'editeur —
 * « anthropic/claude-opus-5 ». C'est le MEME modele que « claude-opus-5 » chez
 * Anthropic, il merite la meme note. On tente donc l'identifiant exact, puis
 * ce qui suit le dernier « / ». Sans correspondance, l'interface se rabat sur
 * les faits du catalogue (tarif, fenetre, roles), ce qui reste honnete.
 *
 * @param {string} id
 * @returns {object|null}
 */
function noteModele(id) {
  const exacte = noteBrute(id);
  if (exacte) return exacte;

  if (typeof id !== 'string') return null;
  const barre = id.lastIndexOf('/');
  if (barre === -1) return null;

  return noteBrute(id.slice(barre + 1).toLowerCase());
}

/**
 * Un fournisseur du catalogue, augmente de ce qui aide a choisir.
 *
 * On construit un OBJET NEUF : le catalogue est gele en profondeur, et il doit
 * le rester. Les champs ajoutes :
 *   guide       le texte du guide (atouts, limites, confidentialite, cle)
 *   enAvant     ce fournisseur fait-il partie des huit montres d'emblee
 *   rang        sa position dans cette mise en avant (pour trier)
 *   modeles     les memes, chacun avec sa `note` (null quand on n'en a pas)
 *
 * @param {object} f une entree de catalogue.js
 * @returns {object}
 */
function enrichirFournisseur(f) {
  const rang = MISE_EN_AVANT.indexOf(f.id);

  return {
    ...f,
    guide: guideFournisseur(f.id),
    enAvant: rang !== -1,
    // Les non mis en avant passent apres, dans l'ordre du catalogue.
    rang: rang === -1 ? MISE_EN_AVANT.length : rang,
    modeles: f.modeles.map((m) => ({ ...m, note: noteModele(m.id) }))
  };
}

/**
 * Tout le catalogue, augmente et TRIE : les huit mis en avant d'abord, dans
 * l'ordre choisi, puis les autres dans l'ordre du catalogue.
 *
 * @param {Array<object>} liste le retour de providers.fournisseurs()
 * @returns {Array<object>}
 */
function enrichir(liste) {
  if (!Array.isArray(liste)) return [];

  return liste
    .map(enrichirFournisseur)
    .map((f, index) => ({ f, index }))
    // On garde l'index d'origine dans la comparaison : sans lui, le tri de
    // JavaScript n'est pas garanti stable sur toutes les versions, et l'ordre
    // du catalogue (soigneusement choisi) partirait en morceaux.
    .sort((a, b) => (a.f.rang - b.f.rang) || (a.index - b.index))
    .map(({ f }) => f);
}

module.exports = {
  MISE_EN_AVANT,
  GUIDES,
  NOTES,
  guideFournisseur,
  noteModele,
  enrichirFournisseur,
  enrichir
};
