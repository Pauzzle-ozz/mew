'use client';

import { useId } from 'react';
import Button from '@/components/shared/Button';
import CatLoadingAnimation from '@/components/shared/CatLoadingAnimation';
import PdfDropzone from '@/components/shared/PdfDropzone';
import { IconBolt, IconClipboard, IconClock, IconUsers } from '@/components/shared/icons';
import CandidateProfileForm from '@/components/matcher/CandidateProfileForm';
import OfferForm from '@/components/matcher/OfferForm';
import UrlScraper from '@/components/matcher/UrlScraper';

/**
 * Etape 1 du mode matching : dire quelle offre et quel profil.
 * Trois facons d'y arriver — CV + lien (rapide), lien seul, formulaire.
 *
 * Sorti de app/solutions/matcher-offres/page.js pour que la page redevienne
 * lisible : elle ne garde que l'etat et les appels API.
 */
export default function MatcherStepSaisie({
  inputMode,
  setInputMode,
  cvFile,
  setCvFile,
  offerUrl,
  setOfferUrl,
  scrapedData,
  setScrapedData,
  offerData,
  setOfferData,
  candidateData,
  setCandidateData,
  currentTab,
  setCurrentTab,
  profileMode,
  setProfileMode,
  formCvFile,
  setFormCvFile,
  error,
  onFermerErreur,
  processing,
  processingLabel,
  progress,
  onAnalyser,
}) {
  const idUrl = `offre-url-${useId()}`;

  return (
    <div className="mx-auto max-w-3xl animate-fade-in space-y-6">
      {/* ── Choix de la facon de saisir ─────────────────────────── */}
      <div className="mx-auto flex w-fit gap-1 rounded-xl bg-surface-elevated p-1" role="group" aria-label="Mode de saisie">
        {MODES.map((mode) => (
          <button
            key={mode.cle}
            type="button"
            onClick={() => setInputMode(mode.cle)}
            aria-pressed={inputMode === mode.cle}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              inputMode === mode.cle
                ? 'bg-primary text-primary-foreground'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {mode.icone}
            {mode.libelle}
          </button>
        ))}
      </div>

      {/* ── Mode rapide : CV + lien ─────────────────────────────── */}
      {inputMode === 'rapide' && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-text-secondary">Ton CV (PDF)</p>
            <PdfDropzone
              fichier={cvFile}
              onFichier={setCvFile}
              tailleMaxMo={5}
              label="Depose ton CV"
              description="PDF, 5 Mo max"
              disabled={processing}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor={idUrl} className="block text-sm font-semibold text-text-secondary">
              Lien de l&apos;offre
            </label>
            <input
              id={idUrl}
              type="url"
              value={offerUrl}
              onChange={(evenement) => setOfferUrl(evenement.target.value)}
              placeholder="https://welcometothejungle.com/..."
              aria-describedby={`${idUrl}-aide`}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder-text-muted transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p id={`${idUrl}-aide`} className="text-xs text-text-muted">
              WTTJ, Indeed, APEC, sites d&apos;entreprises...
            </p>

            <p className="rounded-xl border border-warning/25 bg-warning/8 p-3 text-xs text-warning">
              LinkedIn et Glassdoor bloquent la lecture automatique : pour ces sites, passe par le formulaire.
            </p>
          </div>
        </div>
      )}

      {/* ── Mode lien seul ──────────────────────────────────────── */}
      {inputMode === 'url' && (
        <div className="space-y-5">
          <UrlScraper
            onScrapingComplete={(donnees) => {
              setScrapedData(donnees);
              if (donnees.basicOffer) setOfferData((precedent) => ({ ...precedent, ...donnees.basicOffer }));
            }}
          />

          {scrapedData && (
            <div className="rounded-2xl border border-border/60 bg-surface p-6">
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

      {/* ── Mode formulaire ─────────────────────────────────────── */}
      {inputMode === 'form' && (
        <div className="space-y-5">
          {/* Volontairement PAS de role="tablist" : un vrai motif d'onglets
              exige aria-controls, des panneaux role="tabpanel" et la
              navigation aux fleches. A moitie declare, il ment au lecteur
              d'ecran. Deux boutons avec aria-pressed disent la verite. */}
          <div className="flex border-b border-border/60" role="group" aria-label="Offre ou profil">
            {ONGLETS.map((onglet) => (
              <button
                key={onglet.cle}
                type="button"
                aria-pressed={currentTab === onglet.cle}
                onClick={() => setCurrentTab(onglet.cle)}
                className={`-mb-px flex cursor-pointer items-center gap-1.5 border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
                  currentTab === onglet.cle
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                {onglet.icone}
                {onglet.libelle}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-border/60 bg-surface p-6">
            {currentTab === 'offer' ? (
              <OfferForm offerData={offerData} setOfferData={setOfferData} />
            ) : (
              <CandidateProfileForm
                candidateData={candidateData}
                setCandidateData={setCandidateData}
                profileMode={profileMode}
                setProfileMode={setProfileMode}
                formCvFile={formCvFile}
                setFormCvFile={setFormCvFile}
              />
            )}
          </div>

          {currentTab === 'offer' && (
            <Button variant="outline" size="lg" onClick={() => setCurrentTab('profile')} className="w-full">
              Suivant : ton profil &rarr;
            </Button>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-2xl border border-error/25 bg-error/8 p-4">
          <p className="text-sm text-error">{error}</p>
          <button
            type="button"
            onClick={onFermerErreur}
            className="mt-2 cursor-pointer text-xs text-error underline hover:opacity-80"
          >
            Fermer
          </button>
        </div>
      )}

      {processing ? (
        // role="status" : l'analyse dure une minute. Sans annonce, on ne sait
        // pas si la page travaille ou si elle a plante.
        <div
          role="status"
          aria-live="polite"
          className="space-y-3 rounded-2xl border border-border/60 bg-surface p-6 text-center"
        >
          <CatLoadingAnimation label={processingLabel} />

          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-center gap-1.5 text-xs text-text-muted">
            <IconClock className="h-3.5 w-3.5" />
            <span>30 a 90 secondes</span>
          </div>
        </div>
      ) : (
        <Button variant="primary" size="lg" onClick={onAnalyser} className="w-full rounded-xl py-4 text-lg">
          <IconBolt className="h-5 w-5" />
          Analyser et optimiser mon CV
        </Button>
      )}
    </div>
  );
}

/* ── Donnees de presentation ───────────────────────────────────────── */

const MODES = [
  { cle: 'rapide', libelle: 'Rapide', icone: <IconBolt className="h-4 w-4" /> },
  { cle: 'url', libelle: 'Lien', icone: <IconLien /> },
  { cle: 'form', libelle: 'Formulaire', icone: <IconCrayon /> },
];

const ONGLETS = [
  { cle: 'offer', libelle: 'Offre', icone: <IconClipboard className="h-4 w-4" /> },
  { cle: 'profile', libelle: 'Profil', icone: <IconUsers className="h-4 w-4" /> },
];

/* Ces deux traces n'existent que dans ce selecteur : ils restent ici plutot
   que d'alourdir la bibliotheque partagee avec des icones a un seul usage. */

function IconLien() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      focusable="false"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-2.135a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364l1.757 1.757"
      />
    </svg>
  );
}

function IconCrayon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      focusable="false"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
      />
    </svg>
  );
}
