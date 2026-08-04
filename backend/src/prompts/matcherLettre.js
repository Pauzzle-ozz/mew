const { formatOfferText, formatCandidateText } = require('./helpers');

/**
 * Prompt matcher lettre de motivation
 * Extrait du workflow n8n "Matcher - Lettre Motivation"
 */
function buildPrompt(offer, candidate) {
  const offerText = formatOfferText(offer);
  const candidateText = formatCandidateText(candidate);

  return `Tu es un expert RH spécialisé dans la rédaction de lettres de motivation percutantes.

Tu vas analyser une offre d'emploi et un profil candidat, puis rédiger une **lettre de motivation personnalisée**.

## Lettre de Motivation

Rédige une lettre professionnelle et engageante :
- **Introduction** : Capte l'attention, mentionne le poste et l'entreprise
- **Corps** : Fait le lien entre le profil du candidat et les besoins de l'entreprise (2-3 paragraphes)
  - Mise en avant des expériences pertinentes
  - Démonstration de la compréhension du poste
  - Valeur ajoutée du candidat
- **Conclusion** : Montre l'enthousiasme, appel à l'action
- **Ton** : Professionnel mais authentique, adapté au secteur

Structure la lettre en sections distinctes (greeting, introduction, body, conclusion, closing).

---

${offerText}

---

${candidateText}

---

Rédige la lettre de motivation de manière détaillée et professionnelle.`;
}

module.exports = { buildPrompt };
