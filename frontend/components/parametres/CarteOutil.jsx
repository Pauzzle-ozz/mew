'use client';

import Interrupteur from './Interrupteur';
import SelecteurModele from './SelecteurModele';
import { useParametresIa } from '@/context/ParametresIaContext';
import { resoudreTache } from '@/lib/utils/resolutionTache';

/**
 * UN OUTIL DE MEW, ET CE QU'IL CONFIE A UN MODELE.
 *
 * LA QUESTION A LAQUELLE CETTE CARTE REPOND
 * « Est-ce que cet outil utilise l'IA, oui ou non ? » — et la reponse honnete
 * est presque toujours « en partie ». D'ou les deux colonnes :
 *
 *   ce qui est calcule sur ta machine   toujours la, gratuit, verifiable,
 *                                       et ca ne s'eteint pas.
 *   ce qui est redige par un modele     ca, ca s'allume et ca s'eteint, tache
 *                                       par tache.
 *
 * C'est la regle qui structure tout le projet (voir CLAUDE.md) rendue visible :
 * un score se calcule, une lettre se redige. Couper l'IA ne vide pas l'outil,
 * ca lui retire sa partie redigee — et la carte le dit noir sur blanc plutot
 * que de laisser deviner.
 *
 * `sansIa` vient du backend et est affiche TEL QUEL quand une tache est
 * coupee. Il doit rester exact, pas rassurant : promettre un mode degrade qui
 * n'existe pas serait pire que de ne rien dire.
 */
export default function CarteOutil({ outil, taches, reglages, onChangerTache }) {
  const totalActives = taches.filter((t) => reglages[t.id] && reglages[t.id].actif).length;

  return (
    <section className="rounded-2xl border border-border/60 bg-surface p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-text-primary">{outil.nom}</h2>
          <p className="mt-0.5 text-sm text-text-muted">{outil.resume}</p>
        </div>

        <EtiquetteIa nombreTaches={taches.length} nombreActives={totalActives} />
      </div>

      {outil.local.length > 0 && (
        <div className="mb-5 rounded-xl border border-success/20 bg-success/8 p-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-success">
            Calcule sur ta machine — toujours actif
          </h3>
          <ul className="grid gap-1 sm:grid-cols-2">
            {outil.local.map((ligne) => (
              <li key={ligne} className="flex gap-2 text-sm leading-relaxed text-text-secondary">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                <span>{ligne}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {taches.length === 0 ? (
        <p className="text-sm text-text-muted">
          Cet outil n&apos;appelle jamais de modele. Il n&apos;y a rien a regler ici, et il
          fonctionne meme sans la moindre cle.
        </p>
      ) : (
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-text-muted">
            Redige par un modele — a toi de voir
          </h3>

          {taches.map((tache) => (
            <LigneTache
              key={tache.id}
              tache={tache}
              reglage={reglages[tache.id] || { actif: true, fournisseur: '', modele: '' }}
              reglages={reglages}
              onChanger={(modification) => onChangerTache(tache.id, modification)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** « 100 % local », « IA active », « IA coupee » ou « 1 tache sur 3 ». */
function EtiquetteIa({ nombreTaches, nombreActives }) {
  let texte;
  let classe;

  if (nombreTaches === 0) {
    texte = '100 % local';
    classe = 'bg-success/10 text-success';
  } else if (nombreActives === 0) {
    texte = 'IA coupee';
    classe = 'bg-surface-elevated text-text-muted';
  } else if (nombreActives === nombreTaches) {
    texte = nombreTaches === 1 ? 'IA active' : `IA active sur ${nombreTaches} taches`;
    classe = 'bg-primary-light text-primary';
  } else {
    texte = `IA active sur ${nombreActives} tache${nombreActives > 1 ? 's' : ''} sur ${nombreTaches}`;
    classe = 'bg-warning/10 text-warning';
  }

  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${classe}`}>
      {texte}
    </span>
  );
}

/** Une tache : son interrupteur, et le modele qu'elle utilise quand elle est allumee. */
function LigneTache({ tache, reglage, reglages, onChanger }) {
  const { comptes, taches, fournisseurDe, modelesDe } = useParametresIa();
  const idDescription = `tache-${tache.id}-description`;

  // Ce qui sera REELLEMENT utilise, repli compris. « Suit ton reglage
  // general » tout seul ne dit rien : general, c'est quoi ? Et quand la
  // reponse est « rien du tout », il vaut mieux le dire ici qu'au moment ou la
  // personne clique sur « Generer ».
  const resolution = resoudreTache({ tache, reglages, taches, comptes, modelesDe });

  return (
    <div className="rounded-xl border border-border/60 p-4">
      <div className="flex items-start gap-3">
        <Interrupteur
          actif={reglage.actif}
          onChange={(actif) => onChanger({ actif })}
          libelle={`Utiliser l'IA pour : ${tache.nom}`}
          decrit={idDescription}
        />

        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-text-primary">{tache.nom}</h4>
          <p id={idDescription} className="mt-0.5 text-xs leading-relaxed text-text-muted">
            {tache.description}
          </p>

          {tache.obligatoire && (
            <p className="mt-1.5 text-xs font-medium text-warning">
              C&apos;est la seule chose que fait cet outil : le couper le rend inutilisable.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2 pl-14">
        {reglage.actif ? (
          <>
            <SelecteurModele
              id={`modele-${tache.id}`}
              valeur={{ fournisseur: reglage.fournisseur, modele: reglage.modele }}
              role={tache.role}
              onChange={({ fournisseur, modele }) => onChanger({ fournisseur, modele })}
            />
            <Resolution
              resolution={resolution}
              reglage={reglage}
              nomFournisseur={(id) => {
                const f = fournisseurDe(id);
                return f ? f.nom : id;
              }}
            />
          </>
        ) : (
          <p className="rounded-xl bg-surface-elevated p-3 text-xs leading-relaxed text-text-secondary">
            <strong className="text-text-primary">Sans l&apos;IA :</strong> {tache.sansIa}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Ce qui sera reellement utilise, quand ce n'est pas ce qui est ecrit.
 *
 * Rien ne s'affiche quand la tache a son propre modele : le selecteur le dit
 * deja, et repeter l'evidence noie l'information utile.
 */
function Resolution({ resolution, reglage, nomFournisseur }) {
  if (!resolution) {
    return (
      <p className="text-xs font-medium text-warning">
        Mew ne saura pas quel modele prendre pour cette tache. Choisis-en un ci-dessus, ou coupe
        l&apos;interrupteur : l&apos;outil continuera de calculer tout le reste.
      </p>
    );
  }

  // Le modele vient de cette tache : le selecteur l'affiche deja.
  if (resolution.source === 'tache') return null;

  return (
    <p className="text-xs text-text-muted">
      {reglage.fournisseur ? 'Chez ce fournisseur, Mew prendra' : 'Concretement, Mew prendra'}{' '}
      <strong className="text-text-secondary">{resolution.modele}</strong> chez{' '}
      {nomFournisseur(resolution.fournisseur)}
      {resolution.source === 'general'
        ? ' — le modele que tu utilises deja pour une tache du meme genre.'
        : ' — le premier de son catalogue qui convient a cette tache.'}
    </p>
  );
}
