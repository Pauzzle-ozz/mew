'use client';

import { useState } from 'react';
import CatLoadingAnimation from '@/components/shared/CatLoadingAnimation';
import CopyButton from '@/components/shared/CopyButton';
import PdfDropzone from '@/components/shared/PdfDropzone';
import MatcherTransparency from '@/components/matcher/MatcherTransparency';
import { discoverJobs, rapidAdaptCV } from '@/lib/api/matcherApi';

/**
 * Mode Decouverte : on part du CV, on en deduit des metiers, on va chercher
 * les offres correspondantes chez les sources selectionnees.
 *
 * CE QUI A CHANGE
 *
 * 1) LES OFFRES SONT ENFIN CLASSEES. L'interface annoncait « IA matching »
 *    alors que les offres arrivaient dans l'ordre ou les sources les avaient
 *    renvoyees. Le backend calcule maintenant un score par offre
 *    (jobDiscoveryService._classerOffres) et renvoie la liste DEJA TRIEE.
 *    On ne la retrie donc pas ici : on affiche le score, et surtout le
 *    nombre de competences couvertes, sur chaque carte.
 *
 * 2) LES COULEURS SUIVENT LE THEME. Une centaine de classes codaient un fond
 *    sombre en dur (bg-slate-800, text-white...). En theme clair, cette page
 *    restait un bloc noir au milieu d'une interface creme.
 *
 * 3) LA ZONE DE DEPOT EST CELLE DE TOUT LE MONDE. Elle acceptait n'importe
 *    quel fichier sans rien dire quand il etait refuse, et n'etait pas
 *    utilisable au clavier. PdfDropzone regle les deux.
 */

const SOURCES = [
  { id: 'wttj', libelle: 'Welcome to the Jungle', emoji: '🌿', pardefaut: true },
  { id: 'france_travail', libelle: 'France Travail', emoji: '🇫🇷', pardefaut: true },
  { id: 'indeed', libelle: 'Indeed', emoji: '🔵', pardefaut: false },
  { id: 'hellowork', libelle: 'HelloWork', emoji: '👋', pardefaut: false },
  { id: 'apec', libelle: 'APEC (cadres)', emoji: '🎩', pardefaut: false },
];

// Chaque source garde sa teinte, mais tiree du theme : ces trois couleurs
// existent en clair comme en sombre avec un contraste suffisant.
const TONS_SOURCE = {
  'WTTJ': 'border-success/25 bg-success/10 text-success',
  'France Travail': 'border-info/25 bg-info/10 text-info',
  'Indeed': 'border-accent/25 bg-accent-light text-accent',
  'HelloWork': 'border-warning/25 bg-warning/10 text-warning',
  'APEC': 'border-primary/25 bg-primary-light text-primary',
};

export default function OfferDiscovery({ onSelectOffer }) {
  const [etape, setEtape] = useState(0);
  const [cvFile, setCvFile] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');
  const [resultat, setResultat] = useState(null);
  const [filtreMetier, setFiltreMetier] = useState('');
  const [sourcesChoisies, setSourcesChoisies] = useState(
    SOURCES.filter((source) => source.pardefaut).map((source) => source.id)
  );
  const [localisation, setLocalisation] = useState('');
  const [typeContrat, setTypeContrat] = useState('');

  const [adaptation, setAdaptation] = useState(false);
  const [resultatAdaptation, setResultatAdaptation] = useState(null);
  const [correspondance, setCorrespondance] = useState(null);
  const [offreAdaptee, setOffreAdaptee] = useState(null);
  const [erreurAdaptation, setErreurAdaptation] = useState('');

  const basculerSource = (idSource) => {
    setSourcesChoisies((precedent) => {
      if (precedent.includes(idSource)) {
        // Zero source ne renverrait aucune offre : on garde toujours la derniere.
        if (precedent.length <= 1) return precedent;
        return precedent.filter((id) => id !== idSource);
      }
      return [...precedent, idSource];
    });
  };

  const lancerAnalyse = async () => {
    if (!cvFile || sourcesChoisies.length === 0) return;
    setChargement(true);
    setErreur('');
    try {
      const filtres = {};
      if (localisation.trim()) filtres.localisation = localisation.trim();
      if (typeContrat) filtres.typeContrat = typeContrat;
      const reponse = await discoverJobs(cvFile, sourcesChoisies, filtres);
      setResultat(reponse.data);
      setEtape(1);
    } catch (err) {
      setErreur(err.message || 'Erreur pendant l\'analyse');
    } finally {
      setChargement(false);
    }
  };

  const adapterLeCv = async (offre) => {
    if (!cvFile) return;
    setErreurAdaptation('');
    setResultatAdaptation(null);
    setCorrespondance(null);
    setAdaptation(true);
    setOffreAdaptee(offre);
    setEtape(3);

    try {
      const offreFormatee = {
        title: offre.titre || '',
        company: offre.entreprise || '',
        location: offre.lieu || '',
        contract_type: offre.contrat || '',
        description:
          offre.description ||
          `Poste de ${offre.titre || ''} chez ${offre.entreprise || ''} ${offre.lieu || ''} ${offre.contrat || ''}`.trim(),
      };

      const reponse = await rapidAdaptCV(cvFile, offreFormatee);
      const personnalise = reponse.data?.personalizedCV;

      if (!personnalise) throw new Error('L\'IA n\'a pas retourne les donnees du CV');

      setResultatAdaptation(personnalise);
      // Peut etre absent sur une reponse ancienne : l'affichage le gere.
      setCorrespondance(reponse.data?.correspondance || null);
    } catch (err) {
      setErreurAdaptation(err.message || 'Erreur pendant l\'adaptation');
    } finally {
      setAdaptation(false);
    }
  };

  const retourAuxOffres = () => {
    setEtape(2);
    setResultatAdaptation(null);
    setCorrespondance(null);
    setOffreAdaptee(null);
    setErreurAdaptation('');
  };

  // Le backend a deja trie par correspondance decroissante. On filtre, on ne
  // retrie pas : re-trier ici casserait l'ordre calcule cote serveur.
  const offresAffichees =
    resultat?.offres?.filter((offre) => !filtreMetier || offre.metier_correspondant === filtreMetier) || [];

  /* ── Etape 0 : depot du CV et reglages ─────────────────────────── */
  if (etape === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="font-display text-xl font-semibold text-text-primary">Mode Decouverte</h2>
          <p className="text-sm text-text-secondary">
            On lit ton CV, on en deduit tes metiers, et on va chercher les offres qui collent.
          </p>
        </div>

        <PdfDropzone
          fichier={cvFile}
          onFichier={setCvFile}
          tailleMaxMo={5}
          label="Depose ton CV"
          description="PDF, 5 Mo max"
          disabled={chargement}
        />

        <fieldset className="rounded-xl border border-border/60 bg-surface p-4">
          <legend className="px-1 text-sm font-semibold text-text-primary">Sources de recherche</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SOURCES.map((source) => {
              const choisie = sourcesChoisies.includes(source.id);
              return (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => basculerSource(source.id)}
                  aria-pressed={choisie}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                    choisie
                      ? 'border-primary/40 bg-primary-light text-primary'
                      : 'border-border bg-surface-elevated text-text-muted hover:border-border-light hover:text-text-secondary'
                  }`}
                >
                  <span aria-hidden="true">{source.emoji}</span>
                  <span>{source.libelle}</span>
                  {choisie && (
                    <span aria-hidden="true" className="ml-0.5">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-text-muted">
            {sourcesChoisies.length} source{sourcesChoisies.length > 1 ? 's' : ''} selectionnee
            {sourcesChoisies.length > 1 ? 's' : ''} · au moins une est necessaire
          </p>
        </fieldset>

        <fieldset className="rounded-xl border border-border/60 bg-surface p-4">
          <legend className="px-1 text-sm font-semibold text-text-primary">Filtres (optionnels)</legend>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="decouverte-localisation" className="mb-1 block text-xs text-text-secondary">
                Localisation
              </label>
              <input
                id="decouverte-localisation"
                type="text"
                placeholder="Ex : Paris, Lyon, Toulouse..."
                value={localisation}
                onChange={(evenement) => setLocalisation(evenement.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="decouverte-contrat" className="mb-1 block text-xs text-text-secondary">
                Type de contrat
              </label>
              <select
                id="decouverte-contrat"
                value={typeContrat}
                onChange={(evenement) => setTypeContrat(evenement.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">Tous types</option>
                <option value="CDI">CDI</option>
                <option value="CDD">CDD</option>
                <option value="Stage">Stage</option>
                <option value="Alternance">Alternance</option>
                <option value="Freelance">Freelance</option>
              </select>
            </div>
          </div>
        </fieldset>

        {erreur && <BlocErreur message={erreur} />}

        {chargement ? (
          <div className="flex justify-center py-4">
            <CatLoadingAnimation label="Analyse de ton profil en cours..." />
          </div>
        ) : (
          <button
            type="button"
            onClick={lancerAnalyse}
            disabled={!cvFile || sourcesChoisies.length === 0}
            className="w-full cursor-pointer rounded-xl bg-primary py-3 font-semibold text-primary-foreground transition-all hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Analyser mon profil &rarr;
          </button>
        )}
      </div>
    );
  }

  /* ── Etape 1 : metiers identifies ──────────────────────────────── */
  if (etape === 1) {
    return (
      <div className="space-y-6">
        <div>
          <BoutonRetour onClick={() => setEtape(0)}>Retour</BoutonRetour>
          <h2 className="font-display text-xl font-semibold text-text-primary">Ton profil, vu par l&apos;outil</h2>
          {resultat?.resume_profil && <p className="mt-1 text-sm text-text-secondary">{resultat.resume_profil}</p>}
        </div>

        <ul className="grid grid-cols-1 gap-3">
          {resultat?.metiers?.map((metier, index) => (
            <li key={index} className="rounded-xl border border-border/60 bg-surface p-4">
              {metier.niveau && (
                <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs capitalize text-text-secondary">
                  {metier.niveau}
                </span>
              )}
              <h3 className="mt-1 font-semibold text-text-primary">{metier.titre}</h3>
              {metier.description_courte && (
                <p className="mt-1 text-xs text-text-muted">{metier.description_courte}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {metier.mots_cles?.slice(0, 4).map((motCle, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-primary/20 bg-primary-light px-2 py-0.5 text-xs text-primary"
                  >
                    {motCle}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setEtape(2)}
          className="w-full cursor-pointer rounded-xl bg-primary py-3 font-semibold text-primary-foreground transition-all hover:bg-primary-hover"
        >
          Voir les offres trouvees ({resultat?.offres?.length || 0}) &rarr;
        </button>
      </div>
    );
  }

  /* ── Etape 3 : CV adapte a une offre ───────────────────────────── */
  if (etape === 3) {
    const cvData = resultatAdaptation?.cvData;

    return (
      <div className="space-y-6">
        <div>
          <BoutonRetour onClick={retourAuxOffres}>Retour aux offres</BoutonRetour>
          <h2 className="font-display text-xl font-semibold text-text-primary">
            CV adapte pour {offreAdaptee?.titre || 'cette offre'}
          </h2>
          {offreAdaptee?.entreprise && (
            <p className="mt-1 text-sm text-text-secondary">
              {offreAdaptee.entreprise}
              {offreAdaptee.lieu ? ` · ${offreAdaptee.lieu}` : ''}
            </p>
          )}
        </div>

        {adaptation && (
          <div className="flex flex-col items-center py-12">
            <CatLoadingAnimation label="Adaptation de ton CV en cours..." />
            <p className="mt-3 text-xs text-text-muted">Cela prend 30 a 60 secondes</p>
          </div>
        )}

        {erreurAdaptation && !adaptation && (
          <BlocErreur message={erreurAdaptation} onReessayer={() => adapterLeCv(offreAdaptee)} />
        )}

        {resultatAdaptation && !adaptation && (
          <>
            {/* Meme affichage de score que le mode matching : un seul endroit
                a corriger, et l'utilisateur retrouve la meme lecture. */}
            <MatcherTransparency
              score={resultatAdaptation.score_matching}
              correspondance={correspondance}
              modifications={resultatAdaptation.modifications_apportees}
            />

            {cvData && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-sm font-bold text-text-primary">Texte a copier dans ton CV</h3>
                  <CopyButton texte={assemblerCv(cvData)} label="Copier tout" />
                </div>

                {cvData.titre_poste && <SectionTexte titre="Titre" emoji="🏷️" texte={cvData.titre_poste} />}
                <SectionTexte titre="Resume" emoji="📝" texte={cvData.resume} />
                {cvData.experiences?.length > 0 && (
                  <SectionTexte titre="Experiences" emoji="💼" texte={formaterExperiences(cvData.experiences)} />
                )}
                {cvData.formations?.length > 0 && (
                  <SectionTexte titre="Formations" emoji="🎓" texte={formaterFormations(cvData.formations)} />
                )}
                <SectionTexte titre="Competences" emoji="⚡" texte={cvData.competences_techniques} />
                <SectionTexte titre="Qualites personnelles" emoji="🤝" texte={cvData.competences_soft} />
                <SectionTexte titre="Langues" emoji="🌍" texte={cvData.langues} />
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {offreAdaptee?.url && (
                <a
                  href={offreAdaptee.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  // Meme couple de couleurs que le bouton primaire du projet
                  // (bg-primary / text-primary-foreground) : c'est la seule
                  // paire dont le contraste a ete pense pour les deux themes.
                  className="rounded-xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  Postuler (nouvel onglet) ↗
                </a>
              )}
              <button
                type="button"
                onClick={retourAuxOffres}
                className={`cursor-pointer rounded-xl border border-border-light py-3 text-sm font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary ${
                  offreAdaptee?.url ? '' : 'sm:col-span-2'
                }`}
              >
                &larr; Voir d&apos;autres offres
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  /* ── Etape 2 : la liste des offres ─────────────────────────────── */
  return (
    <div className="space-y-5">
      <div>
        <BoutonRetour onClick={() => setEtape(1)}>Retour</BoutonRetour>
        <h2 className="font-display text-xl font-semibold text-text-primary">Offres trouvees pour toi</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {offresAffichees.length} offre{offresAffichees.length > 1 ? 's' : ''}, les plus proches de ton CV en premier.
        </p>
      </div>

      {resultat?.metiers?.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <FiltreMetier actif={!filtreMetier} onClick={() => setFiltreMetier('')}>
            Tous
          </FiltreMetier>
          {resultat.metiers.map((metier, index) => (
            <FiltreMetier
              key={index}
              actif={filtreMetier === metier.titre}
              onClick={() => setFiltreMetier(metier.titre)}
            >
              {metier.titre}
            </FiltreMetier>
          ))}
        </div>
      )}

      {offresAffichees.length === 0 ? (
        <div className="py-12 text-center text-text-muted">
          <div className="mb-3 text-4xl" aria-hidden="true">
            🔍
          </div>
          <p>Aucune offre ne correspond a ce filtre.</p>
          <p className="mt-1 text-sm">Essaie sans filtre, ou relance une recherche.</p>
        </div>
      ) : (
        <ul className="max-h-[500px] space-y-3 overflow-y-auto pr-1">
          {offresAffichees.map((offre, index) => (
            <CarteOffre
              key={offre.url || `${offre.titre}-${index}`}
              offre={offre}
              onAdapter={() => adapterLeCv(offre)}
              onSelectionner={onSelectOffer ? () => onSelectOffer(offre) : null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Une offre ─────────────────────────────────────────────────────── */

function CarteOffre({ offre, onAdapter, onSelectionner }) {
  const score = Number(offre.score_correspondance);
  const aUnScore = Number.isFinite(score);

  // Les deux listes disent la meme chose que le score, mais en concret :
  // « 8 des 9 competences demandees » se comprend sans explication.
  const communes = Array.isArray(offre.competences_communes) ? offre.competences_communes.length : 0;
  const manquantes = Array.isArray(offre.competences_manquantes) ? offre.competences_manquantes.length : 0;
  const total = communes + manquantes;

  return (
    <li className="rounded-xl border border-border/60 bg-surface p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-xs ${TONS_SOURCE[offre.source] || 'border-border bg-surface-elevated text-text-muted'}`}>
              {offre.source}
            </span>
            {offre.contrat && <span className="text-xs text-text-muted">{offre.contrat}</span>}
            {aUnScore && <PastilleScore score={score} />}
          </div>

          <h3 className="truncate text-sm font-semibold text-text-primary">{offre.titre}</h3>

          <p className="mt-0.5 text-xs text-text-secondary">
            {offre.entreprise && <span>{offre.entreprise}</span>}
            {offre.lieu && <span> · {offre.lieu}</span>}
          </p>

          {total > 0 && (
            <p className="mt-1 text-xs text-text-muted">
              {communes} des {total} competences demandees sont deja dans ton CV
              {manquantes > 0 && (
                <>
                  {' '}
                  · il manque{' '}
                  <span className="font-medium text-warning">
                    {offre.competences_manquantes.slice(0, 3).join(', ')}
                    {manquantes > 3 ? `, +${manquantes - 3}` : ''}
                  </span>
                </>
              )}
            </p>
          )}

          {offre.description && <p className="mt-1 line-clamp-2 text-xs text-text-muted">{offre.description}</p>}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {offre.url && (
            <a
              href={offre.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-border-light px-2 py-1 text-xs text-text-secondary transition-colors hover:border-primary hover:text-primary"
            >
              Voir ↗
            </a>
          )}
          <button
            type="button"
            onClick={onAdapter}
            className="cursor-pointer whitespace-nowrap rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary-hover"
          >
            Adapter CV
          </button>
          {onSelectionner && (
            <button
              type="button"
              onClick={onSelectionner}
              className="cursor-pointer whitespace-nowrap rounded-lg border border-border-light px-2 py-1 text-xs text-text-secondary transition-colors hover:border-primary hover:text-primary"
            >
              Remplir le formulaire
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function PastilleScore({ score }) {
  const ton =
    score >= 75
      ? 'border-success/25 bg-success/10 text-success'
      : score >= 50
        ? 'border-warning/25 bg-warning/10 text-warning'
        : 'border-border bg-surface-elevated text-text-muted';

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${ton}`}>
      {Math.round(score)} % de correspondance
    </span>
  );
}

/* ── Briques communes ──────────────────────────────────────────────── */

function SectionTexte({ titre, emoji, texte }) {
  if (!texte) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm" aria-hidden="true">
            {emoji}
          </span>
          <span className="text-xs font-medium text-text-primary">{titre}</span>
        </div>
        <CopyButton texte={texte} label={`Copier ${titre.toLowerCase()}`} />
      </div>
      <div className="rounded-lg border border-border/60 bg-surface-elevated p-2">
        <p className="whitespace-pre-line text-xs leading-relaxed text-text-secondary">{texte}</p>
      </div>
    </div>
  );
}

function BoutonRetour({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 flex cursor-pointer items-center gap-1 text-xs text-text-muted transition-colors hover:text-text-primary"
    >
      &larr; {children}
    </button>
  );
}

function FiltreMetier({ actif, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors ${
        actif
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border-light text-text-secondary hover:border-primary hover:text-primary'
      }`}
    >
      {children}
    </button>
  );
}

function BlocErreur({ message, onReessayer }) {
  return (
    <div role="alert" className="rounded-xl border border-error/25 bg-error/8 p-4">
      <p className="text-sm text-error">{message}</p>
      {onReessayer && (
        <button
          type="button"
          onClick={onReessayer}
          className="mt-2 cursor-pointer text-xs text-error underline hover:opacity-80"
        >
          Reessayer
        </button>
      )}
    </div>
  );
}

/* ── Mise en forme des textes ──────────────────────────────────────── */

function formaterExperiences(experiences) {
  if (!experiences?.length) return '';
  return experiences
    .map((experience) => {
      const lignes = [];
      if (experience.poste) lignes.push(experience.poste);
      const meta = [
        experience.entreprise,
        experience.localisation,
        [experience.date_debut, experience.date_fin].filter(Boolean).join(' - '),
      ]
        .filter(Boolean)
        .join(' | ');
      if (meta) lignes.push(meta);
      if (experience.description) lignes.push(experience.description);
      return lignes.join('\n');
    })
    .join('\n\n');
}

function formaterFormations(formations) {
  if (!formations?.length) return '';
  return formations
    .map((formation) => {
      const lignes = [];
      if (formation.diplome) lignes.push(formation.diplome);
      const meta = [formation.etablissement, formation.localisation, formation.date_fin].filter(Boolean).join(' | ');
      if (meta) lignes.push(meta);
      return lignes.join('\n');
    })
    .join('\n\n');
}

/** Tout le CV en un seul bloc, pour le bouton « Copier tout ». */
function assemblerCv(cvData) {
  return [
    cvData.titre_poste && `Titre : ${cvData.titre_poste}`,
    cvData.resume && `\nResume :\n${cvData.resume}`,
    cvData.experiences?.length && `\nExperiences :\n${formaterExperiences(cvData.experiences)}`,
    cvData.formations?.length && `\nFormations :\n${formaterFormations(cvData.formations)}`,
    cvData.competences_techniques && `\nCompetences :\n${cvData.competences_techniques}`,
    cvData.competences_soft && `\nQualites personnelles :\n${cvData.competences_soft}`,
    cvData.langues && `\nLangues :\n${cvData.langues}`,
  ]
    .filter(Boolean)
    .join('\n');
}
