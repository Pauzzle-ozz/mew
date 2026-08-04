'use client'

import { useState, useMemo } from 'react'
import AvertissementLecturePdf from '@/components/shared/AvertissementLecturePdf'

function ScoreBar({ label, score, color }) {
  // Un score peut valoir null : c'est le cas de « Marche emploi » tant
  // qu'aucune source de donnees reelle n'est branchee. Afficher « non
  // mesure » est plus honnete qu'une barre a zero, qui se lirait comme
  // un mauvais resultat.
  const mesure = typeof score === 'number' && Number.isFinite(score)

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-text-muted w-28 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-border/30 rounded-full overflow-hidden">
        {mesure && (
          <div
            className={`h-full rounded-full transition-all duration-700 ${color}`}
            style={{ width: `${score}%` }}
          />
        )}
      </div>
      <span className="text-xs font-semibold text-text-primary w-16 text-right">
        {mesure ? score : 'non mesure'}
      </span>
    </div>
  )
}

function ScoreCircle({ score, size = 'md' }) {
  const getColor = (s) => {
    if (s >= 75) return 'text-success border-success/30 bg-success/10'
    if (s >= 50) return 'text-primary border-primary/30 bg-primary/10'
    if (s >= 30) return 'text-warning border-warning/30 bg-warning/10'
    return 'text-error border-error/30 bg-error/10'
  }

  const sizeClasses = size === 'lg'
    ? 'w-16 h-16 text-xl'
    : 'w-12 h-12 text-base'

  return (
    <div className={`${sizeClasses} rounded-full border-2 flex items-center justify-center font-bold ${getColor(score)}`}>
      {score}
    </div>
  )
}

function MetierCard({ metier, colors }) {
  const [expanded, setExpanded] = useState(false)

  // NE PAS SUPPRIMER LE REPLI SUR `note_marche` : ce n'est pas du code mort.
  // Le backend actuel renvoie un objet `scores` detaille, mais les analyses
  // archivees dans tool_usage_history datent d'avant ce changement et ne
  // contiennent qu'un seul nombre, `note_marche`. Quand l'utilisateur rejoue
  // une de ces analyses depuis l'historique, c'est cette ligne qui evite un
  // ecran vide. Elle doit rester tant que d'anciens enregistrements existent.
  const scores = metier.scores || {
    adequation_profil: metier.note_marche || 0,
    marche_emploi: metier.note_marche || 0,
    potentiel_evolution: metier.note_marche || 0,
    global: metier.note_marche || 0
  }

  const justifications = metier.justifications || {}
  const conseils = metier.conseils || {}

  return (
    <div className={`rounded-lg border ${colors.border} overflow-hidden transition-all`}>
      {/* En-tete cliquable */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`w-full p-4 flex items-center justify-between ${colors.bg} hover:brightness-95 transition-all cursor-pointer`}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <ScoreCircle score={scores.global} />
          <div className="text-left min-w-0">
            <h4 className={`text-lg font-bold ${colors.text} truncate`}>
              {metier.intitule}
            </h4>
            {metier.priorite && (
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors.badge} mt-1`}>
                Priorite #{metier.priorite}
              </span>
            )}
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-text-muted shrink-0 ml-2 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Contenu expandable */}
      {expanded && (
        <div className="p-4 border-t border-border/50 space-y-4 bg-surface">
          {/* Barres de scores */}
          <div className="space-y-2">
            <h5 className="text-sm font-semibold text-text-primary mb-2">Scoring detaille</h5>
            <ScoreBar label="Adequation profil" score={scores.adequation_profil} color="bg-primary" />
            <ScoreBar label="Marche emploi" score={scores.marche_emploi} color="bg-success" />
            <ScoreBar label="Potentiel evolution" score={scores.potentiel_evolution} color="bg-secondary" />
          </div>

          {/* Justifications */}
          {(justifications.adequation_profil || justifications.marche_emploi || justifications.potentiel_evolution) && (
            <div className="space-y-1.5">
              {justifications.adequation_profil && (
                <p className="text-xs text-text-muted">
                  <span className="font-medium text-primary">Adequation :</span> {justifications.adequation_profil}
                </p>
              )}
              {justifications.marche_emploi && (
                <p className="text-xs text-text-muted">
                  <span className="font-medium text-success">Marche :</span> {justifications.marche_emploi}
                </p>
              )}
              {justifications.potentiel_evolution && (
                <p className="text-xs text-text-muted">
                  <span className="font-medium text-secondary">Evolution :</span> {justifications.potentiel_evolution}
                </p>
              )}
            </div>
          )}

          {/* Conseils */}
          {(conseils.points_forts?.length > 0 || conseils.lacunes?.length > 0 || conseils.conseil_actionnable) && (
            <div className="space-y-3 pt-2 border-t border-border/30">
              {conseils.points_forts?.length > 0 && (
                <div>
                  <h6 className="text-xs font-semibold text-success mb-1">Tes atouts pour ce poste</h6>
                  <div className="flex flex-wrap gap-1.5">
                    {conseils.points_forts.map((pf, i) => (
                      <span key={i} className="px-2 py-0.5 bg-success/10 border border-success/20 rounded text-xs text-success">
                        {pf}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {conseils.lacunes?.length > 0 && (
                <div>
                  <h6 className="text-xs font-semibold text-warning mb-1">A developper</h6>
                  <div className="flex flex-wrap gap-1.5">
                    {conseils.lacunes.map((lac, i) => (
                      <span key={i} className="px-2 py-0.5 bg-warning/10 border border-warning/20 rounded text-xs text-warning">
                        {lac}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {conseils.conseil_actionnable && (
                <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
                  <p className="text-sm text-text-secondary">
                    <span className="font-semibold text-primary">Conseil : </span>
                    {conseils.conseil_actionnable}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Mots-cles */}
          {metier.mots_cles?.length > 0 && (
            <div className="pt-2 border-t border-border/30">
              <h6 className="text-xs font-semibold text-text-muted mb-1.5">Mots-cles</h6>
              <div className="flex flex-wrap gap-1.5">
                {metier.mots_cles.map((mot, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-surface-elevated border border-border rounded text-xs text-text-muted"
                  >
                    {mot}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const CATEGORIES = ['Correspond a mes competences', 'Je pourrais tenter']

/**
 * @param {object}   result   resultat de l'analyse (recent ou rejoue depuis l'historique)
 * @param {Function} onReset  optionnel : remise a zero. Sans lui, le bouton
 *                            « Faire une nouvelle analyse » du bas n'est pas
 *                            affiche — la page qui n'en veut pas ne le passe pas.
 */
export default function ResultsDisplay({ result, onReset }) {
  const groupedMetiers = useMemo(() => {
    const groups = {
      'Correspond a mes competences': [],
      'Je pourrais tenter': []
    }

    result?.metiers_proposes?.forEach(metier => {
      const categorie = metier.categorie || 'Correspond a mes competences'
      if (groups[categorie]) {
        groups[categorie].push(metier)
      } else {
        groups['Correspond a mes competences'].push(metier)
      }
    })

    return groups
  }, [result?.metiers_proposes])

  const totalDisplayed = useMemo(
    () => CATEGORIES.reduce((sum, cat) => sum + groupedMetiers[cat].length, 0),
    [groupedMetiers]
  )

  if (!result) return null

  const categoryConfig = {
    'Correspond a mes competences': {
      bg: 'bg-success/5',
      border: 'border-success/20',
      text: 'text-success',
      badge: 'bg-success/15 text-success',
      icon: (
        <svg className="w-7 h-7 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      description: 'Ces metiers correspondent directement a ton profil. Tu peux postuler des maintenant.'
    },
    'Je pourrais tenter': {
      bg: 'bg-secondary/5',
      border: 'border-secondary/20',
      text: 'text-secondary',
      badge: 'bg-secondary/15 text-secondary',
      icon: (
        <svg className="w-7 h-7 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
      description: 'Ces metiers sont accessibles avec un peu d\'effort supplementaire. Explore-les !'
    }
  }

  return (
    <div className="space-y-6">

      {/* Fiabilite de la lecture du PDF, affichee AVANT les resultats : la
          personne doit savoir avec quelle marge d'erreur les lire. */}
      <AvertissementLecturePdf confiance={result.profil?.confiance_lecture} />

      {/* Header resultats */}
      <div className="bg-gradient-to-r from-primary to-secondary text-primary-foreground rounded-xl p-6">
        <h2 className="text-2xl font-bold mb-2">Analyse terminee !</h2>
        <p className="text-primary-foreground/80">
          {totalDisplayed} metier{totalDisplayed > 1 ? 's' : ''} identifies pour ton profil
        </p>
        {result.competences_cles?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {result.competences_cles.slice(0, 8).map((comp, i) => (
              <span key={i} className="px-2 py-1 bg-white/15 rounded text-xs font-medium">
                {comp}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Metiers par categorie */}
      {CATEGORIES.map((categorie) => {
        const metiers = groupedMetiers[categorie]
        if (metiers.length === 0) return null

        const config = categoryConfig[categorie]

        return (
          <div key={categorie} className="bg-surface rounded-xl border border-border p-6">
            {/* Titre categorie */}
            <div className="flex items-start gap-3 mb-2">
              {config.icon}
              <div className="flex-1">
                <h3 className="text-xl font-bold text-text-primary flex items-center gap-2">
                  {categorie}
                  <span className="text-sm font-normal text-text-muted">
                    ({metiers.length})
                  </span>
                </h3>
                <p className="text-sm text-text-muted mt-0.5">{config.description}</p>
              </div>
            </div>

            {/* Liste des metiers */}
            <div className="space-y-3 mt-4">
              {/* Copie avant tri : .sort() modifie le tableau sur place, et
                  celui-ci vient d'un useMemo. Trier directement dedans revient
                  a modifier une valeur memorisee pendant le rendu. */}
              {[...metiers]
                .sort((a, b) => (a.priorite || 99) - (b.priorite || 99))
                .map((metier, index) => (
                  <MetierCard key={index} metier={metier} colors={config} />
                ))}
            </div>
          </div>
        )
      })}

      {/* Mots-cles de recherche */}
      {result.mots_cles_recherche?.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-6">
          <h3 className="text-lg font-bold text-text-primary mb-3">Mots-cles pour ta recherche</h3>
          <p className="text-sm text-text-muted mb-3">
            Utilise ces mots-cles sur LinkedIn, Indeed, et les sites d'emploi pour maximiser tes resultats.
          </p>
          <div className="flex flex-wrap gap-2">
            {result.mots_cles_recherche.map((mot, i) => (
              <span
                key={i}
                className="px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary font-medium"
              >
                {mot}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bouton nouvelle analyse.
          Avant : window.location.reload(). Recharger toute la page pour vider
          un resultat, c'est refaire le trajet reseau, re-verifier la session et
          re-telecharger l'application entiere — plusieurs secondes d'ecran
          blanc pour une remise a zero que React fait instantanement. */}
      {onReset && (
        <div className="text-center pt-4">
          <button
            type="button"
            onClick={onReset}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Faire une nouvelle analyse
          </button>
        </div>
      )}
    </div>
  )
}
