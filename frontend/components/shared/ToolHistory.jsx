'use client'

import { useState, useEffect } from 'react'
import { getHistory, deleteHistoryEntry } from '@/lib/api/historyApi'

const TOOL_TYPES = {
  'analyse-cv': { label: 'Analyse CV', emoji: '🔍' },
  'optimiseur-cv': { label: 'Optimiseur CV', emoji: '✨' },
  'matcher-offres': { label: 'Matcher Offres', emoji: '🎯' }
}

export default function ToolHistory({ userId, defaultToolType, onClose, onLoad }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState(defaultToolType || '')

  useEffect(() => {
    if (userId) loadEntries()
  }, [userId, filterType])

  const loadEntries = async () => {
    setLoading(true)
    try {
      const data = await getHistory(userId, {
        toolType: filterType || undefined,
        limit: 50
      })
      setEntries(data || [])
    } catch (err) {
      console.error('Erreur chargement historique:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette entree ?')) return
    try {
      await deleteHistoryEntry(id, userId)
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch (err) {
      console.error('Erreur suppression:', err)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold text-text-primary">Historique d'utilisation</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-surface-elevated flex items-center justify-center text-text-muted hover:text-text-primary cursor-pointer transition-colors"
          >
            &#10005;
          </button>
        </div>

        {/* Filtres */}
        <div className="flex gap-3 p-4 border-b border-border">
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text-primary"
          >
            <option value="">Tous les outils</option>
            {Object.entries(TOOL_TYPES).map(([key, { label, emoji }]) => (
              <option key={key} value={key}>{emoji} {label}</option>
            ))}
          </select>
        </div>

        {/* Liste */}
        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="text-center py-8 text-text-muted">Chargement...</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              Aucun historique trouve
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map(entry => {
                const toolInfo = TOOL_TYPES[entry.tool_type] || { label: entry.tool_type, emoji: '📄' }

                return (
                  <div key={entry.id} className="bg-surface rounded-xl border border-border p-4 hover:border-primary/30 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{toolInfo.emoji}</span>
                          <h3 className="text-sm font-semibold text-text-primary truncate">
                            {entry.title || 'Sans titre'}
                          </h3>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">
                            {toolInfo.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-text-muted">
                            {new Date(entry.created_at).toLocaleDateString('fr-FR', {
                              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                        </div>
                        {/* Résumé des résultats */}
                        {entry.result_summary && Object.keys(entry.result_summary).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {entry.result_summary.metiers?.slice(0, 3).map((m, i) => (
                              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-surface-elevated border border-border text-text-muted">
                                {typeof m === 'string' ? m : m.intitule || m.titre || ''}
                              </span>
                            ))}
                            {entry.result_summary.score_ats && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 border border-success/20 text-success">
                                ATS: {entry.result_summary.score_ats}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        {onLoad && (
                          <button
                            onClick={() => onLoad(entry)}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer transition-colors"
                          >
                            Voir
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="px-2 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors"
                        >
                          &#128465;
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border text-center">
          <p className="text-xs text-text-muted">{entries.length} entree{entries.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
    </div>
  )
}
