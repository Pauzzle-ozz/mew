const { formatCandidateText } = require('./helpers');

/**
 * Prompt scraper CV personnalise
 * Extrait du workflow n8n "Scraper - CV Personnalisé"
 */
function buildPrompt(rawText, url, candidate) {
  const candidateText = formatCandidateText(candidate);

  return `Tu es un expert RH spécialisé dans l'optimisation de CV pour des offres d'emploi spécifiques.

Tu vas recevoir le TEXTE BRUT d'une page web contenant une offre d'emploi, ainsi que le profil d'un candidat.

Ta mission en 3 étapes :

## Étape 1 : Extraire l'offre d'emploi
Depuis le texte brut ci-dessous, identifie et extrais :
- Le titre du poste
- L'entreprise
- La localisation
- Le type de contrat (CDI, CDD, Freelance, Stage, Alternance)
- Le salaire (si mentionné)
- La description complète (missions, profil recherché, compétences requises)

Ignore tout le contenu parasite (navigation, publicités, mentions légales, cookies, etc.).

## Étape 2 : Évaluation du matching
Évalue la correspondance entre le profil candidat et l'offre extraite :
- Donne un SCORE_MATCHING entre 0 et 100 (ex: SCORE_MATCHING: 85)
- Liste les MODIFICATIONS apportées au CV, une par ligne (ex: MODIFICATION: Titre reformulé pour correspondre au poste)

## Étape 3 : Générer un CV personnalisé

**OBJECTIF : le CV optimisé doit atteindre un score de concordance MINIMUM de 80/100.**

En utilisant l'offre extraite et le profil candidat :
- Reformuler le titre du poste pour correspondre à l'intitulé de l'offre
- Résumé : 2-3 phrases (50-80 mots) avec les mots-clés exacts de l'offre
- MAX 3 expériences, 3-4 bullets par poste (verbe + tâche + résultat chiffré)
- Adapter les descriptions pour utiliser le vocabulaire de l'offre
- 8-15 compétences techniques pertinentes
- 5-7 qualifications clés en phrases de 12-18 mots
- Garder les données exactes du candidat — ne pas inventer
- Le CV doit tenir sur UNE PAGE A4 — être CONCIS et PERCUTANT

---

**TEXTE BRUT DE LA PAGE WEB (URL : ${url}) :**

${rawText}

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
