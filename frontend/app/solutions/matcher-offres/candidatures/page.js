'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getUser } from '@/lib/auth';
import {
  getApplications,
  updateApplication,
  deleteApplication,
  getStatistiquesCandidatures,
} from '@/lib/api/applicationsApi';
import Header from '@/components/shared/Header';
import Button from '@/components/shared/Button';
import Alert from '@/components/shared/Alert';
import LoadingScreen from '@/components/shared/LoadingScreen';
import { IconClock } from '@/components/shared/icons';

/**
 * Suivi de candidatures.
 *
 * DEUX MANQUES CORRIGES ICI
 *
 * 1) LES RELANCES ETAIENT INVISIBLES. Chaque candidature spontanee ecrit une
 *    date de relance (`follow_up_date`) en base depuis le debut. Elle n'etait
 *    affichee QUE sur l'ecran de confirmation, juste apres l'envoi : des qu'on
 *    quittait cette page, plus aucun ecran ne la montrait. Relancer est le
 *    geste qui rapporte le plus dans une recherche d'emploi ; le calculer
 *    sans jamais le montrer revenait a ne pas le faire.
 *
 * 2) LES ERREURS ETAIENT AVALEES. Un changement de statut ou une suppression
 *    qui echouait n'ecrivait que dans la console du navigateur. Cote
 *    utilisateur : le bouton ne repondait pas, sans un mot d'explication.
 *    L'etat `error` existait deja et n'etait utilise que pour le chargement.
 */

// Les couleurs passent par les variables de theme. Avant, c'etait du
// bg-blue-900/20 + text-blue-400 : lisible sur le fond noir du theme sombre,
// illisible sur le fond creme du theme clair.
const STATUTS = [
  { key: 'a_postuler', label: 'A postuler', color: 'text-text-muted', bg: 'bg-surface-elevated', border: 'border-border' },
  { key: 'postule',    label: 'Postule',    color: 'text-info',       bg: 'bg-info/10',          border: 'border-info/30' },
  { key: 'entretien',  label: 'Entretien',  color: 'text-warning',    bg: 'bg-warning/10',       border: 'border-warning/30' },
  { key: 'offre',      label: 'Offre recue', color: 'text-success',   bg: 'bg-success/10',       border: 'border-success/30' },
  { key: 'refuse',     label: 'Refuse',     color: 'text-error',      bg: 'bg-error/10',         border: 'border-error/30' },
];

// Filtre special : ne montrer que les candidatures a relancer.
const FILTRE_RELANCES = '__relances';

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

const statutInfo = (key) => STATUTS.find((s) => s.key === key) || STATUTS[0];

const versDate = (valeur) => {
  if (!valeur) return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Jours de calendrier ecoules, en ramenant les deux dates a minuit. */
function joursDepuis(valeur, maintenant) {
  const debut = versDate(valeur);
  if (!debut) return null;
  const aMinuit = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.round((aMinuit(maintenant) - aMinuit(debut)) / MS_PAR_JOUR));
}

/**
 * Repli quand le backend n'expose pas encore la route des statistiques.
 *
 * On n'essaie PAS de recalculer les 8 jours ouvres du backend : on se contente
 * de la date deja enregistree sur la fiche. C'est donc un sous-ensemble des
 * relances reelles — mieux vaut en montrer moins que d'en inventer avec une
 * regle differente de celle du serveur.
 */
function estARelancerLocalement(candidature, maintenant) {
  if (!candidature || candidature.status !== 'postule' || candidature.follow_up_sent) return false;
  const echeance = versDate(candidature.follow_up_date);
  return Boolean(echeance) && echeance.getTime() <= maintenant.getTime();
}

const formaterDate = (valeur, options) => {
  const date = versDate(valeur);
  return date ? date.toLocaleDateString('fr-FR', options) : '';
};

/* ── Petits blocs d'affichage ──────────────────────────────────────────── */

function StatusBadge({ status }) {
  const s = statutInfo(status);
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${s.color} ${s.bg} ${s.border}`}>
      {s.label}
    </span>
  );
}

function BadgeRelance() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border border-warning/30 bg-warning/10 text-warning">
      <IconClock className="w-3 h-3" />A relancer
    </span>
  );
}

function CarteStat({ valeur, libelle, precision }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface p-4">
      <p className="font-display text-xl font-bold text-text-primary tabular-nums">{valeur}</p>
      <p className="text-xs font-medium text-text-secondary mt-0.5">{libelle}</p>
      {precision && <p className="text-xs text-text-muted mt-1 leading-snug">{precision}</p>}
    </div>
  );
}

/**
 * Tableau de bord local : ces chiffres sont calcules par le backend a partir
 * des candidatures deja enregistrees. Aucun appel a un modele, aucun cout.
 */
function Statistiques({ stats }) {
  if (!stats) return null;

  const delai =
    stats.delaiMoyenReponseJours == null
      ? '—'
      : `${String(stats.delaiMoyenReponseJours).replace('.', ',')} j`;

  return (
    <section aria-labelledby="titre-statistiques" className="mb-6">
      <h2 id="titre-statistiques" className="text-sm font-semibold text-text-secondary mb-3">
        Ou en es-tu ?
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CarteStat
          valeur={`${String(stats.tauxReponse ?? 0).replace('.', ',')} %`}
          libelle="Taux de reponse"
          precision="Entretien, offre ou refus : un refus reste une reponse."
        />
        <CarteStat
          valeur={delai}
          libelle="Delai moyen de reponse"
          precision={stats.delaiMoyenReponseJours == null ? 'Aucune reponse recue pour le moment.' : undefined}
        />
        <CarteStat
          valeur={stats.candidaturesDormantes ?? 0}
          libelle="Candidatures dormantes"
          precision="Postulees depuis plus de 30 jours, sans reponse."
        />
        <CarteStat
          valeur={String(stats.cadenceHebdomadaire ?? 0).replace('.', ',')}
          libelle="Candidatures / semaine"
          precision="Rythme moyen depuis ta premiere candidature."
        />
      </div>
    </section>
  );
}

/**
 * Bandeau des relances du jour. C'est la reponse a « ou retrouve-t-on la date
 * de relance apres avoir quitte l'ecran de confirmation ? ».
 */
function BandeauRelances({ relances, onVoirTout, onRelanceFaite }) {
  if (relances.length === 0) return null;

  const pluriel = relances.length > 1 ? 's' : '';

  return (
    <section
      aria-labelledby="titre-relances"
      className="mb-6 rounded-2xl border border-warning/30 bg-warning/5 p-4"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h2 id="titre-relances" className="flex items-center gap-2 text-sm font-semibold text-warning">
          <IconClock className="w-4 h-4 shrink-0" />
          {relances.length} relance{pluriel} a faire aujourd&apos;hui
        </h2>
        <Button variant="ghost" size="sm" onClick={onVoirTout}>
          Ne voir que celles-ci
        </Button>
      </div>

      <p className="text-xs text-text-secondary mt-1">
        Une candidature sans reponse au bout d&apos;une dizaine de jours n&apos;est pas perdue : c&apos;est
        souvent une relance qui la remet sur le dessus de la pile.
      </p>

      <ul className="mt-3 space-y-2">
        {relances.slice(0, 3).map(({ candidature, joursDepuisEnvoi }) => (
          <li
            key={candidature.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary">{candidature.offer_title}</p>
              <p className="text-xs text-text-muted truncate">
                {candidature.company ? `${candidature.company} · ` : ''}
                {joursDepuisEnvoi == null ? 'envoyee' : `envoyee il y a ${joursDepuisEnvoi} jour${joursDepuisEnvoi > 1 ? 's' : ''}`}
              </p>
            </div>
            <Button variant="soft" size="sm" onClick={() => onRelanceFaite(candidature.id)}>
              C&apos;est fait
            </Button>
          </li>
        ))}
      </ul>

      {relances.length > 3 && (
        <p className="text-xs text-text-muted mt-2">
          et {relances.length - 3} autre{relances.length - 3 > 1 ? 's' : ''}...
        </p>
      )}
    </section>
  );
}

function ApplicationRow({ app, aRelancer, onStatusChange, onDelete, onRelanceFaite }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(app.notes || '');
  const [saving, setSaving] = useState(false);

  const handleSaveNotes = async () => {
    setSaving(true);
    const ok = await onStatusChange(app.id, app.status, notes);
    setSaving(false);
    if (ok) setEditing(false);
  };

  const dateStr = formaterDate(app.applied_at || app.created_at, undefined);
  const dateRelanceStr = formaterDate(app.follow_up_date, { day: 'numeric', month: 'long' });

  return (
    <div
      className={`bg-surface rounded-2xl border transition-colors p-4 ${
        aRelancer ? 'border-warning/40' : 'border-border/60 hover:border-primary/30'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <StatusBadge status={app.status} />
            {aRelancer && <BadgeRelance />}
            {app.contract_type && <span className="text-xs text-text-muted">{app.contract_type}</span>}
            {dateStr && <span className="text-xs text-text-muted">{dateStr}</span>}
          </div>

          <h3 className="font-display font-semibold text-text-primary truncate">{app.offer_title}</h3>
          <p className="text-sm text-text-muted">
            {app.company && <span>{app.company}</span>}
            {app.location && <span> · {app.location}</span>}
          </p>

          {/* Date de relance : visible meme quand l'echeance n'est pas encore
              atteinte, pour qu'on sache que quelque chose est prevu. */}
          {app.follow_up_date && !app.follow_up_sent && !aRelancer && dateRelanceStr && (
            <p className="text-xs text-text-muted mt-1">Relance prevue le {dateRelanceStr}</p>
          )}
          {app.follow_up_sent && <p className="text-xs text-text-muted mt-1">Relance deja envoyee</p>}

          {aRelancer && (
            <button
              type="button"
              onClick={() => onRelanceFaite(app.id)}
              className="mt-2 text-xs font-semibold text-warning hover:underline cursor-pointer"
            >
              Marquer la relance comme envoyee
            </button>
          )}

          {/* Notes */}
          {editing ? (
            <div className="mt-3 space-y-2">
              <label htmlFor={`notes-${app.id}`} className="sr-only">
                Notes sur la candidature {app.offer_title}
              </label>
              <textarea
                id={`notes-${app.id}`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes sur cette candidature..."
                className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none text-sm"
                rows={2}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveNotes} disabled={saving} loading={saving}>
                  {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setNotes(app.notes || '');
                  }}
                >
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            app.notes && <p className="text-xs text-text-muted mt-1 italic line-clamp-1">{app.notes}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 shrink-0">
          {app.offer_url && (
            <a
              href={app.offer_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1 rounded-lg border border-border/60 text-text-muted hover:text-text-primary hover:border-primary/40 transition-colors text-center"
            >
              Voir l&apos;offre ↗
            </a>
          )}
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            aria-expanded={editing}
            className="text-xs px-2 py-1 rounded-lg border border-border/60 text-text-muted hover:text-text-primary hover:border-primary/40 transition-colors cursor-pointer"
          >
            Notes
          </button>
          <button
            type="button"
            onClick={() => onDelete(app.id)}
            aria-label={`Supprimer la candidature ${app.offer_title}`}
            className="text-xs px-2 py-1 rounded-lg border border-error/30 text-error hover:bg-error/10 transition-colors cursor-pointer"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </div>

      {/* Changement de statut */}
      <div className="flex gap-1 mt-3 flex-wrap" role="group" aria-label={`Statut de ${app.offer_title}`}>
        {STATUTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onStatusChange(app.id, s.key)}
            aria-pressed={app.status === s.key}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
              app.status === s.key
                ? `${s.bg} ${s.border} ${s.color}`
                : 'border-border/60 text-text-muted hover:border-primary/40 hover:text-text-primary'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function CandidaturesPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();

  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [userId, setUserId] = useState(null);

  /**
   * Recharge les statistiques.
   * Elles ne sont qu'un bonus : si la route n'existe pas (backend plus ancien)
   * ou echoue, on ne montre pas d'erreur et la liste reste utilisable.
   */
  const chargerStatistiques = useCallback(async (uid) => {
    try {
      setStats(await getStatistiquesCandidatures(uid));
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    getUser().then((utilisateur) => {
      const uid = utilisateur?.id;
      setUserId(uid);
      if (!uid) {
        setLoading(false);
        return;
      }
      getApplications(uid)
        .then((apps) => setApplications(apps || []))
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
      chargerStatistiques(uid);
    });
  }, [chargerStatistiques]);

  /**
   * Remplace une candidature dans la liste.
   * Le repli sur `{ ...ancienne, ...modifications }` couvre le cas ou le
   * backend confirme sans renvoyer la ligne : sans lui, on ecrivait
   * `undefined` dans la liste et l'affichage plantait sur un succes.
   */
  const appliquerMaj = (id, renvoyee, modifications) => {
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? renvoyee || { ...a, ...modifications } : a))
    );
  };

  /**
   * @returns {Promise<boolean>} true si l'enregistrement a reussi. Le retour
   * sert au formulaire de notes : il ne doit se refermer que si la sauvegarde
   * est bien passee, sinon la saisie est perdue en silence.
   */
  const handleStatusChange = async (id, newStatus, notes) => {
    if (!userId) return false;
    try {
      const updateData = { status: newStatus };
      if (notes !== undefined) updateData.notes = notes;
      if (newStatus === 'postule') updateData.applied_at = new Date().toISOString();

      const updated = await updateApplication(id, userId, updateData);
      appliquerMaj(id, updated, updateData);
      setError('');
      // Le statut change les statistiques ET la liste des relances.
      chargerStatistiques(userId);
      return true;
    } catch (err) {
      // Avant, cette erreur n'allait que dans la console : le bouton semblait
      // simplement ne pas fonctionner.
      setError(err.message || 'Impossible de mettre a jour cette candidature.');
      return false;
    }
  };

  /** Marque la relance comme envoyee : la candidature sort du bandeau. */
  const handleRelanceFaite = async (id) => {
    if (!userId) return;
    try {
      const updated = await updateApplication(id, userId, { follow_up_sent: true });
      appliquerMaj(id, updated, { follow_up_sent: true });
      setError('');
      chargerStatistiques(userId);
    } catch (err) {
      setError(err.message || 'Impossible d enregistrer cette relance.');
    }
  };

  const handleDelete = async (id) => {
    if (!userId || !window.confirm('Supprimer cette candidature ?')) return;
    try {
      await deleteApplication(id, userId);
      setApplications((prev) => prev.filter((a) => a.id !== id));
      setError('');
      chargerStatistiques(userId);
    } catch (err) {
      setError(err.message || 'Impossible de supprimer cette candidature.');
    }
  };

  /**
   * Relances a faire.
   *
   * On repart TOUJOURS de la liste affichee, meme quand le backend a fourni la
   * sienne : si l'utilisateur vient de passer une candidature en « entretien »,
   * elle doit disparaitre des relances tout de suite, sans attendre que le
   * rechargement des statistiques revienne.
   */
  const relances = useMemo(() => {
    const maintenant = new Date();
    const fournies = Array.isArray(stats?.relancesAFaire) ? stats.relancesAFaire : null;

    const joursParId = new Map();
    if (fournies) {
      fournies.forEach((relance) => {
        const id = relance?.candidature?.id;
        if (id) joursParId.set(id, relance.joursDepuisEnvoi);
      });
    }

    return applications
      .filter((a) => a.status === 'postule' && !a.follow_up_sent)
      .filter((a) => (fournies ? joursParId.has(a.id) : estARelancerLocalement(a, maintenant)))
      .map((a) => ({
        candidature: a,
        joursDepuisEnvoi: joursParId.has(a.id)
          ? joursParId.get(a.id)
          : joursDepuis(a.applied_at || a.created_at, maintenant),
      }));
  }, [applications, stats]);

  const idsARelancer = useMemo(
    () => new Set(relances.map(({ candidature }) => candidature.id)),
    [relances]
  );

  const filtered =
    filter === FILTRE_RELANCES
      ? applications.filter((a) => idsARelancer.has(a.id))
      : filter
        ? applications.filter((a) => a.status === filter)
        : applications;

  // Compteurs par statut
  const counts = STATUTS.reduce((acc, s) => {
    acc[s.key] = applications.filter((a) => a.status === s.key).length;
    return acc;
  }, {});

  if (authLoading) {
    return <LoadingScreen message="Chargement de tes candidatures..." />;
  }

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <Header
        user={user}
        onLogout={logout}
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Candidatures' }]}
        actions={
          <div className="hidden sm:flex items-center gap-2">
            <Link
              href="/solutions/matcher-offres"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-light text-primary text-xs font-semibold hover:bg-primary/15 transition-colors"
            >
              Matcher
            </Link>
            <Link
              href="/solutions/candidature-spontanee"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-elevated text-text-secondary text-xs font-semibold hover:text-text-primary transition-colors"
            >
              Candidature spontanee
            </Link>
          </div>
        }
      />

      <div className="max-w-3xl mx-auto py-8 px-4 animate-fade-in">
        {/* Titre */}
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-text-primary">Mes Candidatures</h1>
          <p className="text-sm text-text-muted mt-1">
            {applications.length} candidature{applications.length > 1 ? 's' : ''} au total
          </p>
        </div>

        {/* Erreur : au-dessus de tout, pour qu'un echec ne passe jamais inapercu */}
        {error && (
          <div className="mb-6">
            <Alert variant="error" onClose={() => setError('')}>
              {error}
            </Alert>
          </div>
        )}

        {!loading && (
          <>
            <BandeauRelances
              relances={relances}
              onVoirTout={() => setFilter(filter === FILTRE_RELANCES ? '' : FILTRE_RELANCES)}
              onRelanceFaite={handleRelanceFaite}
            />

            <Statistiques stats={stats?.statistiques} />
          </>
        )}

        {/* Compteurs par statut, qui servent aussi de filtres */}
        <div className="grid grid-cols-5 gap-2 mb-6">
          {STATUTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setFilter(filter === s.key ? '' : s.key)}
              aria-pressed={filter === s.key}
              className={`flex flex-col items-center p-3 rounded-2xl border transition-all cursor-pointer ${
                filter === s.key
                  ? `${s.bg} ${s.border} ${s.color}`
                  : 'bg-surface border-border/60 hover:border-primary/30 text-text-muted'
              }`}
            >
              <span className="text-lg font-bold tabular-nums">{counts[s.key] || 0}</span>
              <span className="text-xs mt-0.5 text-center leading-tight">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Chargement */}
        {loading && (
          <div role="status" className="text-center py-12 text-text-muted">
            Chargement...
          </div>
        )}

        {/* Vide */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-text-muted font-medium">
              {filter === FILTRE_RELANCES
                ? 'Aucune relance a faire aujourd hui. Rien a rattraper.'
                : filter
                  ? 'Aucune candidature avec ce statut.'
                  : "Aucune candidature pour l'instant."}
            </p>
            {!filter && (
              <div className="mt-4">
                <Button onClick={() => router.push('/solutions/matcher-offres')}>
                  Creer ma premiere candidature →
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Liste */}
        <div className="space-y-3">
          {filtered.map((app) => (
            <ApplicationRow
              key={app.id}
              app={app}
              aRelancer={idsARelancer.has(app.id)}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onRelanceFaite={handleRelanceFaite}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
