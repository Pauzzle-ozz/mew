'use client';

import Button from '@/components/shared/Button';

/**
 * Etape 2 : la cle API.
 *
 * LA REGLE QUI COMMANDE TOUT CE FICHIER
 * Une cle enregistree ne redescend JAMAIS en clair dans le navigateur. Le
 * backend n'en renvoie qu'un apercu (« sk-...4f2a »). Cet apercu ne peut donc
 * pas etre remis dans le champ de saisie : on l'affiche comme une information,
 * pas comme une valeur modifiable.
 *
 * D'ou les deux etats de ce composant :
 *
 *   valeur === null   « garde la cle deja enregistree ». Rien n'est envoye au
 *                     backend a l'enregistrement, la cle en place reste en
 *                     place. C'est l'etat de depart quand une cle existe.
 *   valeur === '...'  l'utilisateur en saisit une NOUVELLE. Elle remplacera
 *                     l'ancienne. Une chaine vide est un champ en cours de
 *                     saisie, pas un effacement.
 *
 * Le controle du prefixe est INDICATIF. Les fournisseurs changent leurs
 * formats sans prevenir : bloquer l'enregistrement sur un prefixe inattendu
 * empecherait de configurer une cle pourtant valide. On previent, on ne
 * refuse pas.
 *
 * @param {object} fournisseur   l'entree du catalogue selectionnee
 * @param {string|null} cleMasquee  apercu de la cle enregistree, ou null
 * @param {string|null} valeur   voir les deux etats ci-dessus
 * @param {Function} onChange    recoit une chaine, ou null pour « garder »
 * @param {boolean} visible      la cle saisie est-elle affichee en clair
 * @param {Function} onBasculerVisibilite
 */
export default function ChampCle({
  fournisseur,
  cleMasquee,
  valeur,
  onChange,
  visible,
  onBasculerVisibilite,
}) {
  const enRemplacement = valeur !== null;
  const obligatoire = fournisseur.cleRequise;

  // Les fournisseurs locaux n'ont pas de compte, pas de cle, pas de facture.
  // Afficher un champ vide serait une question sans reponse.
  if (fournisseur.local && !obligatoire) {
    return (
      <p className="rounded-xl border border-success/20 bg-success/8 p-4 text-sm text-text-secondary">
        <strong className="text-success">Aucune cle n&apos;est necessaire.</strong>{' '}
        {fournisseur.nom} tourne sur ta machine : rien n&apos;est facture et aucune donnee ne part
        sur internet. Verifie simplement que le logiciel est lance avant de tester.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Etat « une cle est deja en place » : on la montre masquee et on
          n'entre en saisie que si l'utilisateur le demande. */}
      {!enRemplacement && cleMasquee && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-surface-elevated p-4">
          <span className="text-sm text-text-secondary">Cle enregistree :</span>
          <code className="rounded-lg bg-surface px-2 py-1 font-mono text-sm text-text-primary">
            {cleMasquee}
          </code>
          <Button variant="outline" size="sm" onClick={() => onChange('')}>
            Remplacer
          </Button>
        </div>
      )}

      {!enRemplacement && !cleMasquee && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-text-secondary">Aucune cle enregistree.</span>
          <Button variant="outline" size="sm" onClick={() => onChange('')}>
            Saisir une cle
          </Button>
        </div>
      )}

      {enRemplacement && (
        <div className="space-y-2">
          <label htmlFor="cle-api" className="block text-sm font-semibold text-text-primary">
            Cle API {obligatoire ? '' : '(facultative)'}
          </label>

          <div className="flex gap-2">
            <input
              id="cle-api"
              // type=password : la cle reste illisible par-dessus l'epaule et
              // n'est proposee ni a l'autocompletion ni au correcteur.
              type={visible ? 'text' : 'password'}
              value={valeur}
              onChange={(evenement) => onChange(evenement.target.value)}
              placeholder={fournisseur.prefixeCle ? `${fournisseur.prefixeCle}...` : 'Colle ta cle ici'}
              autoComplete="off"
              spellCheck="false"
              aria-describedby="cle-api-aide"
              className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 font-mono text-sm text-text-primary placeholder:font-body placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
            <Button variant="outline" size="sm" onClick={onBasculerVisibilite} aria-pressed={visible}>
              {visible ? 'Masquer' : 'Afficher'}
            </Button>
            {cleMasquee && (
              <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
                Annuler
              </Button>
            )}
          </div>

          <p id="cle-api-aide" className="text-xs leading-relaxed text-text-muted">
            Elle est stockee par le backend, sur cette machine. Elle ne repart jamais vers le
            navigateur : la prochaine fois, tu n&apos;en verras que la fin.
          </p>

          <AvertissementPrefixe fournisseur={fournisseur} valeur={valeur} />
        </div>
      )}

      {fournisseur.urlCle && (
        <p className="text-sm text-text-muted">
          Pas encore de cle ?{' '}
          <a
            href={fournisseur.urlCle}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary underline underline-offset-2 hover:text-primary-hover"
          >
            Cree-la sur le site de {fournisseur.nom}
          </a>{' '}
          <span className="text-xs">(nouvel onglet)</span>
        </p>
      )}
    </div>
  );
}

/**
 * Signale un prefixe inattendu sans bloquer.
 * role="status" et non "alert" : ce n'est qu'une suggestion, elle n'a pas a
 * couper la parole au lecteur d'ecran.
 */
function AvertissementPrefixe({ fournisseur, valeur }) {
  const saisie = (valeur || '').trim();
  const suspecte = fournisseur.prefixeCle && saisie.length > 3 && !saisie.startsWith(fournisseur.prefixeCle);

  return (
    <div role="status" aria-live="polite">
      {suspecte && (
        <p className="text-xs font-medium text-warning">
          Les cles {fournisseur.nom} commencent d&apos;habitude par « {fournisseur.prefixeCle} ».
          Verifie que tu n&apos;as pas colle celle d&apos;un autre fournisseur — tu peux tout de
          meme continuer.
        </p>
      )}
    </div>
  );
}
