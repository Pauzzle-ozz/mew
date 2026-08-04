'use client';
import { useState, useRef } from 'react';
import CatLoadingAnimation from '@/components/shared/CatLoadingAnimation';
import { discoverJobs, rapidAdaptCV } from '@/lib/api/matcherApi';

const JOB_SOURCES = [
  { id: 'wttj', label: 'Welcome to the Jungle', emoji: '🌿', default: true },
  { id: 'france_travail', label: 'France Travail', emoji: '🇫🇷', default: true },
  { id: 'indeed', label: 'Indeed', emoji: '🔵', default: false },
  { id: 'hellowork', label: 'HelloWork', emoji: '👋', default: false },
  { id: 'apec', label: 'APEC (Cadres)', emoji: '🎩', default: false },
];

/* ─── Bouton copier ──────────────────────────────────── */
function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        copied
          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
          : 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20'
      }`}
    >
      {copied ? '✓ Copié !' : `Copier ${label || ''}`}
    </button>
  );
}

/* ─── Section texte ──────────────────────────────────── */
function TextSection({ title, icon, text }) {
  if (!text) return null;
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{icon}</span>
          <span className="font-medium text-white text-xs">{title}</span>
        </div>
        <CopyButton text={text} />
      </div>
      <div className="p-2 bg-slate-900/50 border border-slate-700/50 rounded-lg">
        <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

/* ─── Formatters ─────────────────────────────────────── */
function formatExperiences(experiences) {
  if (!experiences?.length) return '';
  return experiences.map(exp => {
    const lines = [];
    if (exp.poste) lines.push(exp.poste);
    const meta = [exp.entreprise, exp.localisation, [exp.date_debut, exp.date_fin].filter(Boolean).join(' - ')].filter(Boolean).join(' | ');
    if (meta) lines.push(meta);
    if (exp.description) lines.push(exp.description);
    return lines.join('\n');
  }).join('\n\n');
}

function formatFormations(formations) {
  if (!formations?.length) return '';
  return formations.map(f => {
    const lines = [];
    if (f.diplome) lines.push(f.diplome);
    const meta = [f.etablissement, f.localisation, f.date_fin].filter(Boolean).join(' | ');
    if (meta) lines.push(meta);
    return lines.join('\n');
  }).join('\n\n');
}

/**
 * OfferDiscovery — Mode découverte du matcher
 */
export default function OfferDiscovery({ onSelectOffer }) {
  const [subStep, setSubStep] = useState(0);
  const [cvFile, setCvFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [filtreMetier, setFiltreMetier] = useState('');
  const [selectedSources, setSelectedSources] = useState(
    JOB_SOURCES.filter(s => s.default).map(s => s.id)
  );
  const [localisation, setLocalisation] = useState('');
  const [typeContrat, setTypeContrat] = useState('');
  const [adapting, setAdapting] = useState(false);
  const [adaptResult, setAdaptResult] = useState(null);
  const [adaptedOffer, setAdaptedOffer] = useState(null);
  const [adaptError, setAdaptError] = useState('');
  const fileRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') setCvFile(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file?.type === 'application/pdf') setCvFile(file);
  };

  const toggleSource = (sourceId) => {
    setSelectedSources(prev => {
      if (prev.includes(sourceId)) {
        if (prev.length <= 1) return prev;
        return prev.filter(s => s !== sourceId);
      }
      return [...prev, sourceId];
    });
  };

  const handleAnalyse = async () => {
    if (!cvFile || selectedSources.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const filters = {};
      if (localisation.trim()) filters.localisation = localisation.trim();
      if (typeContrat) filters.typeContrat = typeContrat;
      const data = await discoverJobs(cvFile, selectedSources, filters);
      setResult(data.data);
      setSubStep(1);
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'analyse');
    } finally {
      setLoading(false);
    }
  };

  const handleAdaptCV = async (offre) => {
    if (!cvFile) return;
    setAdaptError('');
    setAdaptResult(null);
    setAdapting(true);
    setAdaptedOffer(offre);
    setSubStep(3);

    try {
      const offer = {
        title: offre.titre || '',
        company: offre.entreprise || '',
        location: offre.lieu || '',
        contract_type: offre.contrat || '',
        description: offre.description || `Poste de ${offre.titre || ''} chez ${offre.entreprise || ''} ${offre.lieu || ''} ${offre.contrat || ''}`.trim(),
      };

      const response = await rapidAdaptCV(cvFile, offer);
      const personal = response.data?.personalizedCV;

      if (!personal) throw new Error('L\'IA n\'a pas retourne les donnees du CV');

      setAdaptResult(personal);
    } catch (err) {
      setAdaptError(err.message || 'Erreur lors de l\'adaptation');
    } finally {
      setAdapting(false);
    }
  };

  const backToOffers = () => {
    setSubStep(2);
    setAdaptResult(null);
    setAdaptedOffer(null);
    setAdaptError('');
  };

  const offresFiltered = result?.offres?.filter(o =>
    !filtreMetier || o.metier_correspondant === filtreMetier
  ) || [];

  const sourceColors = {
    'WTTJ': 'text-green-400 bg-green-900/20 border-green-800',
    'France Travail': 'text-blue-400 bg-blue-900/20 border-blue-800',
    'Indeed': 'text-purple-400 bg-purple-900/20 border-purple-800',
    'HelloWork': 'text-orange-400 bg-orange-900/20 border-orange-800',
    'APEC': 'text-cyan-400 bg-cyan-900/20 border-cyan-800',
  };

  // ── SubStep 0 : Upload CV ──────────────────────────────────────────
  if (subStep === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white mb-1">Mode Découverte</h2>
          <p className="text-sm text-slate-400">On analyse votre CV et on trouve les offres qui vous correspondent</p>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
            isDragging ? 'border-primary bg-primary/5' :
            cvFile ? 'border-green-500 bg-green-900/10' : 'border-slate-600 hover:border-slate-400 bg-slate-800/30'
          }`}
        >
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
          {cvFile ? (
            <div className="space-y-2">
              <div className="text-3xl">📄</div>
              <p className="text-green-400 font-medium">{cvFile.name}</p>
              <p className="text-xs text-slate-500">{(cvFile.size / 1024).toFixed(0)} Ko · Cliquer pour changer</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-4xl">📎</div>
              <p className="text-slate-300 font-medium">Glissez votre CV PDF ici</p>
              <p className="text-sm text-slate-500">ou cliquez pour sélectionner · Max 2 Mo</p>
            </div>
          )}
        </div>

        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Sources de recherche</h3>
          <div className="flex flex-wrap gap-2">
            {JOB_SOURCES.map(source => {
              const isSelected = selectedSources.includes(source.id);
              return (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => toggleSource(source.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400'
                  }`}
                >
                  <span>{source.emoji}</span>
                  <span>{source.label}</span>
                  {isSelected && <span className="ml-0.5">✓</span>}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {selectedSources.length} source{selectedSources.length > 1 ? 's' : ''} · Au moins 1 requise
          </p>
        </div>

        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Filtres (optionnel)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Localisation</label>
              <input
                type="text"
                placeholder="Ex: Paris, Lyon, Toulouse..."
                value={localisation}
                onChange={e => setLocalisation(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Type de contrat</label>
              <select
                value={typeContrat}
                onChange={e => setTypeContrat(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-600 rounded-lg text-white focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none"
              >
                <option value="">Tous types</option>
                <option value="CDI">CDI</option>
                <option value="CDD">CDD</option>
                <option value="Stage">Stage</option>
                <option value="Alternance">Alternance</option>
                <option value="Freelance">Freelance</option>
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-4">
            <CatLoadingAnimation label="Analyse de votre profil en cours..." />
          </div>
        ) : (
          <button
            onClick={handleAnalyse}
            disabled={!cvFile || selectedSources.length === 0}
            className="w-full py-3 rounded-xl bg-primary text-slate-900 font-semibold hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Analyser mon profil →
          </button>
        )}
      </div>
    );
  }

  // ── SubStep 1 : Métiers identifiés ────────────────────────────────
  if (subStep === 1) {
    return (
      <div className="space-y-6">
        <div>
          <button onClick={() => setSubStep(0)} className="text-xs text-slate-500 hover:text-slate-300 mb-3 flex items-center gap-1">← Retour</button>
          <h2 className="text-xl font-semibold text-white">Votre profil analysé</h2>
          {result?.resume_profil && <p className="text-sm text-slate-400 mt-1">{result.resume_profil}</p>}
        </div>

        <div className="grid grid-cols-1 gap-3">
          {result?.metiers?.map((metier, idx) => (
            <div key={idx} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 hover:border-primary/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 capitalize">{metier.niveau}</span>
                  </div>
                  <h3 className="font-semibold text-white">{metier.titre}</h3>
                  {metier.description_courte && <p className="text-xs text-slate-400 mt-1">{metier.description_courte}</p>}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {metier.mots_cles?.slice(0, 4).map((kw, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{kw}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setSubStep(2)}
          className="w-full py-3 rounded-xl bg-primary text-slate-900 font-semibold hover:brightness-110 transition-all"
        >
          Voir les offres trouvées ({result?.offres?.length || 0}) →
        </button>
      </div>
    );
  }

  // ── SubStep 3 : Résultat adaptation rapide (TEXTE) ────────────────
  if (subStep === 3) {
    const cvData = adaptResult?.cvData;

    return (
      <div className="space-y-6">
        <div>
          <button onClick={backToOffers} className="text-xs text-slate-500 hover:text-slate-300 mb-3 flex items-center gap-1">← Retour aux offres</button>
          <h2 className="text-xl font-semibold text-white">
            CV adapté pour {adaptedOffer?.titre || 'cette offre'}
          </h2>
          {adaptedOffer?.entreprise && (
            <p className="text-sm text-slate-400 mt-1">
              {adaptedOffer.entreprise}{adaptedOffer.lieu ? ` · ${adaptedOffer.lieu}` : ''}
            </p>
          )}
        </div>

        {/* Loading */}
        {adapting && (
          <div className="flex flex-col items-center py-12">
            <CatLoadingAnimation label="Adaptation de votre CV en cours..." />
            <p className="text-xs text-slate-500 mt-3">Cela prend 30 à 60 secondes</p>
          </div>
        )}

        {/* Erreur */}
        {adaptError && !adapting && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-4">
            <p className="text-sm text-red-300">{adaptError}</p>
            <button onClick={() => handleAdaptCV(adaptedOffer)} className="mt-2 text-xs text-red-400 hover:text-red-300 underline">Réessayer</button>
          </div>
        )}

        {/* Résultat : score + texte copiable */}
        {adaptResult && !adapting && (
          <>
            {/* Score de matching */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative flex items-center justify-center">
                <svg width="120" height="120" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#1e293b" strokeWidth="10" />
                  <circle
                    cx="60" cy="60" r="50"
                    fill="none"
                    stroke={adaptResult.score_matching >= 75 ? '#22c55e' : adaptResult.score_matching >= 50 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${(adaptResult.score_matching / 100) * 314} 314`}
                    strokeDashoffset="78.5"
                    style={{ transition: 'stroke-dasharray 1s ease' }}
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-3xl font-bold text-white">{adaptResult.score_matching || '—'}</span>
                  <span className="text-xs text-slate-400">/ 100</span>
                </div>
              </div>
              <p className="text-xs text-slate-500">Score de compatibilité</p>
            </div>

            {/* Modifications apportées */}
            {adaptResult.modifications_apportees?.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <h3 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Modifications apportées</h3>
                <ul className="space-y-1.5">
                  {adaptResult.modifications_apportees.map((mod, i) => (
                    <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-green-400 shrink-0 mt-0.5">→</span>
                      <span>{mod}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sections de texte copiable */}
            {cvData && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">Texte à copier dans ton CV</h3>
                  <CopyButton
                    text={[
                      cvData.titre_poste && `Titre: ${cvData.titre_poste}`,
                      cvData.resume && `\nRésumé:\n${cvData.resume}`,
                      cvData.experiences?.length && `\nExpériences:\n${formatExperiences(cvData.experiences)}`,
                      cvData.formations?.length && `\nFormations:\n${formatFormations(cvData.formations)}`,
                      cvData.competences_techniques && `\nCompétences:\n${cvData.competences_techniques}`,
                      cvData.competences_soft && `\nSoft skills:\n${cvData.competences_soft}`,
                      cvData.langues && `\nLangues:\n${cvData.langues}`,
                    ].filter(Boolean).join('\n')}
                    label="tout"
                  />
                </div>

                {cvData.titre_poste && <TextSection title="Titre" icon="🏷️" text={cvData.titre_poste} />}
                <TextSection title="Résumé" icon="📝" text={cvData.resume} />
                {cvData.experiences?.length > 0 && <TextSection title="Expériences" icon="💼" text={formatExperiences(cvData.experiences)} />}
                {cvData.formations?.length > 0 && <TextSection title="Formations" icon="🎓" text={formatFormations(cvData.formations)} />}
                <TextSection title="Compétences" icon="⚡" text={cvData.competences_techniques} />
                <TextSection title="Soft skills" icon="🤝" text={cvData.competences_soft} />
                <TextSection title="Langues" icon="🌍" text={cvData.langues} />
              </div>
            )}

            {/* Actions : Postuler + Retour */}
            <div className="grid grid-cols-2 gap-3">
              {adaptedOffer?.url ? (
                <a
                  href={adaptedOffer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3 rounded-xl bg-green-600 text-white font-semibold hover:brightness-110 transition-all text-center text-sm"
                >
                  Postuler ↗
                </a>
              ) : null}
              <button
                onClick={backToOffers}
                className={`py-3 rounded-xl border border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white transition-colors text-sm font-medium ${!adaptedOffer?.url ? 'col-span-2' : ''}`}
              >
                ← Voir d'autres offres
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── SubStep 2 : Liste des offres ───────────────────────────────────
  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => setSubStep(1)} className="text-xs text-slate-500 hover:text-slate-300 mb-3 flex items-center gap-1">← Retour</button>
        <h2 className="text-xl font-semibold text-white">Offres trouvées pour vous</h2>
        <p className="text-sm text-slate-400 mt-1">{offresFiltered.length} offres · Cliquez sur "Adapter CV" pour obtenir le texte optimisé</p>
      </div>

      {result?.metiers?.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFiltreMetier('')}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              !filtreMetier ? 'bg-primary text-slate-900 border-primary' : 'border-slate-600 text-slate-400 hover:border-slate-400'
            }`}
          >
            Tous
          </button>
          {result.metiers.map((m, i) => (
            <button
              key={i}
              onClick={() => setFiltreMetier(m.titre)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filtreMetier === m.titre ? 'bg-primary text-slate-900 border-primary' : 'border-slate-600 text-slate-400 hover:border-slate-400'
              }`}
            >
              {m.titre}
            </button>
          ))}
        </div>
      )}

      {offresFiltered.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <div className="text-4xl mb-3">🔍</div>
          <p>Aucune offre trouvée pour ce filtre.</p>
          <p className="text-sm mt-1">Essayez sans filtre ou relancez une recherche.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {offresFiltered.map((offre, idx) => (
            <div key={idx} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 hover:border-primary/40 transition-colors">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${sourceColors[offre.source] || 'text-slate-400 bg-slate-800 border-slate-700'}`}>
                      {offre.source}
                    </span>
                    {offre.contrat && <span className="text-xs text-slate-500">{offre.contrat}</span>}
                  </div>
                  <h3 className="font-semibold text-white text-sm truncate">{offre.titre}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {offre.entreprise && <span>{offre.entreprise}</span>}
                    {offre.lieu && <span> · {offre.lieu}</span>}
                  </p>
                  {offre.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{offre.description}</p>}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {offre.url && (
                    <a
                      href={offre.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-1 rounded-lg border border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Voir ↗
                    </a>
                  )}
                  <button
                    onClick={() => handleAdaptCV(offre)}
                    className="text-xs px-2 py-1 rounded-lg bg-primary text-slate-900 font-semibold hover:brightness-110 transition-all whitespace-nowrap"
                  >
                    Adapter CV
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
