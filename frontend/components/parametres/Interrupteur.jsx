'use client';

/**
 * UN INTERRUPTEUR ACCESSIBLE.
 *
 * POURQUOI `role="switch"` ET PAS UNE CASE A COCHER
 * Une case a cocher dit « je selectionne cette option pour plus tard ».
 * Un interrupteur dit « ca s'applique maintenant ». C'est bien le second sens
 * ici : couper une tache change ce que fera l'outil au prochain clic. Les
 * lecteurs d'ecran annoncent alors « active » / « desactive » au lieu de
 * « coche » / « decoche ».
 *
 * La couleur ne porte JAMAIS l'information a elle seule : la pastille se
 * deplace, et le libelle a cote dit en toutes lettres ce qui se passe.
 */
export default function Interrupteur({ actif, onChange, libelle, decrit, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={actif}
      aria-label={libelle}
      aria-describedby={decrit}
      disabled={disabled}
      onClick={() => onChange(!actif)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        actif ? 'bg-primary' : 'bg-border-light'
      } ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          actif ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
