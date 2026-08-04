'use client';

import { IconChevronRight } from '@/components/shared/icons';

/**
 * Detail du score ATS, critere par critere.
 *
 * POURQUOI CE COMPOSANT EXISTE
 * backend/src/core/score/ats.js ne renvoie plus seulement un nombre : il renvoie
 * le detail complet de son calcul (chaque critere, son poids, ce qui a ete obtenu,
 * et pourquoi). L'interface n'affichait que le nombre final. Tout le travail de
 * transparence etait donc calcule, transmis... puis jete.
 *
 * LA REGLE QUE CE COMPOSANT DOIT RENDRE VISIBLE
 * Un critere qu'on ne peut pas mesurer sur CE CV sort du calcul ET du
 * denominateur. Exemple concret du barre : sans offre ciblee, la famille
 * "mots-cles du poste" (14 points) devient non applicable et le score se calcule
 * sur 86 points. Si on affichait 0/14 a la place, un infirmier plafonnerait a 86 %
 * a cause de mots-cles techniques qui ne le concernent pas. C'est precisement le
 * biais que le barre cherche a supprimer : l'interface ne doit surtout pas le
 * reintroduire en dessinant un zero.
 *
 * COMPATIBILITE HISTORIQUE
 * Les analyses archivees dans tool_usage_history datent d'avant ce champ. Quand
 * `detail` est absent ou mal forme, on n'affiche rien du tout et rien ne plante.
 *
 * @param {object} detail  sortie de scoreAts : { pointsObtenus, pointsMaxApplicables,
 *                         familles: [{ nom, libelle?, obtenu, max }],
 *                         criteres: [{ id, famille, libelle, poids, obtenu,
 *                                      applicable, mesure, message, facilite }] }
 */
export default function ScoreDetail({ detail, className = '' }) {
  if (!estDetailExploitable(detail)) return null;

  const { criteres } = detail;
  const pointsObtenus = Number(detail.pointsObtenus);
  const pointsMax = Number(detail.pointsMaxApplicables);

  // On construit les groupes a partir des familles renvoyees par le backend,
  // puis on ramasse les criteres orphelins (famille inconnue) pour n'en perdre
  // aucun a l'affichage si le barre evolue cote serveur.
  const groupes = detail.familles
    .filter((famille) => famille && typeof famille === 'object')
    .map((famille) => ({
      cle: String(famille.nom ?? ''),
      titre: famille.libelle || famille.nom || 'Critere',
      obtenu: Number(famille.obtenu) || 0,
      max: Number(famille.max) || 0,
      membres: criteres.filter((critere) => critere?.famille === famille.nom),
    }));

  const famillesConnues = new Set(groupes.map((groupe) => groupe.cle));
  const orphelins = criteres.filter(
    (critere) => critere && !famillesConnues.has(String(critere.famille ?? ''))
  );
  if (orphelins.length > 0) {
    groupes.push({
      cle: '__autres',
      titre: 'Autres criteres',
      obtenu: orphelins.reduce((somme, c) => somme + (c.applicable ? Number(c.obtenu) || 0 : 0), 0),
      max: orphelins.reduce((somme, c) => somme + (c.applicable ? Number(c.poids) || 0 : 0), 0),
      membres: orphelins,
    });
  }

  return (
    <section className={`rounded-2xl border border-border/60 bg-surface p-5 sm:p-6 ${className}`}>
      <header className="mb-5">
        <h3 className="font-display text-lg font-bold text-text-primary">Detail du score</h3>
        <p className="mt-1 text-sm text-text-secondary">
          <strong className="font-semibold text-text-primary">
            {formaterNombre(pointsObtenus)} points sur {formaterNombre(pointsMax)} applicables
          </strong>
        </p>
        {/* La phrase qui explique le denominateur variable. Sans elle, un total
            sur 86 au lieu de 100 passe pour un bug. */}
        <p className="mt-2 text-xs leading-relaxed text-text-muted">
          Un critere impossible a mesurer sur ton CV (par exemple les mots-cles d&apos;une offre que tu
          n&apos;as pas renseignee) est retire du calcul <em>et</em> du total : il ne compte pas comme un zero,
          il ne te penalise pas.
        </p>
      </header>

      <div className="space-y-3">
        {groupes.map((groupe) => (
          <GroupeFamille key={groupe.cle} groupe={groupe} />
        ))}
      </div>
    </section>
  );
}

/* ── Une famille : barre de progression + criteres depliables ──────────── */

function GroupeFamille({ groupe }) {
  const { titre, obtenu, max, membres } = groupe;

  // max === 0 signifie qu'aucun critere de cette famille n'etait mesurable.
  // On l'ecrit noir sur blanc plutot que de dessiner une barre vide a 0 %.
  const familleNonApplicable = max === 0;
  const pourcentage = familleNonApplicable ? 0 : Math.round((obtenu / max) * 100);

  return (
    <details className="group rounded-xl border border-border/60 bg-surface-elevated/40 open:bg-surface-elevated/60">
      {/* <details>/<summary> plutot qu'un useState : le pliage est natif, il
          fonctionne au clavier et les lecteurs d'ecran annoncent deja
          "reduit/developpe" sans qu'on ait a gerer aria-expanded a la main. */}
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-webkit-details-marker]:hidden">
        <IconChevronRight className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-90" />

        <span className="flex-1 text-sm font-semibold text-text-primary">{titre}</span>

        {familleNonApplicable ? (
          <BadgeNonApplicable />
        ) : (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-text-secondary">
            {formaterNombre(obtenu)} / {formaterNombre(max)} pts
          </span>
        )}
      </summary>

      {!familleNonApplicable && (
        // aria-hidden : la barre ne fait que redire le "X / Y pts" juste au-dessus,
        // deja lu par les lecteurs d'ecran. L'annoncer deux fois serait du bruit.
        <div className="px-4 pb-3" aria-hidden="true">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className={`h-full rounded-full transition-all duration-500 ${couleurBarre(pourcentage)}`}
              style={{ width: `${pourcentage}%` }}
            />
          </div>
        </div>
      )}

      <ul className="space-y-2 border-t border-border/60 px-4 py-3">
        {membres.length === 0 ? (
          <li className="text-xs text-text-muted">Aucun critere dans cette famille.</li>
        ) : (
          membres.map((critere, index) => (
            <LigneCritere key={critere.id || `${groupe.cle}-${index}`} critere={critere} />
          ))
        )}
      </ul>
    </details>
  );
}

/* ── Un critere ────────────────────────────────────────────────────────── */

function LigneCritere({ critere }) {
  // applicable !== false : un ancien enregistrement sans le champ est traite
  // comme applicable, ce qui reste le cas le plus frequent.
  const applicable = critere.applicable !== false;
  const obtenu = Number(critere.obtenu) || 0;
  const poids = Number(critere.poids) || 0;

  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
          !applicable ? 'bg-text-muted' : obtenu >= poids ? 'bg-success' : obtenu > 0 ? 'bg-warning' : 'bg-error'
        }`}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-text-primary">
            {critere.libelle || critere.id || 'Critere'}
          </span>

          {applicable ? (
            <span className="text-xs font-semibold tabular-nums text-text-secondary">
              {formaterNombre(obtenu)} / {formaterNombre(poids)} pts
            </span>
          ) : (
            <BadgeNonApplicable />
          )}
        </div>

        {critere.message && (
          <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{critere.message}</p>
        )}
      </div>
    </li>
  );
}

function BadgeNonApplicable() {
  return (
    <span className="shrink-0 rounded-full border border-border-light px-2 py-0.5 text-xs font-medium text-text-muted">
      non applicable a ce CV
    </span>
  );
}

/* ── Utilitaires ───────────────────────────────────────────────────────── */

/**
 * Verifie que l'objet a la forme attendue AVANT d'essayer de l'afficher.
 * L'historique rejoue des resultats archives : un `detail` absent doit produire
 * un ecran normal, pas un ecran blanc.
 */
function estDetailExploitable(detail) {
  if (!detail || typeof detail !== 'object') return false;
  if (!Array.isArray(detail.familles) || !Array.isArray(detail.criteres)) return false;
  if (detail.familles.length === 0 && detail.criteres.length === 0) return false;
  if (!Number.isFinite(Number(detail.pointsObtenus))) return false;
  if (!Number.isFinite(Number(detail.pointsMaxApplicables))) return false;
  return true;
}

function couleurBarre(pourcentage) {
  if (pourcentage >= 80) return 'bg-success';
  if (pourcentage >= 50) return 'bg-warning';
  return 'bg-error';
}

/** 3 -> "3" et 3.5 -> "3,5" : meme convention que les messages du backend. */
function formaterNombre(valeur) {
  const nombre = Math.round((Number(valeur) || 0) * 10) / 10;
  return Number.isInteger(nombre) ? String(nombre) : String(nombre).replace('.', ',');
}
