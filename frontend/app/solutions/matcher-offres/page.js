'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getUser, signOut } from '@/lib/auth';

// Composants matcher
import OfferForm from '@/components/matcher/OfferForm';
import CandidateProfileForm from '@/components/matcher/CandidateProfileForm';
import MatcherTransparency from '@/components/matcher/MatcherTransparency';
import OfferDiscovery from '@/components/matcher/OfferDiscovery';
import UrlScraper from '@/components/matcher/UrlScraper';

// Composants partagés
import CatLoadingAnimation from '@/components/shared/CatLoadingAnimation';
import ToolHistory from '@/components/shared/ToolHistory';
import Header from '@/components/shared/Header';
import Button from '@/components/shared/Button';

// APIs
import { analyzeOffer, analyzeScrapedOffer, generateComplete, extractCandidateFromCVFile } from '@/lib/api/matcherApi';
import { saveHistoryEntry } from '@/lib/api/historyApi';
import { createApplication } from '@/lib/api/applicationsApi';

// ── Étapes ───────────────────────────────────────────────────────────
const STEPS = [
  { n: 1, label: 'Saisie' },
  { n: 2, label: 'Résultats' },
];

/* ─── Bouton copier avec feedback ─────────────────────── */
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
          : 'bg-primary-light text-primary border border-primary/20 hover:bg-primary/20'
      }`}
    >
      {copied ? '✓ Copié !' : `Copier ${label || ''}`}
    </button>
  );
}

/* ─── Section de texte optimisé ───────────────────────── */
function OptimizedSection({ title, icon, optimizedText }) {
  if (!optimizedText) return null;

  return (
    <div className="bg-surface-glass backdrop-blur-xl rounded-2xl border border-border/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-display font-semibold text-white text-sm">{title}</h3>
        </div>
        <CopyButton text={optimizedText} />
      </div>
      <div className="p-3 bg-slate-900/50 border border-border/60 rounded-xl">
        <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{optimizedText}</p>
      </div>
    </div>
  );
}

/* ─── Inline SVG Icons ────────────────────────────────── */
const IconTarget = ({ className = "w-8 h-8" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 12h.008" />
  </svg>
);

const IconSearch = ({ className = "w-8 h-8" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
  </svg>
);

const IconTag = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
  </svg>
);

const IconDocument = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
  </svg>
);

const IconBriefcase = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z" />
  </svg>
);

const IconAcademicCap = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
  </svg>
);

const IconBolt = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
  </svg>
);

const IconUsers = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
  </svg>
);

const IconGlobe = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
  </svg>
);

const IconEnvelope = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
  </svg>
);

const IconClipboard = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
  </svg>
);

const IconDocumentUpload = ({ className = "w-10 h-10" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
  </svg>
);

const IconCheckCircle = ({ className = "w-8 h-8" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const IconClock = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

/* ─── Formatters ──────────────────────────────────────── */
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

// La lettre arrive desormais en texte brut (letterData.texte).
// On payait auparavant un second appel a l'IA pour la decouper en cinq
// champs... que cette fonction recollait aussitot avec des sauts de ligne.
// Les champs greeting / introduction / body / conclusion / closing restent
// geres : l'historique rejoue des resultats archives a l'ancien format.
function formatLetterText(letterData) {
  if (!letterData) return '';
  if (letterData.texte) return letterData.texte;

  const parts = [];
  if (letterData.greeting) parts.push(letterData.greeting);
  if (letterData.introduction) parts.push(letterData.introduction);
  if (letterData.body) parts.push(letterData.body);
  if (letterData.conclusion) parts.push(letterData.conclusion);
  if (letterData.closing) parts.push(letterData.closing);
  return parts.join('\n\n');
}

export default function MatcherOffresPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const handleLogout = async () => { if (await signOut()) router.push('/login'); };

  // ── Historique ────────────────────────────────────────────────────
  const [showHistory, setShowHistory] = useState(false);

  // ── Navigation ────────────────────────────────────────────────────
  const [matcherMode, setMatcherMode] = useState(null); // null | 'matching' | 'decouverte'
  const [step, setStep] = useState(0);

  // ── Step 1 : Input ────────────────────────────────────────────────
  const [inputMode, setInputMode] = useState('rapide'); // 'rapide' | 'url' | 'form'
  const [cvFile, setCvFile] = useState(null);
  const [offerUrl, setOfferUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef(null);
  const [scrapedData, setScrapedData] = useState(null);
  const [offerData, setOfferData] = useState({
    title: '', company: '', location: '', contract_type: '', salary: '', description: ''
  });
  const [candidateData, setCandidateData] = useState({
    prenom: '', nom: '', titre_poste: '', email: '', telephone: '', adresse: '', linkedin: '',
    experiences: [], formations: [], competences_techniques: '', competences_soft: '', langues: ''
  });
  const [currentTab, setCurrentTab] = useState('offer');
  const [profileMode, setProfileMode] = useState('form'); // 'form' | 'pdf'
  const [formCvFile, setFormCvFile] = useState(null);

  // Options de génération (lettre toujours générée, CV idéal désactivé)
  const generateOptions = { generatePersonalizedCV: true, generateIdealCV: false, generateCoverLetter: true };

  // ── Processing ────────────────────────────────────────────────────
  const [processing, setProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  // ── Step 2 : Résultats ─────────────────────────────────────────
  const [cvDataOriginal, setCvDataOriginal] = useState(null);
  const [cvDataOptimized, setCvDataOptimized] = useState(null);
  const [scoreMatching, setScoreMatching] = useState(0);
  const [modifications, setModifications] = useState([]);
  const [coverLetterResult, setCoverLetterResult] = useState(null);

  // ── Candidature ───────────────────────────────────────────────────
  const [applicationSaved, setApplicationSaved] = useState(false);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    getUser().then((u) => setUserId(u?.id || null));
  }, []);

  // ─── Reset complet ──────────────────────────────────────────────
  const handleReset = () => {
    setMatcherMode(null);
    setStep(0);
    setCvFile(null);
    setOfferUrl('');
    setScrapedData(null);
    setOfferData({ title: '', company: '', location: '', contract_type: '', salary: '', description: '' });
    setCandidateData({ prenom: '', nom: '', titre_poste: '', email: '', telephone: '', adresse: '', linkedin: '', experiences: [], formations: [], competences_techniques: '', competences_soft: '', langues: '' });
    setProfileMode('form');
    setFormCvFile(null);
    setError('');
    setProcessing(false);
    setCvDataOriginal(null);
    setCvDataOptimized(null);
    setScoreMatching(0);
    setModifications([]);
    setCoverLetterResult(null);
    setApplicationSaved(false);
  };

  // ─── Handler : Découverte → sélection d'une offre ──────────────
  const handleSelectDiscoveredOffer = (offre) => {
    setOfferData({
      title: offre.titre || '',
      company: offre.entreprise || '',
      location: offre.lieu || '',
      contract_type: offre.contrat || '',
      salary: '',
      description: offre.description || `Offre depuis ${offre.source || 'scraping'}`
    });
    setMatcherMode('matching');
    setInputMode('form');
    setCurrentTab('profile');
    setStep(1);
  };

  // ─── Helper progress animation ───────────────────────────────────
  const _progressAnim = async (steps) => {
    for (const [label, pct, ms] of steps) {
      setProcessingLabel(label);
      setProgress(pct);
      await new Promise(r => setTimeout(r, ms));
    }
  };

  // ─── Lancement de l'analyse (step 1 → step 2) ───────────────────
  const handleSubmitMatching = async () => {
    setError('');
    setProcessing(true);
    setProgress(0);

    try {
      let response;
      let originalCandidate = null; // profil candidat AVANT optimisation (pour la comparaison avant/après)

      if (inputMode === 'rapide') {
        if (!cvFile) throw new Error('Veuillez ajouter votre CV PDF');
        if (!offerUrl) throw new Error('Veuillez saisir l\'URL de l\'offre');
        const [apiResp] = await Promise.all([
          generateComplete(cvFile, offerUrl, generateOptions),
          _progressAnim([
            ['Extraction du CV...', 15, 800],
            ['Analyse du profil candidat...', 35, 1200],
            ['Scraping de l\'offre...', 55, 1500],
            ['Optimisation IA en cours...', 80, 2000],
          ])
        ]);
        response = apiResp;
        originalCandidate = apiResp.data?.candidate || null;

      } else if (inputMode === 'url') {
        if (!scrapedData) throw new Error('Analysez d\'abord l\'URL de l\'offre');
        if (!candidateData.prenom || !candidateData.nom || !candidateData.titre_poste)
          throw new Error('Renseignez Prénom, Nom et Titre du poste');
        const [apiResp] = await Promise.all([
          analyzeScrapedOffer(scrapedData.rawText, scrapedData.url, candidateData, generateOptions),
          _progressAnim([['Analyse de l\'offre...', 30, 800], ['Optimisation IA...', 70, 2000]])
        ]);
        response = apiResp;
        originalCandidate = candidateData;

      } else {
        if (!offerData.title || !offerData.company || !offerData.description)
          throw new Error('Titre, entreprise et description de l\'offre sont obligatoires');

        let candidate = candidateData;

        if (profileMode === 'pdf') {
          if (!formCvFile) throw new Error('Veuillez ajouter votre CV PDF');
          const [extracted] = await Promise.all([
            extractCandidateFromCVFile(formCvFile),
            _progressAnim([['Extraction du CV...', 20, 800]])
          ]);
          candidate = extracted.data;
        } else {
          if (!candidateData.prenom || !candidateData.nom || !candidateData.titre_poste)
            throw new Error('Prénom, nom et titre du poste sont obligatoires');
        }

        const [apiResp] = await Promise.all([
          analyzeOffer(offerData, candidate, generateOptions),
          _progressAnim([['Analyse de correspondance...', 55, 800], ['Optimisation IA...', 85, 2000]])
        ]);
        response = apiResp;
        originalCandidate = candidate;
        if (profileMode === 'pdf') setCandidateData(candidate);
      }

      setProgress(100);

      const personal = response.data?.personalizedCV;
      if (!personal?.cvData) throw new Error('L\'IA n\'a pas retourné les données du CV');

      setCvDataOriginal(originalCandidate?.prenom ? { ...originalCandidate } : personal.cvData);
      setCvDataOptimized({ ...personal.cvData });
      setScoreMatching(personal.score_matching || 0);
      setModifications(personal.modifications_apportees || []);
      setCoverLetterResult(response.data?.coverLetter || null);
      setStep(2);

      // Sauvegarde historique (fire-and-forget)
      saveHistoryEntry({
        userId: user.id,
        toolType: 'matcher-offres',
        title: `Match - ${personal.cvData?.titre_poste || 'Offre'}`,
        inputSummary: { poste: personal.cvData?.titre_poste },
        resultSummary: { score_matching: personal.score_matching }
      }).catch(() => {});

    } catch (err) {
      setError(err.message || 'Erreur lors de l\'analyse');
    } finally {
      setProcessing(false);
    }
  };

  // ─── Sauvegarder candidature ─────────────────────────────────────
  const handleSaveApplication = async () => {
    if (!userId) return;
    try {
      await createApplication(userId, {
        offer_title: offerData.title || cvDataOptimized?.titre_poste || 'Candidature',
        company: offerData.company || '',
        offer_url: offerUrl || scrapedData?.url || '',
        location: offerData.location || '',
        contract_type: offerData.contract_type || '',
        status: 'a_postuler'
      });
      setApplicationSaved(true);
    } catch (err) {
      console.error('Erreur sauvegarde candidature:', err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // RENDU
  // ═══════════════════════════════════════════════════════════════════

  // ── Indicateur d'étapes ───────────────────────────────────────────
  const StepIndicator = () => step > 0 && matcherMode === 'matching' ? (
    <div className="flex items-center justify-center gap-1 mb-8 flex-wrap">
      {STEPS.map((s) => (
        <div key={s.n} className="flex items-center gap-1">
          <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
            step === s.n ? 'bg-primary text-primary-foreground' :
            step > s.n ? 'bg-border text-text-secondary' : 'bg-surface-elevated text-text-muted'
          }`}>
            {step > s.n && (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3 text-green-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            )}
            {s.label}
          </div>
          {s.n < 2 && <div className={`w-4 h-px ${step > s.n ? 'bg-border-light' : 'bg-border'}`} />}
        </div>
      ))}
    </div>
  ) : null;

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ── Header avec navigation Mew ── */}
      <Header
        user={user}
        onLogout={handleLogout}
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Matcher d\'Offres' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="soft"
              size="sm"
              onClick={() => setShowHistory(true)}
              className="hidden sm:flex"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              Historique
            </Button>
            <Link
              href="/solutions/matcher-offres/candidatures"
              className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-pink-500/10 text-pink-400 text-sm font-medium hover:bg-pink-500/20 transition-colors"
            >
              <IconClipboard className="w-4 h-4" />
              <span>Mes candidatures</span>
            </Link>
          </div>
        }
      />

      {showHistory && (
        <ToolHistory
          userId={user.id}
          defaultToolType="matcher-offres"
          onClose={() => setShowHistory(false)}
        />
      )}

      <div className="py-12 px-4 animate-fade-in">
        <div className="max-w-5xl mx-auto">

          {/* En-tête */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-2">
              <IconTarget className="w-9 h-9 text-pink-500" />
              <h1 className="font-display text-3xl md:text-4xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 text-transparent bg-clip-text">
                Matcher d'Offres
              </h1>
            </div>
            <p className="text-text-muted text-sm">Adaptez votre CV à une offre ou découvrez des postes qui vous correspondent</p>
            {matcherMode && (
              <div className="flex justify-center gap-4 mt-3">
                <Link href="/solutions/matcher-offres/candidatures" className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2 transition-colors">
                  Mes candidatures →
                </Link>
                <button onClick={handleReset} className="text-xs text-text-muted hover:text-text-secondary transition-colors">
                  Recommencer
                </button>
              </div>
            )}
          </div>

          <StepIndicator />

          {/* ─── STEP 0 : Choix du mode ──────────────────────────────────── */}
          {step === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto animate-fade-in">
              <button
                onClick={() => { setMatcherMode('matching'); setStep(1); }}
                className="group p-8 rounded-2xl border border-border/60 bg-surface-glass backdrop-blur-xl hover:border-pink-500/60 hover:bg-pink-950/20 transition-all text-left"
              >
                <IconTarget className="w-10 h-10 text-pink-400 mb-4" />
                <h2 className="font-display text-lg font-bold text-white mb-2">Adapter mon CV</h2>
                <p className="text-sm text-text-muted leading-relaxed">
                  J'ai une offre précise. L'IA optimise le texte de mon CV et m'affiche le score de correspondance.
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {['PDF+URL', 'URL scraping', 'Formulaire'].map(t => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-surface-elevated text-text-muted">{t}</span>
                  ))}
                </div>
                <p className="mt-5 text-sm font-semibold text-pink-400 group-hover:translate-x-1 transition-transform">Commencer →</p>
              </button>

              <button
                onClick={() => { setMatcherMode('decouverte'); setStep(1); }}
                className="group p-8 rounded-2xl border border-border/60 bg-surface-glass backdrop-blur-xl hover:border-purple-500/60 hover:bg-purple-950/20 transition-all text-left"
              >
                <IconSearch className="w-10 h-10 text-purple-400 mb-4" />
                <h2 className="font-display text-lg font-bold text-white mb-2">Trouver des offres</h2>
                <p className="text-sm text-text-muted leading-relaxed">
                  J'upload mon CV, l'IA identifie mes métiers et scrape les offres réelles qui me correspondent.
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {['WTTJ', 'France Travail', 'IA matching'].map(t => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-surface-elevated text-text-muted">{t}</span>
                  ))}
                </div>
                <p className="mt-5 text-sm font-semibold text-purple-400 group-hover:translate-x-1 transition-transform">Commencer →</p>
              </button>
            </div>
          )}

          {/* ─── MODE DÉCOUVERTE ─────────────────────────────────────────── */}
          {matcherMode === 'decouverte' && step === 1 && (
            <div className="max-w-xl mx-auto animate-fade-in">
              <OfferDiscovery onSelectOffer={handleSelectDiscoveredOffer} />
            </div>
          )}

          {/* ─── MODE MATCHING ───────────────────────────────────────────── */}
          {matcherMode === 'matching' && (
            <>
              {/* ── STEP 1 : Saisie ────────────────────────────────────────── */}
              {step === 1 && (
                <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
                  {/* Sélecteur sous-mode */}
                  <div className="flex gap-1 bg-surface rounded-xl p-1 w-fit mx-auto">
                    {[
                      { key: 'rapide', icon: <IconBolt className="w-4 h-4" />, label: 'Rapide' },
                      { key: 'url', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-2.135a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364l1.757 1.757" /></svg>, label: 'URL' },
                      { key: 'form', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>, label: 'Formulaire' },
                    ].map(m => (
                      <button key={m.key} onClick={() => setInputMode(m.key)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${inputMode === m.key ? 'bg-pink-600 text-white' : 'text-text-muted hover:text-white'}`}>
                        {m.icon}
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {/* Mode Rapide */}
                  {inputMode === 'rapide' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-text-secondary">Votre CV (PDF)</label>
                        <div
                          className={`flex flex-col items-center justify-center rounded-2xl p-12 border-2 border-dashed cursor-pointer transition-all ${
                            isDragging ? 'border-pink-500 bg-pink-950/20' :
                            cvFile ? 'border-green-500 bg-green-950/10' : 'border-border/60 bg-surface hover:border-border-light'
                          }`}
                          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                          onDragLeave={() => setIsDragging(false)}
                          onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') setCvFile(f); }}
                          onClick={() => fileRef.current?.click()}
                        >
                          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files[0]; if (f) setCvFile(f); }} />
                          {cvFile ? (
                            <>
                              <IconCheckCircle className="w-8 h-8 text-green-400 mb-1" />
                              <p className="text-sm font-medium text-green-400">{cvFile.name}</p>
                              <p className="text-xs text-text-muted mt-0.5">{(cvFile.size / 1024).toFixed(0)} Ko</p>
                            </>
                          ) : (
                            <>
                              <IconDocumentUpload className="w-10 h-10 text-text-muted mb-2" />
                              <p className="text-sm font-medium text-white">Glissez votre CV ici</p>
                              <p className="text-xs text-text-muted mt-1">ou cliquez · PDF max 2 Mo</p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-text-secondary">Lien de l'offre</label>
                        <input type="url" value={offerUrl} onChange={(e) => setOfferUrl(e.target.value)}
                          placeholder="https://welcometothejungle.com/..."
                          className="w-full px-4 py-3 bg-surface border border-border/60 rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-pink-500 transition-colors text-sm" />
                        <p className="text-xs text-text-muted">WTTJ, Indeed, APEC, sites entreprises...</p>
                        <div className="p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-xl">
                          <div className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-yellow-400 shrink-0">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                            </svg>
                            <p className="text-xs text-yellow-400">LinkedIn et Glassdoor bloquent le scraping.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Mode URL */}
                  {inputMode === 'url' && (
                    <div className="space-y-5">
                      <UrlScraper
                        onScrapingComplete={(data) => {
                          setScrapedData(data);
                          if (data.basicOffer) setOfferData(d => ({ ...d, ...data.basicOffer }));
                        }}
                      />
                      {scrapedData && (
                        <div className="bg-surface-glass backdrop-blur-xl rounded-2xl p-6 border border-border/60">
                          <h3 className="font-display text-sm font-semibold text-text-secondary mb-4">Votre profil</h3>
                          <CandidateProfileForm
                            candidateData={candidateData}
                            setCandidateData={setCandidateData}
                            profileMode={profileMode}
                            setProfileMode={setProfileMode}
                            formCvFile={formCvFile}
                            setFormCvFile={setFormCvFile}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mode Formulaire */}
                  {inputMode === 'form' && (
                    <div className="space-y-5">
                      <div className="flex border-b border-border/60">
                        {[
                          { key: 'offer', icon: <IconClipboard className="w-4 h-4" />, label: 'Offre' },
                          { key: 'profile', icon: <IconUsers className="w-4 h-4" />, label: 'Profil' },
                        ].map(t => (
                          <button key={t.key} onClick={() => setCurrentTab(t.key)}
                            className={`flex items-center gap-1.5 px-5 py-3 font-semibold text-sm border-b-2 transition-colors -mb-px ${
                              currentTab === t.key ? 'border-pink-500 text-pink-400' : 'border-transparent text-text-muted hover:text-text-secondary'
                            }`}>
                            {t.icon}
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <div className="bg-surface-glass backdrop-blur-xl rounded-2xl p-6 border border-border/60">
                        {currentTab === 'offer' && <OfferForm offerData={offerData} setOfferData={setOfferData} />}
                        {currentTab === 'profile' && <CandidateProfileForm
                            candidateData={candidateData}
                            setCandidateData={setCandidateData}
                            profileMode={profileMode}
                            setProfileMode={setProfileMode}
                            formCvFile={formCvFile}
                            setFormCvFile={setFormCvFile}
                          />}
                      </div>
                      {currentTab === 'offer' && (
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={() => setCurrentTab('profile')}
                          className="w-full"
                        >
                          Suivant : Votre profil →
                        </Button>
                      )}
                    </div>
                  )}

                  {error && (
                    <div className="bg-red-900/20 border border-red-800 rounded-2xl p-4">
                      <p className="text-sm text-red-300">{error}</p>
                      <button onClick={() => setError('')} className="mt-2 text-xs text-red-400 underline">Fermer</button>
                    </div>
                  )}

                  {processing ? (
                    <div className="space-y-3 bg-surface-glass backdrop-blur-xl rounded-2xl p-6 text-center border border-border/60">
                      <CatLoadingAnimation label={processingLabel} />
                      <div className="relative w-full bg-surface-elevated rounded-full h-2 overflow-hidden">
                        <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-pink-600 to-purple-600 rounded-full transition-all duration-700"
                          style={{ width: `${progress}%` }} />
                      </div>
                      <div className="flex items-center justify-center gap-1.5 text-xs text-text-muted">
                        <IconClock className="w-3.5 h-3.5" />
                        <span>30 à 90 secondes</span>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={handleSubmitMatching}
                      disabled={processing}
                      className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 hover:brightness-110 text-lg rounded-xl"
                    >
                      <IconBolt className="w-5 h-5" />
                      Analyser et optimiser mon CV
                    </Button>
                  )}
                </div>
              )}

              {/* ── STEP 2 : Résultats (transparence + texte copiable) ───── */}
              {step === 2 && (
                <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
                  {/* Transparence : score + modifications */}
                  <MatcherTransparency
                    score={scoreMatching}
                    modifications={modifications}
                    cvDataOriginal={cvDataOriginal}
                    cvDataOptimized={cvDataOptimized}
                    onBack={() => setStep(1)}
                  />

                  {/* Sections de texte copiable */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-lg font-bold text-white">Texte optimisé — à copier dans ton CV</h3>
                      <CopyButton
                        text={[
                          cvDataOptimized?.titre_poste && `Titre: ${cvDataOptimized.titre_poste}`,
                          cvDataOptimized?.resume && `\nRésumé:\n${cvDataOptimized.resume}`,
                          cvDataOptimized?.experiences?.length && `\nExpériences:\n${formatExperiences(cvDataOptimized.experiences)}`,
                          cvDataOptimized?.formations?.length && `\nFormations:\n${formatFormations(cvDataOptimized.formations)}`,
                          cvDataOptimized?.competences_techniques && `\nCompétences techniques:\n${cvDataOptimized.competences_techniques}`,
                          cvDataOptimized?.competences_soft && `\nSoft skills:\n${cvDataOptimized.competences_soft}`,
                          cvDataOptimized?.langues && `\nLangues:\n${cvDataOptimized.langues}`,
                        ].filter(Boolean).join('\n')}
                        label="tout"
                      />
                    </div>

                    {cvDataOptimized?.titre_poste && (
                      <div className="bg-surface-glass backdrop-blur-xl rounded-2xl border border-border/60 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <IconTag className="w-5 h-5 text-pink-400" />
                            <h3 className="font-display font-semibold text-white text-sm">Titre du poste</h3>
                          </div>
                          <CopyButton text={cvDataOptimized.titre_poste} />
                        </div>
                        <div className="p-3 bg-slate-900/50 border border-border/60 rounded-xl">
                          <p className="text-sm text-slate-300 font-medium">{cvDataOptimized.titre_poste}</p>
                        </div>
                      </div>
                    )}

                    <OptimizedSection title="Résumé professionnel" icon={<IconDocument className="w-5 h-5 text-blue-400" />} optimizedText={cvDataOptimized?.resume} />
                    {cvDataOptimized?.experiences?.length > 0 && (
                      <OptimizedSection title="Expériences" icon={<IconBriefcase className="w-5 h-5 text-amber-400" />} optimizedText={formatExperiences(cvDataOptimized.experiences)} />
                    )}
                    {cvDataOptimized?.formations?.length > 0 && (
                      <OptimizedSection title="Formations" icon={<IconAcademicCap className="w-5 h-5 text-purple-400" />} optimizedText={formatFormations(cvDataOptimized.formations)} />
                    )}
                    <OptimizedSection title="Compétences techniques" icon={<IconBolt className="w-5 h-5 text-yellow-400" />} optimizedText={cvDataOptimized?.competences_techniques} />
                    <OptimizedSection title="Soft skills / Qualifications" icon={<IconUsers className="w-5 h-5 text-green-400" />} optimizedText={cvDataOptimized?.competences_soft} />
                    <OptimizedSection title="Langues" icon={<IconGlobe className="w-5 h-5 text-cyan-400" />} optimizedText={cvDataOptimized?.langues} />
                  </div>

                  {/* Lettre de motivation (texte copiable) */}
                  {coverLetterResult?.letterData && (
                    <div className="bg-blue-950/20 border border-blue-800/40 rounded-2xl p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <IconEnvelope className="w-5 h-5 text-blue-300" />
                          <h3 className="font-display text-sm font-semibold text-blue-300">Lettre de motivation</h3>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-400">Générée</span>
                        </div>
                        <CopyButton text={formatLetterText(coverLetterResult.letterData)} label="" />
                      </div>
                      <div className="p-3 bg-slate-900/50 border border-blue-800/30 rounded-xl">
                        <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">
                          {formatLetterText(coverLetterResult.letterData)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Save candidature */}
                  {!applicationSaved ? (
                    <div className="bg-surface-glass backdrop-blur-xl rounded-2xl p-5 border border-border/60">
                      <h3 className="font-display text-sm font-semibold text-white mb-1">Suivre cette candidature</h3>
                      <p className="text-xs text-text-muted mb-3">Ajoutez-la à votre tableau de suivi.</p>
                      <Button
                        variant="outline"
                        size="md"
                        onClick={handleSaveApplication}
                        className="w-full"
                      >
                        Ajouter au suivi →
                      </Button>
                    </div>
                  ) : (
                    <div className="bg-green-900/20 border border-green-800 rounded-2xl p-4 text-center">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-green-400">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                        <p className="text-sm text-green-400">Candidature ajoutée</p>
                      </div>
                      <Link href="/solutions/matcher-offres/candidatures" className="text-xs text-green-500 hover:text-green-300 underline">
                        Voir mes candidatures →
                      </Link>
                    </div>
                  )}

                  {error && (
                    <div className="bg-red-900/20 border border-red-800 rounded-2xl p-4">
                      <p className="text-sm text-red-300">{error}</p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => setStep(1)}
                      className="flex-1"
                    >
                      ← Modifier
                    </Button>
                    <Button
                      variant="outline"
                      size="md"
                      onClick={handleReset}
                      className="flex-1"
                    >
                      Nouvelle analyse
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
