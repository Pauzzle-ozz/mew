'use client';

/**
 * MatcherTransparency — Étape 2 du matcher
 * Affiche le score de matching et la comparaison avant/après par section
 */
export default function MatcherTransparency({ score, modifications, cvDataOriginal, cvDataOptimized, onBack }) {
  const scoreColor = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const scoreLabel = score >= 75 ? 'Excellent matching' : score >= 50 ? 'Bon matching' : 'Matching partiel';

  const sections = [
    {
      key: 'titre_poste',
      label: 'Titre du poste',
      avant: cvDataOriginal?.titre_poste,
      apres: cvDataOptimized?.titre_poste
    },
    {
      key: 'resume',
      label: 'Résumé professionnel',
      avant: cvDataOriginal?.resume,
      apres: cvDataOptimized?.resume
    }
  ];

  // Ajouter les expériences si disponibles
  if (cvDataOriginal?.experiences?.length && cvDataOptimized?.experiences?.length) {
    sections.push({
      key: 'experiences',
      label: 'Expériences (1ère)',
      avant: cvDataOriginal.experiences[0]?.description,
      apres: cvDataOptimized.experiences[0]?.description
    });
  }

  const sectionsWithChanges = sections.filter(s => s.avant && s.apres && s.avant !== s.apres);

  return (
    <div className="space-y-8">
      {/* Score de matching */}
      <div className="flex flex-col items-center gap-4">
        <h2 className="text-xl font-semibold text-white">Score de correspondance</h2>
        <div className="relative flex items-center justify-center">
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="58" fill="none" stroke="#1e293b" strokeWidth="12" />
            <circle
              cx="70" cy="70" r="58"
              fill="none"
              stroke={scoreColor}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${(score / 100) * 364} 364`}
              strokeDashoffset="91"
              style={{ transition: 'stroke-dasharray 1s ease' }}
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-4xl font-bold text-white">{score}</span>
            <span className="text-xs text-slate-400">/ 100</span>
          </div>
        </div>
        <span className="text-sm font-medium px-3 py-1 rounded-full" style={{ backgroundColor: scoreColor + '22', color: scoreColor }}>
          {scoreLabel}
        </span>
      </div>

      {/* Liste des modifications */}
      {modifications?.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <span className="text-base">✏️</span>
            Modifications apportées à votre CV
          </h3>
          <ul className="space-y-2">
            {modifications.map((mod, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="text-green-400 mt-0.5 shrink-0">→</span>
                <span>{mod}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Comparaison avant / après par section */}
      {sectionsWithChanges.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <span className="text-base">🔄</span>
            Avant / Après par section
          </h3>
          {sectionsWithChanges.map(section => (
            <div key={section.key} className="rounded-xl border border-slate-700 overflow-hidden">
              <div className="px-4 py-2 bg-slate-800 border-b border-slate-700">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{section.label}</span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-700">
                <div className="p-4 bg-red-950/20">
                  <p className="text-xs font-medium text-red-400 mb-2">Avant</p>
                  <p className="text-sm text-slate-300 leading-relaxed line-clamp-5">{section.avant}</p>
                </div>
                <div className="p-4 bg-green-950/20">
                  <p className="text-xs font-medium text-green-400 mb-2">Après</p>
                  <p className="text-sm text-slate-300 leading-relaxed line-clamp-5">{section.apres}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bouton retour */}
      {onBack && (
        <div className="pt-2">
          <button
            onClick={onBack}
            className="px-5 py-3 rounded-xl border border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white transition-colors text-sm font-medium"
          >
            ← Modifier les données
          </button>
        </div>
      )}
    </div>
  );
}
