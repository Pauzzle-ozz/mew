'use client';

import Logo from '@/components/shared/Logo';

/**
 * Ecran d'attente plein page.
 *
 * POURQUOI CE COMPOSANT EXISTE
 * Le meme bloc etait recopie cinq fois dans les pages. Une des copies avait
 * derive et posait un fond noir en dur : en theme clair, l'ecran de chargement
 * devenait une page noire au milieu d'une interface beige. Ici, on utilise
 * uniquement les variables de theme (bg-background), donc les deux themes
 * restent corrects par construction.
 *
 * Cote accessibilite : un chargement purement visuel (un rond qui tourne) ne
 * dit rien a un lecteur d'ecran. role="status" + aria-live="polite" font
 * annoncer le message d'attente sans interrompre ce que la personne ecoute.
 *
 * @param {string} message  texte affiche et annonce pendant l'attente
 */
export default function LoadingScreen({ message = 'Chargement...' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background"
    >
      <Logo size="md" link={false} />

      {/* motion-reduce:animate-none : une animation en boucle peut declencher des
          troubles vestibulaires. On respecte le reglage systeme "reduire les
          animations" plutot que d'imposer la rotation a tout le monde. */}
      <div
        className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none"
        aria-hidden="true"
      />

      <p className="text-sm font-medium text-text-secondary">{message}</p>
    </div>
  );
}
