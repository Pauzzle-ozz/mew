/**
 * Phrases qui expliquent a l'utilisateur pourquoi son profil colle (ou non)
 * a un metier.
 *
 * POURQUOI ce fichier existe : ces phrases etaient ecrites par un modele de
 * langage a partir des memes listes de competences. Rien ne garantissait
 * qu'il dise vrai -- il pouvait citer comme point fort une competence absente
 * du profil, et personne ne s'en apercevait. Ici, les phrases sont EXACTES
 * PAR CONSTRUCTION : elles ne peuvent nommer que des competences qu'on lui a
 * effectivement passees.
 *
 * Rien ici ne connait de metier ni de vocabulaire : les listes viennent de
 * l'appelant. Un infirmier, un plombier ou un cuisinier obtiennent donc
 * exactement la meme qualite de phrase qu'un developpeur.
 */

const { rendre } = require('./moteur');

// Combien de competences on nomme avant de resumer par "et N autres".
const MAX_CITEES = 5;

// Pour un conseil, on va plus loin : une liste de huit priorites n'est plus
// une priorite. Trois, c'est un plan de travail.
const MAX_CONSEILLEES = 3;

const GABARITS = {
  // Le profil couvre tout ce qui est attendu.
  complet: 'Tu maitrises les {{total}} competences essentielles {{cible}} ({{liste}}).',
  // Le cas courant.
  partiel: 'Tu maitrises {{communes}} des {{total}} competences essentielles {{cible}} ({{liste}}).',
  // Aucune competence commune : on decrit ce que le CV montre, pas ce que la
  // personne vaut. La nuance compte, c'est elle qui rend la phrase juste.
  aucune: 'Ton profil ne fait apparaitre aucune des {{total}} competences essentielles {{cible}}.',
  // Une seule competence attendue en tout : le pluriel serait faux.
  uniqueManquante: 'La competence essentielle {{cible}} ({{liste}}) n\'apparait pas dans ton profil.',

  conseil: 'Pour viser ce poste, concentre-toi sur {{liste}}.',
  aucunEcart: 'Ton profil couvre deja les competences essentielles de ce poste.'
};

/**
 * "de " ou "d'" selon l'initiale du mot qui suit.
 *
 * Limite connue : le h aspire (un "h" qui refuse l'elision) n'est pas
 * detectable sans dictionnaire. On choisit "d'" pour tous les h, qui est le
 * bon choix pour l'immense majorite des intitules de metier ("d'hotesse",
 * "d'horticulteur").
 */
function articleDe(mot) {
  const premier = String(mot || '').trim().charAt(0);
  return /[aeiouyàâäéèêëîïôöùûüh]/i.test(premier) ? "d'" : 'de ';
}

/**
 * Tronque une liste et dit combien d'elements sont passes sous silence.
 * Renvoie { citees, reste }.
 */
function tronquer(elements, maximum) {
  const propres = nettoyerListe(elements);
  // Tronquer pour cacher un seul element serait ridicule ("et 1 autre") :
  // dans ce cas on prefere tout montrer.
  const citees = propres.length <= maximum + 1 ? propres : propres.slice(0, maximum);
  return { citees, reste: propres.length - citees.length };
}

/**
 * Met une liste dans une PHRASE, a la francaise, sans "et" orphelin :
 * "a", "a et b", "a, b et c", "a, b, c et 3 autres".
 */
function formaterListe(elements, maximum = MAX_CITEES) {
  const { citees, reste } = tronquer(elements, maximum);
  if (citees.length === 0) return '';

  if (reste > 0) return `${citees.join(', ')} et ${reste} autres`;
  if (citees.length === 1) return citees[0];
  return `${citees.slice(0, -1).join(', ')} et ${citees[citees.length - 1]}`;
}

/**
 * Met une liste entre PARENTHESES : la, on enumere des etiquettes, pas des
 * mots dans une phrase. La virgule suffit, le "et" ferait lourd.
 * "(react, docker)", "(a, b, c, d, e et 3 autres)".
 */
function formaterEnumeration(elements, maximum = MAX_CITEES) {
  const { citees, reste } = tronquer(elements, maximum);
  if (citees.length === 0) return '';
  return reste > 0 ? `${citees.join(', ')} et ${reste} autres` : citees.join(', ');
}

/**
 * Enleve les valeurs vides et les doublons, sans rien traduire ni filtrer :
 * une competence inconnue de nous reste une competence.
 */
function nettoyerListe(elements) {
  if (!Array.isArray(elements)) return [];
  const vues = new Set();
  const propres = [];
  for (const element of elements) {
    const texte = String(element === null || element === undefined ? '' : element).trim();
    const cle = texte.toLowerCase();
    if (texte !== '' && !vues.has(cle)) {
      vues.add(cle);
      propres.push(texte);
    }
  }
  return propres;
}

/**
 * "du metier d'infirmier" quand on connait l'intitule, "de ce poste" sinon.
 */
function designerCible(intituleMetier) {
  const intitule = String(intituleMetier || '').trim();
  return intitule ? `du metier ${articleDe(intitule)}${intitule}` : 'de ce poste';
}

/**
 * Phrase d'adequation profil / metier.
 *
 * @returns {string} chaine vide si on n'a rien de vrai a dire
 */
function justifierAdequation({
  competencesCommunes = [],
  competencesManquantes = [],
  totalRequises = 0,
  intituleMetier = ''
} = {}) {
  const communes = nettoyerListe(competencesCommunes);
  const manquantes = nettoyerListe(competencesManquantes);

  // Le total annonce par l'appelant peut etre incoherent avec les listes
  // (arrondi, troncature en amont). On ne peut jamais maitriser plus de
  // competences qu'il n'en existe : on prend le plus grand des deux.
  const total = Math.max(Number(totalRequises) || 0, communes.length + manquantes.length);

  // Sans reference, aucune phrase ne serait vraie. On se tait.
  if (total === 0) return '';

  const cible = designerCible(intituleMetier);

  if (communes.length === 0) {
    // "aucune des 1 competences" serait du charabia.
    if (total === 1 && manquantes.length === 1) {
      return rendre(GABARITS.uniqueManquante, { cible, liste: manquantes[0] });
    }
    return rendre(GABARITS.aucune, { total, cible });
  }

  const gabarit = communes.length >= total ? GABARITS.complet : GABARITS.partiel;
  return rendre(gabarit, {
    communes: communes.length,
    total,
    cible,
    liste: formaterEnumeration(communes, MAX_CITEES)
  });
}

/**
 * Conseil d'action tire des seules competences manquantes.
 *
 * @returns {string} un encouragement si rien ne manque, jamais une chaine vide
 */
function resumerEcart({ competencesManquantes = [] } = {}) {
  const manquantes = nettoyerListe(competencesManquantes);
  if (manquantes.length === 0) return GABARITS.aucunEcart;

  return rendre(GABARITS.conseil, { liste: formaterListe(manquantes, MAX_CONSEILLEES) });
}

module.exports = {
  justifierAdequation,
  resumerEcart,
  // Exportes parce qu'ils servent aussi ailleurs (relance.js) et qu'ils sont
  // testables isolement.
  formaterListe,
  formaterEnumeration,
  articleDe
};
