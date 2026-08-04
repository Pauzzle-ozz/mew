'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { validatePDF } from '@/lib/utils/fileHelpers'
import { signOut } from '@/lib/auth'
import ErrorMessage from '@/components/shared/ErrorMessage'
import Header from '@/components/shared/Header'
import Button from '@/components/shared/Button'
import CatLoadingAnimation from '@/components/shared/CatLoadingAnimation'
import ToolHistory from '@/components/shared/ToolHistory'
import Logo from '@/components/shared/Logo'
import { saveHistoryEntry } from '@/lib/api/historyApi'
import { cvApi } from '@/lib/api/cvApi'

/* ─── Stepper ─── */
function Stepper({ current }) {
  const steps = [{ n: 1, label: 'Upload CV' }, { n: 2, label: 'Resultats' }]
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
            s.n === current ? 'bg-primary text-primary-foreground'
            : s.n < current ? 'bg-primary/20 text-primary'
            : 'bg-surface-elevated text-text-muted'
          }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
              s.n < current ? 'bg-primary/30' : s.n === current ? 'bg-white/20' : 'bg-border'
            }`}>
              {s.n < current ? '\u2713' : s.n}
            </span>
            {s.label}
          </div>
          {i < steps.length - 1 && <div className={`h-px w-8 ${s.n < current ? 'bg-primary/40' : 'bg-border'}`} />}
        </div>
      ))}
    </div>
  )
}

/* ─── Score ATS ─── */
function ATSScore({ score }) {
  const color = score >= 75 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--error)'
  const label = score >= 75 ? 'Excellent' : score >= 50 ? 'Bon' : 'A ameliorer'
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 60" className="w-36 h-24">
        <path d="M 10 55 A 40 40 0 0 1 90 55" fill="none" stroke="var(--border)" strokeWidth="8" strokeLinecap="round" />
        <path d="M 10 55 A 40 40 0 0 1 90 55" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${score * 1.257} 200`} style={{ transition: 'stroke-dasharray 1s ease' }} />
        <text x="50" y="50" textAnchor="middle" fill={color} fontSize="20" fontWeight="bold" fontFamily="var(--font-syne)">{score}</text>
      </svg>
      <div className="text-sm font-bold mt-1" style={{ color }}>{label}</div>
      <div className="text-xs text-text-muted">Score ATS /100</div>
    </div>
  )
}

/* ─── Copy button ─── */
function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea'); ta.value = text
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
    }
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={handleCopy} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
      copied ? 'bg-success/10 text-success' : 'bg-primary-light text-primary hover:bg-primary/15'
    }`}>
      {copied ? '\u2713 Copie !' : `Copier ${label || ''}`}
    </button>
  )
}

/* ─── Optimized section ─── */
function OptimizedSection({ title, optimizedText }) {
  if (!optimizedText) return null
  return (
    <div className="bg-surface rounded-2xl border border-border/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-bold text-text-primary text-sm">{title}</h3>
        <CopyButton text={optimizedText} />
      </div>
      <div className="p-3 bg-success/5 border border-success/10 rounded-xl">
        <p className="text-sm text-text-secondary whitespace-pre-line leading-relaxed">{optimizedText}</p>
      </div>
    </div>
  )
}

/* ─── Formatters ─── */
function formatExperiences(exps) {
  if (!exps?.length) return ''
  return exps.map(exp => {
    const lines = []
    if (exp.poste) lines.push(exp.poste)
    const meta = [exp.entreprise, exp.localisation, [exp.date_debut, exp.date_fin].filter(Boolean).join(' - ')].filter(Boolean).join(' | ')
    if (meta) lines.push(meta)
    if (exp.description) lines.push(exp.description)
    return lines.join('\n')
  }).join('\n\n')
}

function formatFormations(formations) {
  if (!formations?.length) return ''
  return formations.map(f => {
    const lines = []
    if (f.diplome) lines.push(f.diplome)
    const meta = [f.etablissement, f.localisation, f.date_fin].filter(Boolean).join(' | ')
    if (meta) lines.push(meta)
    return lines.join('\n')
  }).join('\n\n')
}

/* ─── Main page ─── */
export default function OptimiseurCVPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [processing, setProcessing] = useState(false)
  const [step, setStep] = useState(1)
  const [cvFile, setCvFile] = useState(null)
  const [posteCible, setPosteCible] = useState('')
  const [localError, setLocalError] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [optimResult, setOptimResult] = useState(null)
  const [cvDataOptimized, setCvDataOptimized] = useState(null)

  const handleLogout = async () => { if (await signOut()) router.push('/login') }

  const handleFileChange = (e) => {
    const file = e.target.files[0]; if (!file) return
    setLocalError(null)
    try { validatePDF(file); setCvFile(file) } catch (err) { setLocalError(err.message); setCvFile(null) }
  }

  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files[0]; if (!file) return
    setLocalError(null)
    try { validatePDF(file); setCvFile(file) } catch (err) { setLocalError(err.message); setCvFile(null) }
  }

  const goToStep2 = (data) => {
    setOptimResult({ score_ats: data.score_ats, points_forts: data.points_forts, ameliorations: data.ameliorations })
    setCvDataOptimized(data.cvData_optimise)
    setProcessing(false); setStep(2)
    saveHistoryEntry({
      userId: user.id, toolType: 'optimiseur-cv',
      title: `Optimisation CV - ${data.cvData_optimise?.prenom || ''} ${data.cvData_optimise?.nom || ''}`.trim(),
      inputSummary: { poste_cible: posteCible || data.cvData_optimise?.titre_poste, methode: 'upload' },
      resultSummary: { score_ats: data.score_ats, fullResult: data }
    }).catch(() => {})
  }

  const handlePdfOptimization = async (e) => {
    e.preventDefault(); setLocalError(null)
    if (!cvFile) { setLocalError('Veuillez selectionner un fichier CV'); return }
    setProcessing(true)
    try {
      const data = await cvApi.optimizeCVPDF(cvFile, user.id, posteCible)
      if (data.success) goToStep2(data.data)
      else throw new Error(data.error || 'Erreur lors de l\'optimisation')
    } catch (err) { setProcessing(false); setLocalError(err.message) }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <Logo size="md" link={false} />
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header
        user={user} onLogout={handleLogout}
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Optimiseur CV' }]}
        actions={
          <button onClick={() => setShowHistory(true)} className="px-3 py-1.5 text-xs font-semibold rounded-full bg-primary-light text-primary hover:bg-primary/15 transition-colors cursor-pointer">
            Historique
          </button>
        }
      />

      <main className="mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-4xl">
        {showHistory && (
          <ToolHistory userId={user.id} defaultToolType="optimiseur-cv" onClose={() => setShowHistory(false)}
            onLoad={(entry) => {
              const full = entry.result_summary?.fullResult
              if (full) {
                setOptimResult({ score_ats: full.score_ats, points_forts: full.points_forts, ameliorations: full.ameliorations })
                setCvDataOptimized(full.cvData_optimise); setStep(2); setShowHistory(false)
              }
            }}
          />
        )}

        <Stepper current={step} />

        {/* ── STEP 1: Upload ── */}
        {step === 1 && (
          <div className="animate-fade-in">
            {processing ? (
              <div className="bg-surface rounded-2xl border border-border/60 p-10 text-center">
                <CatLoadingAnimation label="Analyse et optimisation du CV en cours" />
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <h1 className="font-display text-3xl font-bold text-text-primary mb-2">Optimiseur de CV</h1>
                  <p className="text-text-secondary">
                    Uploadez votre CV PDF. L&apos;IA optimise le texte pour les ATS et vous donne les sections a copier-coller.
                  </p>
                </div>

                {/* Target position */}
                <div className="bg-surface rounded-2xl border border-primary/20 p-5 mb-6">
                  <h3 className="font-display text-sm font-bold text-primary mb-1">Poste cible (optionnel mais recommande)</h3>
                  <p className="text-xs text-text-muted mb-3">L&apos;IA adaptera les mots-cles et le resume pour ce poste.</p>
                  <input
                    type="text"
                    placeholder="Ex: Developpeur Full Stack React / Chef de projet digital"
                    value={posteCible}
                    onChange={e => setPosteCible(e.target.value)}
                    className="w-full px-4 py-3 border border-border rounded-xl bg-background text-text-primary placeholder-text-muted focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none text-sm transition-all"
                  />
                </div>

                <ErrorMessage message={localError} onClose={() => setLocalError(null)} />

                {/* Upload zone */}
                <form onSubmit={handlePdfOptimization}>
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onClick={() => document.getElementById('cv-upload').click()}
                    className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all mb-6 ${
                      isDragging ? 'border-primary bg-primary-light scale-[1.01]' :
                      cvFile ? 'border-success/50 bg-success/5' : 'border-border hover:border-primary/40 hover:bg-primary-light'
                    }`}
                  >
                    <input id="cv-upload" type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
                    {cvFile ? (
                      <div className="space-y-2">
                        <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center mx-auto">
                          <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <p className="font-semibold text-text-primary">{cvFile.name}</p>
                        <p className="text-xs text-text-muted">{(cvFile.size / 1024).toFixed(0)} Ko — Cliquer pour changer</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="w-12 h-12 rounded-xl bg-primary-light flex items-center justify-center mx-auto">
                          <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                        </div>
                        <p className="font-display font-bold text-text-primary">Glissez votre CV PDF ici</p>
                        <p className="text-sm text-text-muted">ou cliquez pour selectionner — Max 2 Mo</p>
                      </div>
                    )}
                  </div>

                  <Button type="submit" variant="primary" size="lg" disabled={!cvFile} className="w-full">
                    Optimiser mon CV avec l&apos;IA
                  </Button>
                </form>
              </>
            )}
          </div>
        )}

        {/* ── STEP 2: Results ── */}
        {step === 2 && optimResult && cvDataOptimized && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Resultats de l&apos;optimisation</h1>
              <p className="text-text-muted">Copiez chaque section optimisee dans votre editeur de CV.</p>
            </div>

            {/* Score + insights */}
            <div className="bg-surface rounded-2xl border border-border/60 p-6">
              <div className="flex flex-col md:flex-row gap-6 items-start">
                {optimResult.score_ats != null && (
                  <div className="flex-shrink-0">
                    <ATSScore score={optimResult.score_ats} />
                  </div>
                )}
                <div className="flex-1 grid md:grid-cols-2 gap-4">
                  {optimResult.points_forts?.length > 0 && (
                    <div className="bg-success/5 border border-success/10 rounded-xl p-4">
                      <div className="font-display font-bold text-success text-sm mb-2">Points forts</div>
                      <ul className="space-y-1.5">
                        {optimResult.points_forts.map((p, i) => (
                          <li key={i} className="text-xs text-text-secondary flex gap-2">
                            <span className="text-success shrink-0">{'\u2713'}</span><span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {optimResult.ameliorations?.length > 0 && (
                    <div className="bg-primary-light border border-primary/10 rounded-xl p-4">
                      <div className="font-display font-bold text-primary text-sm mb-2">Ameliorations</div>
                      <ul className="space-y-1.5">
                        {optimResult.ameliorations.map((a, i) => (
                          <li key={i} className="text-xs text-text-secondary flex gap-2">
                            <span className="text-primary shrink-0">+</span><span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Optimized sections */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-text-primary">Texte optimise par section</h2>
                <CopyButton
                  text={[
                    cvDataOptimized.titre_poste && `Titre: ${cvDataOptimized.titre_poste}`,
                    cvDataOptimized.resume && `\nResume:\n${cvDataOptimized.resume}`,
                    cvDataOptimized.experiences?.length && `\nExperiences:\n${formatExperiences(cvDataOptimized.experiences)}`,
                    cvDataOptimized.formations?.length && `\nFormations:\n${formatFormations(cvDataOptimized.formations)}`,
                    cvDataOptimized.competences_techniques && `\nCompetences techniques:\n${cvDataOptimized.competences_techniques}`,
                    cvDataOptimized.competences_soft && `\nSoft skills:\n${cvDataOptimized.competences_soft}`,
                    cvDataOptimized.langues && `\nLangues:\n${cvDataOptimized.langues}`,
                  ].filter(Boolean).join('\n')}
                  label="tout"
                />
              </div>

              {cvDataOptimized.titre_poste && (
                <div className="bg-surface rounded-2xl border border-border/60 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-display font-bold text-text-primary text-sm">Titre du poste</h3>
                    <CopyButton text={cvDataOptimized.titre_poste} />
                  </div>
                  <div className="p-3 bg-success/5 border border-success/10 rounded-xl">
                    <p className="text-sm text-text-secondary font-medium">{cvDataOptimized.titre_poste}</p>
                  </div>
                </div>
              )}

              <OptimizedSection title="Resume professionnel" optimizedText={cvDataOptimized.resume} />
              {cvDataOptimized.experiences?.length > 0 && <OptimizedSection title="Experiences professionnelles" optimizedText={formatExperiences(cvDataOptimized.experiences)} />}
              {cvDataOptimized.formations?.length > 0 && <OptimizedSection title="Formations" optimizedText={formatFormations(cvDataOptimized.formations)} />}
              <OptimizedSection title="Competences techniques" optimizedText={cvDataOptimized.competences_techniques} />
              <OptimizedSection title="Soft skills / Qualifications" optimizedText={cvDataOptimized.competences_soft} />
              <OptimizedSection title="Langues" optimizedText={cvDataOptimized.langues} />
            </div>

            {/* Navigation */}
            <div className="pt-4">
              <Button variant="outline" onClick={() => { setStep(1); setCvFile(null); setOptimResult(null); setCvDataOptimized(null) }}>
                Recommencer
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
