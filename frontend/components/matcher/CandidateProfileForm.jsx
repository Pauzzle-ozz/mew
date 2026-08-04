'use client';

import { useRef } from 'react';

/**
 * Formulaire de profil candidat pour le Matcher d'Offres
 * Deux modes : remplir manuellement (form) ou uploader un CV PDF (pdf)
 */
export default function CandidateProfileForm({
  candidateData,
  setCandidateData,
  profileMode,
  setProfileMode,
  formCvFile,
  setFormCvFile,
}) {
  const fileInputRef = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setCandidateData(prev => ({ ...prev, [name]: value }));
  };

  // Gestion des expériences
  const addExperience = () => {
    setCandidateData(prev => ({
      ...prev,
      experiences: [
        ...prev.experiences,
        { poste: '', entreprise: '', localisation: '', date_debut: '', date_fin: '', description: '' }
      ]
    }));
  };

  const updateExperience = (index, field, value) => {
    setCandidateData(prev => ({
      ...prev,
      experiences: prev.experiences.map((exp, i) =>
        i === index ? { ...exp, [field]: value } : exp
      )
    }));
  };

  const removeExperience = (index) => {
    setCandidateData(prev => ({
      ...prev,
      experiences: prev.experiences.filter((_, i) => i !== index)
    }));
  };

  // Gestion des formations
  const addFormation = () => {
    setCandidateData(prev => ({
      ...prev,
      formations: [
        ...prev.formations,
        { diplome: '', etablissement: '', localisation: '', date_fin: '' }
      ]
    }));
  };

  const updateFormation = (index, field, value) => {
    setCandidateData(prev => ({
      ...prev,
      formations: prev.formations.map((form, i) =>
        i === index ? { ...form, [field]: value } : form
      )
    }));
  };

  const removeFormation = (index) => {
    setCandidateData(prev => ({
      ...prev,
      formations: prev.formations.filter((_, i) => i !== index)
    }));
  };

  // Gestion upload PDF
  const handleFileSelect = (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') return;
    if (file.size > 2 * 1024 * 1024) return;
    setFormCvFile(file);
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <div className="text-4xl">👤</div>
        <div>
          <h2 className="text-2xl font-bold text-white">Votre profil</h2>
          <p className="text-gray-400 text-sm">Complétez vos informations pour un matching optimal</p>
        </div>
      </div>

      {/* Toggle mode */}
      <div className="flex rounded-lg overflow-hidden border border-gray-700">
        <button
          type="button"
          onClick={() => setProfileMode('form')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            profileMode === 'form'
              ? 'bg-pink-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          Remplir manuellement
        </button>
        <button
          type="button"
          onClick={() => setProfileMode('pdf')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            profileMode === 'pdf'
              ? 'bg-pink-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          Importer mon CV PDF
        </button>
      </div>

      {/* ── Mode PDF ── */}
      {profileMode === 'pdf' && (
        <div className="bg-gray-800/50 rounded-lg p-6 space-y-4">
          <p className="text-sm text-gray-400">
            L'IA extraira automatiquement votre profil et l'adaptera à l'offre. Aucun formulaire à remplir.
          </p>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              formCvFile
                ? 'border-green-500/60 bg-green-500/5'
                : 'border-gray-600 hover:border-pink-500/60 hover:bg-pink-500/5'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {formCvFile ? (
              <div className="flex flex-col items-center gap-2">
                <span className="text-3xl">✅</span>
                <p className="text-sm font-medium text-green-400">{formCvFile.name}</p>
                <p className="text-xs text-gray-500">Cliquez pour changer de fichier</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span className="text-3xl text-gray-500">📄</span>
                <p className="text-sm text-gray-300">
                  Glissez votre CV ici ou{' '}
                  <span className="text-pink-400 font-medium">cliquez pour sélectionner</span>
                </p>
                <p className="text-xs text-gray-500">PDF uniquement — 2 Mo max</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Mode formulaire ── */}
      {profileMode === 'form' && (
        <>
          {/* Identité */}
          <div className="bg-gray-800/50 rounded-lg p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">Informations personnelles</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Prénom <span className="text-pink-500">*</span>
                </label>
                <input
                  type="text"
                  name="prenom"
                  value={candidateData.prenom}
                  onChange={handleChange}
                  placeholder="John"
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nom <span className="text-pink-500">*</span>
                </label>
                <input
                  type="text"
                  name="nom"
                  value={candidateData.nom}
                  onChange={handleChange}
                  placeholder="Doe"
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Titre de poste actuel <span className="text-pink-500">*</span>
              </label>
              <input
                type="text"
                name="titre_poste"
                value={candidateData.titre_poste}
                onChange={handleChange}
                placeholder="Ex: Développeur Full Stack"
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email <span className="text-pink-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={candidateData.email}
                  onChange={handleChange}
                  placeholder="john.doe@example.com"
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Téléphone <span className="text-pink-500">*</span>
                </label>
                <input
                  type="tel"
                  name="telephone"
                  value={candidateData.telephone}
                  onChange={handleChange}
                  placeholder="06 12 34 56 78"
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-1 focus:ring-pink-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Adresse
              </label>
              <input
                type="text"
                name="adresse"
                value={candidateData.adresse}
                onChange={handleChange}
                placeholder="Paris, France"
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                LinkedIn
              </label>
              <input
                type="url"
                name="linkedin"
                value={candidateData.linkedin}
                onChange={handleChange}
                placeholder="linkedin.com/in/johndoe"
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
              />
            </div>
          </div>

          {/* Expériences */}
          <div className="bg-gray-800/50 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Expériences professionnelles</h3>
              <button
                type="button"
                onClick={addExperience}
                className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                + Ajouter
              </button>
            </div>

            {candidateData.experiences.map((exp, index) => (
              <div key={index} className="bg-gray-900 rounded-lg p-4 space-y-3 relative">
                <button
                  type="button"
                  onClick={() => removeExperience(index)}
                  className="absolute top-2 right-2 text-red-500 hover:text-red-400 text-xl"
                  title="Supprimer"
                >
                  ×
                </button>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Poste</label>
                  <input
                    type="text"
                    value={exp.poste}
                    onChange={(e) => updateExperience(index, 'poste', e.target.value)}
                    placeholder="Ex: Développeur Full Stack"
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Entreprise</label>
                    <input
                      type="text"
                      value={exp.entreprise}
                      onChange={(e) => updateExperience(index, 'entreprise', e.target.value)}
                      placeholder="Ex: TechCorp"
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Localisation</label>
                    <input
                      type="text"
                      value={exp.localisation}
                      onChange={(e) => updateExperience(index, 'localisation', e.target.value)}
                      placeholder="Ex: Paris"
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Date début</label>
                    <input
                      type="text"
                      value={exp.date_debut}
                      onChange={(e) => updateExperience(index, 'date_debut', e.target.value)}
                      placeholder="Ex: 2021"
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Date fin</label>
                    <input
                      type="text"
                      value={exp.date_fin}
                      onChange={(e) => updateExperience(index, 'date_fin', e.target.value)}
                      placeholder="Ex: Présent"
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                  <textarea
                    value={exp.description}
                    onChange={(e) => updateExperience(index, 'description', e.target.value)}
                    placeholder="Décrivez vos missions et réalisations..."
                    rows={3}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 resize-y"
                  />
                </div>
              </div>
            ))}

            {candidateData.experiences.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">
                Aucune expérience ajoutée. Cliquez sur "Ajouter" pour commencer.
              </p>
            )}
          </div>

          {/* Formations */}
          <div className="bg-gray-800/50 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Formations</h3>
              <button
                type="button"
                onClick={addFormation}
                className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                + Ajouter
              </button>
            </div>

            {candidateData.formations.map((form, index) => (
              <div key={index} className="bg-gray-900 rounded-lg p-4 space-y-3 relative">
                <button
                  type="button"
                  onClick={() => removeFormation(index)}
                  className="absolute top-2 right-2 text-red-500 hover:text-red-400 text-xl"
                  title="Supprimer"
                >
                  ×
                </button>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Diplôme</label>
                  <input
                    type="text"
                    value={form.diplome}
                    onChange={(e) => updateFormation(index, 'diplome', e.target.value)}
                    placeholder="Ex: Master Informatique"
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Établissement</label>
                    <input
                      type="text"
                      value={form.etablissement}
                      onChange={(e) => updateFormation(index, 'etablissement', e.target.value)}
                      placeholder="Ex: Université Paris"
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Localisation</label>
                    <input
                      type="text"
                      value={form.localisation}
                      onChange={(e) => updateFormation(index, 'localisation', e.target.value)}
                      placeholder="Ex: Paris"
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Année d'obtention</label>
                  <input
                    type="text"
                    value={form.date_fin}
                    onChange={(e) => updateFormation(index, 'date_fin', e.target.value)}
                    placeholder="Ex: 2021"
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
                  />
                </div>
              </div>
            ))}

            {candidateData.formations.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">
                Aucune formation ajoutée. Cliquez sur "Ajouter" pour commencer.
              </p>
            )}
          </div>

          {/* Compétences */}
          <div className="bg-gray-800/50 rounded-lg p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">Compétences</h3>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Compétences techniques <span className="text-pink-500">*</span>
              </label>
              <textarea
                name="competences_techniques"
                value={candidateData.competences_techniques}
                onChange={handleChange}
                placeholder="Ex: React, Node.js, TypeScript, PostgreSQL, Docker..."
                rows={3}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 resize-y"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Compétences personnelles (soft skills)
              </label>
              <textarea
                name="competences_soft"
                value={candidateData.competences_soft}
                onChange={handleChange}
                placeholder="Ex: Travail d'équipe, Communication, Résolution de problèmes..."
                rows={2}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 resize-y"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Langues
              </label>
              <input
                type="text"
                name="langues"
                value={candidateData.langues}
                onChange={handleChange}
                placeholder="Ex: Français (natif), Anglais (courant)"
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
