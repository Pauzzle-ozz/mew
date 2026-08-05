'use client';

import { useAuth } from '@/hooks/useAuth';
import Header from '@/components/shared/Header';
import LoadingScreen from '@/components/shared/LoadingScreen';
import Alert from '@/components/shared/Alert';
import OngletsParametres from '@/components/parametres/OngletsParametres';
import { FournisseurParametresIa, useParametresIa } from '@/context/ParametresIaContext';

/**
 * L'ESPACE PARAMETRES.
 *
 * CE QUE CET ESPACE CHANGE
 * Avant, le fournisseur d'IA se decidait dans un fichier .env, donc par la
 * personne qui lance le serveur. Ici, c'est l'utilisateur qui choisit : ses
 * fournisseurs, ses modeles, ses cles. Un modele qui tourne sur sa machine, un
 * service en ligne, ou n'importe quelle adresse compatible OpenAI — et
 * plusieurs a la fois, chacun sur les taches qu'il fait le mieux.
 *
 * POURQUOI LE LAYOUT PORTE L'ETAT
 * En Next.js, un layout ne se demonte pas quand on passe d'un onglet a
 * l'autre : c'est exactement l'endroit ou doit vivre ce que les onglets se
 * partagent (le catalogue, les acces enregistres, l'affectation des taches).
 * Les onglets, eux, ne font que lire et ecrire dans ce contexte — ils ne
 * gardent aucune copie de la verite.
 */
export default function LayoutParametres({ children }) {
  const { user, loading, logout } = useAuth();

  if (loading) return <LoadingScreen message="Ouverture des parametres..." />;

  return (
    <div className="min-h-screen bg-background">
      <Header
        user={user}
        onLogout={logout}
        breadcrumbs={[{ label: 'Tableau de bord', href: '/dashboard' }, { label: 'Parametres' }]}
      />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 animate-fade-in">
          <h1 className="font-display mb-2 text-3xl font-bold text-text-primary">Parametres</h1>
          <p className="max-w-2xl leading-relaxed text-text-secondary">
            Mew n&apos;impose aucun fournisseur d&apos;IA. Choisis ceux que tu veux, apporte tes
            propres cles, et decide outil par outil de ce qui passe par un modele. Tes cles sont
            enregistrees par le backend, sur cette machine, et ne repartent jamais vers le
            navigateur.
          </p>
        </div>

        <FournisseurParametresIa>
          <OngletsParametres />
          <div className="pt-6">
            <BandeauxCommuns />
            {children}
          </div>
        </FournisseurParametresIa>
      </main>
    </div>
  );
}

/**
 * Les trois messages qui valent pour TOUS les onglets.
 *
 * Ils sont ici et pas dans chaque page : une erreur declenchee dans « Mes IA »
 * doit rester visible si l'utilisateur passe a « Outils & modeles » sans
 * l'avoir lue, et surtout le verrou du .env concerne l'espace entier.
 */
function BandeauxCommuns() {
  const { backendTropAncien, source, erreur, succes, setErreur, setSucces } = useParametresIa();

  return (
    <div className="mb-6 space-y-4 empty:mb-0">
      {backendTropAncien && (
        <Alert variant="warning">
          Ce backend Mew ne connait pas encore l&apos;espace Parametres (route /api/ia absente).
          Mets a jour le dossier backend/ puis relance-le avec{' '}
          <code className="font-mono">cd backend &amp;&amp; npm run dev</code>.
        </Alert>
      )}

      {/* Quand backend/.env impose une cle, elle gagne sur tout ce qui est
          choisi ici. Le taire serait le pire scenario : la personne
          changerait de modele, lirait « enregistre », et rien ne bougerait. */}
      {source && source.verrouilleParEnv && (
        <Alert variant="warning">
          {source.note
            || "Le moteur d'IA est impose par le fichier backend/.env de cette installation. "
            + 'Retire OPENAI_API_KEY de ce fichier puis relance le serveur pour choisir toi-meme.'}
        </Alert>
      )}

      {erreur && <Alert variant="error" onClose={() => setErreur('')}>{erreur}</Alert>}
      {succes && <Alert variant="success" onClose={() => setSucces('')}>{succes}</Alert>}
    </div>
  );
}
