'use client';

import { useId } from 'react';
import PdfDropzone from '@/components/shared/PdfDropzone';

/**
 * Profil du candidat : soit rempli a la main, soit importe depuis un CV PDF.
 *
 * TROIS CORRECTIONS FAITES ICI
 *
 * 1) LE REFUS SILENCIEUX DU PDF. Le composant faisait, en une ligne :
 *      if (file.size > 2 * 1024 * 1024) return;
 *    Aucun message. On choisissait son CV, il ne se passait rien, et rien a
 *    l'ecran ne disait pourquoi. La zone de depot partagee (PdfDropzone)
 *    affiche desormais la raison exacte du refus, et sa limite (5 Mo)
 *    correspond enfin a celle du backend — qui, lui, acceptait ces fichiers.
 *
 * 2) LE THEME CLAIR. Environ 147 classes codaient des couleurs en dur pour un
 *    fond sombre (bg-gray-900, text-white, border-gray-700...). En theme
 *    clair, ce formulaire restait un bloc noir au milieu d'une page creme, et
 *    par endroits du texte blanc devenait illisible. Tout passe maintenant par
 *    les variables du theme.
 *
 * 3) LES ETIQUETTES ORPHELINES. Aucun <label> n'etait relie a son champ : un
 *    lecteur d'ecran annoncait « zone de saisie » sans jamais dire laquelle,
 *    sur les vingt champs. htmlFor + id relient chaque paire.
 *    Au passage, un `focus:ring-1 focus:ring-1` duplique dans la classe du
 *    telephone a disparu avec la mise en commun des styles de champ.
 */
export default function CandidateProfileForm({
  candidateData,
  setCandidateData,
  profileMode,
  setProfileMode,
  formCvFile,
  setFormCvFile,
}) {
  const prefixe = `profil-${useId()}`;

  const surChangement = (evenement) => {
    const { name, value } = evenement.target;
    setCandidateData((precedent) => ({ ...precedent, [name]: value }));
  };

  /* ── Experiences ── */
  const ajouterExperience = () => {
    setCandidateData((precedent) => ({
      ...precedent,
      experiences: [
        ...precedent.experiences,
        { poste: '', entreprise: '', localisation: '', date_debut: '', date_fin: '', description: '' },
      ],
    }));
  };

  const modifierExperience = (index, champ, valeur) => {
    setCandidateData((precedent) => ({
      ...precedent,
      experiences: precedent.experiences.map((experience, i) =>
        i === index ? { ...experience, [champ]: valeur } : experience
      ),
    }));
  };

  const retirerExperience = (index) => {
    setCandidateData((precedent) => ({
      ...precedent,
      experiences: precedent.experiences.filter((_, i) => i !== index),
    }));
  };

  /* ── Formations ── */
  const ajouterFormation = () => {
    setCandidateData((precedent) => ({
      ...precedent,
      formations: [...precedent.formations, { diplome: '', etablissement: '', localisation: '', date_fin: '' }],
    }));
  };

  const modifierFormation = (index, champ, valeur) => {
    setCandidateData((precedent) => ({
      ...precedent,
      formations: precedent.formations.map((formation, i) =>
        i === index ? { ...formation, [champ]: valeur } : formation
      ),
    }));
  };

  const retirerFormation = (index) => {
    setCandidateData((precedent) => ({
      ...precedent,
      formations: precedent.formations.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-4xl" aria-hidden="true">
          👤
        </span>
        <div>
          <h2 className="font-display text-2xl font-bold text-text-primary">Ton profil</h2>
          <p className="text-sm text-text-secondary">Plus il est complet, plus le score de correspondance est juste</p>
        </div>
      </div>

      {/* Choix du mode. role="group" + aria-pressed : ces deux boutons se
          comportent comme un interrupteur a deux positions, il faut le dire. */}
      <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Mode de saisie du profil">
        <BoutonMode actif={profileMode === 'form'} onClick={() => setProfileMode('form')}>
          Remplir manuellement
        </BoutonMode>
        <BoutonMode actif={profileMode === 'pdf'} onClick={() => setProfileMode('pdf')}>
          Importer mon CV PDF
        </BoutonMode>
      </div>

      {/* ── Mode PDF ────────────────────────────────────────────── */}
      {profileMode === 'pdf' && (
        <div className="space-y-4 rounded-lg bg-surface-elevated/60 p-6">
          <p className="text-sm text-text-secondary">
            L&apos;IA extrait ton profil du PDF et l&apos;adapte a l&apos;offre. Aucun formulaire a remplir.
          </p>

          <PdfDropzone
            fichier={formCvFile}
            onFichier={setFormCvFile}
            tailleMaxMo={5}
            label="Depose ton CV"
            description="PDF, 5 Mo max"
          />
        </div>
      )}

      {/* ── Mode formulaire ─────────────────────────────────────── */}
      {profileMode === 'form' && (
        <>
          <Bloc titre="Informations personnelles">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Champ
                id={`${prefixe}-prenom`}
                nom="prenom"
                libelle="Prenom"
                obligatoire
                valeur={candidateData.prenom}
                onChange={surChangement}
                placeholder="Ex : Camille"
              />
              <Champ
                id={`${prefixe}-nom`}
                nom="nom"
                libelle="Nom"
                obligatoire
                valeur={candidateData.nom}
                onChange={surChangement}
                placeholder="Ex : Martin"
              />
            </div>

            <Champ
              id={`${prefixe}-titre`}
              nom="titre_poste"
              libelle="Titre de poste actuel"
              obligatoire
              valeur={candidateData.titre_poste}
              onChange={surChangement}
              placeholder="Ex : Aide-soignante, Developpeur Full Stack, Chef de chantier..."
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Champ
                id={`${prefixe}-email`}
                nom="email"
                type="email"
                libelle="Email"
                obligatoire
                valeur={candidateData.email}
                onChange={surChangement}
                placeholder="camille.martin@example.com"
              />
              <Champ
                id={`${prefixe}-telephone`}
                nom="telephone"
                type="tel"
                libelle="Telephone"
                obligatoire
                valeur={candidateData.telephone}
                onChange={surChangement}
                placeholder="06 12 34 56 78"
              />
            </div>

            <Champ
              id={`${prefixe}-adresse`}
              nom="adresse"
              libelle="Adresse"
              valeur={candidateData.adresse}
              onChange={surChangement}
              placeholder="Paris, France"
            />

            <Champ
              id={`${prefixe}-linkedin`}
              nom="linkedin"
              type="url"
              libelle="LinkedIn"
              valeur={candidateData.linkedin}
              onChange={surChangement}
              placeholder="linkedin.com/in/camillemartin"
            />
          </Bloc>

          {/* ── Experiences ── */}
          <Bloc
            titre="Experiences professionnelles"
            action={<BoutonAjouter onClick={ajouterExperience} libelle="Ajouter une experience" />}
          >
            {candidateData.experiences.map((experience, index) => (
              <CarteRepetable
                key={index}
                titre={`Experience ${index + 1}`}
                onSupprimer={() => retirerExperience(index)}
                libelleSuppression={`Supprimer l'experience ${index + 1}`}
              >
                <Champ
                  id={`${prefixe}-exp-${index}-poste`}
                  libelle="Poste"
                  valeur={experience.poste}
                  onChange={(evenement) => modifierExperience(index, 'poste', evenement.target.value)}
                  placeholder="Ex : Developpeur Full Stack"
                />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Champ
                    id={`${prefixe}-exp-${index}-entreprise`}
                    libelle="Entreprise"
                    valeur={experience.entreprise}
                    onChange={(evenement) => modifierExperience(index, 'entreprise', evenement.target.value)}
                    placeholder="Ex : TechCorp"
                  />
                  <Champ
                    id={`${prefixe}-exp-${index}-lieu`}
                    libelle="Localisation"
                    valeur={experience.localisation}
                    onChange={(evenement) => modifierExperience(index, 'localisation', evenement.target.value)}
                    placeholder="Ex : Paris"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Champ
                    id={`${prefixe}-exp-${index}-debut`}
                    libelle="Date de debut"
                    valeur={experience.date_debut}
                    onChange={(evenement) => modifierExperience(index, 'date_debut', evenement.target.value)}
                    placeholder="Ex : 03/2021"
                  />
                  <Champ
                    id={`${prefixe}-exp-${index}-fin`}
                    libelle="Date de fin"
                    valeur={experience.date_fin}
                    onChange={(evenement) => modifierExperience(index, 'date_fin', evenement.target.value)}
                    placeholder="Ex : Aujourd'hui"
                  />
                </div>

                <ChampLong
                  id={`${prefixe}-exp-${index}-description`}
                  libelle="Description"
                  valeur={experience.description}
                  onChange={(evenement) => modifierExperience(index, 'description', evenement.target.value)}
                  placeholder="Decris tes missions et tes realisations..."
                  lignes={3}
                />
              </CarteRepetable>
            ))}

            {candidateData.experiences.length === 0 && (
              <p className="py-4 text-center text-sm text-text-muted">
                Aucune experience ajoutee. Clique sur « Ajouter » pour commencer.
              </p>
            )}
          </Bloc>

          {/* ── Formations ── */}
          <Bloc titre="Formations" action={<BoutonAjouter onClick={ajouterFormation} libelle="Ajouter une formation" />}>
            {candidateData.formations.map((formation, index) => (
              <CarteRepetable
                key={index}
                titre={`Formation ${index + 1}`}
                onSupprimer={() => retirerFormation(index)}
                libelleSuppression={`Supprimer la formation ${index + 1}`}
              >
                <Champ
                  id={`${prefixe}-form-${index}-diplome`}
                  libelle="Diplome"
                  valeur={formation.diplome}
                  onChange={(evenement) => modifierFormation(index, 'diplome', evenement.target.value)}
                  placeholder="Ex : Master Informatique, CAP Petite enfance..."
                />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Champ
                    id={`${prefixe}-form-${index}-etablissement`}
                    libelle="Etablissement"
                    valeur={formation.etablissement}
                    onChange={(evenement) => modifierFormation(index, 'etablissement', evenement.target.value)}
                    placeholder="Ex : Universite Paris"
                  />
                  <Champ
                    id={`${prefixe}-form-${index}-lieu`}
                    libelle="Localisation"
                    valeur={formation.localisation}
                    onChange={(evenement) => modifierFormation(index, 'localisation', evenement.target.value)}
                    placeholder="Ex : Paris"
                  />
                </div>

                <Champ
                  id={`${prefixe}-form-${index}-annee`}
                  libelle="Annee d'obtention"
                  valeur={formation.date_fin}
                  onChange={(evenement) => modifierFormation(index, 'date_fin', evenement.target.value)}
                  placeholder="Ex : 2021"
                />
              </CarteRepetable>
            ))}

            {candidateData.formations.length === 0 && (
              <p className="py-4 text-center text-sm text-text-muted">
                Aucune formation ajoutee. Clique sur « Ajouter » pour commencer.
              </p>
            )}
          </Bloc>

          {/* ── Competences ── */}
          <Bloc titre="Competences">
            <ChampLong
              id={`${prefixe}-competences`}
              nom="competences_techniques"
              libelle="Competences metier"
              obligatoire
              valeur={candidateData.competences_techniques}
              onChange={surChangement}
              placeholder="Ex : React, Node.js, PostgreSQL — ou : aide a la toilette, pose de placo, plan de tournee..."
              lignes={3}
              aide="Ecris-les avec les mots que ton metier utilise vraiment : ce sont ces mots que le score cherche dans l'offre."
            />

            <ChampLong
              id={`${prefixe}-soft`}
              nom="competences_soft"
              libelle="Qualites personnelles"
              valeur={candidateData.competences_soft}
              onChange={surChangement}
              placeholder="Ex : travail d'equipe, sang-froid, sens du contact..."
              lignes={2}
            />

            <Champ
              id={`${prefixe}-langues`}
              nom="langues"
              libelle="Langues"
              valeur={candidateData.langues}
              onChange={surChangement}
              placeholder="Ex : Francais (natif), Anglais (courant)"
            />
          </Bloc>
        </>
      )}
    </div>
  );
}

/* ── Briques communes ──────────────────────────────────────────────── */

// Une seule definition de l'apparence des champs. Elle etait recopiee vingt
// fois, avec des variantes involontaires — dont le `focus:ring-1 focus:ring-1`
// duplique sur le telephone.
const CLASSES_CHAMP =
  'w-full rounded-lg border border-border bg-surface px-4 py-3 text-text-primary placeholder-text-muted transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

function Etiquette({ htmlFor, obligatoire = false, children }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-text-secondary">
      {children}
      {/* L'asterisque seule ne veut rien dire pour un lecteur d'ecran :
          on lui ajoute le mot, reserve a lui. */}
      {obligatoire && (
        <>
          {' '}
          <span className="text-primary" aria-hidden="true">
            *
          </span>
          <span className="sr-only">(obligatoire)</span>
        </>
      )}
    </label>
  );
}

function Champ({ id, nom, libelle, valeur, onChange, placeholder, obligatoire = false, type = 'text' }) {
  return (
    <div>
      <Etiquette htmlFor={id} obligatoire={obligatoire}>
        {libelle}
      </Etiquette>
      <input
        id={id}
        type={type}
        name={nom}
        value={valeur}
        onChange={onChange}
        placeholder={placeholder}
        className={CLASSES_CHAMP}
        required={obligatoire}
      />
    </div>
  );
}

function ChampLong({ id, nom, libelle, valeur, onChange, placeholder, lignes = 3, obligatoire = false, aide }) {
  const idAide = aide ? `${id}-aide` : undefined;

  return (
    <div>
      <Etiquette htmlFor={id} obligatoire={obligatoire}>
        {libelle}
      </Etiquette>
      <textarea
        id={id}
        name={nom}
        value={valeur}
        onChange={onChange}
        placeholder={placeholder}
        rows={lignes}
        aria-describedby={idAide}
        className={`${CLASSES_CHAMP} resize-y`}
        required={obligatoire}
      />
      {aide && (
        <p id={idAide} className="mt-2 text-xs text-text-muted">
          {aide}
        </p>
      )}
    </div>
  );
}

function Bloc({ titre, action, children }) {
  return (
    <section className="space-y-4 rounded-lg bg-surface-elevated/60 p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold text-text-primary">{titre}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function BoutonMode({ actif, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`flex-1 cursor-pointer py-3 text-sm font-medium transition-colors ${
        actif ? 'bg-primary text-primary-foreground' : 'bg-surface text-text-muted hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

function BoutonAjouter({ onClick, libelle }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={libelle}
      className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
    >
      + Ajouter
    </button>
  );
}

/**
 * Une experience ou une formation : meme carte, meme bouton de suppression.
 * Ce bouton n'affichait qu'un « x » : aria-label dit enfin CE QU'IL supprime,
 * sinon un lecteur d'ecran annonce dix fois de suite « bouton x ».
 */
function CarteRepetable({ titre, onSupprimer, libelleSuppression, children }) {
  return (
    <div className="relative space-y-3 rounded-lg border border-border/60 bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{titre}</span>
        <button
          type="button"
          onClick={onSupprimer}
          aria-label={libelleSuppression}
          title={libelleSuppression}
          className="cursor-pointer rounded-full px-2 text-xl leading-none text-error transition-opacity hover:opacity-70"
        >
          &times;
        </button>
      </div>
      {children}
    </div>
  );
}
