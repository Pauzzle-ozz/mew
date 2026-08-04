'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getUser, signOut } from '@/lib/auth';

import CatLoadingAnimation from '@/components/shared/CatLoadingAnimation';
import Header from '@/components/shared/Header';
import Button from '@/components/shared/Button';
import Alert from '@/components/shared/Alert';
import SpontaneTips from '@/components/shared/SpontaneTips';
import Logo from '@/components/shared/Logo';

import { sendSpontaneousApplication, generateFollowUp, markFollowUpSent } from '@/lib/api/candidatureSpontaneeApi';

const STEPS = [
  { n: 1, label: 'Saisie' },
  { n: 2, label: 'Envoi' },
  { n: 3, label: 'Confirmation' },
];

export default function CandidatureSpontaneePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const handleLogout = async () => { if (await signOut()) router.push('/login'); };

  const [step, setStep] = useState(1);
  const [cvFile, setCvFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [targetPosition, setTargetPosition] = useState('');
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [followUpDraft, setFollowUpDraft] = useState(null);
  const [generatingFollowUp, setGeneratingFollowUp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    getUser().then((u) => setUserId(u?.id || null));
  }, []);

  const _progressAnim = async (steps) => {
    for (const [label, pct, ms] of steps) {
      setProcessingLabel(label); setProgress(pct);
      await new Promise(r => setTimeout(r, ms));
    }
  };

  const validate = () => {
    if (!cvFile) return 'Veuillez ajouter votre CV (PDF)';
    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) return 'Email recruteur invalide';
    if (!targetPosition.trim()) return 'Poste vise requis';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError(''); setProcessing(true); setProgress(0); setStep(2);
    try {
      const [apiResult] = await Promise.all([
        sendSpontaneousApplication(cvFile, recipientEmail, targetPosition, company, contactName, userId),
        _progressAnim([
          ['Lecture de votre CV...', 15, 1200],
          ["Redaction de l'email par l'IA...", 45, 3000],
          ['Envoi de votre candidature...', 80, 1500],
        ])
      ]);
      setProgress(100); setProcessingLabel('Termine !');
      await new Promise(r => setTimeout(r, 600));
      setResult(apiResult); setStep(3);
    } catch (err) {
      setError(err.message || "Erreur lors de l'envoi"); setStep(1);
    } finally { setProcessing(false); }
  };

  const handleGenerateFollowUp = async () => {
    if (!result?.application?.id || !userId) return;
    setGeneratingFollowUp(true); setError('');
    try { setFollowUpDraft(await generateFollowUp(result.application.id, userId)); }
    catch (err) { setError(err.message); }
    finally { setGeneratingFollowUp(false); }
  };

  const handleCopyFollowUp = async () => {
    if (!followUpDraft) return;
    await navigator.clipboard.writeText(`Objet : ${followUpDraft.subject}\n\n${followUpDraft.body}`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
    if (result?.application?.id && userId) { try { await markFollowUpSent(result.application.id, userId); } catch {} }
  };

  const handleReset = () => {
    setStep(1); setCvFile(null); setRecipientEmail(''); setTargetPosition('');
    setCompany(''); setContactName(''); setError(''); setResult(null);
    setFollowUpDraft(null); setProgress(0); setCopied(false);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') { setCvFile(file); setError(''); }
    else setError('Seuls les fichiers PDF sont acceptes');
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file?.type === 'application/pdf') { setCvFile(file); setError(''); }
    else if (file) setError('Seuls les fichiers PDF sont acceptes');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <Logo size="md" link={false} />
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const inputClass = 'w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all';

  return (
    <div className="min-h-screen bg-background">
      <Header
        user={user} onLogout={handleLogout}
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Candidature spontanee' }]}
        actions={
          <Link href="/solutions/matcher-offres/candidatures" className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-light text-primary text-xs font-semibold hover:bg-primary/15 transition-colors">
            Mes candidatures
          </Link>
        }
      />

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                step >= s.n ? 'bg-primary text-primary-foreground' : 'bg-surface-elevated text-text-muted'
              }`}>
                {step > s.n ? '\u2713' : s.n}
              </div>
              <span className={`text-xs hidden sm:inline font-medium ${step >= s.n ? 'text-text-primary' : 'text-text-muted'}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <div className={`w-8 h-0.5 ${step > s.n ? 'bg-primary' : 'bg-border'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Form */}
        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center">
              <h1 className="font-display text-2xl font-bold text-text-primary mb-2">Candidature Spontanee</h1>
              <p className="text-sm text-text-secondary">
                Uploadez votre CV, indiquez le poste et l&apos;email du recruteur. L&apos;IA redige et envoie un email percutant.
              </p>
            </div>

            {error && <Alert variant="error" onClose={() => setError('')}>{error}</Alert>}

            {/* CV Upload */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Votre CV (PDF) *</label>
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  isDragging ? 'border-primary bg-primary-light scale-[1.01]' :
                  cvFile ? 'border-success/50 bg-success/5' : 'border-border hover:border-primary/40 hover:bg-primary-light'
                }`}
              >
                <input ref={fileRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
                {cvFile ? (
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center mx-auto">
                      <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="font-semibold text-text-primary">{cvFile.name}</p>
                    <button onClick={(e) => { e.stopPropagation(); setCvFile(null); }} className="text-xs text-error hover:underline cursor-pointer">
                      Retirer
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center mx-auto">
                      <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                    </div>
                    <p className="text-sm text-text-secondary">Glissez votre CV ici ou <span className="text-primary font-medium">parcourez</span></p>
                    <p className="text-xs text-text-muted">PDF uniquement, max 5 Mo</p>
                  </div>
                )}
              </div>
            </div>

            {/* Fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Email du recruteur *</label>
                <input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="recrutement@entreprise.com" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Poste vise *</label>
                <input type="text" value={targetPosition} onChange={(e) => setTargetPosition(e.target.value)} placeholder="Developpeur Full-Stack, Chef de projet..." className={inputClass} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">Entreprise <span className="text-text-muted">(recommande)</span></label>
                  <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Google, Ubisoft..." className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">Nom du contact <span className="text-text-muted">(optionnel)</span></label>
                  <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Dupont, Martin..." className={inputClass} />
                </div>
              </div>
            </div>

            <SpontaneTips />

            <Button variant="primary" size="lg" onClick={handleSubmit} className="w-full">
              Envoyer ma candidature
            </Button>
          </div>
        )}

        {/* Step 2: Processing */}
        {step === 2 && (
          <div className="flex flex-col items-center gap-6 py-16 animate-fade-in">
            <CatLoadingAnimation />
            <div className="text-center space-y-3">
              <p className="text-text-secondary text-sm font-medium">{processingLabel}</p>
              <div className="w-64 h-2 bg-surface-elevated rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-text-muted">{progress}%</p>
            </div>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === 3 && result && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="font-display text-xl font-bold text-text-primary">Candidature envoyee !</h2>
              <p className="text-sm text-text-secondary">
                Email envoye a <span className="font-semibold text-primary">{recipientEmail}</span> avec votre CV.
              </p>
            </div>

            {/* Email preview */}
            <div className="bg-surface rounded-2xl border border-border/60 p-5 space-y-3">
              <div className="text-xs text-text-muted">
                <span className="font-semibold text-text-secondary">Objet :</span> {result.generatedEmail?.subject}
              </div>
              <hr className="border-border" />
              <pre className="text-sm text-text-primary whitespace-pre-wrap font-body leading-relaxed">
                {result.generatedEmail?.body}
              </pre>
            </div>

            {/* Follow-up */}
            {result.followUpDate && (
              <div className="bg-warning/5 border border-warning/20 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-warning shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-warning font-medium">
                    Relance suggeree le {new Date(result.followUpDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                </div>
                {!followUpDraft ? (
                  <button onClick={handleGenerateFollowUp} disabled={generatingFollowUp} className="text-sm text-warning hover:underline disabled:opacity-50 cursor-pointer">
                    {generatingFollowUp ? 'Generation en cours...' : 'Generer un email de relance'}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-surface rounded-xl p-4 space-y-2">
                      <div className="text-xs text-text-muted"><span className="font-semibold">Objet :</span> {followUpDraft.subject}</div>
                      <hr className="border-border" />
                      <pre className="text-sm text-text-primary whitespace-pre-wrap font-body leading-relaxed">{followUpDraft.body}</pre>
                    </div>
                    <Button variant="soft" size="sm" onClick={handleCopyFollowUp}>
                      {copied ? '\u2713 Copie !' : 'Copier dans le presse-papiers'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {error && <Alert variant="error" onClose={() => setError('')}>{error}</Alert>}

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleReset} className="flex-1">Nouvelle candidature</Button>
              <Link href="/solutions/matcher-offres/candidatures" className="flex-1">
                <Button variant="primary" className="w-full">Voir mes candidatures</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
