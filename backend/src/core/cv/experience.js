const { extrairePeriode, totalMois } = require('./extraireDates');
const { estLignePuce, enLignes } = require('./texte');

/**
 * Decoupage de la section « experiences » en postes distincts.
 *
 * C'est la partie la plus incertaine du parseur, parce qu'il n'existe aucune
 * convention de mise en page : selon le CV, le poste, l'entreprise et les
 * dates sont sur une seule ligne, sur trois lignes, ou dans un ordre
 * quelconque. On s'appuie sur les deux seuls reperes a peu pres fiables :
 *   1. les lignes vides, qui separent les postes dans la majorite des CV ;
 *   2. les dates, qui apparaissent une fois par poste.
 * Le resultat reste une estimation : le champ `entreprise` en particulier
 * ressort souvent vide sur les mises en page libres. C'est assume — mieux
 * vaut un champ vide qu'une entreprise inventee.
 */

/**
 * Separateurs qui, sur une ligne d'en-tete, separent le poste de l'employeur.
 * Le tiret simple n'est pris que s'il est entoure d'espaces, sinon on
 * casserait « Developpeur Full-Stack » ou « Aide-soignant ».
 */
const MOTIF_SEPARATEUR_ENTETE = /\s*[—–]\s*|\s*\|\s*|\s+-\s+|\s*,\s*|\s+chez\s+|\s+@\s+|\s+·\s+/i;

/** Une ligne trop longue est une phrase de description, pas un titre de poste. */
const LONGUEUR_MAX_ENTETE = 120;

const MOTIF_MOIS_TEXTE = /\b(janvier|janv|jan|f[ée]vrier|f[ée]vr|f[ée]v|mars|avril|avr|mai|juin|juillet|juil|ao[uû]t|septembre|sept|sep|octobre|oct|novembre|nov|d[ée]cembre|d[ée]c)\b\.?/gi;
const MOTIF_MOTS_PERIODE = /\b(depuis|aujourd['’\s]*hui|actuellement|actuel|en\s+cours|pr[ée]sent|a\s+ce\s+jour|current|now|today)\b/gi;

/**
 * Retire d'un fragment tout ce qui releve de la date, pour ne garder que le
 * libelle. Un fragment qui ne contenait qu'une date ressort vide et sera
 * ignore par l'appelant.
 */
function retirerDates(fragment) {
  return String(fragment)
    .replace(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-](?:19|20)\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}[\/.\-](?:19|20)\d{2}\b/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(MOTIF_MOIS_TEXTE, ' ')
    .replace(MOTIF_MOTS_PERIODE, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\[\s*\]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    // Parenthese restee orpheline apres le retrait d'une date (« Acme (2022 » ).
    // On ne retire pas les parentheses en general : « Developpeuse (freelance) »
    // doit rester intact.
    .replace(/\(\s*$/, '')
    .replace(/^\s*\)/, '')
    .replace(/^[\s|,;:—–\-·]+|[\s|,;:—–\-·]+$/g, '')
    .trim();
}

/** Une ligne qui porte une periode et qui n'est pas une puce de description. */
function estLigneDatee(ligne) {
  if (estLignePuce(ligne)) return false;
  if (ligne.trim().length > LONGUEUR_MAX_ENTETE) return false;
  return extrairePeriode(ligne) !== null;
}

/**
 * Transforme un bloc de lignes en une experience.
 * L'en-tete va du debut du bloc jusqu'a la ligne datee (si elle arrive tot) ;
 * tout ce qui suit est la description.
 */
function construireExperience(lignesBloc) {
  const lignes = lignesBloc.map((l) => l.trimEnd()).filter((l) => l.trim() !== '');
  if (lignes.length === 0) return null;

  let indexDate = -1;
  for (let i = 0; i < lignes.length; i += 1) {
    if (estLigneDatee(lignes[i])) { indexDate = i; break; }
  }

  // Une date qui arrive au-dela de la 3e ligne appartient a la description
  // (« projet livre en 2023 »), pas a l'en-tete du poste.
  const dateDansEntete = indexDate !== -1 && indexDate <= 2;
  let finEntete = dateDansEntete ? indexDate : 0;

  let indexPremierePuce = -1;
  for (let i = 0; i < lignes.length; i += 1) {
    if (estLignePuce(lignes[i])) { indexPremierePuce = i; break; }
  }
  if (indexPremierePuce !== -1 && indexPremierePuce <= finEntete) {
    finEntete = Math.max(0, indexPremierePuce - 1);
  }

  const periode = dateDansEntete ? extrairePeriode(lignes[indexDate]) : null;

  // On decoupe d'abord sur les separateurs, PUIS on retire les dates de chaque
  // morceau. L'inverse effacerait le tiret de « Poste — Entreprise » en meme
  // temps que le tiret de « 2022 - 2024 », et les deux seraient recolles.
  const morceaux = [];
  for (const ligne of lignes.slice(0, finEntete + 1)) {
    for (const brut of ligne.split(MOTIF_SEPARATEUR_ENTETE)) {
      const propre = retirerDates(brut);
      if (propre.length >= 2) morceaux.push(propre);
    }
  }

  return {
    intitule: morceaux[0] || '',
    entreprise: morceaux[1] || '',
    periode,
    description: lignes.slice(finEntete + 1).join('\n').trim()
  };
}

/** Decoupe sur les lignes vides. */
function blocsParLignesVides(lignes) {
  const blocs = [];
  let courant = [];
  for (const ligne of lignes) {
    if (ligne.trim() === '') {
      if (courant.length) { blocs.push(courant); courant = []; }
    } else {
      courant.push(ligne);
    }
  }
  if (courant.length) blocs.push(courant);
  return blocs;
}

/**
 * Decoupe en s'ancrant sur les lignes datees : chaque date ouvre un poste.
 * On rattache la ligne juste au-dessus quand elle ressemble a un titre, parce
 * que beaucoup de CV ecrivent le poste au-dessus de la periode.
 */
function blocsParDates(lignes) {
  const indicesDates = [];
  for (let i = 0; i < lignes.length; i += 1) {
    if (estLigneDatee(lignes[i])) indicesDates.push(i);
  }
  if (indicesDates.length === 0) return [];

  const debuts = [];
  let precedent = -1;
  for (const index of indicesDates) {
    let debut = index;
    let candidat = index - 1;
    while (candidat > precedent && lignes[candidat].trim() === '') candidat -= 1;
    if (
      candidat > precedent &&
      candidat >= 0 &&
      !estLignePuce(lignes[candidat]) &&
      !estLigneDatee(lignes[candidat]) &&
      lignes[candidat].trim().length >= 2 &&
      lignes[candidat].trim().length <= 80
    ) {
      debut = candidat;
    }
    debuts.push(debut);
    precedent = index;
  }

  const blocs = [];
  for (let i = 0; i < debuts.length; i += 1) {
    const fin = i + 1 < debuts.length ? debuts[i + 1] : lignes.length;
    blocs.push(lignes.slice(debuts[i], fin));
  }
  return blocs;
}

function decouperExperiences(texteSectionExperiences) {
  if (typeof texteSectionExperiences !== 'string' || !texteSectionExperiences.trim()) return [];

  const lignes = enLignes(texteSectionExperiences);
  const parLignesVides = blocsParLignesVides(lignes);
  const nombreLignesDatees = lignes.filter(estLigneDatee).length;
  const blocsAvecDate = parLignesVides.filter((bloc) => bloc.some(estLigneDatee)).length;

  let blocs;
  if (
    parLignesVides.length >= 2 &&
    blocsAvecDate >= parLignesVides.length / 2 &&
    nombreLignesDatees <= parLignesVides.length
  ) {
    // Mise en page classique : un poste par paragraphe.
    blocs = parLignesVides;
  } else if (nombreLignesDatees > 0) {
    // CV compact, sans lignes vides exploitables : on suit les dates.
    blocs = blocsParDates(lignes);
  } else {
    blocs = parLignesVides;
  }

  return blocs
    .map(construireExperience)
    .filter((experience) => experience !== null && (experience.intitule !== '' || experience.periode !== null));
}

/**
 * Nombre d'annees d'experience, a une decimale.
 * Passe par totalMois, donc les missions qui se chevauchent ne sont comptees
 * qu'une fois : deux contrats menes en parallele ne doublent pas l'anciennete.
 */
function anneesExperience(experiences, dateReference) {
  if (!Array.isArray(experiences) || experiences.length === 0) return 0;
  const periodes = experiences
    .map((experience) => (experience && experience.periode ? experience.periode : null))
    .filter(Boolean);
  const mois = totalMois(periodes, dateReference);
  return Math.round((mois / 12) * 10) / 10;
}

module.exports = { decouperExperiences, anneesExperience };
