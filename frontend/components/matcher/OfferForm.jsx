'use client';

/**
 * Formulaire de saisie d'une offre d'emploi
 * Utilisé dans le Matcher d'Offres
 */
export default function OfferForm({ offerData, setOfferData }) {
  const handleChange = (e) => {
    const { name, value } = e.target;
    setOfferData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <div className="text-4xl">📋</div>
        <div>
          <h2 className="text-2xl font-bold text-white">Détails de l'offre</h2>
          <p className="text-gray-400 text-sm">Copiez-collez l'offre d'emploi qui vous intéresse</p>
        </div>
      </div>

      {/* Formulaire */}
      <div className="space-y-4">
        {/* Titre du poste */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Titre du poste <span className="text-pink-500">*</span>
          </label>
          <input
            type="text"
            name="title"
            value={offerData.title}
            onChange={handleChange}
            placeholder="Ex: Développeur Full Stack"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-colors"
            required
          />
        </div>

        {/* Entreprise */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Entreprise <span className="text-pink-500">*</span>
          </label>
          <input
            type="text"
            name="company"
            value={offerData.company}
            onChange={handleChange}
            placeholder="Ex: TechCorp SAS"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-colors"
            required
          />
        </div>

        {/* Localisation & Type de contrat */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Localisation <span className="text-pink-500">*</span>
            </label>
            <input
              type="text"
              name="location"
              value={offerData.location}
              onChange={handleChange}
              placeholder="Ex: Paris, France"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Type de contrat <span className="text-pink-500">*</span>
            </label>
            <select
              name="contract_type"
              value={offerData.contract_type}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-colors"
              required
            >
              <option value="">Sélectionner...</option>
              <option value="CDI">CDI</option>
              <option value="CDD">CDD</option>
              <option value="Freelance">Freelance</option>
              <option value="Stage">Stage</option>
              <option value="Alternance">Alternance</option>
            </select>
          </div>
        </div>

        {/* Salaire (optionnel) */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Salaire <span className="text-gray-500 text-xs">(optionnel)</span>
          </label>
          <input
            type="text"
            name="salary"
            value={offerData.salary}
            onChange={handleChange}
            placeholder="Ex: 45-55k€ annuel"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-colors"
          />
        </div>

        {/* Description complète */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Description complète de l'offre <span className="text-pink-500">*</span>
          </label>
          <textarea
            name="description"
            value={offerData.description}
            onChange={handleChange}
            placeholder="Collez ici la description complète de l'offre d'emploi (missions, profil recherché, compétences requises, avantages...)"
            rows={12}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-colors resize-y"
            required
          />
          <p className="text-xs text-gray-500 mt-2">
            💡 Plus la description est détaillée, meilleur sera le matching
          </p>
        </div>
      </div>
    </div>
  );
}
