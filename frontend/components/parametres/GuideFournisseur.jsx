'use client';

/**
 * LE GUIDE D'UN FOURNISSEUR : ce qu'il faut savoir AVANT de coller sa cle.
 *
 * QUATRE BLOCS, DANS CET ORDRE, ET L'ORDRE COMPTE
 *   1. Ou vont mes donnees. C'est ce qui devrait decider en premier quand on
 *      s'apprete a envoyer un CV — un document qui porte un nom, une adresse,
 *      un telephone et un parcours entier. Il passe donc avant le reste.
 *   2. Ce que ce fournisseur fait bien.
 *   3. Ce qu'il fait mal. NON FACULTATIF : un guide qui ne dit que du bien
 *      n'aide personne a choisir, il vend.
 *   4. Comment obtenir la cle, etape par etape, et ou voir les vrais tarifs.
 *
 * Le contenu vient du backend (llm/providers/guides/) : le catalogue est la
 * source unique, l'interface ne reecrit rien de son cote.
 */
export default function GuideFournisseur({ fournisseur }) {
  const guide = fournisseur.guide;

  if (!guide) {
    return (
      <p className="text-sm text-text-muted">
        Aucun guide pour ce fournisseur. Reporte-toi a sa documentation pour obtenir une cle.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {guide.confidentialite && (
        <Bloc titre="Ou va ton CV" ton={fournisseur.local ? 'succes' : 'attention'}>
          <p className="text-sm leading-relaxed">{guide.confidentialite}</p>
        </Bloc>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Puces titre="Ses points forts" items={guide.atouts} ton="succes" />
        <Puces titre="Ses limites" items={guide.limites} ton="attention" />
      </div>

      {guide.cle.etapes.length > 0 && (
        <div>
          <h4 className="font-display mb-2 text-sm font-bold text-text-primary">
            {fournisseur.cleRequise ? 'Comment obtenir ta cle' : 'Comment le mettre en route'}
          </h4>
          {/* Une liste ORDONNEE : ce sont des etapes, pas des remarques. Le
              lecteur d'ecran annonce « 2 sur 4 », ce qui aide a suivre. */}
          <ol className="space-y-1.5 text-sm leading-relaxed text-text-secondary">
            {guide.cle.etapes.map((etape, index) => (
              <li key={etape} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-light text-xs font-semibold text-primary"
                >
                  {index + 1}
                </span>
                <span>{etape}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
        {guide.cle.pourEssayer && (
          <span className="rounded-full bg-surface-elevated px-2.5 py-1">
            {guide.cle.pourEssayer}
          </span>
        )}
        <span className="rounded-full bg-surface-elevated px-2.5 py-1">
          {guide.cle.carteBancaire
            ? 'Carte bancaire demandee a l\'inscription'
            : 'Aucune carte bancaire demandee'}
        </span>

        {guide.cle.urlTarifs && (
          <a
            href={guide.cle.urlTarifs}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary underline underline-offset-2 hover:text-primary-hover"
          >
            Voir les tarifs officiels (nouvel onglet)
          </a>
        )}
      </div>
    </div>
  );
}

const TONS = {
  succes: 'border-success/20 bg-success/8 text-text-secondary',
  attention: 'border-warning/25 bg-warning/8 text-text-secondary',
};

function Bloc({ titre, ton, children }) {
  return (
    <div className={`rounded-xl border p-4 ${TONS[ton]}`}>
      <h4 className="font-display mb-1.5 text-sm font-bold text-text-primary">{titre}</h4>
      {children}
    </div>
  );
}

/** Une colonne de puces. Rien ne s'affiche si la liste est vide. */
function Puces({ titre, items, ton }) {
  if (items.length === 0) return null;

  const pastille = ton === 'succes' ? 'bg-success' : 'bg-warning';

  return (
    <div>
      <h4 className="font-display mb-2 text-sm font-bold text-text-primary">{titre}</h4>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-relaxed text-text-secondary">
            <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${pastille}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
