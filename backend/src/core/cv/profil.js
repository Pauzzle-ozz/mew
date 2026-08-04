const { extraireContact } = require('./extraireContact');
const { decouperSections } = require('./decouperSections');
const { extraireCompetences } = require('./extraireCompetences');
const { decouperExperiences, anneesExperience } = require('./experience');
const { enLignes } = require('./texte');

/**
 * Assemble tous les modules du parseur en un profil unique.
 *
 * Ce que ce fichier N'EST PAS : un remplacant du modele de langage. Il ne
 * comprend pas le metier du candidat, il ne resume pas, il ne juge pas. Il
 * fait le travail mecanique — trouver le mail, compter les mois, separer les
 * blocs — pour que le modele, s'il est appele ensuite, recoive une matiere
 * propre au lieu de 6 000 tokens de texte brut. Et quand la structure est
 * douteuse, il le dit via `confiance` au lieu de faire semblant.
 */

/** Longueur plausible d'un intitule de poste ecrit sous le nom, en en-tete. */
const LONGUEUR_MAX_TITRE_ENTETE = 70;

/**
 * Cherche l'intitule de poste dans l'en-tete, quand aucune experience n'a pu
 * etre isolee. On saute la premiere ligne (le nom du candidat) et tout ce qui
 * ressemble a des coordonnees.
 */
function titreDepuisEntete(entete) {
  const lignes = enLignes(entete).map((l) => l.trim()).filter(Boolean);
  for (let i = 1; i < Math.min(lignes.length, 5); i += 1) {
    const ligne = lignes[i];
    if (ligne.length < 3 || ligne.length > LONGUEUR_MAX_TITRE_ENTETE) continue;
    if (/@|https?:\/\/|linkedin|github/i.test(ligne)) continue;
    if (/\d{4}/.test(ligne)) continue;           // une annee : ce n'est pas un titre
    if ((ligne.match(/\d/g) || []).length >= 4) continue; // telephone, code postal
    return ligne;
  }
  return '';
}

/** L'experience la plus recente : celle qui est en cours, sinon la plus tardive. */
function experiencePrincipale(experiences) {
  let meilleure = null;
  for (const experience of experiences) {
    if (!experience || !experience.intitule) continue;
    if (!meilleure) { meilleure = experience; continue; }
    const enCours = experience.periode && experience.periode.fin === null;
    const meilleureEnCours = meilleure.periode && meilleure.periode.fin === null;
    if (enCours && !meilleureEnCours) { meilleure = experience; continue; }
    if (enCours === meilleureEnCours) {
      const debut = experience.periode ? experience.periode.debut : '';
      const debutMeilleure = meilleure.periode ? meilleure.periode.debut : '';
      if (debut > debutMeilleure) meilleure = experience;
    }
  }
  return meilleure;
}

function construireProfil(texteCv, dateReference) {
  const texte = typeof texteCv === 'string' ? texteCv : '';
  const sections = decouperSections(texte);
  const contact = extraireContact(texte);

  // Si aucune section « experiences » n'a ete reperee, on retente sur le CV
  // entier : mieux vaut un decoupage approximatif, signale comme peu fiable,
  // qu'une liste vide qui laisserait croire que le candidat n'a rien fait.
  const sourceExperiences = sections.experiences || texte;
  const experiences = decouperExperiences(sourceExperiences);

  const formations = decouperExperiences(sections.formations).map((bloc) => ({
    intitule: bloc.intitule,
    etablissement: bloc.entreprise,
    periode: bloc.periode,
    description: bloc.description
  }));

  const competences = extraireCompetences(sections.competences);
  // Les langues se decoupent exactement comme les competences
  // (« Anglais courant, Espagnol notions »).
  const langues = extraireCompetences(sections.langues);

  const principale = experiencePrincipale(experiences);
  const intitulePrincipal = (principale && principale.intitule) || titreDepuisEntete(sections.entete) || '';

  // On repart de la confiance du decoupage et on l'abaisse si le contenu
  // extrait est manifestement pauvre : une structure lisible ne sert a rien
  // si elle ne contient rien.
  const raisons = sections.confiance.raisons.slice();
  let niveau = sections.confiance.niveau;

  if (experiences.length === 0) {
    raisons.push('aucune experience n\'a pu etre isolee');
    niveau = niveau === 'haute' ? 'moyenne' : niveau;
  }
  if (competences.length === 0) {
    raisons.push('aucune competence listee (section absente ou vide)');
    niveau = niveau === 'haute' ? 'moyenne' : niveau;
  }
  if (!contact.email && !contact.telephone) {
    raisons.push('ni email ni telephone trouves : le texte extrait du PDF est probablement incomplet');
    niveau = 'faible';
  }

  return {
    contact,
    resume: sections.resume,
    experiences,
    formations,
    competences,
    langues,
    anneesExperience: anneesExperience(experiences, dateReference),
    intitulePrincipal,
    confiance: {
      niveau,
      sectionsTrouvees: sections.confiance.sectionsTrouvees,
      lignesHorsSection: sections.confiance.lignesHorsSection,
      raisons
    }
  };
}

module.exports = { construireProfil };
