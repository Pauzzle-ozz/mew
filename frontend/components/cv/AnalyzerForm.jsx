import CatLoadingAnimation from '@/components/shared/CatLoadingAnimation'

export default function AnalyzerForm({ formData, onChange, onSubmit, processing }) {
  const inputStyles = "w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors";

  return (
    <form onSubmit={onSubmit} className="space-y-6">

      {/* Identite */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Identite
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          <input
            type="text"
            name="prenom"
            placeholder="Prenom *"
            value={formData.prenom}
            onChange={onChange}
            required
            className={inputStyles}
          />
          <input
            type="text"
            name="nom"
            placeholder="Nom *"
            value={formData.nom}
            onChange={onChange}
            required
            className={inputStyles}
          />
        </div>
      </div>

      {/* Experience */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Experience professionnelle
        </h3>
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <select
              name="niveau_experience"
              value={formData.niveau_experience}
              onChange={onChange}
              className={inputStyles}
            >
              <option value="Junior">Junior (0-2 ans)</option>
              <option value="Confirme">Confirme (3-5 ans)</option>
              <option value="Senior">Senior (5-10 ans)</option>
              <option value="Expert">Expert (10+ ans)</option>
            </select>

            <input
              type="number"
              name="annees_experience"
              placeholder="Annees d'experience"
              value={formData.annees_experience}
              onChange={onChange}
              className={inputStyles}
            />
          </div>

          <select
            name="statut"
            value={formData.statut}
            onChange={onChange}
            className={inputStyles}
          >
            <option value="En recherche active">En recherche active</option>
            <option value="Ouvert aux opportunites">Ouvert aux opportunites</option>
            <option value="En poste">En poste</option>
          </select>

          <textarea
            name="experience"
            rows={4}
            placeholder="Decris ton parcours professionnel..."
            value={formData.experience}
            onChange={onChange}
            className={inputStyles}
          />
        </div>
      </div>

      {/* Competences */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Competences
        </h3>
        <div className="space-y-4">
          <textarea
            name="competences_principales"
            rows={3}
            placeholder="Competences principales (ex: JavaScript, React, Python...)"
            value={formData.competences_principales}
            onChange={onChange}
            className={inputStyles}
          />

          <textarea
            name="outils"
            rows={2}
            placeholder="Outils et technologies maitrises..."
            value={formData.outils}
            onChange={onChange}
            className={inputStyles}
          />

          <textarea
            name="soft_skills"
            rows={2}
            placeholder="Soft skills (ex: Leadership, Communication...)"
            value={formData.soft_skills}
            onChange={onChange}
            className={inputStyles}
          />
        </div>
      </div>

      {/* Objectifs */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Objectifs
        </h3>
        <div className="space-y-4">
          <input
            type="text"
            name="secteur_preferentiel"
            placeholder="Secteur preferentiel (ex: Tech, Sante, Finance...)"
            value={formData.secteur_preferentiel}
            onChange={onChange}
            className={inputStyles}
          />

          <input
            type="text"
            name="type_poste"
            placeholder="Type de poste recherche *"
            value={formData.type_poste}
            onChange={onChange}
            required
            className={inputStyles}
          />
        </div>
      </div>

      {/* Submit button */}
      {processing ? (
        <div className="flex justify-center py-4">
          <CatLoadingAnimation label="Analyse de votre profil en cours" />
        </div>
      ) : (
        <button
          type="submit"
          className="w-full px-6 py-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover font-bold text-lg transition-colors cursor-pointer"
        >
          Analyser mon profil
        </button>
      )}
    </form>
  );
}
