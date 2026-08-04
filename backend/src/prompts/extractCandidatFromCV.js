/**
 * Prompt extraction du profil candidat depuis un CV en texte brut
 * Utilisé dans le mode "Rapide" du matcher (PDF + URL)
 */
function buildPrompt(cvText) {
  return `Tu es un expert RH. On te donne le texte brut d'un CV (extrait d'un fichier PDF).

Ta mission : extraire les informations du candidat et les structurer en JSON.

Règles importantes :
- Extrait exactement ce qui est écrit dans le CV, ne modifie rien
- Si une information n'est pas présente, retourne une chaîne vide "" ou un tableau vide []
- Pour les expériences et formations, sois le plus précis possible
- Le format de sortie doit être un objet JSON valide

**TEXTE BRUT DU CV :**

${cvText}

---

Génère un objet JSON avec exactement cette structure :
{
  "prenom": "prénom du candidat",
  "nom": "nom de famille du candidat",
  "titre_poste": "titre ou poste actuel/recherché",
  "email": "adresse email",
  "telephone": "numéro de téléphone",
  "adresse": "ville ou adresse",
  "linkedin": "URL LinkedIn ou identifiant",
  "resume": "résumé professionnel ou accroche du CV",
  "experiences": [
    {
      "titre": "intitulé du poste",
      "entreprise": "nom de l'entreprise",
      "dates": "période (ex: Jan 2022 - Mars 2024)",
      "description": "missions et responsabilités"
    }
  ],
  "formations": [
    {
      "diplome": "nom du diplôme ou formation",
      "etablissement": "nom de l'école/université",
      "dates": "période ou année d'obtention"
    }
  ],
  "competences_techniques": "liste des compétences techniques séparées par des virgules",
  "competences_soft": "liste des soft skills séparées par des virgules",
  "langues": "langues parlées avec niveau (ex: Français natif, Anglais B2)"
}`;
}

module.exports = { buildPrompt };
