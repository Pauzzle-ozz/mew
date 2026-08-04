const { normaliser } = require('./normaliser');

/**
 * Reduction morphologique du francais — version volontairement TIMIDE.
 *
 * Le but n'est pas de produire le vrai lemme du dictionnaire, c'est de faire
 * tomber deux ecritures du meme metier sur la meme cle :
 *   infirmieres  -> infirmiere -> infirmier
 *   developpeuse -> developpeur
 *   journaux     -> journal
 *
 * Regle d'or de ce fichier : mieux vaut ne rien faire que produire un faux
 * ami. Un lemmatiseur trop gourmand rapproche « matrice » et « mateur »,
 * « pelouse » et « pelour », « travaux » et « traval » — et le score du
 * candidat part en vrille sans que personne comprenne pourquoi.
 *
 * Deux garde-fous :
 *   1. des listes d'INVARIABLES et d'IRREGULIERS, qui servent a CANONISER
 *      ou a proteger — jamais a jeter un mot ;
 *   2. une longueur minimale par regle : les mots courts sont presque
 *      toujours des faux positifs.
 *
 * Ce fichier ne connait AUCUN metier : il traite « soudeuse » exactement
 * comme « developpeuse ».
 */

/**
 * Mots dont le -s / -x final fait partie du mot lui-meme. Enlever ce -s
 * produirait un mot inexistant et casserait le rapprochement avec le meme
 * mot ecrit ailleurs. « permis » et « anglais » sont ici parce que ce sont
 * des mots pleins dans un CV : un permis poids lourd, un anglais courant.
 */
const INVARIABLES = new Set([
  // demandes explicitement par le cahier des charges
  'bus', 'pays', 'souris', 'corps', 'temps', 'prix', 'cours', 'acces',
  'processus', 'cas', 'fois', 'mois', 'os', 'univers', 'succes',
  // noms invariables courants dans un CV ou une offre d'emploi
  'permis', 'repas', 'colis', 'avis', 'devis', 'tapis', 'compromis',
  'concours', 'discours', 'parcours', 'recours', 'secours', 'surplus',
  'virus', 'cactus', 'bonus', 'campus', 'sens', 'poids', 'progres',
  'proces', 'exces', 'deces', 'abus', 'refus', 'relais', 'palais',
  'tennis', 'radis', 'brebis', 'mepris', 'paradis', 'chassis', 'bras',
  'fils', 'gars', 'ours', 'velours', 'pois', 'mets', 'puits', 'tas',
  // langues et nationalites : invariables au masculin
  'anglais', 'francais', 'portugais', 'japonais', 'chinois', 'neerlandais',
  'danois', 'suedois', 'polonais', 'irlandais', 'ecossais', 'libanais',
  'senegalais', 'congolais', 'marais',
  // mots outils qui finissent par -s
  'alors', 'toujours', 'jamais', 'mais', 'vers', 'divers', 'dessous',
  'dessus', 'ailleurs', 'depuis', 'puis', 'tres', 'apres', 'expres',
  'autrefois', 'parfois', 'quelquefois', 'plusieurs', 'moins', 'plus',
  // faux amis des regles de feminin ci-dessous
  'matrice', 'pelouse', 'ventouse', 'jalouse', 'blouse', 'epouse',
  'antenne', 'peluche', 'perceuse'
]);

/**
 * Pluriels irreguliers. Sans cette table, « travaux » deviendrait « traval »
 * (regle -aux -> -al) et « jeux » deviendrait « jeur » (regle -eux -> -eur).
 * Une table qui CANONISE, jamais qui jette.
 */
const IRREGULIERS = new Map(Object.entries({
  travaux: 'travail',
  vitraux: 'vitrail',
  baux: 'bail',
  coraux: 'corail',
  emaux: 'email',
  jeux: 'jeu',
  lieux: 'lieu',
  milieux: 'milieu',
  enjeux: 'enjeu',
  feux: 'feu',
  cheveux: 'cheveu',
  aveux: 'aveu',
  voeux: 'voeu',
  neveux: 'neveu',
  yeux: 'oeil',
  bijoux: 'bijou',
  cailloux: 'caillou',
  choux: 'chou',
  genoux: 'genou',
  hiboux: 'hibou',
  joujoux: 'joujou',
  poux: 'pou',
  messieurs: 'monsieur',
  mesdames: 'madame'
}));

/**
 * Etape 1 : passer au singulier.
 * En francais, un nom qui finit deja par -s, -x ou -z ne change pas au
 * pluriel : on ne touche donc jamais a un -x qui ne fait pas partie de
 * -aux / -eaux (« prix », « choix », « voix » restent entiers tout seuls).
 */
const REGLES_PLURIEL = [
  // -eaux avant -aux, sinon « reseaux » deviendrait « reseal ».
  { fin: 'eaux', remplace: 'eau', minimum: 6 },  // bureaux -> bureau
  { fin: 'aux', remplace: 'al', minimum: 6 },    // journaux -> journal
  { fin: 's', remplace: '', minimum: 4 }         // competences -> competence
];

/**
 * Etape 2 : passer au masculin.
 *
 * -euse et -eux tombent volontairement sur la MEME cle en -eur. C'est un
 * lemme qui n'existe pas dans le dictionnaire (« rigoureur »), et c'est
 * assume : ce qui compte ici est que « rigoureux » et « rigoureuse » se
 * retrouvent, comme « vendeur » et « vendeuse ».
 */
const REGLES_FEMININ = [
  { fin: 'euse', remplace: 'eur', minimum: 7 },   // developpeuse -> developpeur
  { fin: 'eux', remplace: 'eur', minimum: 7 },    // rigoureux -> rigoureur
  { fin: 'trice', remplace: 'teur', minimum: 8 }, // directrice -> directeur
  { fin: 'iere', remplace: 'ier', minimum: 7 },   // infirmiere -> infirmier
  { fin: 'ere', remplace: 'er', minimum: 8 },     // boulangere -> boulanger
  { fin: 'enne', remplace: 'en', minimum: 8 }     // technicienne -> technicien
];

/** Applique la premiere regle qui accroche, ou rend le mot inchange. */
function appliquer(mot, regles) {
  if (INVARIABLES.has(mot)) return mot;

  for (const regle of regles) {
    if (mot.length < regle.minimum) continue;
    if (!mot.endsWith(regle.fin)) continue;

    const candidat = mot.slice(0, -regle.fin.length) + regle.remplace;
    // Un lemme de moins de 3 lettres est presque toujours un accident.
    if (candidat.length < 3) continue;
    return candidat;
  }
  return mot;
}

/**
 * Reduit un mot a une forme commune a ses variantes de genre et de nombre.
 * Renvoie '' si l'entree n'est pas exploitable. Ne plante jamais.
 *
 * @param {string} mot
 * @returns {string}
 */
function lemmatiser(mot) {
  const normalise = normaliser(mot);
  if (!normalise) return '';

  // Un « mot » qui contient un espace ou de la ponctuation technique
  // (node.js, c++, chef de projet) n'a rien a faire ici : on le rend tel quel.
  if (!/^[a-z0-9]+$/.test(normalise)) return normalise;

  if (IRREGULIERS.has(normalise)) return IRREGULIERS.get(normalise);

  const singulier = appliquer(normalise, REGLES_PLURIEL);
  // Le passage au singulier peut demasquer un irregulier ou un invariable :
  // « pelouses » -> « pelouse », qu'il ne faut surtout pas feminiser.
  if (IRREGULIERS.has(singulier)) return IRREGULIERS.get(singulier);

  return appliquer(singulier, REGLES_FEMININ);
}

module.exports = { lemmatiser, INVARIABLES, IRREGULIERS };
