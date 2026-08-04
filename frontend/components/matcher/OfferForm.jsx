'use client';

import { useId } from 'react';

/**
 * Saisie manuelle d'une offre d'emploi.
 *
 * DEUX CORRECTIONS FAITES ICI
 * 1) Les couleurs etaient ecrites en dur pour un fond sombre (bg-gray-800,
 *    text-white...). En theme clair, du texte blanc atterrissait sur le fond
 *    creme : illisible. Tout passe desormais par les variables du theme.
 * 2) Aucun <label> n'etait relie a son champ. Un lecteur d'ecran annoncait
 *    donc « zone de saisie » sans jamais dire laquelle. htmlFor + id reglent
 *    le probleme, et un clic sur l'etiquette place maintenant le curseur dans
 *    le champ (ce qui aide tout le monde, pas seulement les lecteurs d'ecran).
 */
export default function OfferForm({ offerData, setOfferData }) {
  // Un prefixe unique par instance : deux formulaires dans la meme page ne
  // peuvent pas se voler leurs identifiants.
  const prefixe = `offre-${useId()}`;

  const surChangement = (evenement) => {
    const { name, value } = evenement.target;
    setOfferData((precedent) => ({ ...precedent, [name]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-4xl" aria-hidden="true">
          📋
        </span>
        <div>
          <h2 className="font-display text-2xl font-bold text-text-primary">Details de l&apos;offre</h2>
          <p className="text-sm text-text-secondary">Copie-colle l&apos;offre d&apos;emploi qui t&apos;interesse</p>
        </div>
      </div>

      <div className="space-y-4">
        <Champ
          id={`${prefixe}-title`}
          nom="title"
          libelle="Titre du poste"
          obligatoire
          valeur={offerData.title}
          onChange={surChangement}
          placeholder="Ex : Developpeur Full Stack"
        />

        <Champ
          id={`${prefixe}-company`}
          nom="company"
          libelle="Entreprise"
          obligatoire
          valeur={offerData.company}
          onChange={surChangement}
          placeholder="Ex : TechCorp SAS"
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Champ
            id={`${prefixe}-location`}
            nom="location"
            libelle="Localisation"
            obligatoire
            valeur={offerData.location}
            onChange={surChangement}
            placeholder="Ex : Paris, France"
          />

          <div>
            <Etiquette htmlFor={`${prefixe}-contract`} obligatoire>
              Type de contrat
            </Etiquette>
            <select
              id={`${prefixe}-contract`}
              name="contract_type"
              value={offerData.contract_type}
              onChange={surChangement}
              className={CLASSES_CHAMP}
              required
            >
              <option value="">Selectionner...</option>
              <option value="CDI">CDI</option>
              <option value="CDD">CDD</option>
              <option value="Freelance">Freelance</option>
              <option value="Stage">Stage</option>
              <option value="Alternance">Alternance</option>
            </select>
          </div>
        </div>

        <Champ
          id={`${prefixe}-salary`}
          nom="salary"
          libelle="Salaire"
          mention="(optionnel)"
          valeur={offerData.salary}
          onChange={surChangement}
          placeholder="Ex : 45-55k euros annuel"
        />

        <div>
          <Etiquette htmlFor={`${prefixe}-description`} obligatoire>
            Description complete de l&apos;offre
          </Etiquette>
          <textarea
            id={`${prefixe}-description`}
            name="description"
            value={offerData.description}
            onChange={surChangement}
            placeholder="Colle ici la description complete de l'offre (missions, profil recherche, competences requises, avantages...)"
            rows={12}
            aria-describedby={`${prefixe}-description-aide`}
            className={`${CLASSES_CHAMP} resize-y`}
            required
          />
          <p id={`${prefixe}-description-aide`} className="mt-2 text-xs text-text-muted">
            Plus la description est detaillee, plus le score de correspondance est fiable : il se calcule sur les
            mots de l&apos;offre.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Briques communes ──────────────────────────────────────────────── */

// Une seule definition de l'apparence des champs. Avant, ces classes etaient
// recopiees a l'identique sept fois : la moindre correction en oubliait une.
const CLASSES_CHAMP =
  'w-full rounded-lg border border-border bg-surface px-4 py-3 text-text-primary placeholder-text-muted transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

function Etiquette({ htmlFor, obligatoire = false, mention, children }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-text-secondary">
      {children}
      {/* L'asterisque seule ne dit rien a un lecteur d'ecran : on lui ajoute
          le mot « obligatoire », visible uniquement pour lui. */}
      {obligatoire && (
        <>
          {' '}
          <span className="text-primary" aria-hidden="true">
            *
          </span>
          <span className="sr-only">(obligatoire)</span>
        </>
      )}
      {mention && <span className="ml-1 text-xs text-text-muted">{mention}</span>}
    </label>
  );
}

function Champ({ id, nom, libelle, valeur, onChange, placeholder, obligatoire = false, mention, type = 'text' }) {
  return (
    <div>
      <Etiquette htmlFor={id} obligatoire={obligatoire} mention={mention}>
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
