import CatLoadingAnimation from '@/components/shared/CatLoadingAnimation'

/**
 * Saisie manuelle du profil, pour qui n'a pas (ou ne veut pas deposer) de CV PDF.
 *
 * POURQUOI CHAQUE CHAMP A MAINTENANT UNE ETIQUETTE
 * Les onze champs n'etaient identifies que par leur `placeholder`. Un
 * placeholder n'est PAS une etiquette, pour deux raisons concretes :
 *   1) il disparait des la premiere lettre tapee — on ne sait plus ce qu'on
 *      est en train de remplir, et on ne peut plus le verifier avant d'envoyer ;
 *   2) plusieurs lecteurs d'ecran ne l'annoncent pas du tout : le champ etait
 *      lu « champ de saisie », onze fois de suite, sans jamais dire lequel.
 * Chaque champ porte donc un `id`, relie a un <label htmlFor>. Le placeholder
 * ne sert plus qu'a montrer un exemple.
 */

const styleChamp =
  'w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors'

/**
 * Etiquette + champ.
 * Le composant ne rend que l'etiquette : le champ lui-meme est passe en
 * children, pour garder input / select / textarea ecrits en clair et eviter
 * une couche d'abstraction que personne n'aurait envie de relire.
 */
function Champ({ id, label, requis = false, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-text-primary">
        {label}
        {/* L'etoile est purement visuelle : c'est l'attribut `required` du champ
            qui fait annoncer « obligatoire » par les lecteurs d'ecran. */}
        {requis && <span className="ml-1 text-error" aria-hidden="true">*</span>}
      </label>
      {children}
    </div>
  )
}

/** Bloc de champs : titre relie a son groupe pour les lecteurs d'ecran. */
function Bloc({ id, titre, children }) {
  return (
    <div role="group" aria-labelledby={id} className="bg-surface rounded-xl border border-border p-6">
      <h3 id={id} className="text-lg font-semibold text-text-primary mb-4">
        {titre}
      </h3>
      {children}
    </div>
  )
}

export default function AnalyzerForm({ formData, onChange, onSubmit, processing }) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <p className="text-sm text-text-muted">
        Les champs suivis d&apos;une <span className="text-error font-semibold">*</span> sont obligatoires.
      </p>

      {/* Identite */}
      <Bloc id="bloc-identite" titre="Identite">
        <div className="grid md:grid-cols-2 gap-4">
          <Champ id="prenom" label="Prenom" requis>
            <input
              id="prenom"
              type="text"
              name="prenom"
              autoComplete="given-name"
              placeholder="Ex : Camille"
              value={formData.prenom}
              onChange={onChange}
              required
              className={styleChamp}
            />
          </Champ>

          <Champ id="nom" label="Nom" requis>
            <input
              id="nom"
              type="text"
              name="nom"
              autoComplete="family-name"
              placeholder="Ex : Dupont"
              value={formData.nom}
              onChange={onChange}
              required
              className={styleChamp}
            />
          </Champ>
        </div>
      </Bloc>

      {/* Experience */}
      <Bloc id="bloc-experience" titre="Experience professionnelle">
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Champ id="niveau_experience" label="Niveau d'experience">
              <select
                id="niveau_experience"
                name="niveau_experience"
                value={formData.niveau_experience}
                onChange={onChange}
                className={styleChamp}
              >
                <option value="Junior">Junior (0-2 ans)</option>
                <option value="Confirme">Confirme (3-5 ans)</option>
                <option value="Senior">Senior (5-10 ans)</option>
                <option value="Expert">Expert (10+ ans)</option>
              </select>
            </Champ>

            <Champ id="annees_experience" label="Nombre d'annees d'experience">
              <input
                id="annees_experience"
                type="number"
                name="annees_experience"
                min="0"
                max="60"
                placeholder="Ex : 4"
                value={formData.annees_experience}
                onChange={onChange}
                className={styleChamp}
              />
            </Champ>
          </div>

          <Champ id="statut" label="Situation actuelle">
            <select
              id="statut"
              name="statut"
              value={formData.statut}
              onChange={onChange}
              className={styleChamp}
            >
              <option value="En recherche active">En recherche active</option>
              <option value="Ouvert aux opportunites">Ouvert aux opportunites</option>
              <option value="En poste">En poste</option>
            </select>
          </Champ>

          <Champ id="experience" label="Parcours professionnel">
            <textarea
              id="experience"
              name="experience"
              rows={4}
              placeholder="Decris tes postes precedents, tes missions, tes resultats..."
              value={formData.experience}
              onChange={onChange}
              className={styleChamp}
            />
          </Champ>
        </div>
      </Bloc>

      {/* Competences */}
      <Bloc id="bloc-competences" titre="Competences">
        <div className="space-y-4">
          <Champ id="competences_principales" label="Competences principales">
            <textarea
              id="competences_principales"
              name="competences_principales"
              rows={3}
              placeholder="Ex : JavaScript, React, Python..."
              value={formData.competences_principales}
              onChange={onChange}
              className={styleChamp}
            />
          </Champ>

          <Champ id="outils" label="Outils et technologies maitrises">
            <textarea
              id="outils"
              name="outils"
              rows={2}
              placeholder="Ex : Figma, Git, Excel, Salesforce..."
              value={formData.outils}
              onChange={onChange}
              className={styleChamp}
            />
          </Champ>

          <Champ id="soft_skills" label="Qualites personnelles (soft skills)">
            <textarea
              id="soft_skills"
              name="soft_skills"
              rows={2}
              placeholder="Ex : Leadership, communication, rigueur..."
              value={formData.soft_skills}
              onChange={onChange}
              className={styleChamp}
            />
          </Champ>
        </div>
      </Bloc>

      {/* Objectifs */}
      <Bloc id="bloc-objectifs" titre="Objectifs">
        <div className="space-y-4">
          <Champ id="secteur_preferentiel" label="Secteur preferentiel">
            <input
              id="secteur_preferentiel"
              type="text"
              name="secteur_preferentiel"
              placeholder="Ex : Tech, Sante, Finance..."
              value={formData.secteur_preferentiel}
              onChange={onChange}
              className={styleChamp}
            />
          </Champ>

          <Champ id="type_poste" label="Type de poste recherche" requis>
            <input
              id="type_poste"
              type="text"
              name="type_poste"
              placeholder="Ex : Developpeur front-end, Chef de projet..."
              value={formData.type_poste}
              onChange={onChange}
              required
              className={styleChamp}
            />
          </Champ>
        </div>
      </Bloc>

      {/* Envoi */}
      {processing ? (
        <div className="flex justify-center py-4">
          <CatLoadingAnimation label="Analyse de votre profil en cours" />
        </div>
      ) : (
        <button
          type="submit"
          className="w-full px-6 py-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover font-bold text-lg transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Analyser mon profil
        </button>
      )}
    </form>
  )
}
