/**
 * Prompt candidature spontanee - generation email
 * Etape 1 : generation texte creatif (gpt-4o, temperature 0.7)
 */
function buildPrompt({ cvText, targetPosition, company, contactName }) {
  const greeting = contactName
    ? `Madame/Monsieur ${contactName},`
    : 'Madame, Monsieur,';

  const companyLine = company
    ? `L'entreprise ciblee est : ${company}`
    : "L'entreprise n'a pas ete precisee.";

  return `Tu es un expert en recrutement et en strategie de candidature spontanee.
Tu maitrises l'art de rediger des emails d'approche percutants qui obtiennent des reponses.

## Contexte

${companyLine}
Poste vise : ${targetPosition}
Destinataire : ${greeting}

## CV du candidat (texte extrait)

${cvText}

## Ta mission

Redige un email de candidature spontanee court, percutant et memorable.

Regles absolues :
- Longueur : 120 a 180 mots MAXIMUM (surtout pas plus)
- Commence TOUJOURS par "${greeting}"
- Introduction : accroche forte, cite l'entreprise si connue, le poste vise
- Corps : 2 elements cles du profil qui apportent de la valeur a l'entreprise (sois concret, chiffres si presents dans le CV)
- Conclusion : appel a l'action clair et confiant ("je suis disponible pour un echange")
- Termine par "Cordialement," suivi d'une ligne vide puis du prenom et nom extraits du CV
- Ton : professionnel mais humain, pas corporate-robotique
- Ne mentionne PAS "en annexe" ou "piece jointe" dans le corps de l'email
- Ne jamais inventer des informations absentes du CV

Structure ta reponse exactement ainsi :
SUBJECT: [objet de l'email en 6-10 mots]
---
[corps de l'email]`;
}

module.exports = { buildPrompt };
