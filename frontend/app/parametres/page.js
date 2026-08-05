'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/shared/Button';
import LoadingScreen from '@/components/shared/LoadingScreen';
import CarteFournisseur from '@/components/parametres/CarteFournisseur';
import PanneauCompte from '@/components/parametres/PanneauCompte';
import { useParametresIa } from '@/context/ParametresIaContext';

/**
 * ONGLET « MES IA » : chez qui j'ai un acces, et avec quelle cle.
 *
 * POURQUOI ON N'AFFICHE PAS LES SEIZE FOURNISSEURS D'UN COUP
 * Mis a plat, ils se ressemblent tous et le choix devient un tirage au sort.
 * On montre d'abord ceux dont le nom parle a quelqu'un qui n'a jamais paye
 * d'API, plus les deux facons de tout faire tourner chez soi. Les autres ne
 * sont ni caches ni moins bons : ils sont a un clic, derriere « voir les
 * autres ». C'est le backend qui decide lesquels sont mis en avant
 * (llm/providers/guides/), pour que l'interface n'ait pas sa propre liste qui
 * derive avec le temps.
 *
 * UN FOURNISSEUR DEJA CONFIGURE EST TOUJOURS VISIBLE, meme s'il n'est pas mis
 * en avant : cacher un acces qu'on a soi-meme enregistre serait le meilleur
 * moyen de ne plus jamais le retrouver.
 *
 * TROIS GROUPES, ET L'ORDRE COMPTE
 *   « Sur ta machine »  gratuit, sans cle, et le CV ne quitte pas l'ordinateur.
 *                       En premier, parce que c'est le plus respectueux et que
 *                       personne n'y pense spontanement.
 *   « En ligne »        une cle, quelques centimes, et la meilleure qualite.
 *   « Autre »           la porte de sortie : n'importe quelle adresse
 *                       compatible OpenAI. Aucun modele n'est hors de portee.
 */
const GROUPES = [
  {
    cle: 'local',
    titre: 'Sur ta machine',
    explication:
      "Gratuit, sans cle, et ton CV ne sort jamais de ton ordinateur. Le logiciel doit tourner de son cote.",
    filtre: (f) => f.local,
  },
  {
    cle: 'ligne',
    titre: 'En ligne',
    explication:
      'Il te faut un compte chez eux et ta propre cle. Compte quelques centimes par lettre de motivation.',
    filtre: (f) => !f.local && f.id !== 'personnalise',
  },
  {
    cle: 'autre',
    titre: 'Autre fournisseur',
    explication:
      "Pour tout le reste : tu saisis toi-meme l'adresse de l'API. Aucun modele n'est hors de portee.",
    filtre: (f) => f.id === 'personnalise',
  },
];

const ID_PANNEAU = 'panneau-fournisseur';

export default function OngletMesIa() {
  const { chargement, backendTropAncien, fournisseurs, comptes, compteDe, fournisseurDe }
    = useParametresIa();

  const [ouvert, setOuvert] = useState(null);
  const [toutVoir, setToutVoir] = useState(false);

  /** Visible d'emblee : les mis en avant, plus tout ce qui est deja configure. */
  const estVisible = useMemo(() => {
    const configures = new Set(comptes.map((c) => c.fournisseur));
    return (f) => toutVoir || f.enAvant || configures.has(f.id);
  }, [comptes, toutVoir]);

  const caches = useMemo(
    () => fournisseurs.filter((f) => !estVisible(f)).length,
    [fournisseurs, estVisible]
  );

  if (chargement) return <LoadingScreen message="Lecture de tes acces..." />;
  if (backendTropAncien) return null;

  const fournisseurOuvert = ouvert ? fournisseurDe(ouvert) : null;

  return (
    <div className="space-y-8">
      <Resume comptes={comptes} />

      {GROUPES.map((groupe) => {
        const liste = fournisseurs.filter(groupe.filtre).filter(estVisible);
        if (liste.length === 0) return null;

        return (
          <section key={groupe.cle}>
            <h2 className="font-display mb-1 text-base font-bold text-text-primary">
              {groupe.titre}
            </h2>
            <p className="mb-4 text-sm text-text-muted">{groupe.explication}</p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {liste.map((fournisseur) => (
                <CarteFournisseur
                  key={fournisseur.id}
                  fournisseur={fournisseur}
                  compte={compteDe(fournisseur.id)}
                  ouvert={ouvert === fournisseur.id}
                  idPanneau={ID_PANNEAU}
                  onOuvrir={setOuvert}
                />
              ))}
            </div>
          </section>
        );
      })}

      {(caches > 0 || toutVoir) && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={() => setToutVoir((v) => !v)}>
            {toutVoir
              ? 'Ne montrer que les principaux'
              : `Voir les ${caches} autres fournisseurs`}
          </Button>
          {!toutVoir && (
            <p className="mt-2 text-xs text-text-muted">
              Groq, Cerebras, Together, Fireworks, xAI, Moonshot, llama.cpp... Moins connus, pas
              moins bons — certains ont un palier gratuit.
            </p>
          )}
        </div>
      )}

      {/* Le panneau s'ouvre SOUS la grille et non dans la carte : une carte qui
          s'agrandit dans une grille pousse toutes ses voisines et fait sauter
          la page sous les yeux de la personne. */}
      {fournisseurOuvert && (
        <PanneauCompte
          // key : changer de fournisseur remonte le panneau a neuf, sinon une
          // cle a moitie saisie ou un test reussi resterait affiche sous le
          // fournisseur suivant.
          key={fournisseurOuvert.id}
          id={ID_PANNEAU}
          fournisseur={fournisseurOuvert}
          compte={compteDe(fournisseurOuvert.id)}
          onFerme={() => setOuvert(null)}
        />
      )}
    </div>
  );
}

/**
 * Ou j'en suis, en une ligne.
 * Le lien vers l'onglet suivant n'apparait qu'une fois un acces enregistre :
 * avant, il n'y a rien a y regler.
 */
function Resume({ comptes }) {
  const utilisables = comptes.filter((c) => c.utilisable).length;

  if (utilisables === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-surface-elevated p-5">
        <p className="text-sm leading-relaxed text-text-secondary">
          <strong className="text-text-primary">Aucun acces enregistre pour l&apos;instant.</strong>{' '}
          Les scores, l&apos;analyse de ton CV et la recherche d&apos;offres fonctionnent deja sans
          rien : ils sont calcules sur ta machine. Une cle ne sert qu&apos;aux textes rediges
          (lettre, email, CV reformule).
        </p>
        <p className="mt-2 text-sm text-text-muted">
          Tu hesites ? <strong className="text-text-secondary">Ollama</strong> ne coute rien et
          garde ton CV sur ton ordinateur. Pour la meilleure qualite de redaction, prends un
          fournisseur en ligne.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-success/20 bg-success/8 p-5">
      <p className="text-sm text-text-secondary">
        <strong className="text-text-primary">
          {utilisables} acces {utilisables > 1 ? 'enregistres' : 'enregistre'}
        </strong>
        {utilisables > 1
          ? ' — tu peux confier chaque tache a celui qui la fait le mieux.'
          : ' — ajoutes-en d\'autres pour repartir les taches entre plusieurs modeles.'}
      </p>
      <Link
        href="/parametres/outils"
        className="text-sm font-semibold text-primary underline underline-offset-2 hover:text-primary-hover"
      >
        Regler les outils et les modeles
      </Link>
    </div>
  );
}
