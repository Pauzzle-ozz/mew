const { normaliserMemeLongueur } = require('./texte');

/**
 * Lecture des periodes d'un CV (« Janvier 2022 - Mars 2024 ») et calcul de
 * l'anciennete reelle.
 *
 * Le piege que ce fichier existe pour eviter : un freelance, un interimaire
 * ou quelqu'un qui cumule deux emplois a des missions qui se CHEVAUCHENT.
 * Additionner betement les durees donne « 12 ans d'experience » a quelqu'un
 * qui en a 7. On fusionne donc les intervalles avant de sommer.
 */

/** Mois francais et anglais, formes completes et abregees. */
const MOIS = {
  jan: 1, janv: 1, janvier: 1, january: 1,
  fev: 2, fevr: 2, fevrier: 2, feb: 2, february: 2,
  mar: 3, mars: 3, march: 3,
  avr: 4, avril: 4, apr: 4, april: 4,
  mai: 5, may: 5,
  jun: 6, juin: 6, june: 6,
  jul: 7, juil: 7, juillet: 7, july: 7,
  aou: 8, aout: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septembre: 9, september: 9,
  oct: 10, octobre: 10, october: 10,
  nov: 11, novembre: 11, november: 11,
  dec: 12, decembre: 12, december: 12
};

const NOMS_MOIS = Object.keys(MOIS).sort((a, b) => b.length - a.length).join('|');

/**
 * Un seul motif, quatre formes de date, testees dans cet ordre :
 *   1. « janvier 2022 », « Jan. 2022 »       -> groupes 1 et 2
 *   2. « 12/01/2022 » (jour/mois/annee)      -> groupes 3, 4 et 5
 *   3. « 01/2022 », « 01-2022 »              -> groupes 6 et 7
 *   4. « 2022 » seule                        -> groupe 8
 * L'ordre compte : la forme la plus riche doit etre essayee en premier,
 * sinon « 01/2022 » serait lu comme l'annee 2022 sans son mois.
 */
const MOTIF_DATE = new RegExp(
  `\\b(${NOMS_MOIS})\\.?\\s*((?:19|20)\\d{2})\\b` +
  '|\\b(0?[1-9]|[12]\\d|3[01])[\\/.\\-](0?[1-9]|1[0-2])[\\/.\\-]((?:19|20)\\d{2})\\b' +
  '|\\b(0?[1-9]|1[0-2])[\\/.\\-]((?:19|20)\\d{2})\\b' +
  '|\\b((?:19|20)\\d{2})\\b',
  'g'
);

/** Marqueurs qui signifient « ca continue aujourd'hui ». */
const MOTIF_EN_COURS = /\b(aujourd\s*['’]?\s*hui|a\s+ce\s+jour|ce\s+jour|nos\s+jours|actuellement|actuel|actuelle|en\s+cours|en\s+poste|present|presente|maintenant|now|today|current|currently|ongoing|to\s+date|till\s+now)\b/;

/** Marqueurs d'un debut sans fin (« depuis 2019 »). */
const MOTIF_DEPUIS = /\b(depuis|since|from|a\s+partir\s+de)\b/;

/** Un index absolu en mois, pour comparer et soustraire facilement. */
function versIndexMois(annee, mois) {
  return annee * 12 + (mois - 1);
}

function formater(annee, mois) {
  return `${annee}-${String(mois).padStart(2, '0')}`;
}

/** Transforme 'AAAA-MM' en index absolu. Renvoie null si la chaine est invalide. */
function indexDepuisChaine(chaine) {
  if (typeof chaine !== 'string') return null;
  const trouve = chaine.match(/^(\d{4})-(\d{2})$/);
  if (!trouve) return null;
  const mois = Number(trouve[2]);
  if (mois < 1 || mois > 12) return null;
  return versIndexMois(Number(trouve[1]), mois);
}

function indexMaintenant(dateReference) {
  const date = dateReference instanceof Date ? dateReference : new Date();
  return versIndexMois(date.getFullYear(), date.getMonth() + 1);
}

/**
 * Trouve toutes les dates d'une ligne, dans l'ordre d'apparition.
 * `moisConnu` est faux pour une annee seule : on ne sait pas encore si elle
 * doit valoir janvier (debut de periode) ou decembre (fin de periode).
 */
function trouverDates(ligneNormalisee) {
  const dates = [];
  MOTIF_DATE.lastIndex = 0;
  let trouve;
  while ((trouve = MOTIF_DATE.exec(ligneNormalisee)) !== null) {
    if (trouve[1]) {
      dates.push({ annee: Number(trouve[2]), mois: MOIS[trouve[1]], moisConnu: true, position: trouve.index });
    } else if (trouve[3]) {
      dates.push({ annee: Number(trouve[5]), mois: Number(trouve[4]), moisConnu: true, position: trouve.index });
    } else if (trouve[6]) {
      dates.push({ annee: Number(trouve[7]), mois: Number(trouve[6]), moisConnu: true, position: trouve.index });
    } else if (trouve[8]) {
      dates.push({ annee: Number(trouve[8]), mois: 1, moisConnu: false, position: trouve.index });
    }
  }
  return dates;
}

/**
 * extrairePeriode('Jan 2022 - Mars 2024')
 *   -> { debut: '2022-01', fin: '2024-03', mois: 27 }
 * extrairePeriode('2019 - aujourd hui')
 *   -> { debut: '2019-01', fin: null, mois: <jusqu'a maintenant> }
 * Renvoie null si la ligne ne contient aucune date.
 *
 * `dateReference` est optionnel et sert uniquement aux tests, pour que
 * « en cours » donne un resultat reproductible.
 */
function extrairePeriode(ligne, dateReference) {
  if (typeof ligne !== 'string' || !ligne.trim()) return null;

  const normalisee = normaliserMemeLongueur(ligne);
  const dates = trouverDates(normalisee);
  if (dates.length === 0) return null;

  const enCours = MOTIF_EN_COURS.test(normalisee);
  const depuis = MOTIF_DEPUIS.test(normalisee);

  let debut = dates[0];
  let fin = dates.length >= 2 ? dates[1] : null;

  if (fin === null) {
    // Une seule date : soit la periode continue, soit c'est un point dans le
    // temps (une annee de diplome par exemple). Dans le doute on compte un
    // mois plutot que douze : mieux vaut sous-estimer l'experience.
    if (!enCours && !depuis) fin = debut;
  }

  // Une annee seule en FIN de periode designe la fin de l'annee : « 2022-2024 »
  // se lit « de janvier 2022 a decembre 2024 ». En debut, c'est janvier.
  const indexDebut = versIndexMois(debut.annee, debut.moisConnu ? debut.mois : 1);
  let indexFin = null;
  let finFormatee = null;

  if (fin !== null) {
    const moisFin = fin.moisConnu ? fin.mois : (fin === debut ? debut.mois : 12);
    indexFin = versIndexMois(fin.annee, moisFin);
    finFormatee = formater(fin.annee, moisFin);
  }

  // Periode ecrite a l'envers (« 2024 - 2022 ») : on remet dans l'ordre
  // plutot que de renvoyer une duree negative.
  if (indexFin !== null && indexFin < indexDebut) {
    return {
      debut: finFormatee,
      fin: formater(debut.annee, debut.moisConnu ? debut.mois : 12),
      mois: indexDebut - indexFin + 1
    };
  }

  const indexEffectif = indexFin === null ? indexMaintenant(dateReference) : indexFin;

  return {
    debut: formater(debut.annee, debut.moisConnu ? debut.mois : 1),
    fin: finFormatee,
    // +1 parce que les deux mois extremes sont travailles :
    // janvier a mars, c'est trois mois, pas deux.
    mois: Math.max(0, indexEffectif - indexDebut + 1)
  };
}

/**
 * Somme des durees AVEC fusion des chevauchements.
 * Deux missions de 12 mois qui se recouvrent sur 6 mois font 18 mois,
 * pas 24. Sans ca, tout profil freelance ressort avec le double de son
 * experience reelle.
 */
function totalMois(periodes, dateReference) {
  if (!Array.isArray(periodes) || periodes.length === 0) return 0;

  const maintenant = indexMaintenant(dateReference);

  const intervalles = [];
  for (const periode of periodes) {
    if (!periode || typeof periode !== 'object') continue;
    const debut = indexDepuisChaine(periode.debut);
    if (debut === null) continue;
    const fin = periode.fin === null || periode.fin === undefined
      ? maintenant
      : indexDepuisChaine(periode.fin);
    if (fin === null) continue;
    intervalles.push([Math.min(debut, fin), Math.max(debut, fin)]);
  }

  if (intervalles.length === 0) return 0;

  intervalles.sort((a, b) => a[0] - b[0]);

  let total = 0;
  let [debutCourant, finCourante] = intervalles[0];

  for (let i = 1; i < intervalles.length; i += 1) {
    const [debut, fin] = intervalles[i];
    // `finCourante + 1` : deux periodes collees (decembre puis janvier)
    // forment une seule tranche continue, il ne faut pas compter de trou.
    if (debut <= finCourante + 1) {
      finCourante = Math.max(finCourante, fin);
    } else {
      total += finCourante - debutCourant + 1;
      debutCourant = debut;
      finCourante = fin;
    }
  }
  total += finCourante - debutCourant + 1;

  return total;
}

module.exports = { extrairePeriode, totalMois };
