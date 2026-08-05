'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/shared/Button';
import LoadingScreen from '@/components/shared/LoadingScreen';
import CarteOutil from '@/components/parametres/CarteOutil';
import { useParametresIa } from '@/context/ParametresIaContext';

/**
 * ONGLET « OUTILS & MODELES ».
 *
 * DEUX QUESTIONS, UN SEUL ECRAN — parce que ce sont deux facettes de la meme :
 *   « cet outil utilise-t-il l'IA ? »   un interrupteur par tache
 *   « avec quel modele ? »              n'importe lequel, de n'importe quel
 *                                       acces enregistre
 *
 * C'est ici que vit la promesse : tel modele lit tes CV, tel autre redige tes
 * lettres, meme s'ils ne sont pas chez le meme fournisseur.
 *
 * POURQUOI UN BROUILLON PLUTOT QU'UN ENREGISTREMENT A CHAQUE CLIC
 * Regler quatre taches, c'est une dizaine de gestes. Ecrire a chacun ferait
 * autant d'allers-retours reseau et rendrait impossible de se raviser. On
 * garde donc un brouillon local, on montre clairement qu'il y a des
 * modifications en attente, et on ecrit une fois. La barre d'enregistrement
 * est COLLEE EN BAS : sans elle, on peut regler tout un ecran, partir, et
 * perdre son travail sans jamais avoir vu le bouton.
 */
export default function OngletOutils() {
  const {
    chargement, backendTropAncien, outils, taches, comptes, reglagesTaches, enregistrerLesTaches,
  } = useParametresIa();

  // Le brouillon : ce que l'utilisateur a change et pas encore enregistre.
  const [brouillon, setBrouillon] = useState(null);
  const [enregistrement, setEnregistrement] = useState(false);

  // Le brouillon repart de l'etat du backend a chaque fois que celui-ci change
  // (chargement initial, enregistrement reussi, acces retire ailleurs). C'est
  // ce qui evite qu'un brouillon perime survive a un aller-retour.
  useEffect(() => {
    setBrouillon(reglagesTaches);
  }, [reglagesTaches]);

  const modifie = useMemo(() => {
    if (!brouillon) return false;
    return JSON.stringify(brouillon) !== JSON.stringify(reglagesTaches);
  }, [brouillon, reglagesTaches]);

  const changerTache = useCallback((idTache, modification) => {
    setBrouillon((precedent) => ({
      ...precedent,
      [idTache]: { ...(precedent[idTache] || { actif: true, fournisseur: '', modele: '' }), ...modification },
    }));
  }, []);

  const enregistrer = useCallback(async () => {
    setEnregistrement(true);
    await enregistrerLesTaches(brouillon);
    setEnregistrement(false);
  }, [brouillon, enregistrerLesTaches]);

  if (chargement || !brouillon) return <LoadingScreen message="Lecture de tes reglages..." />;
  if (backendTropAncien) return null;

  const utilisables = comptes.filter((c) => c.utilisable);

  return (
    <div className="space-y-6 pb-24">
      {utilisables.length === 0 && <AucunAcces />}

      {outils.map((outil) => (
        <CarteOutil
          key={outil.id}
          outil={outil}
          taches={taches.filter((t) => t.outil === outil.id)}
          reglages={brouillon}
          onChangerTache={changerTache}
        />
      ))}

      <BarreEnregistrement
        modifie={modifie}
        enCours={enregistrement}
        onEnregistrer={enregistrer}
        onAnnuler={() => setBrouillon(reglagesTaches)}
      />
    </div>
  );
}

/**
 * Sans le moindre acces, cet ecran reste utile : il dit exactement ce qui
 * marche deja. Le masquer donnerait l'impression que Mew ne sert a rien sans
 * cle — ce qui est faux, et c'est meme l'inverse du projet.
 */
function AucunAcces() {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface-elevated p-5">
      <p className="text-sm leading-relaxed text-text-secondary">
        <strong className="text-text-primary">Aucun acces enregistre.</strong> Tout ce qui est
        marque « calcule sur ta machine » ci-dessous fonctionne des maintenant, sans cle et sans
        rien envoyer nulle part. Pour les textes rediges, ajoute un acces dans{' '}
        <Link
          href="/parametres"
          className="font-semibold text-primary underline underline-offset-2 hover:text-primary-hover"
        >
          l&apos;onglet « Mes IA »
        </Link>
        .
      </p>
    </div>
  );
}

/**
 * La barre d'enregistrement, collee en bas de l'ecran.
 * `role="status"` : son apparition est une information (« tu as des choses non
 * enregistrees »), pas une alerte qui coupe la parole au lecteur d'ecran.
 */
function BarreEnregistrement({ modifie, enCours, onEnregistrer, onAnnuler }) {
  if (!modifie) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-surface-glass backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <span className="text-sm text-text-secondary">
          Tu as des modifications non enregistrees.
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={onAnnuler}>
            Annuler
          </Button>
          <Button size="sm" onClick={onEnregistrer} loading={enCours}>
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}
