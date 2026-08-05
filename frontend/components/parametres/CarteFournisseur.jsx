'use client';

/**
 * UNE CARTE DE FOURNISSEUR.
 *
 * CE QU'ELLE DOIT DIRE EN UN COUP D'OEIL, dans cet ordre :
 *   1. son nom ;
 *   2. si un acces est deja enregistre — c'est l'information qu'on cherche en
 *      arrivant sur cet ecran ;
 *   3. ce qu'il en coute : rien, un palier gratuit, ou une cle payante ;
 *   4. ou vont les donnees, quand c'est remarquable (« rien ne sort de chez toi »).
 *
 * C'EST UN BOUTON, PAS UN BOUTON RADIO. Choisir une carte n'affecte aucune
 * valeur : ca ouvre le panneau de reglage de ce fournisseur, en dessous. D'ou
 * `aria-expanded` et `aria-controls`, qui disent au lecteur d'ecran qu'un
 * panneau va s'ouvrir et lequel.
 */
export default function CarteFournisseur({ fournisseur, compte, ouvert, idPanneau, onOuvrir }) {
  const configure = Boolean(compte);

  return (
    <button
      type="button"
      onClick={() => onOuvrir(ouvert ? null : fournisseur.id)}
      aria-expanded={ouvert}
      aria-controls={idPanneau}
      className={`flex h-full cursor-pointer flex-col rounded-2xl border p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        ouvert
          ? 'border-primary bg-primary-light'
          : 'border-border/60 bg-surface hover:border-primary/40 hover:bg-primary-light'
      }`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="font-display text-sm font-bold text-text-primary">{fournisseur.nom}</span>

        {/* La pastille double la couleur de bordure : la couleur seule ne doit
            jamais porter l'information (daltonisme). */}
        <span
          aria-hidden="true"
          className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
            configure ? 'bg-success' : 'bg-border-light'
          }`}
        />
      </span>

      <Etat compte={compte} fournisseur={fournisseur} />
      <Etiquettes fournisseur={fournisseur} />

      {fournisseur.note && (
        <span className="mt-2 text-xs leading-relaxed text-text-muted">{fournisseur.note}</span>
      )}
    </button>
  );
}

/**
 * L'etat de l'acces, en toutes lettres.
 *
 * « utilisable » a false alors qu'un compte existe est le cas qu'il ne faut
 * surtout pas taire : c'est typiquement une cle effacee a la main dans le
 * fichier de reglages. Sans cette ligne, la carte annoncerait un acces qui ne
 * fonctionne pas.
 */
function Etat({ compte, fournisseur }) {
  if (!compte) {
    return (
      <span className="mt-1.5 text-xs font-medium text-text-muted">
        {fournisseur.cleRequise ? 'Aucune cle enregistree' : 'Pas encore ajoute'}
      </span>
    );
  }

  if (!compte.utilisable) {
    return (
      <span className="mt-1.5 text-xs font-medium text-warning">
        Acces incomplet : il manque une cle
      </span>
    );
  }

  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-success">
      Acces enregistre
      {compte.cleMasquee && (
        <code className="rounded bg-success/10 px-1.5 py-0.5 font-mono text-[11px]">
          {compte.cleMasquee}
        </code>
      )}
    </span>
  );
}

/**
 * Les deux ou trois mots qui decident a la place d'une notice.
 * On se limite volontairement : cinq etiquettes ne se lisent plus.
 */
function Etiquettes({ fournisseur }) {
  const etiquettes = [];

  if (fournisseur.local) {
    etiquettes.push({ texte: 'Rien ne sort de chez toi', ton: 'succes' });
    etiquettes.push({ texte: 'Gratuit', ton: 'succes' });
  } else if (fournisseur.paliergratuit) {
    etiquettes.push({ texte: 'Palier gratuit', ton: 'accent' });
  } else if (fournisseur.cleRequise) {
    etiquettes.push({ texte: 'Cle payante', ton: 'neutre' });
  }

  if (etiquettes.length === 0) return null;

  const tons = {
    succes: 'bg-success/10 text-success',
    accent: 'bg-accent-light text-accent',
    neutre: 'bg-surface-elevated text-text-muted',
  };

  return (
    <span className="mt-2 flex flex-wrap gap-1.5">
      {etiquettes.map((etiquette) => (
        <span
          key={etiquette.texte}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${tons[etiquette.ton]}`}
        >
          {etiquette.texte}
        </span>
      ))}
    </span>
  );
}
