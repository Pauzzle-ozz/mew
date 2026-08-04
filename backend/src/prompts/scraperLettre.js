const { formatCandidateText } = require('./helpers');

/**
 * Prompt scraper lettre de motivation
 * Extrait du workflow n8n "Scraper - Lettre de Motivation"
 */
function buildPrompt(rawText, url, candidate) {
  const candidateText = formatCandidateText(candidate);

  return `Tu es un expert RH spécialisé dans la rédaction de lettres de motivation percutantes.

Tu vas recevoir le TEXTE BRUT d'une page web contenant une offre d'emploi, ainsi que le profil d'un candidat.

Ta mission en 2 étapes :

## Étape 1 : Extraire l'offre d'emploi
Depuis le texte brut ci-dessous, identifie et extrais :
- Le titre du poste
- L'entreprise
- La localisation
- Le type de contrat
- La description complète (missions, profil recherché, compétences requises)
- La culture d'entreprise, les valeurs, l'équipe (si mentionnés)

Ignore tout le contenu parasite (navigation, publicités, mentions légales, cookies, etc.).

## Étape 2 : Rédiger une lettre de motivation personnalisée
En utilisant l'offre extraite et le profil candidat, rédige une lettre professionnelle et engageante :
- **Introduction** : Capte l'attention, mentionne le poste et l'entreprise
- **Corps** : Fait le lien entre le profil du candidat et les besoins de l'entreprise (2-3 paragraphes)
  - Mise en avant des expériences pertinentes
  - Démonstration de la compréhension du poste
  - Valeur ajoutée du candidat
- **Conclusion** : Montre l'enthousiasme, appel à l'action
- **Ton** : Professionnel mais authentique, adapté au secteur

Structure la lettre en sections distinctes (greeting, introduction, body, conclusion, closing).

---

**TEXTE BRUT DE LA PAGE WEB (URL : ${url}) :**

${rawText}

---

${candidateText}

---

Rédige la lettre de motivation de manière détaillée et professionnelle.`;
}

module.exports = { buildPrompt };
