'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { getUser } from '@/lib/auth';

// Composants du matcher
import MatcherStepChoix from '@/components/matcher/MatcherStepChoix';
import MatcherStepSaisie from '@/components/matcher/MatcherStepSaisie';
import MatcherStepResultats from '@/components/matcher/MatcherStepResultats';
import OfferDiscovery from '@/components/matcher/OfferDiscovery';

// Composants partages
import Button from '@/components/shared/Button';
import Header from '@/components/shared/Header';
import LoadingScreen from '@/components/shared/LoadingScreen';
import ToolHistory from '@/components/shared/ToolHistory';
import { IconClipboard, IconClock, IconTarget } from '@/components/shared/icons';

// APIs
import { analyzeOffer, analyzeScrapedOffer, generateComplete, extractCandidateFromCVFile } from '@/lib/api/matcherApi';
import { saveHistoryEntry } from '@/lib/api/historyApi';

/**
 * Matcher d'offres.
 *
 * CE QUI A CHANGE DANS CE FICHIER
 *
 * 1) LE THEME CLAIR MARCHE ENFIN. La page forcait `bg-black text-white` sur
 *    son conteneur : quel que soit le theme choisi, elle restait noire et le
 *    bouton de bascule n'avait aucun effet dessus. Toutes les couleurs
 *    passent maintenant par les variables definies dans globals.css.
 *
 * 2) LE SCORE EST CELUI DU BACKEND. `response.data.correspondance` contient
 *    le calcul complet (criteres, competences communes et manquantes,
 *    actions). On le transmet tel quel a l'affichage. Il peut etre absent
 *    d'un resultat archive : tout l'affichage le tolere.
 *
 * 3) LA PAGE NE DESSINE PLUS SES TROIS ECRANS. Elle faisait 880 lignes, dont
 *    86 de <path> SVG recopies et trois etapes imbriquees. Les icones vivent
 *    dans components/shared/icons.jsx, les etapes dans
 *    components/matcher/MatcherStep*.jsx. Ici il ne reste que l'etat, les
 *    appels API et l'enchainement des etapes.
 */

const ETAPES = [
  { numero: 1, libelle: 'Saisie' },
  { numero: 2, libelle: 'Resultats' },
];

const PROFIL_VIDE = {
  prenom: '',
  nom: '',
  titre_poste: '',
  email: '',
  telephone: '',
  adresse: '',
  linkedin: '',
  experiences: [],
  formations: [],
  competences_techniques: '',
  competences_soft: '',
  langues: '',
};

const OFFRE_VIDE = {
  title: '',
  company: '',
  location: '',
  contract_type: '',
  salary: '',
  description: '',
};

// La lettre est toujours generee ; le « CV ideal » ne l'est plus (personne ne
// l'affichait, et il coutait deux appels a gpt-4o).
const OPTIONS_GENERATION = { generatePersonalizedCV: true, generateIdealCV: false, generateCoverLetter: true };

export default function MatcherOffresPage() {
  const { user, loading, logout } = useAuth();

  const [showHistory, setShowHistory] = useState(false);

  // null | 'matching' | 'decouverte'
  const [matcherMode, setMatcherMode] = useState(null);
  const [step, setStep] = useState(0);

  // ── Etape 1 : saisie ──────────────────────────────────────────────
  const [inputMode, setInputMode] = useState('rapide'); // 'rapide' | 'url' | 'form'
  const [cvFile, setCvFile] = useState(null);
  const [offerUrl, setOfferUrl] = useState('');
  const [scrapedData, setScrapedData] = useState(null);
  const [offerData, setOfferData] = useState(OFFRE_VIDE);
  const [candidateData, setCandidateData] = useState(PROFIL_VIDE);
  const [currentTab, setCurrentTab] = useState('offer');
  const [profileMode, setProfileMode] = useState('form'); // 'form' | 'pdf'
  const [formCvFile, setFormCvFile] = useState(null);

  // ── Traitement ────────────────────────────────────────────────────
  const [processing, setProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  // ── Etape 2 : resultats ───────────────────────────────────────────
  const [cvDataOriginal, setCvDataOriginal] = useState(null);
  const [cvDataOptimized, setCvDataOptimized] = useState(null);
  const [scoreMatching, setScoreMatching] = useState(0);
  const [correspondance, setCorrespondance] = useState(null);
  const [modifications, setModifications] = useState([]);
  const [coverLetterResult, setCoverLetterResult] = useState(null);

  // ── Candidature ───────────────────────────────────────────────────
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    getUser().then((compte) => setUserId(compte?.id || null));
  }, []);

  const handleReset = () => {
    setMatcherMode(null);
    setStep(0);
    setCvFile(null);
    setOfferUrl('');
    setScrapedData(null);
    setOfferData(OFFRE_VIDE);
    setCandidateData(PROFIL_VIDE);
    setProfileMode('form');
    setFormCvFile(null);
    setError('');
    setProcessing(false);
    setCvDataOriginal(null);
    setCvDataOptimized(null);
    setScoreMatching(0);
    setCorrespondance(null);
    setModifications([]);
    setCoverLetterResult(null);
  };

  /** Mode decouverte : on a clique sur « remplir le formulaire » depuis une offre trouvee. */
  const handleSelectDiscoveredOffer = (offre) => {
    setOfferData({
      title: offre.titre || '',
      company: offre.entreprise || '',
      location: offre.lieu || '',
      contract_type: offre.contrat || '',
      salary: '',
      description: offre.description || `Offre depuis ${offre.source || 'une recherche'}`,
    });
    setMatcherMode('matching');
    setInputMode('form');
    setCurrentTab('profile');
    setStep(1);
  };

  /**
   * Barre de progression « decorative » : elle avance pendant que la requete
   * tourne, sans rien mesurer de reel. Elle est la pour montrer que la page
   * travaille, pas pour donner une duree exacte.
   */
  const animerProgression = async (etapes) => {
    for (const [libelle, pourcentage, duree] of etapes) {
      setProcessingLabel(libelle);
      setProgress(pourcentage);
      await new Promise((resoudre) => setTimeout(resoudre, duree));
    }
  };

  const handleSubmitMatching = async () => {
    setError('');
    setProcessing(true);
    setProgress(0);

    try {
      let reponse;
      // Profil AVANT optimisation : c'est lui qui permet la comparaison
      // avant / apres a l'ecran suivant.
      let profilOrigine = null;

      if (inputMode === 'rapide') {
        if (!cvFile) throw new Error('Ajoute ton CV au format PDF');
        if (!offerUrl) throw new Error('Saisis le lien de l\'offre');

        const [resultat] = await Promise.all([
          generateComplete(cvFile, offerUrl, OPTIONS_GENERATION),
          animerProgression([
            ['Lecture du CV...', 15, 800],
            ['Analyse du profil...', 35, 1200],
            ['Lecture de l\'offre...', 55, 1500],
            ['Optimisation en cours...', 80, 2000],
          ]),
        ]);
        reponse = resultat;
        profilOrigine = resultat.data?.candidate || null;
      } else if (inputMode === 'url') {
        if (!scrapedData) throw new Error('Analyse d\'abord le lien de l\'offre');
        if (!candidateData.prenom || !candidateData.nom || !candidateData.titre_poste) {
          throw new Error('Renseigne ton prenom, ton nom et ton titre de poste');
        }

        const [resultat] = await Promise.all([
          analyzeScrapedOffer(scrapedData.rawText, scrapedData.url, candidateData, OPTIONS_GENERATION),
          animerProgression([
            ['Analyse de l\'offre...', 30, 800],
            ['Optimisation en cours...', 70, 2000],
          ]),
        ]);
        reponse = resultat;
        profilOrigine = candidateData;
      } else {
        if (!offerData.title || !offerData.company || !offerData.description) {
          throw new Error('Le titre, l\'entreprise et la description de l\'offre sont obligatoires');
        }

        let profil = candidateData;

        if (profileMode === 'pdf') {
          if (!formCvFile) throw new Error('Ajoute ton CV au format PDF');
          const [extrait] = await Promise.all([
            extractCandidateFromCVFile(formCvFile),
            animerProgression([['Lecture du CV...', 20, 800]]),
          ]);
          profil = extrait.data;
        } else if (!candidateData.prenom || !candidateData.nom || !candidateData.titre_poste) {
          throw new Error('Ton prenom, ton nom et ton titre de poste sont obligatoires');
        }

        const [resultat] = await Promise.all([
          analyzeOffer(offerData, profil, OPTIONS_GENERATION),
          animerProgression([
            ['Calcul de la correspondance...', 55, 800],
            ['Optimisation en cours...', 85, 2000],
          ]),
        ]);
        reponse = resultat;
        profilOrigine = profil;
        if (profileMode === 'pdf') setCandidateData(profil);
      }

      setProgress(100);

      const personnalise = reponse.data?.personalizedCV;
      if (!personnalise?.cvData) throw new Error('L\'IA n\'a pas retourne les donnees du CV');

      // correspondance = le calcul local du backend. score_matching reste le
      // secours : il vaut deja correspondance.score cote serveur.
      const correspondanceRecue = reponse.data?.correspondance || null;
      const note = correspondanceRecue?.score ?? personnalise.score_matching ?? 0;

      setCvDataOriginal(profilOrigine?.prenom ? { ...profilOrigine } : personnalise.cvData);
      setCvDataOptimized({ ...personnalise.cvData });
      setCorrespondance(correspondanceRecue);
      setScoreMatching(note);
      setModifications(personnalise.modifications_apportees || []);
      setCoverLetterResult(reponse.data?.coverLetter || null);
      setStep(2);

      // Historique : on n'attend pas la reponse, un echec ici ne doit pas
      // empecher l'utilisateur de lire son resultat.
      saveHistoryEntry({
        userId: user.id,
        toolType: 'matcher-offres',
        title: `Match - ${personnalise.cvData?.titre_poste || 'Offre'}`,
        inputSummary: { poste: personnalise.cvData?.titre_poste },
        resultSummary: { score_matching: note },
      }).catch(() => {});
    } catch (err) {
      setError(err.message || 'Erreur pendant l\'analyse');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <LoadingScreen message="Chargement du matcher..." />;

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <Header
        user={user}
        onLogout={logout}
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Matcher d\'offres' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="soft" size="sm" onClick={() => setShowHistory(true)} className="hidden sm:flex">
              <IconClock className="h-4 w-4" />
              Historique
            </Button>
          </div>
        }
      />

      {showHistory && (
        <ToolHistory userId={user.id} defaultToolType="matcher-offres" onClose={() => setShowHistory(false)} />
      )}

      <div className="animate-fade-in px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center">
            <div className="mb-2 flex items-center justify-center gap-3">
              <IconTarget className="h-9 w-9 text-primary" />
              <h1 className="font-display bg-gradient-to-r from-primary to-accent bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
                Matcher d&apos;offres
              </h1>
            </div>
            <p className="text-sm text-text-secondary">
              Adapte ton CV a une offre precise, ou trouve les offres qui te correspondent.
            </p>

            {matcherMode && (
              <div className="mt-3 flex justify-center gap-4">
                <button
                  type="button"
                  onClick={handleReset}
                  className="cursor-pointer text-xs text-text-muted transition-colors hover:text-text-secondary"
                >
                  Recommencer
                </button>
              </div>
            )}
          </div>

          {matcherMode === 'matching' && step > 0 && <IndicateurEtapes etapeCourante={step} />}

          {step === 0 && (
            <MatcherStepChoix
              onChoisir={(mode) => {
                setMatcherMode(mode);
                setStep(1);
              }}
            />
          )}

          {matcherMode === 'decouverte' && step === 1 && (
            <div className="mx-auto max-w-xl animate-fade-in">
              <OfferDiscovery onSelectOffer={handleSelectDiscoveredOffer} />
            </div>
          )}

          {matcherMode === 'matching' && step === 1 && (
            <MatcherStepSaisie
              inputMode={inputMode}
              setInputMode={setInputMode}
              cvFile={cvFile}
              setCvFile={setCvFile}
              offerUrl={offerUrl}
              setOfferUrl={setOfferUrl}
              scrapedData={scrapedData}
              setScrapedData={setScrapedData}
              offerData={offerData}
              setOfferData={setOfferData}
              candidateData={candidateData}
              setCandidateData={setCandidateData}
              currentTab={currentTab}
              setCurrentTab={setCurrentTab}
              profileMode={profileMode}
              setProfileMode={setProfileMode}
              formCvFile={formCvFile}
              setFormCvFile={setFormCvFile}
              error={error}
              onFermerErreur={() => setError('')}
              processing={processing}
              processingLabel={processingLabel}
              progress={progress}
              onAnalyser={handleSubmitMatching}
            />
          )}

          {matcherMode === 'matching' && step === 2 && (
            <MatcherStepResultats
              score={scoreMatching}
              correspondance={correspondance}
              modifications={modifications}
              cvDataOriginal={cvDataOriginal}
              cvDataOptimized={cvDataOptimized}
              coverLetterResult={coverLetterResult}
              error={error}
              onModifier={() => setStep(1)}
              onRecommencer={handleReset}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Indicateur d'etapes ───────────────────────────────────────────── */

function IndicateurEtapes({ etapeCourante }) {
  return (
    <nav aria-label="Progression" className="mb-8 flex flex-wrap items-center justify-center gap-1">
      <ol className="flex flex-wrap items-center gap-1">
        {ETAPES.map((etape) => {
          const faite = etapeCourante > etape.numero;
          const active = etapeCourante === etape.numero;

          return (
            <li key={etape.numero} className="flex items-center gap-1">
              <span
                aria-current={active ? 'step' : undefined}
                className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : faite
                      ? 'bg-surface-elevated text-text-secondary'
                      : 'bg-surface-elevated text-text-muted'
                }`}
              >
                {faite && (
                  <span className="text-success" aria-hidden="true">
                    ✓
                  </span>
                )}
                {etape.libelle}
                {faite && <span className="sr-only">(terminee)</span>}
              </span>

              {etape.numero < ETAPES.length && (
                <span className={`h-px w-4 ${faite ? 'bg-border-light' : 'bg-border'}`} aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
