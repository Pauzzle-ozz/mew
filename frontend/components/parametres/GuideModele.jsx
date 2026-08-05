'use client';

import { detailModele, resumerContexte, resumerCout, resumerTarif } from '@/lib/utils/formatModele';

/**
 * LE GUIDE D'UN MODELE.
 *
 * DEUX SOURCES, ET ELLES N'ONT PAS LE MEME STATUT
 *   - les CHIFFRES viennent du catalogue : tarif, fenetre, cout estime par
 *     texte redige. Ils sont vrais pour tout modele que Mew connait, y compris
 *     ceux sur lesquels on n'a rien d'autre a dire.
 *   - la NOTE (points forts, limites, a qui il s'adresse) n'existe que pour
 *     les modeles sur lesquels on peut ecrire quelque chose d'honnete. Un
 *     modele decouvert en direct chez Ollama ou OpenRouter n'en a pas — et
 *     c'est tres bien : mieux vaut pas de phrase qu'une phrase creuse.
 *
 * Quand il n'y a que les chiffres, on les affiche quand meme : « 0,15 $ par
 * million de tokens, environ 0,001 EUR par lettre » repond deja a la question
 * que la personne se pose.
 */
export default function GuideModele({ modele, compact = false }) {
  if (!modele) return null;

  const note = modele.note;

  if (compact) {
    return (
      <p className="text-xs leading-relaxed text-text-muted">
        {note && note.resume ? `${note.resume} ` : ''}
        {detailModele(modele) || 'Ce modele ne figure pas dans le catalogue de Mew : son tarif est inconnu.'}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {note && note.resume && (
        <p className="text-sm leading-relaxed text-text-secondary">{note.resume}</p>
      )}

      <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-text-muted">
        <Chiffre libelle="Tarif" valeur={`${resumerTarif(modele)} / million de tokens`} />
        <Chiffre libelle="Contexte" valeur={resumerContexte(modele)} />
        <Chiffre libelle="Cout" valeur={resumerCout(modele)} />
      </dl>

      {note && (note.atouts.length > 0 || note.limites.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Puces titre="Points forts" items={note.atouts} pastille="bg-success" />
          <Puces titre="Limites" items={note.limites} pastille="bg-warning" />
        </div>
      )}

      {note && note.pourQui && (
        <p className="rounded-xl bg-surface-elevated p-3 text-xs leading-relaxed text-text-secondary">
          <strong className="text-text-primary">A prendre pour :</strong> {note.pourQui}
        </p>
      )}

      {!note && (
        <p className="text-xs leading-relaxed text-text-muted">
          Mew n&apos;a pas de fiche pour ce modele — c&apos;est normal pour un modele local, tres
          recent, ou decouvert en direct chez ton fournisseur. Les chiffres ci-dessus sont tout ce
          qu&apos;on peut en dire de sur.
        </p>
      )}
    </div>
  );
}

/** Un chiffre et son libelle. Rien ne s'affiche quand la valeur est inconnue. */
function Chiffre({ libelle, valeur }) {
  if (!valeur) return null;

  return (
    <div className="flex gap-1.5">
      <dt className="font-semibold text-text-secondary">{libelle} :</dt>
      <dd>{valeur}</dd>
    </div>
  );
}

function Puces({ titre, items, pastille }) {
  if (!items || items.length === 0) return null;

  return (
    <div>
      <h5 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-text-muted">{titre}</h5>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs leading-relaxed text-text-secondary">
            <span aria-hidden="true" className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${pastille}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
