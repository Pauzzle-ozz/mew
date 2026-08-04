'use client';

import { useEffect, useRef, useState } from 'react';
import { IconCheck, IconCopy } from '@/components/shared/icons';

/**
 * Bouton "copier dans le presse-papiers".
 *
 * POURQUOI CE COMPOSANT EXISTE
 * Le meme bouton etait ecrit trois fois dans le projet, avec trois apparences
 * differentes (couleurs en dur, durees de confirmation differentes) et, surtout,
 * une confirmation purement visuelle : la coche verte ne disait rien a une
 * personne qui n'utilise pas ses yeux pour lire l'ecran. La region aria-live
 * ci-dessous corrige cela.
 *
 * @param {string}   texte     contenu a copier
 * @param {string}   label     texte du bouton (par defaut "Copier")
 * @param {Function} onCopie   optionnel, appele apres une copie reussie
 */
export default function CopyButton({
  texte = '',
  label = 'Copier',
  onCopie,
  className = '',
}) {
  // 'pret' | 'copie' | 'echec'
  const [etat, setEtat] = useState('pret');
  const minuteur = useRef(null);

  // Sans ce nettoyage, un setEtat s'executerait apres le demontage du composant
  // (par exemple si l'utilisateur change de page dans les 2 secondes).
  useEffect(() => {
    return () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    };
  }, []);

  const signaler = (nouvelEtat) => {
    setEtat(nouvelEtat);
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setEtat('pret'), 2000);
  };

  const copier = async () => {
    if (!texte) return;

    try {
      // navigator.clipboard n'existe qu'en HTTPS (ou sur localhost) et peut etre
      // refuse par l'utilisateur : d'ou le repli juste en dessous.
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texte);
      } else {
        copierParTextarea(texte);
      }
      signaler('copie');
      onCopie?.();
    } catch {
      try {
        copierParTextarea(texte);
        signaler('copie');
        onCopie?.();
      } catch {
        signaler('echec');
      }
    }
  };

  const copie = etat === 'copie';
  const echec = etat === 'echec';

  const apparence = copie
    ? 'border-success/30 bg-success/10 text-success'
    : echec
      ? 'border-error/30 bg-error/10 text-error'
      : 'border-primary/20 bg-primary-light text-primary hover:bg-primary/15';

  return (
    <>
      <button
        type="button"
        onClick={copier}
        disabled={!texte}
        aria-label={copie ? 'Texte copie dans le presse-papiers' : `${label} dans le presse-papiers`}
        className={`
          inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5
          text-xs font-semibold transition-colors duration-200
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background
          disabled:cursor-not-allowed disabled:opacity-40
          ${apparence} ${className}
        `}
      >
        {copie ? <IconCheck className="h-3.5 w-3.5" /> : <IconCopy className="h-3.5 w-3.5" />}
        {copie ? 'Copie !' : echec ? 'Echec de la copie' : label}
      </button>

      {/* Region d'annonce dediee, invisible a l'oeil.
          On ne se repose PAS sur le changement de texte du bouton : selon le
          lecteur d'ecran, une etiquette qui change sous le focus n'est pas
          relue. Un aria-live="polite" separe, lui, est annonce de facon fiable. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copie ? 'Texte copie dans le presse-papiers.' : ''}
        {echec ? 'La copie a echoue. Selectionne le texte et copie-le a la main.' : ''}
      </span>
    </>
  );
}

/**
 * Repli historique : on cree un textarea hors ecran, on selectionne son contenu
 * et on demande au navigateur de le copier. document.execCommand est deprecie
 * mais reste le seul recours quand l'API presse-papiers est indisponible.
 */
function copierParTextarea(texte) {
  const zone = document.createElement('textarea');
  zone.value = texte;
  // position fixed + opacity 0 : le champ ne doit ni s'afficher, ni faire
  // sauter le defilement de la page au moment du focus.
  zone.setAttribute('readonly', '');
  zone.style.position = 'fixed';
  zone.style.top = '0';
  zone.style.left = '0';
  zone.style.opacity = '0';
  zone.style.pointerEvents = 'none';

  document.body.appendChild(zone);
  zone.select();
  zone.setSelectionRange(0, texte.length);

  try {
    const reussi = document.execCommand('copy');
    if (!reussi) throw new Error('execCommand a renvoye false');
  } finally {
    document.body.removeChild(zone);
  }
}
