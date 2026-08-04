const { sansAccents, enLignes } = require('./texte');

/**
 * Extraction des coordonnees d'un CV, sans aucun appel a un modele.
 *
 * Pourquoi du code plutot que l'IA : une adresse email ou un numero de
 * telephone ont une forme parfaitement definie. Les faire deviner par un
 * modele coute de l'argent, prend deux secondes, et introduit un risque
 * d'hallucination sur la donnee la plus critique du CV (si le mail est faux,
 * la candidature n'arrive nulle part).
 *
 * Toutes les valeurs absentes sont des chaines vides, jamais null : le code
 * appelant peut faire `contact.email.length` sans se proteger.
 */

const MOTIF_EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/;

/**
 * Numero francais. Deux formes acceptees :
 *  - international : +33 / 0033, suivi eventuellement de « (0) »
 *  - national : 0 suivi du chiffre d'operateur
 * Puis 8 chiffres, separes par des espaces, des points ou des tirets.
 * Les gardes `(?<![\d+])` et `(?!\d)` evitent de decouper un numero au milieu
 * d'une suite de chiffres plus longue (un SIRET, un IBAN...).
 */
const MOTIF_TELEPHONE = /(?<![\d+])(?:(?:\+|00)\s*33[\s.\-]*(?:\(\s*0\s*\)[\s.\-]*)?[1-9]|0[1-9])(?:[\s.\-]*\d){8}(?!\d)/g;

const MOTIF_LINKEDIN = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9%._\-]+)/i;
const MOTIF_GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9._\-]+)/i;

/**
 * Villes utilisees uniquement en dernier recours, quand le CV ne donne pas de
 * code postal. Cette liste ne SERT PAS a filtrer : si la ville du candidat
 * n'y figure pas, on renvoie simplement une chaine vide, on ne jette rien
 * d'autre. Un CV avec « 62000 Arras » est reconnu sans passer par ici.
 */
const GRANDES_VILLES = [
  'Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Montpellier',
  'Strasbourg', 'Bordeaux', 'Lille', 'Rennes', 'Reims', 'Toulon', 'Saint-Etienne',
  'Le Havre', 'Grenoble', 'Dijon', 'Angers', 'Nimes', 'Villeurbanne', 'Clermont-Ferrand',
  'Le Mans', 'Aix-en-Provence', 'Brest', 'Tours', 'Amiens', 'Limoges', 'Annecy',
  'Perpignan', 'Boulogne-Billancourt', 'Metz', 'Besancon', 'Orleans', 'Rouen',
  'Mulhouse', 'Caen', 'Nancy', 'Argenteuil', 'Montreuil', 'Roubaix', 'Tourcoing',
  'Avignon', 'Poitiers', 'Versailles', 'La Rochelle', 'Pau', 'Calais', 'Colmar',
  'Bourges', 'Cannes', 'Antibes', 'Ajaccio', 'Bayonne', 'Chambery', 'Lorient',
  'Valence', 'Quimper', 'Troyes', 'Niort', 'Beauvais', 'Cholet', 'Vannes',
  'Fort-de-France', 'Saint-Denis', 'Pointe-a-Pitre', 'Cayenne', 'Bruxelles',
  'Geneve', 'Lausanne', 'Luxembourg', 'Montreal'
];

/**
 * Un code postal francais va de 01000 a 98999. On refuse 00xxx et 99xxx,
 * ce qui elimine deja pas mal de faux positifs (references produit, montants).
 */
function estCodePostalPlausible(chiffres) {
  const debut = Number(chiffres.slice(0, 2));
  return debut >= 1 && debut <= 98;
}

/**
 * Ramene n'importe quelle ecriture d'un numero francais a 10 chiffres colles.
 * Renvoie une chaine vide si le resultat n'est pas un numero francais valide.
 */
function normaliserTelephone(brut) {
  let chiffres = String(brut).replace(/\D/g, '');

  if (chiffres.startsWith('00')) chiffres = chiffres.slice(2);

  if (chiffres.startsWith('33')) {
    let reste = chiffres.slice(2);
    // La forme « +33 (0)6... » laisse un zero parasite apres l'indicatif.
    if (reste.startsWith('0')) reste = reste.slice(1);
    chiffres = '0' + reste;
  } else if (chiffres.length === 9 && /^[1-9]/.test(chiffres)) {
    chiffres = '0' + chiffres;
  }

  return /^0[1-9]\d{8}$/.test(chiffres) ? chiffres : '';
}

/** Nettoie un nom de ville capture par une regex. */
function nettoyerVille(brut) {
  return String(brut)
    .replace(/[,;:.\-–—(){}\[\]]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ');
}

/**
 * Cherche un couple code postal / ville sur une ligne, dans les deux ordres
 * d'ecriture courants : « 75011 Paris » et « Paris (75011) ».
 */
function chercherCodePostalEtVille(ligne) {
  const apres = ligne.match(/\b(\d{5})\b[\s,;:\-–—]*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’\- ]{1,40})/);
  if (apres && estCodePostalPlausible(apres[1])) {
    return { codePostal: apres[1], ville: nettoyerVille(apres[2]) };
  }

  const avant = ligne.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’\- ]{1,40}?)[\s,;:\-–—(]+\(?\b(\d{5})\b\)?/);
  if (avant && estCodePostalPlausible(avant[2])) {
    return { codePostal: avant[2], ville: nettoyerVille(avant[1]) };
  }

  const seul = ligne.match(/\b(\d{5})\b/);
  if (seul && estCodePostalPlausible(seul[1])) {
    return { codePostal: seul[1], ville: '' };
  }

  return null;
}

function extraireContact(texte) {
  const resultat = {
    email: '',
    telephone: '',
    linkedin: '',
    github: '',
    ville: '',
    codePostal: ''
  };

  if (typeof texte !== 'string' || !texte.trim()) return resultat;

  const email = texte.match(MOTIF_EMAIL);
  if (email) resultat.email = email[0].replace(/[.,;]+$/, '');

  // On teste tous les candidats et on garde le premier qui donne un vrai
  // numero francais : le premier « motif qui ressemble » n'est pas toujours
  // le bon (une date en 01.02.2019 par exemple).
  const candidats = texte.match(MOTIF_TELEPHONE) || [];
  for (const candidat of candidats) {
    const normalise = normaliserTelephone(candidat);
    if (normalise) {
      resultat.telephone = normalise;
      break;
    }
  }

  const linkedin = texte.match(MOTIF_LINKEDIN);
  if (linkedin) {
    const identifiant = linkedin[1].replace(/[.,;/]+$/, '');
    if (identifiant) resultat.linkedin = `https://www.linkedin.com/in/${identifiant}`;
  }

  const github = texte.match(MOTIF_GITHUB);
  if (github) {
    const identifiant = github[1].replace(/[.,;/]+$/, '');
    // « github.com/mon-projet » dans une section Projets renvoie un depot et
    // non un profil, mais on ne peut pas les distinguer : on garde le premier.
    if (identifiant) resultat.github = `https://github.com/${identifiant}`;
  }

  const lignes = enLignes(texte);
  for (const ligne of lignes) {
    const trouve = chercherCodePostalEtVille(ligne);
    if (trouve) {
      resultat.codePostal = trouve.codePostal;
      resultat.ville = trouve.ville;
      if (trouve.ville) break;
    }
  }

  // Dernier recours : pas de code postal, on cherche une grande ville dans
  // l'en-tete (les 12 premieres lignes), la ou se trouvent les coordonnees.
  if (!resultat.ville) {
    const entete = sansAccents(lignes.slice(0, 12).join('\n')).toLowerCase();
    for (const ville of GRANDES_VILLES) {
      const forme = sansAccents(ville).toLowerCase();
      if (new RegExp(`(^|[^a-z])${forme.replace(/[-]/g, '\\-')}([^a-z]|$)`).test(entete)) {
        resultat.ville = ville;
        break;
      }
    }
  }

  return resultat;
}

module.exports = { extraireContact, normaliserTelephone };
