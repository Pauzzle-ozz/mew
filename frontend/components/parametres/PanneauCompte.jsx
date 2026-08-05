'use client';

import { useCallback, useState } from 'react';
import Button from '@/components/shared/Button';
import ChampCle from './ChampCle';
import ChampAdresse from './ChampAdresse';
import ResultatTest from './ResultatTest';
import GuideFournisseur from './GuideFournisseur';
import { useParametresIa } from '@/context/ParametresIaContext';
import { testerConnexion } from '@/lib/api/iaApi';

/**
 * LE PANNEAU D'UN FOURNISSEUR : son guide, sa cle, son test.
 *
 * CE QU'IL NE FAIT PLUS : choisir des modeles. Enregistrer un acces chez
 * Anthropic n'oblige plus a decider dans la foulee ce qu'on va lui faire
 * faire — ca se regle dans l'onglet « Outils & modeles », ou l'on voit
 * TOUS les comptes cote a cote. C'est cette separation qui permet « ce
 * modele-la lit mes CV, cet autre redige mes lettres ».
 *
 * POURQUOI L'ETAT VIT ICI ET PAS DANS LE CONTEXTE
 * Une cle en cours de frappe, un test qui vient de tourner : ca ne concerne
 * qu'un fournisseur, et ca doit disparaitre des qu'on en ouvre un autre. Le
 * parent monte ce composant avec `key={fournisseur.id}` : changer de
 * fournisseur le remonte a neuf, et rien ne traine d'un ecran a l'autre.
 */
export default function PanneauCompte({ fournisseur, compte, id, onFerme }) {
  const { enregistrerUnCompte, retirerUnCompte, chercherModeles, setErreur } = useParametresIa();

  // null = « garde la cle deja enregistree ». Voir ChampCle.jsx.
  const [cle, setCle] = useState(compte && compte.aUneCle ? null : '');
  const [cleVisible, setCleVisible] = useState(false);
  const [baseURL, setBaseURL] = useState(
    (compte && compte.baseURL) || fournisseur.baseURL || ''
  );

  const [test, setTest] = useState(null);
  const [testEnCours, setTestEnCours] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [confirmationRetrait, setConfirmationRetrait] = useState(false);
  const [listage, setListage] = useState({ enCours: false, message: '' });

  // L'adresse ne se saisit que quand elle ne peut pas etre devinee : un
  // fournisseur local lance sur un autre port, ou une adresse personnalisee.
  // Pour les services en ligne elle est fixe, et la modifier ne pourrait que
  // casser la configuration.
  const adresseModifiable = fournisseur.local || !fournisseur.baseURL;

  /** Ce qui manque pour pouvoir tester ou enregistrer, en une phrase. */
  const manque = (() => {
    if (adresseModifiable && !baseURL.trim()) return "Saisis l'adresse de l'API.";
    if (fournisseur.cleRequise && !(compte && compte.aUneCle) && !(cle || '').trim()) {
      return 'Ce fournisseur demande une cle API.';
    }
    return null;
  })();

  const lancerTest = useCallback(async () => {
    if (manque) {
      setErreur(manque);
      return;
    }

    setTestEnCours(true);
    setTest(null);

    // Aucun modele n'est impose : le backend prend celui deja affecte a une
    // tache chez ce fournisseur, ou le premier de son catalogue. Ce qu'on
    // verifie ici, c'est l'acces — la cle, l'adresse, le reseau.
    const resultat = await testerConnexion({
      fournisseur: fournisseur.id,
      baseURL: baseURL.trim() || null,
      cleApi: cle || null,
      modele: null,
    });

    setTest(resultat);
    setTestEnCours(false);
  }, [manque, fournisseur.id, baseURL, cle, setErreur]);

  const enregistrer = useCallback(async () => {
    if (manque) {
      setErreur(manque);
      return;
    }

    setEnregistrement(true);
    const ok = await enregistrerUnCompte(fournisseur.id, {
      cleApi: cle,
      baseURL: baseURL.trim() || null,
    });
    setEnregistrement(false);

    // La cle est desormais chez le backend : on repasse en « garde celle
    // enregistree » plutot que de laisser la vraie cle dans un champ ouvert.
    if (ok) {
      setCle(null);
      setCleVisible(false);
    }
  }, [manque, fournisseur.id, cle, baseURL, enregistrerUnCompte, setErreur]);

  const chercher = useCallback(async () => {
    setListage({ enCours: true, message: '' });
    const resultat = await chercherModeles(fournisseur.id, {
      baseURL: baseURL.trim() || null,
      cleApi: cle || null,
    });
    setListage({ enCours: false, message: resultat.message });
  }, [fournisseur.id, baseURL, cle, chercherModeles]);

  return (
    <section
      id={id}
      className="animate-fade-in rounded-2xl border border-primary/30 bg-surface p-6"
      aria-label={`Reglages ${fournisseur.nom}`}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <h2 className="font-display text-xl font-bold text-text-primary">{fournisseur.nom}</h2>
        <Button variant="ghost" size="sm" onClick={onFerme}>Fermer</Button>
      </div>

      <div className="space-y-6">
        <GuideFournisseur fournisseur={fournisseur} />

        <hr className="border-border/60" />

        {adresseModifiable && (
          <ChampAdresse fournisseur={fournisseur} valeur={baseURL} onChange={setBaseURL} />
        )}

        <ChampCle
          fournisseur={fournisseur}
          cleMasquee={compte ? compte.cleMasquee : null}
          valeur={cle}
          onChange={(valeur) => { setCle(valeur); setTest(null); }}
          visible={cleVisible}
          onBasculerVisibilite={() => setCleVisible((v) => !v)}
        />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={enregistrer} loading={enregistrement}>
              {compte ? 'Mettre a jour' : 'Enregistrer cet acces'}
            </Button>

            <Button variant="outline" onClick={lancerTest} loading={testEnCours}>
              Tester
            </Button>

            {fournisseur.listageDynamique && (
              <Button variant="ghost" size="sm" onClick={chercher} loading={listage.enCours}>
                Chercher ses modeles
              </Button>
            )}

            {manque && <span className="text-sm text-text-muted">{manque}</span>}
          </div>

          {/* aria-live : le resultat de la recherche arrive apres coup, il doit
              etre annonce sans que la personne ait a repartir a la peche. */}
          <p aria-live="polite" className="text-xs text-text-muted empty:hidden">
            {listage.enCours ? 'Interrogation du fournisseur...' : listage.message}
          </p>

          <p className="text-xs leading-relaxed text-text-muted">
            « Tester » envoie une consigne courte au modele et regarde ce qui revient : la
            connexion, la cle, et si la reponse respecte le format attendu par Mew. Rien
            n&apos;est enregistre a ce stade.
          </p>

          <ResultatTest resultat={test} enCours={testEnCours} />
        </div>

        {compte && (
          <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-5">
            {confirmationRetrait ? (
              <>
                <span className="text-sm text-text-secondary">
                  Retirer cet acces et effacer sa cle de cette machine ?
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    setConfirmationRetrait(false);
                    if (await retirerUnCompte(fournisseur.id)) onFerme();
                  }}
                >
                  Oui, retirer
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmationRetrait(false)}>
                  Annuler
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmationRetrait(true)}>
                Retirer cet acces
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
