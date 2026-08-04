/**
 * Fonctions de formatage partagees entre les prompts
 */

/**
 * Formate les donnees d'une offre en texte structure
 */
function formatOfferText(offer) {
  let text = `**OFFRE D'EMPLOI**\n\n`;
  text += `Poste : ${offer.title}\n`;
  text += `Entreprise : ${offer.company}\n`;
  if (offer.location) text += `Localisation : ${offer.location}\n`;
  if (offer.contract_type) text += `Type de contrat : ${offer.contract_type}\n`;
  if (offer.salary) text += `Salaire : ${offer.salary}\n`;
  text += `\nDescription complète :\n${offer.description}`;
  return text;
}

/**
 * Formate les donnees d'un candidat en texte structure
 */
function formatCandidateText(candidate) {
  let text = `**PROFIL CANDIDAT**\n\n`;
  text += `Identité :\n`;
  text += `Prénom : ${candidate.prenom}\n`;
  text += `Nom : ${candidate.nom}\n`;
  text += `Titre de poste : ${candidate.titre_poste}\n`;
  if (candidate.email) text += `Email : ${candidate.email}\n`;
  if (candidate.telephone) text += `Téléphone : ${candidate.telephone}\n`;
  if (candidate.adresse) text += `Adresse : ${candidate.adresse}\n`;
  if (candidate.linkedin) text += `LinkedIn : ${candidate.linkedin}\n`;

  if (candidate.experiences && candidate.experiences.length > 0) {
    text += `\nExpériences professionnelles :\n${JSON.stringify(candidate.experiences, null, 2)}\n`;
  }

  if (candidate.formations && candidate.formations.length > 0) {
    text += `\nFormations :\n${JSON.stringify(candidate.formations, null, 2)}\n`;
  }

  if (candidate.competences_techniques) {
    text += `\nCompétences techniques : ${candidate.competences_techniques}\n`;
  }
  if (candidate.competences_soft) {
    text += `Compétences soft : ${candidate.competences_soft}\n`;
  }
  if (candidate.langues) {
    text += `Langues : ${candidate.langues}\n`;
  }

  return text;
}

module.exports = { formatOfferText, formatCandidateText };
