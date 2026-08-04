const { sansAccents, enLignes } = require('./texte');

/**
 * Decoupage de la section « competences » en une liste.
 *
 * REGLE ABSOLUE DE CE FICHIER : aucun filtrage par dictionnaire.
 *
 * La tentation est grande de ne garder que ce qui figure dans une liste de
 * competences connues. C'est exactement ce qu'il ne faut pas faire. Un
 * infirmier ecrit « pose de voie veineuse peripherique » et « transmissions
 * ciblees ». Un plombier ecrit « soudure au chalumeau » et « PER multicouche ».
 * Aucun de ces termes ne figure dans une liste de competences tech, et un
 * filtre les ferait disparaitre EN SILENCE : l'outil renverrait « 0 competence
 * detectee » a un professionnel qui en a trente. On prend donc tout ce que le
 * candidat a ecrit, on se contente de nettoyer la mise en forme.
 */

/**
 * Seule liste de mots qui peut faire disparaitre une entree : des etiquettes
 * de regroupement, pas des competences. « Langages : Java, Python » ne doit
 * pas produire une competence nommee « Langages ». Cette liste ne retire
 * QUE ces mots exacts, jamais un terme metier inconnu d'elle.
 */
const ETIQUETTES = new Set([
  'langages', 'langage', 'langues', 'langue', 'outils', 'outil', 'logiciels',
  'logiciel', 'technologies', 'technologie', 'techniques', 'technique',
  'frameworks', 'framework', 'bases de donnees', 'base de donnees', 'bdd',
  'competences', 'competence', 'competences techniques', 'savoir faire',
  'savoir-faire', 'savoir etre', 'savoir-etre', 'soft skills', 'hard skills',
  'skills', 'methodes', 'methodologies', 'methodologie', 'environnement',
  'environnements', 'systemes', 'systeme', 'divers', 'autres', 'autre',
  'niveau', 'niveaux', 'domaines', 'domaine', 'specialites', 'specialite',
  'qualites', 'qualite', 'informatique', 'bureautique', 'transverses'
]);

/** Separateurs explicites demandes : virgule, point-virgule, barre verticale, puces, sauts de ligne. */
const MOTIF_SEPARATEURS = /[\n;,|•▪●◦‣∙·■□▶▸➢➤\t]+/;

const LONGUEUR_MIN = 2;
const LONGUEUR_MAX = 60;

/** Enleve puces de tete, numerotation, ponctuation parasite. */
function nettoyerEntree(brut) {
  return String(brut)
    // Attention : « o » n'est une puce que suivi d'un espace, sinon on
    // amputerait « outils » ou « organisation » de leur premiere lettre.
    .replace(/^o\s+/, '')
    .replace(/^[\s\-–—*+>•▪●◦‣∙·]+/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/[\s.,;:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Forme comparable pour la deduplication (casse et accents ignores). */
function cle(valeur) {
  return sansAccents(valeur).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function estEtiquette(valeur) {
  return ETIQUETTES.has(sansAccents(valeur).toLowerCase().replace(/\s+/g, ' ').trim());
}

function extraireCompetences(texteSectionCompetences) {
  if (typeof texteSectionCompetences !== 'string' || !texteSectionCompetences.trim()) return [];

  const fragments = [];

  for (const ligne of enLignes(texteSectionCompetences)) {
    for (const morceau of ligne.split(MOTIF_SEPARATEURS)) {
      // « Langages : Java » -> on garde les deux cotes du deux-points et on
      // laisse le filtre d'etiquettes decider. Couper aveuglement avant le
      // deux-points ferait perdre « Gestion de projet : agile ».
      const positionDeuxPoints = morceau.indexOf(':');
      if (positionDeuxPoints > 0 && positionDeuxPoints < morceau.length - 1) {
        fragments.push(morceau.slice(0, positionDeuxPoints));
        fragments.push(morceau.slice(positionDeuxPoints + 1));
      } else {
        fragments.push(morceau.replace(/:/g, ' '));
      }
    }
  }

  const vues = new Set();
  const competences = [];

  for (const fragment of fragments) {
    const entree = nettoyerEntree(fragment);
    if (entree.length < LONGUEUR_MIN || entree.length > LONGUEUR_MAX) continue;
    // Une entree sans aucune lettre est une decoration (« ***, 5/5, ---- »).
    if (!/[A-Za-zÀ-ÿ]/.test(entree)) continue;
    if (estEtiquette(entree)) continue;

    const identifiant = cle(entree);
    if (!identifiant || vues.has(identifiant)) continue;
    vues.add(identifiant);
    competences.push(entree);
  }

  return competences;
}

module.exports = { extraireCompetences };
