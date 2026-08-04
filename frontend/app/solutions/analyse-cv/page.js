'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useCVAnalyzer } from '@/hooks/useCVAnalyzer'
import { validatePDF } from '@/lib/utils/fileHelpers'
import { signOut } from '@/lib/auth'
import ErrorMessage from '@/components/shared/ErrorMessage'
import ResultsDisplay from '@/components/cv/ResultsDisplay'
import AnalyzerForm from '@/components/cv/AnalyzerForm'
import CatLoadingAnimation from '@/components/shared/CatLoadingAnimation'
import ToolHistory from '@/components/shared/ToolHistory'
import Header from '@/components/shared/Header'
import Logo from '@/components/shared/Logo'
import Button from '@/components/shared/Button'
import { saveHistoryEntry } from '@/lib/api/historyApi'

export default function AnalyseCVPage() {
  const { user, loading } = useAuth()
  const { processing, result, setResult, error, analyzeWithForm, analyzeWithPDF } = useCVAnalyzer()
  const router = useRouter()

  const [inputMethod, setInputMethod] = useState('upload')
  const [cvFile, setCvFile] = useState(null)
  const [localError, setLocalError] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const [formData, setFormData] = useState({
    prenom: '', nom: '', niveau_experience: 'Junior', annees_experience: '',
    statut: 'En recherche active', experience: '', competences_principales: '',
    outils: '', soft_skills: '', secteur_preferentiel: '', type_poste: ''
  })

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value })

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

  const handlePdfAnalysis = async (e) => {
    e.preventDefault()
    if (!cvFile) { setLocalError('Veuillez selectionner un fichier CV'); return }
    try {
      const res = await analyzeWithPDF(cvFile, user.id)
      saveHistoryEntry({
        userId: user.id, toolType: 'analyse-cv',
        title: `Analyse CV PDF - ${cvFile.name}`,
        inputSummary: { fichier: cvFile.name },
        resultSummary: { metiers: res?.metiers_proposes?.slice(0, 3)?.map(m => m.intitule), fullResult: res }
      }).catch(() => {})
    } catch {}
  }

  const handleFormSubmit = async (e) => {
    e.preventDefault()
    try {
      const res = await analyzeWithForm(formData, user.id)
      saveHistoryEntry({
        userId: user.id, toolType: 'analyse-cv',
        title: `Analyse CV - ${formData.prenom} ${formData.nom}`,
        inputSummary: { prenom: formData.prenom, nom: formData.nom, type_poste: formData.type_poste },
        resultSummary: { metiers: res?.metiers_proposes?.slice(0, 3)?.map(m => m.intitule), fullResult: res }
      }).catch(() => {})
    } catch {}
  }

  const handleLogout = async () => { if (await signOut()) router.push('/login') }

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
        user={user}
        onLogout={handleLogout}
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Analyseur CV' }]}
        actions={
          <button
            onClick={() => setShowHistory(true)}
            className="px-3 py-1.5 text-xs font-semibold rounded-full bg-primary-light text-primary hover:bg-primary/15 transition-colors cursor-pointer"
          >
            Historique
          </button>
        }
      />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {showHistory && (
          <ToolHistory
            userId={user.id}
            defaultToolType="analyse-cv"
            onClose={() => setShowHistory(false)}
            onLoad={(entry) => {
              const fullResult = entry.result_summary?.fullResult
              if (fullResult) { setResult(fullResult); setShowHistory(false) }
            }}
          />
        )}

        {result ? (
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h1 className="font-display text-2xl font-bold text-text-primary">Resultats de l&apos;analyse</h1>
              <Button variant="outline" size="sm" onClick={() => setResult(null)}>Nouvelle analyse</Button>
            </div>
            <ResultsDisplay result={result} />
          </div>
        ) : (
          <div className="animate-fade-in">
            {/* Page header */}
            <div className="mb-8">
              <h1 className="font-display text-3xl font-bold text-text-primary mb-2">Analyseur de CV</h1>
              <p className="text-text-secondary">
                Uploadez votre CV PDF ou remplissez le formulaire. L&apos;IA analyse votre profil et propose des metiers adaptes.
              </p>
            </div>

            {/* Method selector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <button
                type="button"
                onClick={() => setInputMethod('upload')}
                className={`p-5 rounded-2xl border-2 transition-all text-left cursor-pointer ${
                  inputMethod === 'upload'
                    ? 'border-primary bg-primary-light shadow-sm'
                    : 'border-border hover:border-primary/30'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <h3 className="font-display font-bold text-text-primary mb-1">Upload CV PDF</h3>
                <p className="text-sm text-text-muted">Rapide et automatique. Glissez votre fichier.</p>
              </button>

              <button
                type="button"
                onClick={() => setInputMethod('form')}
                className={`p-5 rounded-2xl border-2 transition-all text-left cursor-pointer ${
                  inputMethod === 'form'
                    ? 'border-primary bg-primary-light shadow-sm'
                    : 'border-border hover:border-primary/30'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </div>
                <h3 className="font-display font-bold text-text-primary mb-1">Formulaire manuel</h3>
                <p className="text-sm text-text-muted">Remplissez vos informations pas a pas.</p>
              </button>
            </div>

            <ErrorMessage message={localError || error} onClose={() => setLocalError(null)} />

            {/* Upload mode */}
            {inputMethod === 'upload' && (
              <form onSubmit={handlePdfAnalysis}>
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

                {processing ? (
                  <div className="flex justify-center py-6">
                    <CatLoadingAnimation label="Analyse de votre CV en cours" />
                  </div>
                ) : (
                  <Button type="submit" variant="primary" size="lg" disabled={!cvFile} className="w-full">
                    Analyser mon CV
                  </Button>
                )}
              </form>
            )}

            {/* Form mode */}
            {inputMethod === 'form' && (
              <AnalyzerForm formData={formData} onChange={handleChange} onSubmit={handleFormSubmit} processing={processing} />
            )}
          </div>
        )}
      </main>
    </div>
  )
}
