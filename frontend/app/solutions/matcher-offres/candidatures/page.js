'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getUser, signOut } from '@/lib/auth';
import { getApplications, updateApplication, deleteApplication } from '@/lib/api/applicationsApi';
import Header from '@/components/shared/Header';
import Button from '@/components/shared/Button';

// ── Statuts ───────────────────────────────────────────────────────────
const STATUTS = [
  { key: 'a_postuler',  label: 'À postuler',  color: 'text-text-muted',      bg: 'bg-surface-elevated',   border: 'border-border/60' },
  { key: 'postule',     label: 'Postulé',      color: 'text-blue-400',        bg: 'bg-blue-900/20',        border: 'border-blue-700' },
  { key: 'entretien',   label: 'Entretien',    color: 'text-yellow-400',      bg: 'bg-yellow-900/20',      border: 'border-yellow-700' },
  { key: 'offre',       label: 'Offre reçue',  color: 'text-green-400',       bg: 'bg-green-900/20',       border: 'border-green-700' },
  { key: 'refuse',      label: 'Refusé',       color: 'text-red-400',         bg: 'bg-red-900/20',         border: 'border-red-700' },
];

const statutInfo = (key) => STATUTS.find(s => s.key === key) || STATUTS[0];

function StatusBadge({ status }) {
  const s = statutInfo(status);
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${s.color} ${s.bg} ${s.border}`}>
      {s.label}
    </span>
  );
}

function ApplicationRow({ app, onStatusChange, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(app.notes || '');
  const [saving, setSaving] = useState(false);

  const handleStatusChange = async (newStatus) => {
    await onStatusChange(app.id, newStatus);
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    await onStatusChange(app.id, app.status, notes);
    setSaving(false);
    setEditing(false);
  };

  const dateStr = app.applied_at
    ? new Date(app.applied_at).toLocaleDateString('fr-FR')
    : app.created_at
    ? new Date(app.created_at).toLocaleDateString('fr-FR')
    : '';

  return (
    <div className="bg-surface rounded-2xl border border-border/60 hover:border-primary/30 transition-colors p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <StatusBadge status={app.status} />
            {app.contract_type && <span className="text-xs text-text-muted">{app.contract_type}</span>}
            {dateStr && <span className="text-xs text-text-muted">{dateStr}</span>}
          </div>
          <h3 className="font-display font-semibold text-text-primary truncate">{app.offer_title}</h3>
          <p className="text-sm text-text-muted">
            {app.company && <span>{app.company}</span>}
            {app.location && <span> · {app.location}</span>}
          </p>

          {/* Notes */}
          {editing ? (
            <div className="mt-3 space-y-2">
              <textarea
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
                <Button variant="outline" size="sm" onClick={() => { setEditing(false); setNotes(app.notes || ''); }}>
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
            <a href={app.offer_url} target="_blank" rel="noopener noreferrer"
              className="text-xs px-2 py-1 rounded-lg border border-border/60 text-text-muted hover:text-text-primary hover:border-primary/40 transition-colors text-center">
              Voir ↗
            </a>
          )}
          <button onClick={() => setEditing(!editing)}
            className="text-xs px-2 py-1 rounded-lg border border-border/60 text-text-muted hover:text-text-primary hover:border-primary/40 transition-colors">
            Notes
          </button>
          <button onClick={() => onDelete(app.id)}
            className="text-xs px-2 py-1 rounded-lg border border-red-900 text-red-500 hover:bg-red-950/20 transition-colors">
            ✕
          </button>
        </div>
      </div>

      {/* Changement de statut */}
      <div className="flex gap-1 mt-3 flex-wrap">
        {STATUTS.map(s => (
          <button key={s.key} onClick={() => handleStatusChange(s.key)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              app.status === s.key ? `${s.bg} ${s.border} ${s.color}` : 'border-border/60 text-text-muted hover:border-primary/40 hover:text-text-primary'
            }`}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CandidaturesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [userId, setUserId] = useState(null);

  const handleLogout = async () => {
    if (!(await signOut())) return;
    router.push('/login');
  };

  useEffect(() => {
    getUser().then((utilisateur) => {
      const uid = utilisateur?.id;
      setUserId(uid);
      if (uid) {
        getApplications(uid)
          .then(apps => setApplications(apps || []))
          .catch(e => setError(e.message))
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
  }, []);

  const handleStatusChange = async (id, newStatus, notes) => {
    if (!userId) return;
    try {
      const updateData = { status: newStatus };
      if (notes !== undefined) updateData.notes = notes;
      if (newStatus === 'postule') updateData.applied_at = new Date().toISOString();
      const updated = await updateApplication(id, userId, updateData);
      setApplications(prev => prev.map(a => a.id === id ? updated : a));
    } catch (err) {
      console.error('Erreur mise à jour:', err);
    }
  };

  const handleDelete = async (id) => {
    if (!userId || !confirm('Supprimer cette candidature ?')) return;
    try {
      await deleteApplication(id, userId);
      setApplications(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error('Erreur suppression:', err);
    }
  };

  const filtered = filter
    ? applications.filter(a => a.status === filter)
    : applications;

  // Compteurs par statut
  const counts = STATUTS.reduce((acc, s) => {
    acc[s.key] = applications.filter(a => a.status === s.key).length;
    return acc;
  }, {});

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-text-muted">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <Header
        user={user}
        onLogout={handleLogout}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Candidatures' }
        ]}
        actions={
          <div className="hidden sm:flex items-center gap-2">
            <Link
              href="/solutions/matcher-offres"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-pink-500/10 text-pink-400 text-sm font-medium hover:bg-pink-500/20 transition-colors"
            >
              <span>🎯</span>
              <span>Matcher</span>
            </Link>
            <Link
              href="/solutions/candidature-spontanee"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition-colors"
            >
              <span>📧</span>
              <span>Candidature</span>
            </Link>
          </div>
        }
      />

      <div className="max-w-3xl mx-auto py-8 px-4 animate-fade-in">
        {/* Title */}
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-text-primary">Mes Candidatures</h1>
          <p className="text-sm text-text-muted mt-1">{applications.length} candidature{applications.length > 1 ? 's' : ''} au total</p>
        </div>

        {/* Compteurs par statut */}
        <div className="grid grid-cols-5 gap-2 mb-6">
          {STATUTS.map(s => (
            <button key={s.key} onClick={() => setFilter(filter === s.key ? '' : s.key)}
              className={`flex flex-col items-center p-3 rounded-2xl border transition-all ${
                filter === s.key ? `${s.bg} ${s.border} ${s.color}` : 'bg-surface border-border/60 hover:border-primary/30 text-text-muted'
              }`}>
              <span className="text-lg font-bold">{counts[s.key] || 0}</span>
              <span className="text-xs mt-0.5">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Erreur */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-2xl p-4 mb-6">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-12 text-text-muted">Chargement...</div>
        )}

        {/* Vide */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-text-muted font-medium">
              {filter ? 'Aucune candidature avec ce statut.' : 'Aucune candidature pour l\'instant.'}
            </p>
            <div className="mt-4">
              <Button onClick={() => router.push('/solutions/matcher-offres')}>
                Créer ma première candidature →
              </Button>
            </div>
          </div>
        )}

        {/* Liste */}
        <div className="space-y-3">
          {filtered.map(app => (
            <ApplicationRow
              key={app.id}
              app={app}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))}
        </div>

      </div>
    </div>
  );
}
