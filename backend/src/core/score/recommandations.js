'use strict';

/**
 * Transforme le detail du bareme ATS en deux listes lisibles.
 *
 * POURQUOI CE FICHIER EXISTE
 * optimiseCvPdf.js listait 10 regles ATS au modele (lignes 26 a 56), puis lui demandait
 * (lignes 67-68) de recracher "3 a 5 points forts" et "3 a 5 ameliorations". Le modele
 * rendait des conseils generiques, souvent les memes, parfois sans rapport avec le CV.
 * Ici, le bareme sait deja quel critere est rate et de combien : il n'y a plus rien a
 * deviner, seulement a trier et a formuler.
 *
 * LE TRI, C'EST TOUT L'INTERET
 * Les ameliorations sont classees par RENDEMENT = points perdus / facilite.
 * "Ajoutez votre numero de telephone" (10 secondes, 4 points) passe avant "reecrivez vos
 * 14 puces" (une heure, 7 points). Un classement par points perdus seuls mettrait en
 * premier le conseil que personne n'appliquera.
 *
 * ZERO RESEAU, ZERO ECRITURE : une fonction pure sur la sortie de scoreAts.
 */

// Un critere est un "point fort" a partir de ce taux de reussite. En dessous, il a
// quelque chose a corriger et il part dans les ameliorations.
const SEUIL_POINT_FORT = 0.9;

// En dessous, la perte est trop faible pour meriter une ligne dans l'interface :
// on evite de noyer 3 vrais conseils dans 12 broutilles.
const PERTE_MINIMALE = 0.5;

/**
 * @param {object} resultatAts sortie de core/score/ats.js -> scoreAts()
 * @returns {{pointsForts: Array, ameliorations: Array}}
 *   pointsForts   : [{ titre, message, points, critereId, famille }]
 *   ameliorations : [{ titre, message, pointsPerdus, facilite, critereId }]
 */
function recommandations(resultatAts) {
  const criteres =
    resultatAts && Array.isArray(resultatAts.criteres) ? resultatAts.criteres : [];

  // Les criteres non applicables ne sont ni un merite ni un reproche : ils n'ont pas
  // pu etre mesures sur ce CV. Les faire apparaitre reintroduirait exactement le biais
  // que la neutralisation sert a supprimer.
  const mesures = criteres.filter((critere) => critere.applicable);

  const pointsForts = mesures
    .filter((critere) => critere.poids > 0 && critere.obtenu / critere.poids >= SEUIL_POINT_FORT)
    .map((critere) => ({
      titre: critere.libelle,
      message: critere.message,
      points: critere.obtenu,
      critereId: critere.id,
      famille: critere.famille
    }))
    .sort(comparerPointsForts);

  const ameliorations = mesures
    .map((critere) => ({
      titre: critere.libelle,
      message: critere.message,
      pointsPerdus: arrondi1(critere.poids - critere.obtenu),
      facilite: critere.facilite,
      critereId: critere.id
    }))
    .filter((amelioration) => amelioration.pointsPerdus >= PERTE_MINIMALE)
    .sort(comparerAmeliorations);

  return { pointsForts, ameliorations };
}

/** Rendement d'une correction : ce qu'elle rapporte divise par ce qu'elle coute. */
function rendement(amelioration) {
  const facilite = Number.isFinite(amelioration.facilite) && amelioration.facilite > 0
    ? amelioration.facilite
    : 3; // facilite absente du bareme : on la suppose moyenne
  return amelioration.pointsPerdus / facilite;
}

// Les egalites sont departagees jusqu'au bout (points perdus, puis identifiant) pour
// que deux appels sur le meme CV rendent la liste dans le meme ordre. Sans ce dernier
// critere, l'ordre dependrait de l'implementation du tri et le "meme CV, meme resultat"
// serait faux sur l'affichage alors qu'il serait vrai sur le score.
function comparerAmeliorations(a, b) {
  const ecartRendement = rendement(b) - rendement(a);
  if (Math.abs(ecartRendement) > 1e-9) return ecartRendement;
  const ecartPoints = b.pointsPerdus - a.pointsPerdus;
  if (ecartPoints !== 0) return ecartPoints;
  return a.critereId < b.critereId ? -1 : a.critereId > b.critereId ? 1 : 0;
}

function comparerPointsForts(a, b) {
  const ecart = b.points - a.points;
  if (ecart !== 0) return ecart;
  return a.critereId < b.critereId ? -1 : a.critereId > b.critereId ? 1 : 0;
}

function arrondi1(valeur) {
  return Math.round(valeur * 10) / 10;
}

module.exports = { recommandations, SEUIL_POINT_FORT, PERTE_MINIMALE };
