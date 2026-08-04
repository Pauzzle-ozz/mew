'use client';

import { IconChevronRight } from '@/components/shared/icons';

/**
 * Resultat du matcher : le score de correspondance, ce qui le compose,
 * et ce qu'il reste a faire pour l'ameliorer.
 *
 * POURQUOI CE COMPOSANT A CHANGE
 * Le nombre affiche dans le cercle venait du modele de langage, dans une
 * reponse dont le prompt exigeait par ailleurs « un score MINIMUM de 80/100 ».
 * Il mesurait donc l'obeissance du modele, pas la correspondance du candidat
 * avec l'offre. Le backend le calcule maintenant (core/score/matching.js) et
 * renvoie le detail complet dans `correspondance`. Ce composant existe pour
 * montrer ce detail : un score seul n'a jamais aide personne, « il te manque
 * kubernetes » si.
 *
 * COMPATIBILITE HISTORIQUE
 * L'historique rejoue des analyses archivees, faites avant l'existence de
 * `correspondance`. Quand la prop est absente ou mal formee, on retombe sur
 * l'ancien affichage (le cercle et la comparaison avant/apres) sans rien
 * casser. C'est pour cela que chaque bloc teste ses donnees avant de sortir.
 *
 * @param {number} score           ancien champ, garde comme secours
 * @param {object} correspondance  { score, criteres, competencesCommunes,
 *                                   competencesManquantes, actions }
 */
export default function MatcherTransparency({
  score,
  correspondance,
  modifications,
  cvDataOriginal,
  cvDataOptimized,
  onBack,
}) {
  // correspondance.score fait autorite ; `score` reste le secours pour les
  // resultats archives qui n'avaient que lui.
  const note = normaliserNote(correspondance?.score ?? score);
  const ton = tonDuScore(note);

  const criteres = Array.isArray(correspondance?.criteres) ? correspondance.criteres : [];
  const communes = listeDeTextes(correspondance?.competencesCommunes);
  const manquantes = listeDeTextes(correspondance?.competencesManquantes);
  const actions = Array.isArray(correspondance?.actions) ? correspondance.actions : [];

  const sections = construireSections(cvDataOriginal, cvDataOptimized);

  return (
    <div className="space-y-8">
      {/* ── Le score ─────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-4">
        <h2 className="font-display text-xl font-semibold text-text-primary">Score de correspondance</h2>

        <Jauge note={note} classeTrait={ton.trait} />

        <span className={`rounded-full px-3 py-1 text-sm font-medium ${ton.badge}`}>{ton.libelle}</span>

        {criteres.length > 0 && (
          <p className="max-w-md text-center text-xs leading-relaxed text-text-muted">
            Ce score est calcule a partir de l&apos;offre et de ton CV, sans intervention de l&apos;IA. Le
            detail complet est juste en dessous.
          </p>
        )}
      </div>

      {/* ── Ce qui manque : le bloc le plus utile de la page ──────── */}
      {manquantes.length > 0 && (
        <section className="rounded-2xl border border-warning/25 bg-warning/8 p-5">
          <h3 className="font-display text-sm font-semibold text-text-primary">
            Ce que l&apos;offre demande et qui n&apos;apparait pas dans ton CV
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            Si tu pratiques ces points, nomme-les avec les mots exacts de l&apos;offre : les filtres
            automatiques cherchent ces mots-la, pas des synonymes.
          </p>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {manquantes.map((competence) => (
              <li
                key={competence}
                className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning"
              >
                {competence}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Les actions proposees ────────────────────────────────── */}
      {actions.length > 0 && (
        <section className="rounded-2xl border border-border/60 bg-surface p-5">
          <h3 className="font-display text-sm font-semibold text-text-primary">Comment gagner des points</h3>
          <ul className="mt-3 space-y-3">
            {actions.map((action, index) => (
              <li key={action?.id || index} className="flex items-start gap-3">
                <PastilleDePriorite priorite={action?.priorite} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-text-secondary">{action?.message}</p>
                  {/* Un gain de 0 point existe : ce sont les messages de
                      fiabilite (« l'offre donne peu d'informations »). Les
                      afficher comme « +0 pts » ferait croire a un bug. */}
                  {Number(action?.gain) > 0 && (
                    <p className="mt-0.5 text-xs font-semibold tabular-nums text-primary">
                      Jusqu&apos;a +{Math.round(Number(action.gain))} points
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Le detail critere par critere ────────────────────────── */}
      {criteres.length > 0 && <BlocCriteres criteres={criteres} />}

      {/* ── Ce qui correspond deja ───────────────────────────────── */}
      {communes.length > 0 && (
        <section className="rounded-2xl border border-border/60 bg-surface p-5">
          <h3 className="font-display text-sm font-semibold text-text-primary">
            Points communs entre ton CV et l&apos;offre
            <span className="ml-2 font-normal tabular-nums text-text-muted">
              {communes.length} sur {communes.length + manquantes.length}
            </span>
          </h3>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {communes.map((competence) => (
              <li
                key={competence}
                className="rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-xs font-medium text-success"
              >
                {competence}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Modifications apportees au CV ────────────────────────── */}
      {modifications?.length > 0 && (
        <section className="rounded-2xl border border-border/60 bg-surface-elevated/60 p-5">
          <h3 className="font-display text-sm font-semibold text-text-primary">
            Modifications apportees a ton CV
          </h3>
          <ul className="mt-3 space-y-2">
            {modifications.map((modification, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-text-secondary">
                <span className="mt-0.5 shrink-0 text-success" aria-hidden="true">
                  &rarr;
                </span>
                <span>{modification}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Comparaison avant / apres ────────────────────────────── */}
      {sections.length > 0 && (
        <section className="space-y-4">
          <h3 className="font-display text-sm font-semibold text-text-primary">Avant / apres, section par section</h3>
          {sections.map((section) => (
            <div key={section.cle} className="overflow-hidden rounded-xl border border-border/60">
              <div className="border-b border-border/60 bg-surface-elevated px-4 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{section.libelle}</span>
              </div>
              {/* Une colonne sur mobile : deux colonnes de texte long sur un
                  telephone donnent des mots coupes toutes les trois lettres. */}
              <div className="grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <div className="bg-error/5 p-4">
                  <p className="mb-2 text-xs font-medium text-error">Avant</p>
                  <p className="text-sm leading-relaxed text-text-secondary">{section.avant}</p>
                </div>
                <div className="bg-success/5 p-4">
                  <p className="mb-2 text-xs font-medium text-success">Apres</p>
                  <p className="text-sm leading-relaxed text-text-secondary">{section.apres}</p>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {onBack && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onBack}
            className="cursor-pointer rounded-xl border border-border-light px-5 py-3 text-sm font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary"
          >
            &larr; Modifier les donnees
          </button>
        </div>
      )}
    </div>
  );
}

/* ── La jauge circulaire ───────────────────────────────────────────── */

// Circonference du cercle de rayon 58 : 2 x PI x 58 = 364,4.
const CIRCONFERENCE = 364;

function Jauge({ note, classeTrait }) {
  return (
    <div className="relative flex items-center justify-center">
      {/* role="img" + aria-label : sans cela un lecteur d'ecran lit deux
          cercles vides. Le nombre est aussi ecrit en clair au centre, donc
          le SVG lui-meme peut rester une image resumee en une phrase. */}
      <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={`Score de ${note} sur 100`}>
        <circle cx="70" cy="70" r="58" fill="none" strokeWidth="12" className="stroke-border" />
        <circle
          cx="70"
          cy="70"
          r="58"
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(note / 100) * CIRCONFERENCE} ${CIRCONFERENCE}`}
          strokeDashoffset="91"
          className={`${classeTrait} transition-[stroke-dasharray] duration-1000 ease-out motion-reduce:transition-none`}
        />
      </svg>
      <div className="absolute flex flex-col items-center" aria-hidden="true">
        <span className="text-4xl font-bold tabular-nums text-text-primary">{note}</span>
        <span className="text-xs text-text-muted">/ 100</span>
      </div>
    </div>
  );
}

/* ── Le detail par critere ─────────────────────────────────────────── */

function BlocCriteres({ criteres }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-surface p-5">
      <h3 className="font-display text-sm font-semibold text-text-primary">Detail du calcul</h3>
      {/* La phrase qui explique le denominateur variable. Sans elle, un
          critere « non mesurable » passe pour un zero qu'on cacherait. */}
      <p className="mt-1 text-xs leading-relaxed text-text-muted">
        Un critere que l&apos;offre ne permet pas de mesurer (elle ne dit rien du diplome, par exemple) sort du
        calcul <em>et</em> du total. Il ne compte pas comme un zero : il ne te penalise pas.
      </p>

      <ul className="mt-4 space-y-3">
        {criteres.map((critere, index) => (
          <LigneCritere key={critere?.id || index} critere={critere} />
        ))}
      </ul>
    </section>
  );
}

function LigneCritere({ critere }) {
  // applicable !== false : un enregistrement ancien, sans le champ, est
  // traite comme mesurable. C'est le cas le plus frequent.
  const applicable = critere?.applicable !== false;
  const poids = Number(critere?.poids) || 0;
  const obtenu = Number(critere?.obtenu) || 0;
  const pourcentage = poids > 0 ? Math.round((obtenu / poids) * 100) : 0;

  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-text-primary">{critere?.libelle || critere?.id || 'Critere'}</span>

        {applicable ? (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-text-secondary">
            {formaterNombre(obtenu)} / {formaterNombre(poids)} pts
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-border-light px-2 py-0.5 text-xs font-medium text-text-muted">
            non mesurable sur cette offre
          </span>
        )}
      </div>

      {applicable && (
        // aria-hidden : la barre ne fait que redire le « X / Y pts » ecrit
        // juste au-dessus. L'annoncer deux fois serait du bruit.
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border" aria-hidden="true">
          <div
            className={`h-full rounded-full transition-all duration-700 ${couleurBarre(pourcentage)}`}
            style={{ width: `${Math.max(0, Math.min(100, pourcentage))}%` }}
          />
        </div>
      )}

      {critere?.detail && <p className="mt-1 text-xs leading-relaxed text-text-muted">{critere.detail}</p>}
    </li>
  );
}

/* ── Petites briques ───────────────────────────────────────────────── */

function PastilleDePriorite({ priorite }) {
  const couleur =
    priorite === 'haute' ? 'text-error' : priorite === 'moyenne' ? 'text-warning' : 'text-text-muted';

  return <IconChevronRight className={`mt-0.5 h-4 w-4 shrink-0 ${couleur}`} />;
}

/* ── Utilitaires ───────────────────────────────────────────────────── */

function normaliserNote(valeur) {
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre)) return 0;
  return Math.max(0, Math.min(100, Math.round(nombre)));
}

function tonDuScore(note) {
  if (note >= 75) {
    return { trait: 'stroke-success', badge: 'bg-success/10 text-success', libelle: 'Bonne correspondance' };
  }
  if (note >= 50) {
    return { trait: 'stroke-warning', badge: 'bg-warning/10 text-warning', libelle: 'Correspondance moyenne' };
  }
  return { trait: 'stroke-error', badge: 'bg-error/10 text-error', libelle: 'Correspondance partielle' };
}

function couleurBarre(pourcentage) {
  if (pourcentage >= 80) return 'bg-success';
  if (pourcentage >= 50) return 'bg-warning';
  return 'bg-error';
}

/**
 * Le backend renvoie des tableaux de chaines, mais un resultat archive peut
 * contenir n'importe quoi. On filtre pour ne jamais essayer d'afficher un
 * objet dans du JSX (ce qui ferait planter le rendu).
 */
function listeDeTextes(valeur) {
  if (!Array.isArray(valeur)) return [];
  return valeur.map((element) => String(element ?? '').trim()).filter(Boolean);
}

/** Les seules sections comparables : celles qui existent des deux cotes ET qui ont change. */
function construireSections(avant, apres) {
  const candidates = [
    { cle: 'titre_poste', libelle: 'Titre du poste', avant: avant?.titre_poste, apres: apres?.titre_poste },
    { cle: 'resume', libelle: 'Resume professionnel', avant: avant?.resume, apres: apres?.resume },
  ];

  if (avant?.experiences?.length && apres?.experiences?.length) {
    candidates.push({
      cle: 'experiences',
      libelle: 'Experiences (la premiere)',
      avant: avant.experiences[0]?.description,
      apres: apres.experiences[0]?.description,
    });
  }

  return candidates.filter((section) => section.avant && section.apres && section.avant !== section.apres);
}

/** 3 -> « 3 » et 3.5 -> « 3,5 » : meme convention que les messages du backend. */
function formaterNombre(valeur) {
  const nombre = Math.round((Number(valeur) || 0) * 10) / 10;
  return Number.isInteger(nombre) ? String(nombre) : String(nombre).replace('.', ',');
}
