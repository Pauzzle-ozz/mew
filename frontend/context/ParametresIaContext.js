'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getCatalogue,
  getEtat,
  enregistrerCompte,
  supprimerCompte,
  enregistrerTaches,
  supprimerConfig,
  getModeles,
} from '@/lib/api/iaApi';

/**
 * L'ETAT PARTAGE DE L'ESPACE PARAMETRES.
 *
 * POURQUOI UN CONTEXTE, ET POURQUOI ICI
 * L'espace Parametres est decoupe en onglets, et chaque onglet est une route a
 * lui. Sans etat commun, passer de « Mes IA » a « Outils & modeles »
 * rechargerait le catalogue et l'etat a chaque clic, et surtout : l'onglet des
 * modeles ne saurait pas quels acces viennent d'etre ajoutes dans l'autre. Le
 * contexte vit donc dans le LAYOUT, qui lui ne se demonte pas quand on change
 * d'onglet.
 *
 * C'est la meme raison qu'avant, quand tout tenait dans une page unique :
 * les reglages se repondent. Retirer un acces libere les taches qui le
 * visaient ; ajouter une cle rend d'un coup une dizaine de modeles choisissables.
 * Un etat eclate dans chaque onglet laisserait trainer des affirmations
 * fausses — exactement ce qu'on veut eviter sur cet ecran.
 *
 * CE QU'IL NE FAIT PAS : deviner. Apres chaque ecriture, c'est la reponse du
 * backend qui devient l'etat. Lui seul sait ce qui est reellement enregistre,
 * et lui seul decide de l'apercu masque des cles.
 */

const ContexteParametresIa = createContext(null);

/**
 * Le « rien » stable. Un `{}` ecrit a la volee serait un objet NEUF a chaque
 * rendu : tout useEffect qui depend des reglages se reveillerait en boucle.
 */
const SANS_REGLAGES = Object.freeze({});

export function useParametresIa() {
  const valeur = useContext(ContexteParametresIa);
  if (!valeur) {
    throw new Error('useParametresIa doit etre appele sous <FournisseurParametresIa>.');
  }
  return valeur;
}

export function FournisseurParametresIa({ children }) {
  const [chargement, setChargement] = useState(true);
  const [backendTropAncien, setBackendTropAncien] = useState(false);

  const [catalogue, setCatalogue] = useState(null);
  const [etat, setEtat] = useState(null);

  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  // Les modeles annonces en direct par un fournisseur, par identifiant. C'est
  // ce qui rend Ollama et OpenRouter utilisables : leur catalogue statique est
  // vide ou immense.
  const [modelesDynamiques, setModelesDynamiques] = useState({});

  /* --- Chargement initial ------------------------------------------- */

  useEffect(() => {
    let monte = true;

    (async () => {
      try {
        const cat = await getCatalogue();
        if (!monte) return;

        // getCatalogue renvoie null quand la route n'existe pas : ce n'est pas
        // une panne, c'est un backend qui n'a pas encore cet ecran.
        if (!cat) {
          setBackendTropAncien(true);
          return;
        }
        setCatalogue(cat);

        const lu = await getEtat();
        if (monte && lu) setEtat(lu);
      } catch (probleme) {
        if (monte) setErreur(probleme.message);
      } finally {
        if (monte) setChargement(false);
      }
    })();

    return () => { monte = false; };
  }, []);

  /* --- Lectures derivees -------------------------------------------- */

  const fournisseurs = useMemo(() => (catalogue ? catalogue.fournisseurs : []), [catalogue]);
  const outils = useMemo(() => (catalogue ? catalogue.outils : []), [catalogue]);
  const taches = useMemo(() => (catalogue ? catalogue.taches : []), [catalogue]);
  const comptes = useMemo(() => (etat ? etat.comptes : []), [etat]);

  const fournisseurDe = useCallback(
    (id) => fournisseurs.find((f) => f.id === id) || null,
    [fournisseurs]
  );

  const compteDe = useCallback(
    (id) => comptes.find((c) => c.fournisseur === id) || null,
    [comptes]
  );

  /**
   * Les modeles proposes pour un fournisseur.
   * Le catalogue passe en premier : lui seul porte les tarifs, les roles et
   * les notes. Le listage en direct complete avec ce que le fournisseur
   * declare vraiment avoir.
   */
  const modelesDe = useCallback((id) => {
    const f = fournisseurDe(id);
    const statiques = f ? f.modeles : [];
    const directs = modelesDynamiques[id];
    if (!directs) return statiques;

    const connus = new Set(statiques.map((m) => m.id));
    return [...statiques, ...directs.filter((m) => !connus.has(m.id))];
  }, [fournisseurDe, modelesDynamiques]);

  /* --- Ecritures ----------------------------------------------------- */

  /** Applique la reponse du backend et affiche ses remarques eventuelles. */
  const appliquer = useCallback((nouvelEtat, message) => {
    setEtat(nouvelEtat);
    setErreur('');
    // Le backend accepte des configurations imparfaites en le signalant
    // (modele absent du catalogue, prefixe de cle inhabituel). Les taire
    // reviendrait a laisser croire que tout est parfait.
    const remarques = nouvelEtat.avertissements.length > 0
      ? ` ${nouvelEtat.avertissements.join(' ')}`
      : '';
    setSucces(`${message}${remarques}`);
  }, []);

  const enregistrerUnCompte = useCallback(async (idFournisseur, acces) => {
    setErreur('');
    setSucces('');
    const f = fournisseurs.find((x) => x.id === idFournisseur);

    try {
      const nouvel = await enregistrerCompte(idFournisseur, acces);
      appliquer(nouvel, `${f ? f.nom : idFournisseur} est enregistre.`);
      return true;
    } catch (probleme) {
      setErreur(probleme.message);
      return false;
    }
  }, [fournisseurs, appliquer]);

  const retirerUnCompte = useCallback(async (idFournisseur) => {
    setErreur('');
    setSucces('');
    const f = fournisseurs.find((x) => x.id === idFournisseur);

    try {
      const nouvel = await supprimerCompte(idFournisseur);
      appliquer(nouvel, `L'acces ${f ? f.nom : idFournisseur} est retire, sa cle avec lui.`);
      return true;
    } catch (probleme) {
      setErreur(probleme.message);
      return false;
    }
  }, [fournisseurs, appliquer]);

  const enregistrerLesTaches = useCallback(async (nouvellesTaches) => {
    setErreur('');
    setSucces('');

    try {
      const nouvel = await enregistrerTaches(nouvellesTaches);
      appliquer(nouvel, 'Tes reglages sont enregistres.');
      return true;
    } catch (probleme) {
      setErreur(probleme.message);
      return false;
    }
  }, [appliquer]);

  const toutEffacer = useCallback(async () => {
    setErreur('');
    setSucces('');

    try {
      await supprimerConfig();
      // On relit plutot que de deviner : le backend seul sait ce qui reste.
      const lu = await getEtat();
      setEtat(lu);
      setModelesDynamiques({});
      setSucces('Tout est efface : plus aucune cle API n\'est enregistree sur cette machine.');
      return true;
    } catch (probleme) {
      setErreur(probleme.message);
      return false;
    }
  }, []);

  /**
   * Demande a un fournisseur la liste de ce qu'il a vraiment.
   *
   * `cleApi` sert quand la cle est en cours de saisie et pas encore
   * enregistree : elle part alors dans le CORPS d'un POST, jamais dans l'URL.
   *
   * @returns {Promise<{ok: boolean, message: string}>} jamais de throw : un
   *   listage qui echoue est une information a afficher, pas une panne.
   */
  const chercherModeles = useCallback(async (idFournisseur, { baseURL, cleApi } = {}) => {
    const f = fournisseurs.find((x) => x.id === idFournisseur);

    try {
      const reponse = await getModeles(idFournisseur, { baseURL, cleApi });
      const liste = reponse && reponse.modeles;

      if (!liste || liste.length === 0) {
        return {
          ok: false,
          message: f && f.local
            ? `Aucun modele trouve. Verifie que ${f.nom} est lance et qu'au moins un modele est telecharge.`
            : "Ce fournisseur n'a pas donne sa liste. Celle du catalogue de Mew reste utilisable.",
        };
      }

      setModelesDynamiques((precedent) => ({ ...precedent, [idFournisseur]: liste }));
      return { ok: true, message: `${liste.length} modeles trouves chez ${f ? f.nom : idFournisseur}.` };
    } catch (probleme) {
      return { ok: false, message: probleme.message };
    }
  }, [fournisseurs]);

  const valeur = useMemo(() => ({
    chargement,
    backendTropAncien,
    catalogue,
    fournisseurs,
    outils,
    taches,
    comptes,
    reglagesTaches: etat ? etat.taches : SANS_REGLAGES,
    configure: Boolean(etat && etat.configure),
    // D'ou vient la configuration appliquee. `verrouilleParEnv` a true veut
    // dire que tout ce qui est fait ici restera sans effet : il faut le dire.
    source: (etat && etat.source) || (catalogue && catalogue.source) || null,
    verifieLe: catalogue ? catalogue.verifieLe : null,
    erreur,
    succes,
    setErreur,
    setSucces,
    fournisseurDe,
    compteDe,
    modelesDe,
    enregistrerUnCompte,
    retirerUnCompte,
    enregistrerLesTaches,
    toutEffacer,
    chercherModeles,
  }), [
    chargement, backendTropAncien, catalogue, fournisseurs, outils, taches, comptes, etat,
    erreur, succes, fournisseurDe, compteDe, modelesDe,
    enregistrerUnCompte, retirerUnCompte, enregistrerLesTaches, toutEffacer, chercherModeles,
  ]);

  return (
    <ContexteParametresIa.Provider value={valeur}>
      {children}
    </ContexteParametresIa.Provider>
  );
}
