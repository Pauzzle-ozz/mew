const { normaliserTitre, enLignes } = require('./texte');
const TITRES = require('../../data/fr/sections-cv.json');

/**
 * Decoupage d'un CV en sections a partir de ses titres.
 *
 * Pourquoi c'est fragile, et pourquoi on renvoie un score de confiance :
 * pdf-parse rend un CV en une seule colonne de texte. Quand le CV d'origine
 * est sur deux colonnes (tres frequent sur les modeles Canva ou Word), les
 * lignes des deux colonnes sont ENTRELACEES. Le resultat est illisible, et
 * aucune heuristique ne peut le recoller. Plutot que de rendre un decoupage
 * faux avec l'air sur de lui, on le dit : confiance « faible ». Le code
 * appelant peut alors basculer sur le modele de langage, qui s'en sort mieux
 * sur du texte melange.
 */

const CLES_SECTIONS = ['entete', 'resume', 'experiences', 'formations', 'competences', 'langues', 'centresInteret', 'autres'];

/** Index : titre normalise -> cle de section. Construit une fois au chargement. */
const INDEX_TITRES = new Map();
for (const cle of Object.keys(TITRES)) {
  if (!CLES_SECTIONS.includes(cle)) continue; // ignore la cle "_lisezMoi"
  for (const variante of TITRES[cle]) {
    const normalise = normaliserTitre(variante);
    if (normalise && !INDEX_TITRES.has(normalise)) INDEX_TITRES.set(normalise, cle);
  }
}

const LONGUEUR_MAX_TITRE = 60;

/** Une ligne faite uniquement de tirets ou d'egals : un soulignement de titre. */
const MOTIF_SEPARATEUR = /^[\s\-–—_=~*.·•]{3,}$/;

/**
 * Cette ligne est-elle un titre de section ?
 * Renvoie { cle, reste, soulignable } ou null.
 * `reste` recupere le contenu ecrit sur la meme ligne que le titre
 * (« COMPETENCES : React, Node »), sinon il aurait ete perdu.
 */
function detecterTitre(ligne) {
  const nettoyee = ligne.trim();
  if (!nettoyee || nettoyee.length > LONGUEUR_MAX_TITRE) return null;

  // Un titre de section ne se termine pas par un point : c'est une phrase.
  if (/\.\s*$/.test(nettoyee)) return null;

  // Un titre ne contient pas d'adresse mail ni de lien.
  if (/[@]|https?:\/\//.test(nettoyee)) return null;

  const direct = INDEX_TITRES.get(normaliserTitre(nettoyee));
  if (direct) return { cle: direct, reste: '' };

  // Forme « TITRE : contenu sur la meme ligne »
  const separation = nettoyee.indexOf(':');
  if (separation > 0 && separation <= LONGUEUR_MAX_TITRE) {
    const avant = nettoyee.slice(0, separation);
    const cle = INDEX_TITRES.get(normaliserTitre(avant));
    if (cle) return { cle, reste: nettoyee.slice(separation + 1).trim() };
  }

  return null;
}

function decouperSections(texteCv) {
  const sections = {};
  for (const cle of CLES_SECTIONS) sections[cle] = [];

  const lignes = enLignes(typeof texteCv === 'string' ? texteCv : '');

  let sectionCourante = 'entete';
  let lignesHorsSection = 0;
  let lignesNonVides = 0;
  const sectionsTrouvees = [];
  let titresSoulignes = 0;
  let titresMajuscules = 0;

  for (let i = 0; i < lignes.length; i += 1) {
    const ligne = lignes[i];
    const nettoyee = ligne.trim();

    if (MOTIF_SEPARATEUR.test(nettoyee)) continue; // soulignement decoratif

    const titre = detecterTitre(ligne);
    if (titre) {
      sectionCourante = titre.cle;
      if (titre.cle !== 'entete' && !sectionsTrouvees.includes(titre.cle)) {
        sectionsTrouvees.push(titre.cle);
      }
      if (nettoyee === nettoyee.toUpperCase()) titresMajuscules += 1;
      const suivante = (lignes[i + 1] || '').trim();
      if (MOTIF_SEPARATEUR.test(suivante)) titresSoulignes += 1;
      if (titre.reste) sections[titre.cle].push(titre.reste);
      continue;
    }

    if (nettoyee) {
      lignesNonVides += 1;
      if (sectionCourante === 'entete') lignesHorsSection += 1;
    }
    sections[sectionCourante].push(ligne);
  }

  const resultat = {};
  for (const cle of CLES_SECTIONS) {
    resultat[cle] = sections[cle].join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  const proportionHorsSection = lignesNonVides === 0 ? 1 : lignesHorsSection / lignesNonVides;
  const raisons = [];

  if (sectionsTrouvees.length === 0) {
    raisons.push('aucun titre de section reconnu : CV sans structure, en image, ou mise en page exotique');
  } else if (sectionsTrouvees.length < 2) {
    raisons.push(`une seule section reconnue (${sectionsTrouvees[0]}) : il en faut au moins deux pour se fier au decoupage`);
  }

  if (proportionHorsSection > 0.5 && lignesNonVides > 0) {
    raisons.push(
      `${Math.round(proportionHorsSection * 100)}% des lignes ne sont rattachees a aucune section ` +
      '(signature classique d\'un CV en deux colonnes que l\'extraction PDF a entrelace)'
    );
  }

  let niveau;
  if (sectionsTrouvees.length < 2 || proportionHorsSection > 0.5) {
    niveau = 'faible';
  } else if (sectionsTrouvees.length >= 4 && proportionHorsSection <= 0.3) {
    niveau = 'haute';
  } else {
    niveau = 'moyenne';
    if (sectionsTrouvees.length < 4) {
      raisons.push(`seulement ${sectionsTrouvees.length} sections reconnues : le CV est peut-etre incomplet`);
    }
  }

  // Signaux positifs : ils n'ameliorent pas la note mais expliquent la decision
  // a qui lit le rapport.
  if (niveau === 'haute' && (titresSoulignes > 0 || titresMajuscules > 0)) {
    raisons.push('titres nettement identifiables (majuscules ou soulignement)');
  }

  resultat.confiance = {
    niveau,
    sectionsTrouvees,
    lignesHorsSection,
    raisons
  };

  return resultat;
}

module.exports = { decouperSections };
