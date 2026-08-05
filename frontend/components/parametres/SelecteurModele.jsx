'use client';

import { useMemo, useState } from 'react';
import Button from '@/components/shared/Button';
import GuideModele from './GuideModele';
import { useParametresIa } from '@/context/ParametresIaContext';
import { etiquetteModele } from '@/lib/utils/formatModele';

/**
 * LE CHOIX D'UN MODELE, TOUS COMPTES CONFONDUS.
 *
 * C'EST LE COMPOSANT QUI PORTE LA PROMESSE DE L'ECRAN : « je veux que tel
 * modele lise mes CV et que tel autre redige mes lettres ». Il ne montre donc
 * pas les modeles d'UN fournisseur, mais ceux de TOUS les acces enregistres,
 * ranges par fournisseur. Deux comptes, deux gammes, un seul menu.
 *
 * TROIS FACONS DE CHOISIR, ET ELLES COMPTENT TOUTES LES TROIS
 *   1. « Suivre mon reglage general » — l'option par defaut. Personne ne
 *      devrait avoir a regler cinq taches pour commencer a utiliser Mew.
 *   2. Un modele de la liste.
 *   3. Un identifiant saisi a la main. Le catalogue est une aide, pas une
 *      barriere : un modele local telecharge hier, un modele sorti ce matin,
 *      un alias interne d'entreprise — rien de tout ca n'est dans la liste, et
 *      tout ca doit rester utilisable.
 *
 * ACCESSIBILITE : ce sont de VRAIS boutons radio, groupes par <fieldset> et
 * caches visuellement. On garde ainsi gratuitement la navigation aux fleches,
 * l'annonce « 3 sur 12 » et l'etat coche, qu'une div cliquable obligerait a
 * reecrire a la main.
 */
export default function SelecteurModele({ id, valeur, role, onChange, disabled = false }) {
  const { comptes, fournisseurDe, modelesDe, chercherModeles } = useParametresIa();

  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [manuel, setManuel] = useState(false);
  const [listage, setListage] = useState({ enCours: '', message: '' });

  const utilisables = useMemo(() => comptes.filter((c) => c.utilisable), [comptes]);

  /**
   * Les modeles de chaque compte, filtres par la recherche.
   *
   * On NE RETIRE PAS les modeles dont le role ne correspond pas : on les
   * marque. Le catalogue dit ce qui convient le mieux, il ne decide pas a la
   * place de quelqu'un qui veut son meilleur modele partout.
   */
  const groupes = useMemo(() => {
    const terme = recherche.trim().toLowerCase();

    return utilisables.map((compte) => {
      const f = fournisseurDe(compte.fournisseur);
      const modeles = modelesDe(compte.fournisseur).filter((m) => (
        terme === ''
        || m.nom.toLowerCase().includes(terme)
        || m.id.toLowerCase().includes(terme)
      ));

      return { compte, nom: f ? f.nom : compte.fournisseur, modeles };
    }).filter((groupe) => groupe.modeles.length > 0 || recherche.trim() === '');
  }, [utilisables, fournisseurDe, modelesDe, recherche]);

  /** Le modele actuellement choisi, avec son fournisseur. */
  const choisi = useMemo(() => {
    if (!valeur.fournisseur || !valeur.modele) return null;
    const modele = modelesDe(valeur.fournisseur).find((m) => m.id === valeur.modele);
    const f = fournisseurDe(valeur.fournisseur);

    // Modele hors catalogue (saisi a la main, retire depuis) : il ne doit pas
    // disparaitre de l'ecran, sinon on ne peut plus le corriger.
    return {
      modele: modele || { id: valeur.modele, nom: valeur.modele, entree: null, sortie: null, contexte: null, roles: [], note: null },
      nomFournisseur: f ? f.nom : valeur.fournisseur,
      dansLeCatalogue: Boolean(modele),
    };
  }, [valeur, modelesDe, fournisseurDe]);

  const chercher = async (idFournisseur) => {
    setListage({ enCours: idFournisseur, message: '' });
    const resultat = await chercherModeles(idFournisseur);
    setListage({ enCours: '', message: resultat.message });
  };

  if (utilisables.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        Ajoute d&apos;abord un acces dans l&apos;onglet « Mes IA » pour pouvoir choisir un modele.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        aria-controls={`${id}-panneau`}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
          disabled
            ? 'cursor-not-allowed border-border/40 bg-surface-elevated opacity-60'
            : 'cursor-pointer border-border bg-surface hover:border-primary/50'
        }`}
      >
        <span className="min-w-0">
          {choisi ? (
            <>
              <span className="block truncate text-sm font-semibold text-text-primary">
                {choisi.modele.nom}
              </span>
              <span className="block truncate text-xs text-text-muted">
                chez {choisi.nomFournisseur} · {etiquetteModele(choisi.modele)}
                {!choisi.dansLeCatalogue && ' · hors catalogue'}
              </span>
            </>
          ) : (
            <>
              <span className="block text-sm font-semibold text-text-secondary">
                Suit ton reglage general
              </span>
              <span className="block text-xs text-text-muted">
                Mew prend le modele que tu utilises deja pour ce genre de tache.
              </span>
            </>
          )}
        </span>

        <span aria-hidden="true" className="shrink-0 text-xs font-semibold text-primary">
          {ouvert ? 'Fermer' : 'Changer'}
        </span>
      </button>

      {ouvert && (
        <div
          id={`${id}-panneau`}
          className="animate-fade-in space-y-4 rounded-xl border border-border/60 bg-surface-elevated p-4"
        >
          <label className="block">
            <span className="sr-only">Rechercher un modele</span>
            <input
              type="search"
              value={recherche}
              onChange={(evenement) => setRecherche(evenement.target.value)}
              placeholder="Rechercher un modele..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
          </label>

          <fieldset className="border-0 p-0">
            <legend className="sr-only">Choix du modele</legend>

            <Choix
              nom={id}
              coche={!valeur.fournisseur && !valeur.modele}
              onChange={() => { onChange({ fournisseur: '', modele: '' }); setManuel(false); }}
              titre="Suivre mon reglage general"
              detail="Le plus simple : Mew reutilise le modele deja choisi pour une tache du meme genre."
            />
          </fieldset>

          {groupes.map((groupe) => (
            <fieldset key={groupe.compte.fournisseur} className="border-0 p-0">
              <legend className="mb-1.5 text-xs font-bold uppercase tracking-wide text-text-muted">
                {groupe.nom}
              </legend>

              {groupe.modeles.length === 0 ? (
                <div className="flex flex-wrap items-center gap-3 py-1">
                  <p className="text-xs text-text-muted">
                    Aucun modele connu pour ce fournisseur.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={listage.enCours === groupe.compte.fournisseur}
                    onClick={() => chercher(groupe.compte.fournisseur)}
                  >
                    Chercher ses modeles
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  {groupe.modeles.map((modele) => (
                    <Choix
                      key={`${groupe.compte.fournisseur}/${modele.id}`}
                      nom={id}
                      coche={valeur.fournisseur === groupe.compte.fournisseur && valeur.modele === modele.id}
                      onChange={() => {
                        onChange({ fournisseur: groupe.compte.fournisseur, modele: modele.id });
                        setManuel(false);
                      }}
                      titre={modele.nom}
                      detail={etiquetteModele(modele)}
                      // Une simple mention, pas un blocage : le catalogue
                      // conseille, il ne decide pas a ta place.
                      mention={
                        role && modele.roles.length > 0 && !modele.roles.includes(role)
                          ? 'pas le mieux place pour cette tache'
                          : null
                      }
                    />
                  ))}
                </div>
              )}
            </fieldset>
          ))}

          <p aria-live="polite" className="text-xs text-text-muted empty:hidden">
            {listage.message}
          </p>

          <div className="border-t border-border/60 pt-3">
            {manuel ? (
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-text-primary">
                  Identifiant exact du modele
                </span>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={valeur.fournisseur || utilisables[0].fournisseur}
                    onChange={(evenement) => onChange({ fournisseur: evenement.target.value, modele: valeur.modele })}
                    aria-label="Chez quel fournisseur"
                    className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                  >
                    {utilisables.map((compte) => {
                      const f = fournisseurDe(compte.fournisseur);
                      return (
                        <option key={compte.fournisseur} value={compte.fournisseur}>
                          {f ? f.nom : compte.fournisseur}
                        </option>
                      );
                    })}
                  </select>

                  <input
                    type="text"
                    value={valeur.modele}
                    onChange={(evenement) => onChange({
                      fournisseur: valeur.fournisseur || utilisables[0].fournisseur,
                      modele: evenement.target.value,
                    })}
                    placeholder="par exemple llama3.1:8b"
                    autoComplete="off"
                    spellCheck="false"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-text-primary placeholder:font-body placeholder:text-text-muted focus:border-primary focus:outline-none"
                  />
                </div>
                <span className="block text-xs text-text-muted">
                  Il doit etre ecrit exactement comme ton fournisseur l&apos;attend.
                </span>
              </label>
            ) : (
              <button
                type="button"
                onClick={() => setManuel(true)}
                className="cursor-pointer text-xs font-semibold text-primary underline underline-offset-2 hover:text-primary-hover"
              >
                Mon modele n&apos;est pas dans la liste
              </button>
            )}
          </div>
        </div>
      )}

      {choisi && (
        <div className="rounded-xl bg-surface-elevated p-3">
          <GuideModele modele={choisi.modele} compact={!ouvert} />
        </div>
      )}
    </div>
  );
}

/** Un bouton radio deguise en ligne cliquable. */
function Choix({ nom, coche, onChange, titre, detail, mention }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface has-[:checked]:bg-primary-light">
      <input
        type="radio"
        name={nom}
        checked={coche}
        onChange={onChange}
        className="peer sr-only"
      />
      {/* La pastille double la couleur de fond : la couleur seule ne doit
          jamais porter l'information. */}
      <span
        aria-hidden="true"
        className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50 ${
          coche ? 'border-primary bg-primary' : 'border-border-light'
        }`}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-primary">{titre}</span>
        <span className="block text-xs text-text-muted">
          {detail}
          {mention && <span className="text-warning"> · {mention}</span>}
        </span>
      </span>
    </label>
  );
}
