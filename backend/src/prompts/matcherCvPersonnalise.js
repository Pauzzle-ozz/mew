const { formatOfferText, formatCandidateText } = require('./helpers');

/**
 * Prompt matcher CV personnalise
 * Extrait du workflow n8n "Matcher - CV Personnalisé"
 */
function buildPrompt(offer, candidate) {
  const offerText = formatOfferText(offer);
  const candidateText = formatCandidateText(candidate);

  return `Tu es un expert RH spécialisé dans l'optimisation de CV pour des offres d'emploi spécifiques.

Tu vas analyser une offre d'emploi et un profil candidat, puis générer un **CV personnalisé optimisé** pour cette offre.

## Étape 1 : Évaluation du matching

Avant de générer le CV, évalue le niveau de correspondance entre le profil et l'offre :
- Donne un SCORE_MATCHING entre 0 et 100 (ex: SCORE_MATCHING: 85)
- Liste les MODIFICATIONS apportées au CV, une par ligne (ex: MODIFICATION: Titre reformulé de "Développeur" vers "Lead Developer Full-Stack")

## Étape 2 : CV Personnalisé

**OBJECTIF : le CV optimisé doit atteindre un score de concordance MINIMUM de 80/100.**

Pour atteindre ce score, tu DOIS :
- Reformuler le titre du poste pour correspondre à l'intitulé de l'offre
- Réécrire le résumé en 2-3 phrases (50-80 mots) avec les mots-clés exacts de l'offre
- MAX 3 expériences, 3-4 bullets par poste (verbe + tâche + résultat chiffré)
- Adapter les descriptions pour utiliser le vocabulaire de l'offre
- 8-15 compétences techniques pertinentes (pas de liste exhaustive)
- 5-7 qualifications clés en phrases de 12-18 mots
- Garder les données exactes du candidat (prenom, nom, email, téléphone) — ne pas inventer
- Le CV doit tenir sur UNE PAGE A4 — être CONCIS et PERCUTANT

---

${offerText}

---

${candidateText}

---

Commence ta réponse par :
SCORE_MATCHING: [nombre 0-100]
MODIFICATIONS:
- [modification 1]
- [modification 2]
...

Puis génère le CV personnalisé de manière détaillée et professionnelle.`;
}

module.exports = { buildPrompt };
