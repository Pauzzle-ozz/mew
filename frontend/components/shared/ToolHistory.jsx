'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { getHistory, deleteHistoryEntry } from '@/lib/api/historyApi';

const TOOL_TYPES = {
  'analyse-cv': { label: 'Analyse CV', emoji: '🔍' },
  'optimiseur-cv': { label: 'Optimiseur CV', emoji: '✨' },
  'matcher-offres': { label: 'Matcher Offres', emoji: '🎯' },
};

// Elements qui peuvent recevoir le focus au clavier. Sert au piege a focus.
const SELECTEUR_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Fenetre modale de l'historique d'utilisation des outils.
 *
 * CE QUI A ETE CORRIGE ICI
 * C'etait une <div> posee par-dessus la page. Pour un lecteur d'ecran, rien ne
 * disait qu'une fenetre s'etait ouverte, ni que le reste de la page etait
 * devenu inaccessible : la personne continuait a parcourir le formulaire du
 * dessous sans comprendre pourquoi plus rien ne repondait. Trois manques :
 *   1. aucun role="dialog" / aria-modal, donc aucune annonce d'ouverture ;
 *   2. aucune fermeture par Echap, alors que c'est LE geste attendu ;
 *   3. le focus restait sur le bouton qui avait ouvert la fenetre, quelque
 *      part derriere, et n'y revenait pas a la fermeture.
 * Les boutons croix et corbeille, eux, n'affichaient qu'un caractere : le
 * lecteur d'ecran annoncait « bouton » sans dire ce qu'il faisait.
 */
export default function ToolHistory({ userId, defaultToolType, onClose, onLoad }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');
  const [filterType, setFilterType] = useState(defaultToolType || '');

  const panneauRef = useRef(null);
  const fermerRef = useRef(null);
  // Element qui avait le focus avant l'ouverture : c'est a lui qu'on doit le
  // rendre a la fermeture, sinon le focus repart au tout debut de la page et
  // il faut re-parcourir toute l'interface pour revenir ou on en etait.
  const declencheurRef = useRef(null);

  // onClose est presque toujours passe en fonction fleche (`onClose={() =>
  // setOuvert(false)}`), donc une NOUVELLE fonction a chaque rendu du parent.
  // S'il figurait dans les dependances de l'effet ci-dessous, cet effet se
  // rejouerait a chaque rendu du parent et redonnerait le focus a la croix,
  // au milieu de ce que la personne etait en train de faire. On garde donc la
  // derniere version dans une ref, et l'effet ne se joue qu'a l'ouverture.
  const demandeFermetureRef = useRef(onClose);
  useEffect(() => {
    demandeFermetureRef.current = onClose;
  });

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setErreur('');
    try {
      const data = await getHistory(userId, {
        toolType: filterType || undefined,
        limit: 50,
      });
      setEntries(data || []);
    } catch (err) {
      setErreur(err.message || 'Impossible de charger l historique.');
    } finally {
      setLoading(false);
    }
  }, [userId, filterType]);

  useEffect(() => {
    if (userId) loadEntries();
  }, [userId, loadEntries]);

  // Ouverture / fermeture : focus, touche Echap, et blocage du defilement
  // de la page du dessous (sinon la roulette fait defiler l'arriere-plan).
  useEffect(() => {
    declencheurRef.current = document.activeElement;
    fermerRef.current?.focus();

    const defilementInitial = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const surTouche = (evenement) => {
      if (evenement.key === 'Escape') {
        evenement.stopPropagation();
        demandeFermetureRef.current?.();
        return;
      }

      // Piege a focus : sans lui, Tab sort de la fenetre et va se promener
      // dans la page masquee derriere, que l'utilisateur ne voit plus.
      if (evenement.key !== 'Tab') return;
      const panneau = panneauRef.current;
      if (!panneau) return;

      const focusables = Array.from(panneau.querySelectorAll(SELECTEUR_FOCUSABLE));
      if (focusables.length === 0) return;

      const premier = focusables[0];
      const dernier = focusables[focusables.length - 1];
      const actif = document.activeElement;
      const dansLePanneau = panneau.contains(actif);

      if (evenement.shiftKey) {
        if (!dansLePanneau || actif === premier) {
          evenement.preventDefault();
          dernier.focus();
        }
      } else if (!dansLePanneau || actif === dernier) {
        evenement.preventDefault();
        premier.focus();
      }
    };

    document.addEventListener('keydown', surTouche);

    return () => {
      document.removeEventListener('keydown', surTouche);
      document.body.style.overflow = defilementInitial;
      // Le focus revient d'ou il venait. Le test d'existence evite de planter
      // si l'element declencheur a disparu du DOM entre-temps.
      const declencheur = declencheurRef.current;
      if (declencheur && typeof declencheur.focus === 'function' && document.contains(declencheur)) {
        declencheur.focus();
      }
    };
    // Volontairement vide : cet effet gere l'OUVERTURE de la fenetre, il ne
    // doit se jouer qu'une fois. Voir demandeFermetureRef plus haut.
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette entree ?')) return;
    try {
      await deleteHistoryEntry(id, userId);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setErreur(err.message || 'Impossible de supprimer cette entree.');
    }
  };

  const idTitre = useId();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      // Un clic sur le fond ferme la fenetre, comme partout ailleurs.
      // On ecoute le fond SEUL (evenement.target === fond) : sans ce test, un
      // clic n'importe ou dans le panneau remonterait ici et fermerait tout.
      onMouseDown={(evenement) => {
        if (evenement.target === evenement.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panneauRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-background"
      >
        {/* En-tete */}
        <div className="flex items-center justify-between border-b border-border p-6">
          <h2 id={idTitre} className="text-xl font-bold text-text-primary">
            Historique d'utilisation
          </h2>
          <button
            ref={fermerRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer l historique"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-surface-elevated text-text-muted transition-colors hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span aria-hidden="true">&#10005;</span>
          </button>
        </div>

        {/* Filtres */}
        <div className="flex gap-3 border-b border-border p-4">
          <label htmlFor={`${idTitre}-filtre`} className="sr-only">
            Filtrer par outil
          </label>
          <select
            id={`${idTitre}-filtre`}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          >
            <option value="">Tous les outils</option>
            {Object.entries(TOOL_TYPES).map(([key, { label, emoji }]) => (
              <option key={key} value={key}>
                {emoji} {label}
              </option>
            ))}
          </select>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto p-4">
          {erreur && (
            <p
              role="alert"
              className="mb-3 rounded-xl border border-error/20 bg-error/8 px-4 py-3 text-sm font-medium text-error"
            >
              {erreur}
            </p>
          )}

          {loading ? (
            <div role="status" className="py-8 text-center text-text-muted">
              Chargement...
            </div>
          ) : entries.length === 0 ? (
            <div className="py-8 text-center text-text-muted">Aucun historique trouve</div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => {
                const toolInfo = TOOL_TYPES[entry.tool_type] || {
                  label: entry.tool_type,
                  emoji: '📄',
                };
                const titre = entry.title || 'Sans titre';

                return (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/30"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-lg" aria-hidden="true">
                            {toolInfo.emoji}
                          </span>
                          <h3 className="truncate text-sm font-semibold text-text-primary">{titre}</h3>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {toolInfo.label}
                          </span>
                        </div>
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs text-text-muted">
                            {new Date(entry.created_at).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        {/* Resume des resultats */}
                        {entry.result_summary && Object.keys(entry.result_summary).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {entry.result_summary.metiers?.slice(0, 3).map((m, i) => (
                              <span
                                key={i}
                                className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-xs text-text-muted"
                              >
                                {typeof m === 'string' ? m : m.intitule || m.titre || ''}
                              </span>
                            ))}
                            {/* != null et non « && » : un score ATS de 0 est une
                                valeur juste, et c'est meme la plus importante a
                                montrer. Avec `score_ats &&`, le 0 etait faux en
                                JavaScript et la pastille disparaissait — l'entree
                                paraissait ne pas avoir de score du tout. */}
                            {entry.result_summary.score_ats != null && (
                              <span className="rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-xs text-success">
                                ATS: {entry.result_summary.score_ats}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="ml-4 flex items-center gap-2">
                        {onLoad && (
                          <button
                            type="button"
                            onClick={() => onLoad(entry)}
                            aria-label={`Voir le resultat : ${titre}`}
                            className="cursor-pointer rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            Voir
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(entry.id)}
                          aria-label={`Supprimer l entree : ${titre}`}
                          className="cursor-pointer rounded-lg px-2 py-1.5 text-xs text-error transition-colors hover:bg-error/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <span aria-hidden="true">&#128465;</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pied */}
        <div className="border-t border-border p-4 text-center">
          <p className="text-xs text-text-muted">
            {entries.length} entree{entries.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
