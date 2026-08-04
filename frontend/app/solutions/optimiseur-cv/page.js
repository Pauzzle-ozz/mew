'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import ErrorMessage from '@/components/shared/ErrorMessage'
import Header from '@/components/shared/Header'
import Button from '@/components/shared/Button'
import CatLoadingAnimation from '@/components/shared/CatLoadingAnimation'
import ToolHistory from '@/components/shared/ToolHistory'
import LoadingScreen from '@/components/shared/LoadingScreen'
import CopyButton from '@/components/shared/CopyButton'
import PdfDropzone from '@/components/shared/PdfDropzone'
import ScoreDetail from '@/components/shared/ScoreDetail'
import AvertissementLecturePdf from '@/components/shared/AvertissementLecturePdf'
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
      {/* role="img" + aria-label : le <text> dans un SVG n'est pas lu de facon
          fiable par tous les lecteurs d'ecran. On donne la phrase complete. */}
      <svg viewBox="0 0 100 60" className="w-36 h-24" role="img" aria-label={`Score ATS : ${score} sur 100 — ${label}`}>
        <path d="M 10 55 A 40 40 0 0 1 90 55" fill="none" stroke="var(--border)" strokeWidth="8" strokeLinecap="round" />
        <path d="M 10 55 A 40 40 0 0 1 90 55" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${score * 1.257} 200`} style={{ transition: 'stroke-dasharray 1s ease' }} />
        <text x="50" y="50" textAnchor="middle" fill={color} fontSize="20" fontWeight="bold" fontFamily="var(--font-syne)">{score}</text>
      </svg>
      <div className="text-sm font-bold mt-1" style={{ color }} aria-hidden="true">{label}</div>
      <div className="text-xs text-text-muted" aria-hidden="true">Score ATS /100</div>
    </div>
  )
}

/* ─── Optimized section ─── */
function OptimizedSection({ title, optimizedText }) {
  if (!optimizedText) return null
  return (
    <div className="bg-surface rounded-2xl border border-border/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-bold text-text-primary text-sm">{title}</h3>
        <CopyButton texte={optimizedText} label={`Copier ${title.toLowerCase()}`} />
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
  const { user, loading, logout } = useAuth()

  const [processing, setProcessing] = useState(false)
  const [step, setStep] = useState(1)
  const [cvFile, setCvFile] = useState(null)
  const [posteCible, setPosteCible] = useState('')
  const [localError, setLocalError] = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  // On garde la reponse du backend telle quelle, au lieu d'en recopier trois
  // champs dans trois etats separes : le jour ou le backend en ajoute un
  // (c'est ce qui vient de se passer avec score_detail), il n'y a rien a
  // rebrancher. Les champs absents des resultats archives valent simplement
  // undefined, et chaque bloc d'affichage teste leur presence.
  const [resultat, setResultat] = useState(null)

  const cvOptimise = resultat?.cvData_optimise

  // PdfDropzone valide le fichier et affiche lui-meme le refus.
  const handleFichier = (fichier) => {
    setLocalError(null)
    setCvFile(fichier)
  }

  const handlePdfOptimization = async (e) => {
    e.preventDefault(); setLocalError(null)
    if (!cvFile) { setLocalError('Choisis d\'abord un CV au format PDF.'); return }
    setProcessing(true)
    try {
      const reponse = await cvApi.optimizeCVPDF(cvFile, user.id, posteCible)
      if (!reponse.success) throw new Error(reponse.error || 'Erreur lors de l\'optimisation')

      const data = reponse.data
      setResultat(data)
      setProcessing(false)
      setStep(2)

      const contact = data.profil_extrait?.contact || {}
      const identite = `${data.cvData_optimise?.prenom || contact.prenom || ''} ${data.cvData_optimise?.nom || contact.nom || ''}`.trim()

      saveHistoryEntry({
        userId: user.id, toolType: 'optimiseur-cv',
        title: identite ? `Optimisation CV - ${identite}` : 'Optimisation CV',
        inputSummary: { poste_cible: posteCible || data.cvData_optimise?.titre_poste, methode: 'upload' },
        resultSummary: { score_ats: data.score_ats, fullResult: data }
      }).catch(() => {})
    } catch (err) {
      setProcessing(false)
      setLocalError(err.message)
    }
  }

  const recommencer = () => {
    setStep(1)
    setCvFile(null)
    setResultat(null)
    setLocalError(null)
  }

  if (loading) return <LoadingScreen message="Chargement de ton espace" />

  return (
    <div className="min-h-screen bg-background">
      <Header
        user={user} onLogout={logout}
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
                setResultat(full); setStep(2); setShowHistory(false)
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
                  <label htmlFor="poste-cible" className="font-display text-sm font-bold text-primary block">
                    Poste cible (optionnel mais recommande)
                  </label>
                  <p id="poste-cible-aide" className="text-xs text-text-muted mt-1 mb-3">
                    L&apos;IA adaptera les mots-cles et le resume pour ce poste. Sans poste cible, le critere
                    « mots-cles de l&apos;offre » ne peut pas etre mesure : il sort du score au lieu de te penaliser.
                  </p>
                  <input
                    id="poste-cible"
                    type="text"
                    aria-describedby="poste-cible-aide"
                    placeholder="Ex: Developpeur Full Stack React / Chef de projet digital"
                    value={posteCible}
                    onChange={e => setPosteCible(e.target.value)}
                    className="w-full px-4 py-3 border border-border rounded-xl bg-background text-text-primary placeholder-text-muted focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none text-sm transition-all"
                  />
                </div>

                {/* ErrorMessage monte lui-meme sa region d'alerte en
                    permanence : ne pas l'envelopper dans un second
                    role="alert", les regions imbriquees se neutralisent. */}
                <ErrorMessage message={localError} onClose={() => setLocalError(null)} />

                {/* Upload zone */}
                <form onSubmit={handlePdfOptimization}>
                  <PdfDropzone
                    fichier={cvFile}
                    onFichier={handleFichier}
                    tailleMaxMo={5}
                    label="Depose ton CV"
                    description="PDF, 5 Mo max — une seule colonne de preference, c'est ce que lisent le mieux les logiciels de recrutement"
                    className="mb-6"
                  />

                  <Button type="submit" variant="primary" size="lg" disabled={!cvFile} className="w-full">
                    Optimiser mon CV avec l&apos;IA
                  </Button>
                </form>
              </>
            )}
          </div>
        )}

        {/* ── STEP 2: Results ──
            Condition sur `resultat` seulement : en mode degrade il n'y a PAS de
            CV reecrit, mais il y a un score, son detail et les corrections a
            faire. Exiger le CV reecrit ici affichait un ecran vide alors que
            l'essentiel etait disponible. */}
        {step === 2 && resultat && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Resultats de l&apos;optimisation</h1>
              <p className="text-text-muted">
                {cvOptimise
                  ? 'Copiez chaque section optimisee dans votre editeur de CV.'
                  : 'Voici votre score detaille et ce qu\'il faut corriger.'}
              </p>
            </div>

            {/* Fiabilite de la lecture du PDF : a lire avant le score, puisque
                c'est elle qui dit avec quelle marge d'erreur l'interpreter. */}
            <AvertissementLecturePdf confiance={resultat.profil_extrait?.confiance} />

            {/* Mode degrade : pas de cle API, donc pas de reecriture. Le reste
                fonctionne — on le dit sans en faire un drame. */}
            {resultat.degraded && (
              <div className="rounded-2xl border border-info/30 bg-info/8 p-5">
                <h2 className="text-sm font-bold text-info">La reecriture automatique n&apos;est pas activee</h2>
                <p className="mt-1.5 text-sm text-text-secondary">
                  Aucune cle API n&apos;est configuree sur cette installation, donc l&apos;IA n&apos;a pas
                  reecrit votre CV. Tout le reste est bien la : le score, le detail de son calcul et la liste
                  des corrections a apporter. Ce sont des corrections que vous pouvez faire vous-meme, dans
                  l&apos;ordre indique ci-dessous.
                </p>
                <p className="mt-1.5 text-xs text-text-muted">
                  Pour activer la reecriture : ajoutez une cle dans le fichier <code>backend/src/.env</code>
                  {' '}(voir <code>backend/.env.example</code>).
                </p>
              </div>
            )}

            {/* Score + insights */}
            <div className="bg-surface rounded-2xl border border-border/60 p-6">
              <div className="flex flex-col md:flex-row gap-6 items-start">
                {resultat.score_ats != null && (
                  <div className="flex-shrink-0">
                    <ATSScore score={resultat.score_ats} />
                  </div>
                )}
                <div className="flex-1 grid md:grid-cols-2 gap-4">
                  {resultat.points_forts?.length > 0 && (
                    <div className="bg-success/5 border border-success/10 rounded-xl p-4">
                      <h2 className="font-display font-bold text-success text-sm mb-2">Points forts</h2>
                      <ul className="space-y-1.5">
                        {resultat.points_forts.map((p, i) => (
                          <li key={i} className="text-xs text-text-secondary flex gap-2">
                            <span className="text-success shrink-0" aria-hidden="true">{'\u2713'}</span><span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {resultat.ameliorations?.length > 0 && (
                    <div className="bg-primary-light border border-primary/10 rounded-xl p-4">
                      <h2 className="font-display font-bold text-primary text-sm mb-1">Ameliorations</h2>
                      {/* Le backend a deja classe cette liste : la correction la
                          plus rentable en premier (ajouter un telephone : dix
                          secondes) avant la plus couteuse (reecrire toutes ses
                          puces : une heure). On l'affiche dans cet ordre exact,
                          surtout on ne la retrie pas. */}
                      <p className="text-[11px] text-text-muted mb-2">Par ordre de priorite : commencez par la premiere.</p>
                      <ol className="space-y-1.5">
                        {resultat.ameliorations.map((a, i) => (
                          <li key={i} className="text-xs text-text-secondary flex gap-2">
                            <span className="text-primary shrink-0 font-semibold tabular-nums">{i + 1}.</span><span>{a}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Detail du calcul, sous la jauge. Absent des resultats archives :
                le composant ne rend alors rien du tout. */}
            <ScoreDetail detail={resultat.score_detail} />

            {/* Optimized sections */}
            {cvOptimise && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-text-primary">Texte optimise par section</h2>
                  <CopyButton
                    texte={[
                      cvOptimise.titre_poste && `Titre: ${cvOptimise.titre_poste}`,
                      cvOptimise.resume && `\nResume:\n${cvOptimise.resume}`,
                      cvOptimise.experiences?.length && `\nExperiences:\n${formatExperiences(cvOptimise.experiences)}`,
                      cvOptimise.formations?.length && `\nFormations:\n${formatFormations(cvOptimise.formations)}`,
                      cvOptimise.competences_techniques && `\nCompetences techniques:\n${cvOptimise.competences_techniques}`,
                      cvOptimise.competences_soft && `\nSoft skills:\n${cvOptimise.competences_soft}`,
                      cvOptimise.langues && `\nLangues:\n${cvOptimise.langues}`,
                    ].filter(Boolean).join('\n')}
                    label="Copier tout le CV"
                  />
                </div>

                {cvOptimise.titre_poste && (
                  <div className="bg-surface rounded-2xl border border-border/60 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-display font-bold text-text-primary text-sm">Titre du poste</h3>
                      <CopyButton texte={cvOptimise.titre_poste} label="Copier le titre" />
                    </div>
                    <div className="p-3 bg-success/5 border border-success/10 rounded-xl">
                      <p className="text-sm text-text-secondary font-medium">{cvOptimise.titre_poste}</p>
                    </div>
                  </div>
                )}

                <OptimizedSection title="Resume professionnel" optimizedText={cvOptimise.resume} />
                {cvOptimise.experiences?.length > 0 && <OptimizedSection title="Experiences professionnelles" optimizedText={formatExperiences(cvOptimise.experiences)} />}
                {cvOptimise.formations?.length > 0 && <OptimizedSection title="Formations" optimizedText={formatFormations(cvOptimise.formations)} />}
                <OptimizedSection title="Competences techniques" optimizedText={cvOptimise.competences_techniques} />
                <OptimizedSection title="Soft skills / Qualifications" optimizedText={cvOptimise.competences_soft} />
                <OptimizedSection title="Langues" optimizedText={cvOptimise.langues} />
              </div>
            )}

            {/* Navigation */}
            <div className="pt-4">
              <Button variant="outline" onClick={recommencer}>
                Recommencer
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
