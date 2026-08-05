'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/shared/Button';
import { getCapacites } from '@/lib/api/capacitesApi';
import { useParametresIa } from '@/context/ParametresIaContext';

/**
 * ONGLET « DONNEES & CONFIDENTIALITE ».
 *
 * A QUOI IL SERT
 * Mew manipule un CV : un document qui porte un nom, une adresse, un
 * telephone et un parcours entier. La question « ou va tout ca ? » merite une
 * page a elle, pas une note en bas d'un formulaire.
 *
 * TROIS BLOCS
 *   1. Ou vivent tes donnees — repondu par le backend, pas suppose ici.
 *   2. Ce que cette installation sait faire, et ce qui est eteint. Une
 *      capacite eteinte n'est pas une panne : c'est une brique qu'on n'a pas
 *      configuree, et ca doit se lire comme tel.
 *   3. Tout effacer. La reponse honnete a « comment je retire mes cles de
 *      cette machine ? » doit etre a un clic, pas dans un fichier cache.
 */
export default function OngletDonnees() {
  const { comptes, toutEffacer } = useParametresIa();
  const [capacites, setCapacites] = useState(null);
  const [confirmation, setConfirmation] = useState(false);
  const [effacement, setEffacement] = useState(false);

  useEffect(() => {
    let monte = true;
    // getCapacites() renvoie deja null au lieu de lever : rien a rattraper.
    getCapacites().then((donnees) => {
      if (monte && donnees) setCapacites(donnees);
    });
    return () => { monte = false; };
  }, []);

  const avecCle = comptes.filter((c) => c.aUneCle).length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/60 bg-surface p-6">
        <h2 className="font-display mb-4 text-lg font-bold text-text-primary">
          Ou vivent tes donnees
        </h2>

        <dl className="space-y-3">
          <Ligne
            titre="Ton CV, tes candidatures, ton historique"
            valeur={
              capacites && capacites.stockage === 'supabase'
                ? 'Dans TON projet Supabase — c\'est toi qui l\'heberges.'
                : 'Dans un fichier sur cette machine (backend/data/mew.json). Rien n\'est envoye ailleurs.'
            }
            ton="succes"
          />
          <Ligne
            titre="Tes cles API"
            valeur={
              avecCle === 0
                ? 'Aucune cle enregistree pour l\'instant.'
                : `${avecCle} cle${avecCle > 1 ? 's' : ''} dans backend/data/config-ia.json, sur cette `
                  + 'machine. Elles ne repartent jamais vers le navigateur : tu n\'en revois que la fin.'
            }
            ton="succes"
          />
          <Ligne
            titre="Le texte envoye aux modeles"
            valeur={
              "Quand tu utilises une tache IA, le contenu de ton CV part chez le fournisseur "
              + 'choisi POUR CETTE TACHE. Le detail fournisseur par fournisseur est dans '
              + 'l\'onglet « Mes IA ». Un modele local (Ollama, LM Studio) ne fait rien sortir.'
            }
            ton="attention"
          />
        </dl>
      </section>

      <section className="rounded-2xl border border-border/60 bg-surface p-6">
        <h2 className="font-display mb-1 text-lg font-bold text-text-primary">
          Ce que cette installation sait faire
        </h2>
        <p className="mb-4 text-sm text-text-muted">
          Une brique eteinte n&apos;est pas une panne : c&apos;est quelque chose que personne
          n&apos;a configure. Tout le reste continue de fonctionner.
        </p>

        {capacites ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {[
              { cle: 'ia', libelle: 'Redaction par un modele' },
              { cle: 'envoiEmail', libelle: 'Envoi des emails (Resend)' },
              { cle: 'scraping', libelle: 'Lecture des offres en ligne' },
              { cle: 'franceTravail', libelle: 'Offres France Travail' },
            ].map(({ cle, libelle }) => (
              <li key={cle} className="flex items-center gap-2 text-sm">
                {/* Le point ne porte pas l'information a lui seul : le mot est
                    ecrit juste a cote (daltonisme, lecteur d'ecran). */}
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${capacites[cle] ? 'bg-success' : 'bg-text-muted/40'}`}
                />
                <span className="text-text-secondary">{libelle}</span>
                <span className={capacites[cle] ? 'text-success' : 'text-text-muted'}>
                  {capacites[cle] ? 'active' : 'non configuree'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          // Backend injoignable : on n'affiche aucun indicateur, plutot que
          // d'annoncer a tort que tout est desactive.
          <p className="text-sm text-text-muted">
            Le backend ne repond pas : impossible de savoir ce qui est actif. Verifie qu&apos;il
            tourne avec <code className="font-mono">cd backend &amp;&amp; npm run dev</code>.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-error/20 bg-error/5 p-6">
        <h2 className="font-display mb-1 text-lg font-bold text-text-primary">
          Retirer toutes tes cles de cette machine
        </h2>
        <p className="mb-4 max-w-2xl text-sm leading-relaxed text-text-secondary">
          Efface <strong>tous</strong> les acces enregistres et l&apos;affectation des taches. Tes
          candidatures, ton historique et tes CV ne sont pas touches. Les outils continuent de
          calculer ce qu&apos;ils calculent deja sur ta machine ; seuls les textes rediges
          s&apos;arretent, jusqu&apos;a ce que tu remettes une cle.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {confirmation ? (
            <>
              <span className="text-sm font-medium text-text-primary">
                Effacer {avecCle > 0 ? `les ${avecCle} cles` : 'la configuration'} ? C&apos;est definitif.
              </span>
              <Button
                variant="danger"
                loading={effacement}
                onClick={async () => {
                  setEffacement(true);
                  await toutEffacer();
                  setEffacement(false);
                  setConfirmation(false);
                }}
              >
                Oui, tout effacer
              </Button>
              <Button variant="ghost" onClick={() => setConfirmation(false)}>Annuler</Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmation(true)} disabled={comptes.length === 0}>
              Tout effacer
            </Button>
          )}

          {comptes.length === 0 && !confirmation && (
            <span className="text-sm text-text-muted">Il n&apos;y a rien a effacer.</span>
          )}
        </div>
      </section>
    </div>
  );
}

const TONS = {
  succes: 'border-success/20 bg-success/8',
  attention: 'border-warning/25 bg-warning/8',
};

function Ligne({ titre, valeur, ton }) {
  return (
    <div className={`rounded-xl border p-4 ${TONS[ton]}`}>
      <dt className="mb-1 text-sm font-bold text-text-primary">{titre}</dt>
      <dd className="text-sm leading-relaxed text-text-secondary">{valeur}</dd>
    </div>
  );
}
