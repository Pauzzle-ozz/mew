/**
 * Prompt d'optimisation CV par PDF
 * Objectif : CV optimisé ATS tenant sur 1 page A4
 */
function buildPrompt(cvText, numPages, posteCible) {
  const posteSection = posteCible
    ? `\n=== POSTE CIBLÉ ===\n${posteCible}\n\nOptimise le CV SPÉCIFIQUEMENT pour ce poste : utilise les mots-clés exacts, adapte le résumé, met en avant les expériences les plus pertinentes.\n`
    : '';
  return `Tu es un expert en rédaction de CV et optimisation ATS (Applicant Tracking Systems).

=== CV EXTRAIT D'UN PDF ===
${cvText}

Nombre de pages : ${numPages}
${posteSection}

=== MISSION ===
1. EXTRAIRE les informations du CV PDF
2. OPTIMISER le contenu pour passer les ATS et convaincre les recruteurs
Le CV final doit être CONCIS, PERCUTANT et tenir sur UNE PAGE A4.

=== OBJECTIF 1 PAGE ===
C'est la contrainte principale. Mieux vaut un CV court et percutant qu'un CV long et dilué.
Si tu dois choisir, privilégie la QUALITÉ sur la QUANTITÉ.

=== RÈGLES ATS ===

1. MOTS-CLÉS : intégrer les termes exacts du secteur, répéter les compétences clés dans le titre, résumé et expériences

2. FORMAT : sections standards (Profil, Expérience, Compétences, Formation), chronologie inversée

3. VERBES D'ACTION : chaque bullet commence par un verbe fort (Développé, Piloté, Optimisé, Conçu, Géré, Augmenté, Créé, Dirigé, Coordonné, Amélioré, Réduit)

4. CHIFFRES : ajouter des résultats mesurables (%, €, nombres, durées)

5. RÉSUMÉ PROFESSIONNEL — 2-3 PHRASES MAX (50-80 mots)
   - Phrase 1 : Titre + années d'expérience
   - Phrase 2 : 2-3 compétences phares
   - Phrase 3 (optionnelle) : réalisation clé chiffrée

6. EXPÉRIENCES — CONDENSÉES
   - MAX 3 postes (les plus récents et pertinents)
   - 3-4 bullets par poste (jamais plus de 5)
   - Chaque bullet : 60-150 caractères, format "Verbe + Tâche + Résultat chiffré"

7. COMPÉTENCES TECHNIQUES — 8-15 COMPÉTENCES PERTINENTES
   - Pas de liste exhaustive, uniquement les plus importantes
   - Format : à virgules

8. QUALIFICATIONS CLÉS — 5-7 PHRASES
   - Chaque qualification = phrase de 12-18 mots
   - Séparées par des retours à la ligne
   - Tu peux déduire/enrichir à partir du parcours

9. FORMATIONS : diplôme + établissement + année uniquement
10. LANGUES : format court à virgules

=== RÈGLES STRICTES ===
- EXTRAIRE toutes les informations disponibles dans le PDF
- NE PAS modifier les noms d'entreprises, dates, diplômes
- Tu PEUX enrichir et déduire des qualifications à partir du parcours
- Rester cohérent avec le parcours du candidat

=== FORMAT DE RÉPONSE ===
Commence par :
SCORE ATS: [nombre entre 0 et 100]
POINTS FORTS: [liste de 3 à 5 points, un par ligne avec "• "]
AMÉLIORATIONS: [liste de 3 à 5 changements, un par ligne avec "• "]

Puis extrais et optimise le CV complet.`;
}

module.exports = { buildPrompt };
