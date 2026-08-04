'use client';

import { useId, useRef, useState } from 'react';
import { IconDocumentUpload, IconX } from '@/components/shared/icons';

/**
 * Zone de depot d'un CV au format PDF.
 *
 * POURQUOI CE COMPOSANT EXISTE
 * Le projet contenait six zones de depot copiees-collees, toutes construites sur le
 * meme schema : un <div onClick> qui declenche un <input type="file"> portant
 * className="hidden". Deux consequences mesurees avant cette refonte :
 *
 * 1) INACCESSIBLE AU CLAVIER. Un <div> n'est pas focusable, et className="hidden"
 *    pose display:none, ce qui retire l'input de l'ordre de tabulation. Resultat :
 *    une personne qui navigue au clavier ne pouvait deposer AUCUN CV, donc n'avait
 *    acces a aucun des cinq outils. Pour un service de recherche d'emploi, cela
 *    revient a fermer la porte a une partie des candidats.
 *    Le correctif tient en un mot : sr-only au lieu de hidden. La classe sr-only
 *    masque visuellement l'element mais le laisse dans l'arbre d'accessibilite et
 *    dans l'ordre de tabulation. On garde donc un VRAI <input type="file"> relie a
 *    un <label htmlFor> : c'est la construction que les lecteurs d'ecran
 *    interpretent le mieux, et un input file s'active nativement au clavier.
 *
 * 2) REFUS SILENCIEUX. CandidateProfileForm.jsx faisait, en une ligne :
 *      if (file.size > 2 * 1024 * 1024) return;
 *    Aucun message. L'utilisateur choisissait son fichier, et il ne se passait
 *    rien du tout : impossible de deviner que le PDF etait trop lourd. Ici, tout
 *    refus produit un message dans un element role="alert", donc annonce
 *    immediatement par les lecteurs d'ecran et visible pour tout le monde.
 *
 * @param {File|null}  fichier      le fichier actuellement retenu (composant controle)
 * @param {Function}   onFichier    appele avec le File valide, ou null quand on retire
 * @param {number}     tailleMaxMo  limite de poids en Mo
 * @param {string}     label        titre affiche dans la zone
 * @param {string}     description  texte d'aide sous le titre
 * @param {boolean}    disabled     desactive la zone (pendant un traitement par exemple)
 */
export default function PdfDropzone({
  fichier = null,
  onFichier,
  tailleMaxMo = 5,
  label = 'Depose ton CV',
  description,
  disabled = false,
  className = '',
}) {
  const [survol, setSurvol] = useState(false);
  const [erreur, setErreur] = useState('');
  const inputRef = useRef(null);
  // Le survol de fichier declenche aussi dragleave quand le curseur passe sur un
  // enfant de la zone. Ce compteur distingue "je sors vraiment" de "je change
  // d'element a l'interieur", sinon le cadre clignote pendant le glisser.
  const profondeurSurvol = useRef(0);

  const idUnique = useId();
  const idInput = `pdf-dropzone-${idUnique}`;
  const idAide = `${idInput}-aide`;
  const idErreur = `${idInput}-erreur`;

  const aide = description || `PDF, ${tailleMaxMo} Mo max`;

  /**
   * Seule porte d'entree d'un fichier, quelle que soit son origine (clic ou
   * glisser-deposer). Un refus ne vide jamais la selection precedente : si
   * quelqu'un depose par erreur un mauvais fichier, il garde celui qui marchait.
   */
  const traiterFichier = (candidat) => {
    if (disabled || !candidat) return;

    const message = validerPdf(candidat, tailleMaxMo);
    if (message) {
      setErreur(message);
      return;
    }

    setErreur('');
    onFichier?.(candidat);
  };

  const ouvrirSelecteur = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const surChangementInput = (evenement) => {
    traiterFichier(evenement.target.files?.[0]);
    // On vide l'input : sans cela, rechoisir le MEME fichier apres l'avoir retire
    // ne declenche aucun evenement change, et l'interface parait bloquee.
    evenement.target.value = '';
  };

  const surTouche = (evenement) => {
    if (disabled) return;
    // Entree et Espace sont les deux touches qui activent un bouton.
    // preventDefault sur Espace est obligatoire : sans lui, la barre d'espace
    // fait defiler la page en meme temps qu'elle ouvre le selecteur.
    if (evenement.key === 'Enter' || evenement.key === ' ' || evenement.key === 'Spacebar') {
      evenement.preventDefault();
      ouvrirSelecteur();
    }
  };

  const surDragOver = (evenement) => {
    if (disabled) return;
    // Sans preventDefault, le navigateur refuse le depot et ouvre le PDF
    // dans un nouvel onglet a la place.
    evenement.preventDefault();
    evenement.dataTransfer.dropEffect = 'copy';
  };

  const surDragEnter = (evenement) => {
    if (disabled) return;
    evenement.preventDefault();
    profondeurSurvol.current += 1;
    setSurvol(true);
  };

  const surDragLeave = () => {
    if (disabled) return;
    profondeurSurvol.current -= 1;
    if (profondeurSurvol.current <= 0) {
      profondeurSurvol.current = 0;
      setSurvol(false);
    }
  };

  const surDrop = (evenement) => {
    evenement.preventDefault();
    profondeurSurvol.current = 0;
    setSurvol(false);
    if (disabled) return;
    traiterFichier(evenement.dataTransfer.files?.[0]);
  };

  const retirer = (evenement) => {
    // stopPropagation : le bouton est a l'interieur de la zone cliquable ; sans
    // cela, retirer le fichier rouvrirait aussitot le selecteur.
    evenement.stopPropagation();
    setErreur('');
    if (inputRef.current) inputRef.current.value = '';
    onFichier?.(null);
  };

  // aria-describedby peut pointer vers plusieurs elements : on annonce l'aide,
  // et le message d'erreur quand il y en a un.
  const decritPar = erreur ? `${idAide} ${idErreur}` : idAide;

  const bordure = disabled
    ? 'border-border bg-surface-elevated/40'
    : erreur
      ? 'border-error/60 bg-error/5'
      : survol
        ? 'border-primary bg-primary-light'
        : fichier
          ? 'border-success/60 bg-success/5'
          : 'border-border-light bg-surface hover:border-primary/60 hover:bg-primary-light/50';

  return (
    <div className={className}>
      {/* L'input reste un vrai champ de formulaire, simplement masque a l'oeil.
          sr-only (et non hidden) : il garde le focus clavier et son etiquette. */}
      <input
        ref={inputRef}
        id={idInput}
        type="file"
        accept=".pdf,application/pdf"
        className="sr-only"
        onChange={surChangementInput}
        disabled={disabled}
        aria-describedby={decritPar}
      />
      <label htmlFor={idInput} className="sr-only">
        {label} (fichier PDF, {tailleMaxMo} Mo maximum)
      </label>

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-label={
          fichier
            ? `${label}. Fichier choisi : ${fichier.name}. Activer pour en choisir un autre.`
            : `${label}. Activer pour choisir un fichier PDF, ou glisser le fichier ici.`
        }
        aria-describedby={decritPar}
        onClick={ouvrirSelecteur}
        onKeyDown={surTouche}
        onDragEnter={surDragEnter}
        onDragOver={surDragOver}
        onDragLeave={surDragLeave}
        onDrop={surDrop}
        className={`
          w-full rounded-2xl border-2 border-dashed p-8 text-center transition-colors duration-200
          ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
          ${bordure}
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background
        `}
      >
        {fichier ? (
          <div className="flex flex-col items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10 text-success">
              <IconDocumentUpload className="h-6 w-6" />
            </span>

            <div className="min-w-0 max-w-full">
              <p className="truncate text-sm font-semibold text-text-primary" title={fichier.name}>
                {fichier.name}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">{formaterTaille(fichier.size)}</p>
            </div>

            <button
              type="button"
              onClick={retirer}
              disabled={disabled}
              aria-label={`Retirer le fichier ${fichier.name}`}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border-light px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-error/40 hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              <IconX className="h-3.5 w-3.5" />
              Retirer
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-light text-primary">
              <IconDocumentUpload className="h-6 w-6" />
            </span>

            <div>
              <p className="text-sm font-semibold text-text-primary">{label}</p>
              <p className="mt-1 text-xs text-text-secondary">
                Glisse ton fichier ici ou <span className="font-semibold text-primary">clique pour le choisir</span>
              </p>
            </div>
          </div>
        )}

        <p id={idAide} className="mt-3 text-xs text-text-muted">
          {aide}
        </p>
      </div>

      {/* role="alert" : le message est annonce des son apparition, sans que
          l'utilisateur ait a le chercher. C'est exactement ce qui manquait
          quand un fichier trop lourd etait rejete en silence. */}
      {erreur && (
        <p
          id={idErreur}
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-xl border border-error/20 bg-error/8 px-3 py-2 text-sm font-medium text-error"
        >
          {erreur}
        </p>
      )}
    </div>
  );
}

/* ── Validation ────────────────────────────────────────────────────────── */

/**
 * Renvoie un message d'erreur en francais, ou une chaine vide si le fichier passe.
 * Centralisee ici pour que les six zones de depot appliquent enfin la meme regle :
 * avant, la limite valait 2 Mo dans un fichier, 5 Mo dans un autre, et n'etait
 * pas verifiee du tout dans un troisieme.
 */
function validerPdf(fichier, tailleMaxMo) {
  // Certains navigateurs et systemes ne renseignent pas le type MIME : on retombe
  // alors sur l'extension plutot que de refuser un PDF parfaitement valide.
  const estPdf = fichier.type === 'application/pdf' || /\.pdf$/i.test(fichier.name || '');
  if (!estPdf) {
    return "Ce fichier n'est pas un PDF. Choisis un document au format PDF.";
  }

  if (fichier.size === 0) {
    return 'Ce fichier est vide. Verifie qu il s agit bien de ton CV.';
  }

  const octetsMax = tailleMaxMo * 1024 * 1024;
  if (fichier.size > octetsMax) {
    return `Ton PDF fait ${formaterTaille(fichier.size)}, la limite est ${tailleMaxMo} Mo.`;
  }

  return '';
}

/** 7 549 747 octets -> "7,2 Mo" (virgule francaise, Ko en dessous de 1 Mo). */
function formaterTaille(octets) {
  if (!Number.isFinite(octets)) return '';
  const mo = octets / (1024 * 1024);
  if (mo < 1) {
    return `${Math.max(1, Math.round(octets / 1024))} Ko`;
  }
  return `${mo.toFixed(1).replace('.', ',')} Mo`;
}
