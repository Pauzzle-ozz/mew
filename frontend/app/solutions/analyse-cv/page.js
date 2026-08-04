'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useCVAnalyzer } from '@/hooks/useCVAnalyzer'
import ErrorMessage from '@/components/shared/ErrorMessage'
import ResultsDisplay from '@/components/cv/ResultsDisplay'
import AnalyzerForm from '@/components/cv/AnalyzerForm'
import CatLoadingAnimation from '@/components/shared/CatLoadingAnimation'
import ToolHistory from '@/components/shared/ToolHistory'
import Header from '@/components/shared/Header'
import LoadingScreen from '@/components/shared/LoadingScreen'
import Button from '@/components/shared/Button'
import PdfDropzone from '@/components/shared/PdfDropzone'
import { saveHistoryEntry } from '@/lib/api/historyApi'

const PROFIL_VIDE = {
  prenom: '', nom: '', niveau_experience: 'Junior', annees_experience: '',
  statut: 'En recherche active', experience: '', competences_principales: '',
  outils: '', soft_skills: '', secteur_preferentiel: '', type_poste: ''
}

export default function AnalyseCVPage() {
  const { user, loading, logout } = useAuth()
  const { processing, result, setResult, error, setError, analyzeWithForm, analyzeWithPDF, reset } = useCVAnalyzer()

  const [inputMethod, setInputMethod] = useState('upload')
  const [cvFile, setCvFile] = useState(null)
  const [localError, setLocalError] = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  const [formData, setFormData] = useState(PROFIL_VIDE)

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value })

  // PdfDropzone valide lui-meme le fichier (format, poids, fichier vide) et
  // affiche son propre message. La page n'a donc plus qu'a retenir le fichier
  // accepte — et a effacer une eventuelle erreur precedente.
  const handleFichier = (fichier) => {
    setLocalError(null)
    setCvFile(fichier)
  }

  const handlePdfAnalysis = async (e) => {
    e.preventDefault()
    if (!cvFile) { setLocalError('Choisis d\'abord un CV au format PDF.'); return }
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

  /**
   * Remise a zero complete, sans rechargement de page : on efface le resultat
   * et l'erreur du hook, le fichier choisi et l'erreur locale.
   */
  const nouvelleAnalyse = () => {
    reset()
    setCvFile(null)
    setLocalError(null)
  }

  if (loading) return <LoadingScreen message="Chargement de ton espace" />

  return (
    <div className="min-h-screen bg-background">
      <Header
        user={user}
        onLogout={logout}
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
              <Button variant="outline" size="sm" onClick={nouvelleAnalyse}>Nouvelle analyse</Button>
            </div>
            <ResultsDisplay result={result} onReset={nouvelleAnalyse} />
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
                aria-pressed={inputMethod === 'upload'}
                className={`p-5 rounded-2xl border-2 transition-all text-left cursor-pointer ${
                  inputMethod === 'upload'
                    ? 'border-primary bg-primary-light shadow-sm'
                    : 'border-border hover:border-primary/30'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true" focusable="false">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <h3 className="font-display font-bold text-text-primary mb-1">Upload CV PDF</h3>
                <p className="text-sm text-text-muted">Rapide et automatique. Glissez votre fichier.</p>
              </button>

              <button
                type="button"
                onClick={() => setInputMethod('form')}
                aria-pressed={inputMethod === 'form'}
                className={`p-5 rounded-2xl border-2 transition-all text-left cursor-pointer ${
                  inputMethod === 'form'
                    ? 'border-primary bg-primary-light shadow-sm'
                    : 'border-border hover:border-primary/30'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true" focusable="false">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </div>
                <h3 className="font-display font-bold text-text-primary mb-1">Formulaire manuel</h3>
                <p className="text-sm text-text-muted">Remplissez vos informations pas a pas.</p>
              </button>
            </div>

            {/* ErrorMessage monte lui-meme sa region d'alerte en permanence :
                pas de conteneur role="alert" ici, deux regions imbriquees se
                neutralisent. */}
            {/* La croix de fermeture doit effacer LES DEUX sources d'erreur :
                avant, elle ne vidait que l'erreur locale et un message venu
                du hook restait affiche, comme si le bouton etait casse. */}
            <ErrorMessage
              message={localError || error}
              onClose={() => { setLocalError(null); setError(null) }}
            />

            {/* Upload mode */}
            {inputMethod === 'upload' && (
              <form onSubmit={handlePdfAnalysis}>
                <PdfDropzone
                  fichier={cvFile}
                  onFichier={handleFichier}
                  tailleMaxMo={5}
                  label="Depose ton CV"
                  description="PDF, 5 Mo max — une seule colonne de preference, c'est ce que lisent le mieux les logiciels de recrutement"
                  disabled={processing}
                  className="mb-6"
                />

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
