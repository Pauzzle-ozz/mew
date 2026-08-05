/**
 * MISE EN FORME DES CHIFFRES D'UN MODELE.
 *
 * Ecrite a la main plutot qu'avec Intl : le format doit etre le meme partout
 * (virgule decimale, espace comme separateur de milliers) quelle que soit la
 * langue du navigateur. Un tarif affiche « 2.50 » chez l'un et « 2,50 » chez
 * l'autre, dans un tableau comparatif, se lit deux fois moins bien.
 *
 * Tout est calcule a partir du catalogue. Un modele dont on ne connait pas le
 * tarif rend « tarif inconnu » — jamais un zero, qui laisserait croire a la
 * gratuite.
 */

const virgule = (valeur, decimales) => valeur.toFixed(decimales).replace('.', ',');

const separerMilliers = (entier) => String(Math.round(entier)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** « 2,50 $ / 10,00 $ » — entree puis sortie, par million de tokens. */
export function resumerTarif(modele) {
  if (!modele || (modele.entree === null && modele.sortie === null)) return 'tarif inconnu';
  if (modele.entree === 0 && modele.sortie === 0) return 'gratuit';
  return `${virgule(modele.entree || 0, 2)} $ / ${virgule(modele.sortie || 0, 2)} $`;
}

/** « fenetre de 1 000 000 tokens », ou null quand elle est inconnue. */
export function resumerContexte(modele) {
  if (!modele || !modele.contexte) return null;
  return `fenetre de ${separerMilliers(modele.contexte)} tokens`;
}

/**
 * Un appel typique de Mew : environ 3 000 tokens envoyes (le CV et l'offre) et
 * 700 tokens produits (la lettre), convertis au taux fixe ci-dessous.
 * C'est un ORDRE DE GRANDEUR, pas une facture.
 */
const TOKENS_ENTREE_TYPIQUE = 3000;
const TOKENS_SORTIE_TYPIQUE = 700;
const USD_VERS_EUR = 0.92;

/** Le cout d'UN texte redige, en euros. null quand le tarif est inconnu. */
export function coutParLettre(modele) {
  if (!modele || (modele.entree === null && modele.sortie === null)) return null;

  const usd = (TOKENS_ENTREE_TYPIQUE / 1e6) * (modele.entree || 0)
    + (TOKENS_SORTIE_TYPIQUE / 1e6) * (modele.sortie || 0);
  return Math.round(usd * USD_VERS_EUR * 1000) / 1000;
}

/**
 * Le cout par lettre, ecrit pour quelqu'un qui ne convertit pas des dollars
 * par million de tokens de tete. C'est la seule ligne vraiment parlante de
 * tout l'ecran.
 *
 * @returns {string|null}
 */
export function resumerCout(modele) {
  const cout = coutParLettre(modele);
  if (cout === null) return null;
  if (cout === 0) return 'gratuit a l\'usage';
  // En dessous du dixieme de centime, « 0,001 EUR » est plus parlant que
  // « 0,0004 EUR », qu'on lit comme une erreur d'affichage.
  if (cout < 0.001) return 'moins de 0,001 EUR par texte redige';
  return `environ ${virgule(cout, 3)} EUR par texte redige`;
}

/**
 * Tout ce qu'on sait chiffrer sur un modele, en une ligne.
 * « 2,50 $ / 10,00 $ par million de tokens · fenetre de 1 000 000 tokens ·
 *   environ 0,014 EUR par texte redige »
 */
export function detailModele(modele) {
  const morceaux = [];

  if (modele && (modele.entree !== null || modele.sortie !== null)) {
    morceaux.push(`${resumerTarif(modele)} par million de tokens`);
  }

  const contexte = resumerContexte(modele);
  if (contexte) morceaux.push(contexte);

  const cout = resumerCout(modele);
  if (cout) morceaux.push(cout);

  return morceaux.join(' · ');
}

/** L'etiquette courte affichee a cote d'un modele dans une liste. */
export function etiquetteModele(modele) {
  const cout = resumerCout(modele);
  if (cout === 'gratuit a l\'usage') return 'gratuit';
  if (modele && modele.entree === null && modele.sortie === null) return 'tarif inconnu';
  return resumerTarif(modele);
}
