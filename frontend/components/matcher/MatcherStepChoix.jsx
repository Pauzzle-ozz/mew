'use client';

import { IconSearch, IconTarget } from '@/components/shared/icons';

/**
 * Premier ecran du matcher : choisir entre partir d'une offre precise
 * ou partir de son CV.
 *
 * Sorti de app/solutions/matcher-offres/page.js, qui melangeait l'etat de
 * l'outil et le dessin de ses trois ecrans sur 880 lignes.
 *
 * @param {Function} onChoisir appele avec 'matching' ou 'decouverte'
 */
export default function MatcherStepChoix({ onChoisir }) {
  return (
    <div className="mx-auto grid max-w-2xl animate-fade-in grid-cols-1 gap-6 md:grid-cols-2">
      <CarteMode
        icone={<IconTarget className="mb-4 h-10 w-10 text-primary" />}
        titre="Adapter mon CV"
        description="J'ai une offre precise. L'outil calcule ma correspondance et l'IA reecrit le texte de mon CV."
        etiquettes={['PDF + lien', 'Lien seul', 'Formulaire']}
        onClick={() => onChoisir('matching')}
        tonAccent="text-primary"
      />

      <CarteMode
        icone={<IconSearch className="mb-4 h-10 w-10 text-accent" />}
        titre="Trouver des offres"
        description="Je depose mon CV, l'outil en deduit mes metiers et va chercher les offres qui me correspondent."
        etiquettes={['WTTJ', 'France Travail', 'Offres classees']}
        onClick={() => onChoisir('decouverte')}
        tonAccent="text-accent"
      />
    </div>
  );
}

function CarteMode({ icone, titre, description, etiquettes, onClick, tonAccent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group cursor-pointer rounded-2xl border border-border/60 bg-surface p-8 text-left transition-all hover:border-primary/60 hover:bg-primary-light"
    >
      {icone}
      <h2 className="font-display mb-2 text-lg font-bold text-text-primary">{titre}</h2>
      <p className="text-sm leading-relaxed text-text-secondary">{description}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {etiquettes.map((etiquette) => (
          <span key={etiquette} className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
            {etiquette}
          </span>
        ))}
      </div>

      {/* motion-reduce : le petit glissement au survol est du decor, il n'a
          aucune raison d'etre impose a qui a demande moins d'animations. */}
      <p
        className={`mt-5 text-sm font-semibold transition-transform group-hover:translate-x-1 motion-reduce:transform-none ${tonAccent}`}
      >
        Commencer &rarr;
      </p>
    </button>
  );
}
