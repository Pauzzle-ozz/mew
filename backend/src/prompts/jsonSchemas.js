/**
 * Prompts de conversion JSON
 * Extraits des etapes "reponse JSON" / "Convertir en JSON" des workflows n8n
 * Chaque fonction prend le texte genere et retourne un prompt pour la conversion
 */

/**
 * Conversion analyse CV → JSON structure
 * Utilise par analyseCvForm et analyseCvPdf
 */
function cvToJSON(generatedText) {
  return `Tu vas recevoir un texte contenant un score ATS, des points forts, des améliorations, et un CV optimisé. Transforme tout cela en JSON STRICT.

RÈGLES :
- JSON valide uniquement
- Aucun texte avant/après
- Pas de \`\`\`json
- Extrais le score ATS (nombre), les points forts (tableau), les améliorations (tableau) en PLUS du CV
- Structure EXACTE :

{
  "score_ats": 85,
  "points_forts": ["point 1", "point 2", "point 3"],
  "ameliorations": ["amélioration 1", "amélioration 2", "amélioration 3"],
  "prenom": "",
  "nom": "",
  "titre_poste": "",
  "email": "",
  "telephone": "",
  "adresse": "",
  "linkedin": "",
  "resume": "",
  "experiences": [
    {
      "poste": "",
      "entreprise": "",
      "localisation": "",
      "date_debut": "",
      "date_fin": "",
      "description": ""
    }
  ],
  "formations": [
    {
      "diplome": "",
      "etablissement": "",
      "localisation": "",
      "date_fin": ""
    }
  ],
  "competences_techniques": "",
  "competences_soft": "",
  "langues": "",
  "interets": ""
}

CONTRAINTES CONTENU CONDENSÉ (OBJECTIF 1 PAGE A4) :
- "resume" : 2-3 phrases (50-80 mots), percutant et accrocheur
- "experiences" : MAX 3 postes les plus récents/pertinents
- "description" de chaque expérience : 3-4 bullets séparés par des retours à la ligne, chaque bullet 15-20 mots max avec verbe d'action + résultat chiffré
- "formations" : diplôme + établissement + année uniquement
- "competences_techniques" : 8-15 compétences pertinentes à virgules (pas d'exhaustivité)
- "competences_soft" : 5-7 qualifications sous forme de PHRASES de 12-18 mots, séparées par \n. Ne JAMAIS laisser vide, inventer si nécessaire.
- "langues" : format court à virgules (ex: "Français (natif), Anglais (C1)")
- Le contenu doit être CONCIS et PERCUTANT — objectif 1 page

Texte à transformer :
${generatedText}`;
}

/**
 * Conversion CV personnalise → JSON structure
 * Utilise par matcherCvPersonnalise et scraperCvPersonnalise
 * Extrait aussi le score_matching et les modifications_apportees
 */
function personalizedCVToJSON(generatedText) {
  return `Tu vas recevoir un texte qui contient :
1. Un SCORE_MATCHING (nombre 0-100)
2. Une liste de MODIFICATIONS apportées
3. Un CV personnalisé optimisé

Ta mission est de transformer ce contenu en **JSON STRICT**, exploitable par un workflow automatisé.

Règles obligatoires :
- Réponds UNIQUEMENT avec du JSON valide
- Aucun texte explicatif avant ou après
- Aucun Markdown (pas de \`\`\`json)
- Aucun commentaire
- Toutes les clés doivent être présentes
- score_matching doit être un nombre entier (0-100)
- modifications_apportees doit être un tableau de strings

Structure JSON attendue :

{
  "score_matching": 0,
  "modifications_apportees": [],
  "personalizedCV": {
    "prenom": "",
    "nom": "",
    "titre_poste": "",
    "email": "",
    "telephone": "",
    "adresse": "",
    "linkedin": "",
    "resume": "",
    "experiences": [
      {
        "poste": "",
        "entreprise": "",
        "localisation": "",
        "date_debut": "",
        "date_fin": "",
        "description": ""
      }
    ],
    "formations": [
      {
        "diplome": "",
        "etablissement": "",
        "localisation": "",
        "date_fin": ""
      }
    ],
    "competences_techniques": "",
    "competences_soft": "",
    "langues": ""
  }
}

CONTRAINTES CONTENU CONDENSÉ (1 PAGE A4) :
- "resume" : 2-3 phrases (50-80 mots)
- MAX 3 postes, 3-4 bullets par poste (15-20 mots max par bullet)
- "competences_techniques" : 8-15 compétences pertinentes à virgules
- "competences_soft" : 5-7 qualifications en PHRASES de 12-18 mots, séparées par \n. Ne JAMAIS laisser vide.

Voici le contenu à transformer :

${generatedText}`;
}

/**
 * Conversion CV ideal → JSON structure
 * Utilise par matcherCvIdeal et scraperCvIdeal
 */
module.exports = {
  cvToJSON,
  personalizedCVToJSON
};
