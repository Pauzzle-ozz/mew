/**
 * Jours feries francais et calcul en jours ouvres.
 *
 * POURQUOI ce fichier existe : la relance d'une candidature est planifiee a
 * J+8. Sans ce calcul, une candidature envoyee un vendredi programme sa
 * relance un samedi -- elle arrive dans une boite vide et se noie sous le
 * courrier du lundi matin. On veut que la relance tombe un jour ou quelqu'un
 * la lit.
 *
 * Tout est calcule en heure LOCALE de la machine (getDay, getDate...).
 * C'est le bon repere pour une application francaise qui tourne en local.
 * Attention si tu passes une date construite en UTC : c'est le jour local
 * qui fait foi ici.
 *
 * Les fonctions ne modifient jamais la date qu'on leur donne : elles en
 * renvoient une nouvelle.
 */

const SAMEDI = 6;
const DIMANCHE = 0;

// Le calendrier gregorien commence en 1582 ; l'algorithme de Paques ci-dessous
// n'a de sens qu'apres.
const ANNEE_MIN = 1583;
const ANNEE_MAX = 4099;

// Chercher un jour ouvre ne devrait jamais demander plus de quelques pas.
// Cette limite empeche une boucle infinie si une donnee aberrante passe.
const MAX_PAS = 3650;

// Les feries d'une annee ne changent jamais : on les garde en memoire plutot
// que de refaire le calcul a chaque date testee.
const cacheFeries = new Map();

/**
 * Dimanche de Paques, algorithme de Meeus/Jones/Butcher.
 *
 * C'est de l'arithmetique pure, sans table ni approximation : elle donne la
 * date exacte pour n'importe quelle annee du calendrier gregorien. Les noms
 * de variables (a, b, c...) sont ceux de l'algorithme d'origine ; les
 * renommer rendrait la comparaison avec la reference impossible.
 */
function calculerPaques(annee) {
  verifierAnnee(annee);

  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(annee, mois - 1, jour);
}

/**
 * Les 11 jours feries francais : 8 dates fixes et 3 qui suivent Paques.
 *
 * Paques lui-meme n'est pas dans la liste : c'est un dimanche, il ne change
 * rien a un calcul de jours ouvres.
 *
 * @returns {Date[]} tries du plus tot au plus tard, a minuit heure locale
 */
function feriesFrancais(annee) {
  verifierAnnee(annee);
  if (cacheFeries.has(annee)) return cacheFeries.get(annee).map(copier);

  const paques = calculerPaques(annee);

  const feries = [
    new Date(annee, 0, 1),    // Jour de l'an
    new Date(annee, 4, 1),    // Fete du travail
    new Date(annee, 4, 8),    // Victoire 1945
    new Date(annee, 6, 14),   // Fete nationale
    new Date(annee, 7, 15),   // Assomption
    new Date(annee, 10, 1),   // Toussaint
    new Date(annee, 10, 11),  // Armistice 1918
    new Date(annee, 11, 25),  // Noel
    decalerJours(paques, 1),  // Lundi de Paques
    decalerJours(paques, 39), // Ascension
    decalerJours(paques, 50)  // Lundi de Pentecote
  ].sort((x, y) => x - y);

  cacheFeries.set(annee, feries);
  return feries.map(copier);
}

/**
 * Un jour ouvre : ni samedi, ni dimanche, ni ferie.
 */
function estJourOuvre(date) {
  const jour = versDate(date);
  const numeroJour = jour.getDay();
  if (numeroJour === SAMEDI || numeroJour === DIMANCHE) return false;
  return !estFerie(jour);
}

function estFerie(date) {
  const jour = versDate(date);
  const cle = cleDuJour(jour);
  return feriesFrancais(jour.getFullYear()).some((ferie) => cleDuJour(ferie) === cle);
}

/**
 * Le prochain jour ouvre, LA DATE ELLE-MEME COMPRISE.
 *
 * Choix important : si la date est deja ouvree, on la renvoie telle quelle.
 * C'est ce qu'attend l'usage reel ("cette relance peut-elle partir ce
 * jour-la, sinon quand ?"). Pour obtenir strictement le jour ouvre suivant,
 * appelle ajouterJoursOuvres(date, 1).
 *
 * L'heure de la journee est conservee.
 */
function prochainJourOuvre(date) {
  let courant = versDate(date);
  let pas = 0;
  while (!estJourOuvre(courant) && pas < MAX_PAS) {
    courant = decalerJours(courant, 1);
    pas += 1;
  }
  return courant;
}

/**
 * Ajoute (ou retire, si n est negatif) n jours ouvres.
 *
 * On avance jour par jour en ne comptant que les jours ouvres : c'est plus
 * lent qu'une formule, mais c'est la seule facon simple de rester juste avec
 * des feries qui tombent n'importe quand.
 *
 * n = 0 renvoie la date inchangee, meme si c'est un dimanche : a l'appelant
 * de passer par prochainJourOuvre s'il veut la recaler.
 */
function ajouterJoursOuvres(date, n) {
  const nombre = Math.trunc(Number(n));
  if (!Number.isFinite(nombre) || nombre === 0) return versDate(date);

  const sens = nombre > 0 ? 1 : -1;
  let restants = Math.abs(nombre);
  let courant = versDate(date);
  let pas = 0;

  while (restants > 0 && pas < MAX_PAS) {
    courant = decalerJours(courant, sens);
    if (estJourOuvre(courant)) restants -= 1;
    pas += 1;
  }

  return courant;
}

/* ------------------------------------------------------------------ */
/* Petites aides internes                                              */
/* ------------------------------------------------------------------ */

function copier(date) {
  return new Date(date.getTime());
}

/**
 * Decale d'un nombre de jours calendaires en conservant l'heure.
 * setDate gere seul les fins de mois et les annees bissextiles.
 */
function decalerJours(date, nombreDeJours) {
  const resultat = copier(date);
  resultat.setDate(resultat.getDate() + nombreDeJours);
  return resultat;
}

/**
 * Identifiant du jour en heure locale. On compare des jours, pas des
 * instants : sans ca, deux dates du meme jour a des heures differentes
 * seraient vues comme differentes.
 */
function cleDuJour(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Accepte une Date, une chaine ISO ou un timestamp, et refuse clairement le
 * reste : une date invalide qui se propage en silence produit une relance
 * planifiee n'importe quand.
 */
function versDate(valeur) {
  if (valeur instanceof Date) {
    if (Number.isNaN(valeur.getTime())) throw new TypeError('Date invalide');
    return copier(valeur);
  }

  // Piege : new Date(null) et new Date(true) renvoient le 1er janvier 1970
  // sans broncher. Une relance planifiee en 1970 passerait inapercue jusqu'a
  // ce qu'un utilisateur s'en etonne. On refuse tout ce qui n'est pas
  // explicitement une chaine ou un nombre.
  const estChaineUtile = typeof valeur === 'string' && valeur.trim() !== '';
  const estNombreUtile = typeof valeur === 'number' && Number.isFinite(valeur);
  if (!estChaineUtile && !estNombreUtile) {
    throw new TypeError(`Date invalide : ${String(valeur)}`);
  }

  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Date invalide : ${String(valeur)}`);
  }
  return date;
}

function verifierAnnee(annee) {
  if (!Number.isInteger(annee) || annee < ANNEE_MIN || annee > ANNEE_MAX) {
    throw new TypeError(`Annee invalide : ${String(annee)} (attendu ${ANNEE_MIN}-${ANNEE_MAX})`);
  }
}

module.exports = {
  feriesFrancais,
  estJourOuvre,
  prochainJourOuvre,
  ajouterJoursOuvres,
  // Exportes parce qu'ils sont utiles ailleurs et testables isolement.
  calculerPaques,
  estFerie
};
