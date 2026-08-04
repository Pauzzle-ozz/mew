'use client';

import { useState } from 'react';
import Button from '@/components/shared/Button';

/**
 * Etape 3 : un modele pour chacun des deux roles.
 *
 * LES DEUX ROLES, EXPLIQUES SANS JARGON
 * Mew n'appelle un modele que pour ecrire. Deux usages seulement, et ils n'ont
 * pas les memes besoins :
 *
 *   redaction   ecrit tes lettres et tes emails. C'est ce que lira un
 *               recruteur : prends le meilleur.
 *   extraction  range et reformate ce qui existe deja (lire un CV, en sortir
 *               un profil). Personne ne lit ce texte : prends le plus rapide
 *               et le moins cher.
 *
 * Separer les deux, c'est payer le prix fort uniquement sur les quelques
 * lignes qui comptent.
 *
 * POURQUOI ON PEUT AUSSI SAISIR UN IDENTIFIANT A LA MAIN
 * Le catalogue est une aide, pas une barriere. Un modele local telecharge
 * hier, un modele sorti ce matin, un alias interne d'entreprise : rien de tout
 * cela n'est dans la liste, et tout cela doit rester utilisable. Des que la
 * liste est vide — ou sur demande — le menu devient un champ libre.
 */
export default function ChoixModeles({
  modeles,
  valeurs,
  onChange,
  listageDisponible,
  listageEnCours,
  listageErreur,
  onRecharger,
  origineListe,
}) {
  return (
    <div className="space-y-6">
      <ChampModele
        role="redaction"
        titre="Modele de redaction"
        explication="Il ecrit tes lettres de motivation et tes emails. C'est le texte que lira un recruteur : prends le meilleur."
        modeles={modeles}
        valeur={valeurs.redaction}
        onChange={(id) => onChange('redaction', id)}
      />

      <ChampModele
        role="extraction"
        titre="Modele d'extraction"
        explication="Il range et reformate ce que tu lui donnes (lire ton CV, en sortir ton profil). Personne ne lit ce texte : prends le plus rapide et le moins cher."
        modeles={modeles}
        valeur={valeurs.extraction}
        onChange={(id) => onChange('extraction', id)}
      />

      <div className="flex flex-wrap items-center gap-3">
        {listageDisponible && (
          <Button variant="outline" size="sm" onClick={onRecharger} loading={listageEnCours}>
            {listageEnCours ? 'Recherche en cours...' : 'Chercher les modeles disponibles'}
          </Button>
        )}

        {/* aria-live : le resultat de la recherche arrive apres coup, il doit
            etre annonce sans que la personne ait a repartir a la peche. */}
        <p aria-live="polite" className="text-xs text-text-muted">
          {listageEnCours && 'Interrogation du fournisseur...'}
          {!listageEnCours && listageErreur && (
            <span className="text-warning">{listageErreur}</span>
          )}
          {!listageEnCours && !listageErreur && origineListe === 'direct'
            && 'Liste obtenue directement chez le fournisseur.'}
          {!listageEnCours && !listageErreur && origineListe === 'catalogue'
            && 'Liste issue du catalogue de Mew (tarifs verifies a la main).'}
        </p>
      </div>

      <p className="rounded-xl bg-surface-elevated p-3 text-xs leading-relaxed text-text-muted">
        Un « token » est un morceau de mot : 1 000 tokens font a peu pres 750 mots. Les tarifs sont
        donnes par MILLION de tokens, en dollars — c&apos;est pour cela qu&apos;ils paraissent
        eleves alors qu&apos;une lettre coute quelques centimes.
      </p>
    </div>
  );
}

/**
 * Un role, un menu (ou un champ libre).
 * L'etat « saisie a la main » vit ici : c'est un detail d'affichage, la page
 * n'a besoin que de l'identifiant final.
 */
function ChampModele({ role, titre, explication, modeles, valeur, onChange }) {
  const [manuelDemande, setManuelDemande] = useState(false);

  // Un modele qui n'est pas dans la liste (identifiant saisi a la main, modele
  // retire du catalogue) ne doit pas disparaitre silencieusement du menu :
  // on bascule en champ libre pour qu'il reste visible et modifiable.
  const proposes = modeles.filter((m) => m.roles.length === 0 || m.roles.includes(role));
  const horsListe = Boolean(valeur) && !proposes.some((m) => m.id === valeur);
  const manuel = manuelDemande || horsListe || proposes.length === 0;

  const idChamp = `modele-${role}`;
  const choisi = proposes.find((m) => m.id === valeur) || null;

  return (
    <div className="space-y-2">
      <label htmlFor={idChamp} className="block text-sm font-semibold text-text-primary">
        {titre}
      </label>
      <p className="text-sm text-text-muted">{explication}</p>

      {manuel ? (
        <input
          id={idChamp}
          type="text"
          value={valeur || ''}
          onChange={(evenement) => onChange(evenement.target.value)}
          placeholder="identifiant exact du modele, par exemple llama3.1:8b"
          autoComplete="off"
          spellCheck="false"
          aria-describedby={`${idChamp}-aide`}
          className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 font-mono text-sm text-text-primary placeholder:font-body placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
      ) : (
        <select
          id={idChamp}
          value={valeur || ''}
          onChange={(evenement) => onChange(evenement.target.value)}
          aria-describedby={`${idChamp}-aide`}
          className="w-full cursor-pointer rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:outline-none"
        >
          <option value="">Choisir un modele...</option>
          {proposes.map((modele) => (
            <option key={modele.id} value={modele.id}>
              {modele.nom}
              {modele.entree !== null ? ` — ${resumerTarif(modele)}` : ''}
            </option>
          ))}
        </select>
      )}

      <div id={`${idChamp}-aide`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
        {choisi && <span>{detailModele(choisi)}</span>}
        {manuel && proposes.length === 0 && (
          <span>
            Aucun modele connu pour ce fournisseur : saisis l&apos;identifiant exact tel qu&apos;il
            l&apos;attend.
          </span>
        )}

        {proposes.length > 0 && (
          <button
            type="button"
            onClick={() => setManuelDemande(!manuel)}
            className="cursor-pointer font-semibold text-primary underline underline-offset-2 hover:text-primary-hover"
          >
            {manuel ? 'Revenir a la liste' : "Saisir un autre identifiant"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mise en forme des chiffres
//
// Ecrite a la main plutot qu'avec Intl : le format doit etre le meme partout
// (virgule decimale, espace comme separateur de milliers) quelle que soit la
// langue du navigateur.
// ---------------------------------------------------------------------------

const virgule = (valeur, decimales) => valeur.toFixed(decimales).replace('.', ',');

const separerMilliers = (entier) => String(Math.round(entier)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** « 2,50 $ / 10,00 $ » — entree puis sortie, par million de tokens. */
function resumerTarif(modele) {
  if (modele.entree === null && modele.sortie === null) return 'tarif inconnu';
  if (modele.entree === 0 && modele.sortie === 0) return 'gratuit';
  return `${virgule(modele.entree || 0, 2)} $ / ${virgule(modele.sortie || 0, 2)} $`;
}

/**
 * Ce qu'on affiche sous le menu une fois un modele choisi.
 *
 * L'estimation « par lettre » est la seule ligne vraiment parlante : personne
 * ne sait convertir des dollars par million de tokens en depense reelle. Elle
 * repose sur un appel typique de Mew — environ 3 000 tokens envoyes (le CV et
 * l'offre) et 700 tokens produits (la lettre) — et sur un taux de change fixe.
 * C'est un ORDRE DE GRANDEUR, pas une facture.
 */
function detailModele(modele) {
  const morceaux = [];

  if (modele.entree !== null || modele.sortie !== null) {
    morceaux.push(`${resumerTarif(modele)} par million de tokens`);
  }
  if (modele.contexte) {
    morceaux.push(`fenetre de ${separerMilliers(modele.contexte)} tokens`);
  }

  const cout = coutParLettre(modele);
  if (cout !== null) {
    morceaux.push(cout === 0 ? 'gratuit a l\'usage' : `environ ${virgule(cout, 3)} EUR par lettre`);
  }

  return morceaux.join(' · ');
}

const TOKENS_ENTREE_TYPIQUE = 3000;
const TOKENS_SORTIE_TYPIQUE = 700;
const USD_VERS_EUR = 0.92;

function coutParLettre(modele) {
  if (modele.entree === null && modele.sortie === null) return null;
  const usd = (TOKENS_ENTREE_TYPIQUE / 1e6) * (modele.entree || 0)
    + (TOKENS_SORTIE_TYPIQUE / 1e6) * (modele.sortie || 0);
  return Math.round(usd * USD_VERS_EUR * 1000) / 1000;
}
