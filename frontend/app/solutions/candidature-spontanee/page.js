'use client';

import { useState, useEffect, useId } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { getUser } from '@/lib/auth';

import CatLoadingAnimation from '@/components/shared/CatLoadingAnimation';
import Header from '@/components/shared/Header';
import Button from '@/components/shared/Button';
import Alert from '@/components/shared/Alert';
import SpontaneTips from '@/components/shared/SpontaneTips';
import PdfDropzone from '@/components/shared/PdfDropzone';
import CopyButton from '@/components/shared/CopyButton';
import LoadingScreen from '@/components/shared/LoadingScreen';
import { IconClock } from '@/components/shared/icons';

import {
  sendSpontaneousApplication,
  generateFollowUp,
  markFollowUpSent,
} from '@/lib/api/candidatureSpontaneeApi';

const STEPS = [
  { n: 1, label: 'Saisie' },
  { n: 2, label: 'Envoi' },
  { n: 3, label: 'Confirmation' },
];

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CandidatureSpontaneePage() {
  const { user, loading, logout } = useAuth();

  const [step, setStep] = useState(1);
  const [cvFile, setCvFile] = useState(null);

  // Le candidat : ces deux champs ne sont pas decoratifs, voir plus bas.
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');

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
  const [userId, setUserId] = useState(null);

  const idBase = useId();
  const champ = (nom) => `${idBase}-${nom}`;

  useEffect(() => {
    getUser().then((utilisateur) => {
      setUserId(utilisateur?.id || null);
      // Pre-remplissage de l'email de reponse par celui du compte : dans la
      // quasi-totalite des cas c'est la bonne adresse, et un champ deja rempli
      // est un champ qu'on ne laisse pas vide par distraction. Il reste
      // modifiable, par exemple pour utiliser une adresse dediee a la
      // recherche d'emploi.
      // Le test EMAIL_VALIDE n'est pas de la paranoia : en mode local il n'y a
      // pas de compte, et getUser() renvoie le libelle « Vous » comme email.
      // Sans ce garde-fou, le champ se pre-remplissait avec « Vous ».
      if (utilisateur?.email && EMAIL_VALIDE.test(utilisateur.email)) {
        setCandidateEmail((actuel) => actuel || utilisateur.email);
      }
    });
  }, []);

  const _progressAnim = async (etapes) => {
    for (const [label, pct, ms] of etapes) {
      setProcessingLabel(label);
      setProgress(pct);
      await new Promise((r) => setTimeout(r, ms));
    }
  };

  const validate = () => {
    if (!cvFile) return 'Veuillez ajouter votre CV (PDF)';
    if (!candidateName.trim()) return 'Votre prenom et nom sont requis';
    if (!EMAIL_VALIDE.test(candidateEmail)) return 'Votre email est invalide';
    if (!EMAIL_VALIDE.test(recipientEmail)) return 'Email recruteur invalide';
    if (!targetPosition.trim()) return 'Poste vise requis';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setProcessing(true);
    setProgress(0);
    setStep(2);
    try {
      const [apiResult] = await Promise.all([
        sendSpontaneousApplication({
          cvFile,
          recipientEmail,
          targetPosition,
          company,
          contactName,
          candidateName: candidateName.trim(),
          candidateEmail: candidateEmail.trim(),
          userId,
        }),
        _progressAnim([
          ['Lecture de votre CV...', 15, 1200],
          ["Redaction de l'email par l'IA...", 45, 3000],
          ['Envoi de votre candidature...', 80, 1500],
        ]),
      ]);
      setProgress(100);
      setProcessingLabel('Termine !');
      await new Promise((r) => setTimeout(r, 600));
      setResult(apiResult);
      setStep(3);
    } catch (err) {
      setError(err.message || "Erreur lors de l'envoi");
      setStep(1);
    } finally {
      setProcessing(false);
    }
  };

  const handleGenerateFollowUp = async () => {
    if (!result?.application?.id || !userId) return;
    setGeneratingFollowUp(true);
    setError('');
    try {
      setFollowUpDraft(await generateFollowUp(result.application.id, userId));
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingFollowUp(false);
    }
  };

  /**
   * Marque la relance comme envoyee une fois le texte copie.
   * L'echec est silencieux VOLONTAIREMENT : la copie, elle, a reussi, et
   * afficher une erreur a ce moment-la ferait croire que le texte n'est pas
   * dans le presse-papiers. La candidature reapparaitra simplement dans les
   * relances a faire, ce qui est le comportement le moins genant.
   */
  const handleCopieRelance = async () => {
    if (!result?.application?.id || !userId) return;
    try {
      await markFollowUpSent(result.application.id, userId);
    } catch {
      /* voir le commentaire ci-dessus */
    }
  };

  const handleReset = () => {
    setStep(1);
    setCvFile(null);
    setRecipientEmail('');
    setTargetPosition('');
    setCompany('');
    setContactName('');
    setError('');
    setResult(null);
    setFollowUpDraft(null);
    setProgress(0);
    // candidateName et candidateEmail ne sont PAS remis a zero : ils decrivent
    // la personne, pas la candidature. Les effacer obligerait a les ressaisir
    // a chaque envoi, et c'est exactement le genre de friction qui pousse a
    // sauter le champ.
  };

  if (loading) {
    return <LoadingScreen message="Chargement de votre espace..." />;
  }

  const inputClass =
    'w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all';

  return (
    <div className="min-h-screen bg-background">
      <Header
        user={user}
        onLogout={logout}
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Candidature spontanee' }]}
        actions={
          <Link
            href="/solutions/matcher-offres/candidatures"
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-light text-primary text-xs font-semibold hover:bg-primary/15 transition-colors"
          >
            Mes candidatures
          </Link>
        }
      />

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Stepper */}
        <ol className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <li key={s.n} className="flex items-center gap-2" aria-current={step === s.n ? 'step' : undefined}>
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  step >= s.n ? 'bg-primary text-primary-foreground' : 'bg-surface-elevated text-text-muted'
                }`}
                aria-hidden="true"
              >
                {step > s.n ? '✓' : s.n}
              </span>
              <span
                className={`text-xs hidden sm:inline font-medium ${
                  step >= s.n ? 'text-text-primary' : 'text-text-muted'
                }`}
              >
                Etape {s.n} : {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <span className={`w-8 h-0.5 ${step > s.n ? 'bg-primary' : 'bg-border'}`} aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>

        {/* Etape 1 : formulaire */}
        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center">
              <h1 className="font-display text-2xl font-bold text-text-primary mb-2">Candidature Spontanee</h1>
              <p className="text-sm text-text-secondary">
                Deposez votre CV, dites-nous qui vous etes et a qui ecrire. L&apos;IA redige et envoie un email
                percutant, avec votre CV en piece jointe.
              </p>
            </div>

            {error && (
              <Alert variant="error" onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            {/* CV */}
            <div>
              <p className="block text-sm font-medium text-text-secondary mb-2">Votre CV (PDF) *</p>
              <PdfDropzone
                fichier={cvFile}
                onFichier={(fichier) => {
                  setCvFile(fichier);
                  setError('');
                }}
                tailleMaxMo={5}
                label="Deposez votre CV"
                disabled={processing}
              />
            </div>

            {/* Vous */}
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold text-text-primary mb-1">Vous</legend>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={champ('nom')} className="block text-sm font-medium text-text-secondary mb-2">
                    Votre prenom et nom *
                  </label>
                  <input
                    id={champ('nom')}
                    type="text"
                    autoComplete="name"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="Camille Durand"
                    className={inputClass}
                    aria-describedby={champ('nom-aide')}
                  />
                  {/* Le POURQUOI, dit a l'utilisateur et pas seulement au
                      developpeur : le nom devine a partir du CV donnait des
                      pieces jointes du genre « CV_Infirmier_Diplome_D_Etat.pdf ». */}
                  <p id={champ('nom-aide')} className="mt-1.5 text-xs text-text-muted">
                    Sert a nommer la piece jointe envoyee au recruteur.
                  </p>
                </div>

                <div>
                  <label htmlFor={champ('email')} className="block text-sm font-medium text-text-secondary mb-2">
                    Votre email *
                  </label>
                  <input
                    id={champ('email')}
                    type="email"
                    autoComplete="email"
                    value={candidateEmail}
                    onChange={(e) => setCandidateEmail(e.target.value)}
                    placeholder="camille.durand@email.com"
                    className={inputClass}
                    aria-describedby={champ('email-aide')}
                  />
                  <p id={champ('email-aide')} className="mt-1.5 text-xs text-text-muted">
                    C&apos;est a cette adresse que le recruteur repondra quand il cliquera sur « Repondre ».
                  </p>
                </div>
              </div>
            </fieldset>

            {/* Le destinataire */}
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold text-text-primary mb-1">La candidature</legend>

              <div>
                <label htmlFor={champ('recruteur')} className="block text-sm font-medium text-text-secondary mb-2">
                  Email du recruteur *
                </label>
                <input
                  id={champ('recruteur')}
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="recrutement@entreprise.com"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor={champ('poste')} className="block text-sm font-medium text-text-secondary mb-2">
                  Poste vise *
                </label>
                <input
                  id={champ('poste')}
                  type="text"
                  value={targetPosition}
                  onChange={(e) => setTargetPosition(e.target.value)}
                  placeholder="Developpeur Full-Stack, Chef de projet..."
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor={champ('entreprise')}
                    className="block text-sm font-medium text-text-secondary mb-2"
                  >
                    Entreprise <span className="text-text-muted">(recommande)</span>
                  </label>
                  <input
                    id={champ('entreprise')}
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Google, Ubisoft..."
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor={champ('contact')} className="block text-sm font-medium text-text-secondary mb-2">
                    Nom du contact <span className="text-text-muted">(optionnel)</span>
                  </label>
                  <input
                    id={champ('contact')}
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Dupont, Martin..."
                    className={inputClass}
                  />
                </div>
              </div>
            </fieldset>

            <SpontaneTips />

            <Button variant="primary" size="lg" onClick={handleSubmit} className="w-full" disabled={processing}>
              Envoyer ma candidature
            </Button>
          </div>
        )}

        {/* Etape 2 : traitement */}
        {step === 2 && (
          <div className="flex flex-col items-center gap-6 py-16 animate-fade-in" role="status" aria-live="polite">
            <CatLoadingAnimation />
            <div className="text-center space-y-3">
              <p className="text-text-secondary text-sm font-medium">{processingLabel}</p>
              <div
                className="w-64 h-2 bg-surface-elevated rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progression de l envoi"
              >
                <div
                  className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-text-muted">{progress}%</p>
            </div>
          </div>
        )}

        {/* Etape 3 : confirmation */}
        {step === 3 && result && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
                <svg
                  className="w-7 h-7 text-success"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h2 className="font-display text-xl font-bold text-text-primary">Candidature envoyee !</h2>
              <p className="text-sm text-text-secondary">
                Email envoye a <span className="font-semibold text-primary">{recipientEmail}</span> avec votre CV.
              </p>
              {candidateEmail && (
                <p className="text-sm text-text-muted">
                  Sa reponse arrivera sur <span className="font-medium text-text-secondary">{candidateEmail}</span>.
                </p>
              )}
            </div>

            {/* Apercu de l'email */}
            <div className="bg-surface rounded-2xl border border-border/60 p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs text-text-muted">
                  <span className="font-semibold text-text-secondary">Objet :</span>{' '}
                  {result.generatedEmail?.subject}
                </div>
                <CopyButton
                  texte={`Objet : ${result.generatedEmail?.subject || ''}\n\n${result.generatedEmail?.body || ''}`}
                  label="Copier l email"
                />
              </div>
              <hr className="border-border" />
              <pre className="text-sm text-text-primary whitespace-pre-wrap font-body leading-relaxed">
                {result.generatedEmail?.body}
              </pre>
            </div>

            {/* Relance */}
            {result.followUpDate && (
              <div className="bg-warning/5 border border-warning/20 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <IconClock className="w-5 h-5 text-warning shrink-0" />
                  <p className="text-sm text-warning font-medium">
                    Relance suggeree le{' '}
                    {new Date(result.followUpDate).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </p>
                </div>
                {/* La date est aussi enregistree dans le suivi de candidatures :
                    on le dit ici, sinon la relance disparait des qu'on quitte
                    cet ecran et personne ne sait ou la retrouver. */}
                <p className="text-xs text-text-secondary">
                  Elle apparaitra automatiquement dans{' '}
                  <Link
                    href="/solutions/matcher-offres/candidatures"
                    className="font-semibold text-primary hover:underline"
                  >
                    Mes candidatures
                  </Link>{' '}
                  le jour venu. Rien a noter dans un agenda.
                </p>

                {!followUpDraft ? (
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={handleGenerateFollowUp}
                    disabled={generatingFollowUp}
                    loading={generatingFollowUp}
                  >
                    {generatingFollowUp ? 'Generation en cours...' : 'Generer un email de relance'}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-surface rounded-xl p-4 space-y-2">
                      <div className="text-xs text-text-muted">
                        <span className="font-semibold">Objet :</span> {followUpDraft.subject}
                      </div>
                      <hr className="border-border" />
                      <pre className="text-sm text-text-primary whitespace-pre-wrap font-body leading-relaxed">
                        {followUpDraft.body}
                      </pre>
                    </div>
                    <CopyButton
                      texte={`Objet : ${followUpDraft.subject}\n\n${followUpDraft.body}`}
                      label="Copier la relance"
                      onCopie={handleCopieRelance}
                    />
                  </div>
                )}
              </div>
            )}

            {error && (
              <Alert variant="error" onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleReset} className="flex-1">
                Nouvelle candidature
              </Button>
              <Link href="/solutions/matcher-offres/candidatures" className="flex-1">
                <Button variant="primary" className="w-full">
                  Voir mes candidatures
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
