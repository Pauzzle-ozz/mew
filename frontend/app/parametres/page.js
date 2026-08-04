'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import Header from '@/components/shared/Header';
import LoadingScreen from '@/components/shared/LoadingScreen';
import Alert from '@/components/shared/Alert';
import Button from '@/components/shared/Button';
import ChoixFournisseur from '@/components/parametres/ChoixFournisseur';
import ChampAdresse from '@/components/parametres/ChampAdresse';
import ChampCle from '@/components/parametres/ChampCle';
import ChoixModeles from '@/components/parametres/ChoixModeles';
import ResultatTest from '@/components/parametres/ResultatTest';
import {
  getFournisseurs,
  getConfig,
  getModeles,
  enregistrerConfig,
  supprimerConfig,
  testerConnexion,
} from '@/lib/api/iaApi';

/**
 * ECRAN PARAMETRES — le choix du modele.
 *
 * CE QUE CET ECRAN CHANGE
 * Avant, le fournisseur d'IA se decidait dans un fichier .env, donc par la
 * personne qui lance le serveur. Ici, c'est l'utilisateur qui choisit : son
 * fournisseur, ses modeles, sa cle. Un modele qui tourne sur son ordinateur,
 * un service en ligne, ou n'importe quelle adresse compatible OpenAI.
 *
 * LE PARCOURS, EN CINQ TEMPS
 *   1. chez qui       — cartes groupees, le local en premier
 *   2. la cle         — jamais reaffichee en clair, lien vers la page ou on la cree
 *   3. les modeles    — un par role, avec tarif et fenetre
 *   4. le test        — AVANT d'enregistrer, avec le detail de ce qui s'est passe
 *   5. l'enregistrement
 *
 * POURQUOI L'ETAT VIT ICI ET PAS DANS LES COMPOSANTS
 * Les cinq etapes se repondent : changer de fournisseur invalide la cle, les
 * modeles et le resultat du test. Un etat eclate dans cinq composants aurait
 * laisse trainer un test reussi sous une configuration qui n'existe plus —
 * exactement le genre de mensonge qu'on veut eviter sur cet ecran.
 */
export default function ParametresPage() {
  const { user, loading, logout } = useAuth();

  // --- chargement initial ---------------------------------------------------
  const [chargement, setChargement] = useState(true);
  const [catalogue, setCatalogue] = useState(null);
  const [backendTropAncien, setBackendTropAncien] = useState(false);

  // --- la configuration en cours d'edition ---------------------------------
  const [idFournisseur, setIdFournisseur] = useState('');
  const [baseURL, setBaseURL] = useState('');
  // null = « garde la cle deja enregistree ». Voir ChampCle.jsx.
  const [cle, setCle] = useState(null);
  const [cleVisible, setCleVisible] = useState(false);
  const [cleMasquee, setCleMasquee] = useState(null);
  const [modeles, setModeles] = useState({ redaction: '', extraction: '' });

  // Ce que le backend a repondu au chargement : sert a savoir si la cle
  // enregistree appartient bien au fournisseur actuellement selectionne.
  const [configEnregistree, setConfigEnregistree] = useState(null);

  // --- le listage en direct des modeles ------------------------------------
  const [modelesDynamiques, setModelesDynamiques] = useState(null);
  const [listageEnCours, setListageEnCours] = useState(false);
  const [listageErreur, setListageErreur] = useState('');

  // --- actions --------------------------------------------------------------
  const [test, setTest] = useState(null);
  const [testEnCours, setTestEnCours] = useState(false);
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false);
  const [confirmationEffacement, setConfirmationEffacement] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  // useMemo et pas un simple ternaire : sans lui, le `[]` du cas « pas encore
  // charge » serait un tableau NEUF a chaque rendu, ce qui reveillerait tous
  // les useMemo/useCallback qui en dependent a chaque frappe au clavier.
  const fournisseurs = useMemo(() => (catalogue ? catalogue.fournisseurs : []), [catalogue]);
  const fournisseur = useMemo(
    () => fournisseurs.find((f) => f.id === idFournisseur) || null,
    [fournisseurs, idFournisseur]
  );

  /**
   * La liste proposee dans les deux menus.
   * Le catalogue passe en premier : lui seul porte les tarifs et les roles.
   * Le listage en direct complete avec ce que le fournisseur declare vraiment
   * avoir — c'est ce qui rend Ollama et OpenRouter utilisables.
   */
  const modelesDisponibles = useMemo(() => {
    const statiques = fournisseur ? fournisseur.modeles : [];
    if (!modelesDynamiques) return statiques;

    const connus = new Set(statiques.map((m) => m.id));
    return [...statiques, ...modelesDynamiques.filter((m) => !connus.has(m.id))];
  }, [fournisseur, modelesDynamiques]);

  // -------------------------------------------------------------------------
  // Chargement initial
  // -------------------------------------------------------------------------
  useEffect(() => {
    let monte = true;

    (async () => {
      try {
        const cat = await getFournisseurs();
        if (!monte) return;

        // getFournisseurs renvoie null quand la route n'existe pas : ce n'est
        // pas une panne, c'est un backend qui n'a pas encore cet ecran.
        if (!cat) {
          setBackendTropAncien(true);
          return;
        }
        setCatalogue(cat);

        const config = await getConfig();
        if (!monte || !config) return;

        setConfigEnregistree(config);

        const connu = cat.fournisseurs.find((f) => f.id === config.fournisseur);
        if (!connu) {
          // Un fournisseur enregistre puis retire du catalogue laisserait la
          // page muette, avec un formulaire vierge et aucune explication.
          if (config.fournisseur) {
            setErreur(
              `Le fournisseur enregistre (« ${config.fournisseur} ») n'existe plus dans le `
              + 'catalogue de cette version de Mew. Choisis-en un ci-dessous.'
            );
          }
          return;
        }

        setIdFournisseur(connu.id);
        setBaseURL(config.baseURL || connu.baseURL || '');
        setCleMasquee(config.cleMasquee);
        setCle(config.cleEnregistree ? null : '');
        setModeles({
          redaction: config.modeleRedaction || '',
          extraction: config.modeleExtraction || '',
        });
      } catch (probleme) {
        if (monte) setErreur(probleme.message);
      } finally {
        if (monte) setChargement(false);
      }
    })();

    return () => { monte = false; };
  }, []);

  // -------------------------------------------------------------------------
  // Changer de fournisseur remet tout le reste a zero
  // -------------------------------------------------------------------------
  const choisirFournisseur = useCallback((id) => {
    const nouveau = fournisseurs.find((f) => f.id === id);
    if (!nouveau) return;

    setIdFournisseur(id);
    setBaseURL(nouveau.baseURL || '');
    setModelesDynamiques(null);
    setListageErreur('');
    // Un test reussi chez OpenAI ne dit rien de Mistral : le garder a l'ecran
    // laisserait croire que la nouvelle configuration est validee.
    setTest(null);
    setSucces('');
    setErreur('');

    // La cle enregistree appartient a UN fournisseur. Si on en change, elle
    // n'a plus cours : on repart sur une saisie vierge.
    const memeQuAvant = configEnregistree && configEnregistree.fournisseur === id;
    setCleMasquee(memeQuAvant ? configEnregistree.cleMasquee : null);
    setCle(memeQuAvant && configEnregistree.cleEnregistree ? null : '');
    setCleVisible(false);

    setModeles({
      redaction: memeQuAvant && configEnregistree.modeleRedaction
        ? configEnregistree.modeleRedaction
        : modeleParDefaut(nouveau.modeles, 'redaction'),
      extraction: memeQuAvant && configEnregistree.modeleExtraction
        ? configEnregistree.modeleExtraction
        : modeleParDefaut(nouveau.modeles, 'extraction'),
    });
  }, [fournisseurs, configEnregistree]);

  const changerModele = useCallback((role, valeur) => {
    setModeles((precedent) => ({ ...precedent, [role]: valeur }));
    setTest(null);
  }, []);

  // -------------------------------------------------------------------------
  // Lister les modeles en direct
  // -------------------------------------------------------------------------
  const rechargerModeles = useCallback(async () => {
    if (!fournisseur) return;

    setListageEnCours(true);
    setListageErreur('');

    try {
      // La cle en cours de saisie est transmise : elle part alors dans le
      // CORPS d'un POST, jamais dans l'URL. C'est ce qui permet de coller sa
      // cle et de voir aussitot les modeles, sans rien avoir enregistre.
      const reponse = await getModeles(fournisseur.id, {
        baseURL: baseURL || null,
        cleApi: cle || null,
      });
      const liste = reponse && reponse.modeles;

      if (!liste || liste.length === 0) {
        setListageErreur(
          fournisseur.local
            ? `Aucun modele trouve. Verifie que ${fournisseur.nom} est lance et qu'au moins un modele est telecharge.`
            : "Ce fournisseur n'a pas donne sa liste. La liste ci-dessus vient du catalogue de Mew, elle reste utilisable."
        );
        return;
      }

      setModelesDynamiques(liste);

      // Ne rien pre-remplir laisserait deux menus vides juste apres une
      // recherche reussie : on choisit pour l'utilisateur, il peut changer.
      setModeles((precedent) => ({
        redaction: precedent.redaction || liste[0].id,
        extraction: precedent.extraction || liste[0].id,
      }));
    } catch (probleme) {
      setListageErreur(probleme.message);
    } finally {
      setListageEnCours(false);
    }
  }, [fournisseur, baseURL, cle]);

  // -------------------------------------------------------------------------
  // Verifications communes au test et a l'enregistrement
  // -------------------------------------------------------------------------
  const manque = useMemo(() => {
    if (!fournisseur) return 'Choisis d\'abord un fournisseur.';
    if (!fournisseur.baseURL && !baseURL.trim()) return "Saisis l'adresse de l'API.";
    if (fournisseur.cleRequise && !cleMasquee && !(cle || '').trim()) {
      return 'Ce fournisseur demande une cle API.';
    }
    if (!modeles.redaction.trim() && !modeles.extraction.trim()) {
      return 'Choisis au moins un modele.';
    }
    return null;
  }, [fournisseur, baseURL, cle, cleMasquee, modeles]);

  /** La configuration telle qu'elle sera envoyee au backend. */
  const construireConfig = useCallback(() => {
    // Si un seul des deux roles est renseigne, il sert pour les deux : mieux
    // vaut un modele un peu cher pour l'extraction qu'un role sans modele.
    const redaction = modeles.redaction.trim() || modeles.extraction.trim();
    const extraction = modeles.extraction.trim() || modeles.redaction.trim();

    return {
      fournisseur: idFournisseur,
      baseURL: baseURL.trim() || null,
      cleApi: (cle || '').trim() || null,
      modeleRedaction: redaction || null,
      modeleExtraction: extraction || null,
    };
  }, [idFournisseur, baseURL, cle, modeles]);

  // -------------------------------------------------------------------------
  // Tester
  // -------------------------------------------------------------------------
  const lancerTest = useCallback(async () => {
    if (manque) {
      setErreur(manque);
      return;
    }

    setErreur('');
    setSucces('');
    setTestEnCours(true);
    setTest(null);

    const config = construireConfig();
    // On teste le modele de redaction : c'est lui qui porte le format a
    // respecter, donc le seul dont l'echec serait vraiment genant.
    const resultat = await testerConnexion({
      fournisseur: config.fournisseur,
      baseURL: config.baseURL,
      cleApi: config.cleApi,
      modele: config.modeleRedaction,
      role: 'redaction',
    });

    setTest(resultat);
    setTestEnCours(false);
  }, [manque, construireConfig]);

  // -------------------------------------------------------------------------
  // Enregistrer
  // -------------------------------------------------------------------------
  const enregistrer = useCallback(async () => {
    if (manque) {
      setErreur(manque);
      return;
    }

    setErreur('');
    setSucces('');
    setEnregistrementEnCours(true);

    try {
      const { avertissements } = await enregistrerConfig(construireConfig());

      // On relit plutot que de deviner : c'est le backend qui decide de
      // l'apercu masque de la cle, et lui seul sait ce qui est reellement
      // enregistre.
      const config = await getConfig();
      if (config) {
        setConfigEnregistree(config);
        setCleMasquee(config.cleMasquee);
      }
      setCle(null);
      setCleVisible(false);

      // Le backend accepte les configurations imparfaites en le signalant
      // (modele absent du catalogue, prefixe de cle inhabituel). Les taire
      // reviendrait a laisser croire que tout est parfait.
      setSucces(
        'Configuration enregistree. Les outils de Mew utilisent desormais ce modele.'
        + (avertissements.length > 0 ? ` ${avertissements.join(' ')}` : '')
      );
    } catch (probleme) {
      setErreur(probleme.message);
    } finally {
      setEnregistrementEnCours(false);
    }
  }, [manque, construireConfig]);

  // -------------------------------------------------------------------------
  // Effacer
  // -------------------------------------------------------------------------
  const effacer = useCallback(async () => {
    setErreur('');
    setSucces('');

    try {
      await supprimerConfig();
      setConfigEnregistree(null);
      setCleMasquee(null);
      setCle('');
      setTest(null);
      setConfirmationEffacement(false);
      setSucces('Configuration effacee. Ta cle a ete supprimee du backend.');
    } catch (probleme) {
      setErreur(probleme.message);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------
  if (loading || chargement) return <LoadingScreen message="Ouverture des parametres..." />;

  // L'etape « adresse » n'existe que pour les fournisseurs locaux (changement
  // de port) et pour l'adresse personnalisee. Quand elle est absente, tout ce
  // qui suit avance d'un cran.
  const adresseModifiable = Boolean(fournisseur && (fournisseur.local || !fournisseur.baseURL));
  const numeroEtape = (rang) => (adresseModifiable ? rang + 1 : rang);

  return (
    <div className="min-h-screen bg-background">
      <Header
        user={user}
        onLogout={logout}
        breadcrumbs={[{ label: 'Tableau de bord', href: '/dashboard' }, { label: 'Parametres' }]}
      />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 animate-fade-in">
          <h1 className="font-display mb-2 text-3xl font-bold text-text-primary">
            Ton modele, ton choix
          </h1>
          <p className="max-w-2xl leading-relaxed text-text-secondary">
            Mew n&apos;impose aucun fournisseur. Choisis celui que tu veux — un modele qui tourne
            sur ta machine, un service en ligne, ou n&apos;importe quelle autre adresse — et
            apporte ta propre cle. Elle est enregistree par le backend, sur cette machine, et ne
            repart jamais vers le navigateur.
          </p>
        </div>

        {backendTropAncien ? (
          <Alert variant="warning">
            Ce backend Mew ne connait pas encore l&apos;ecran Parametres (route /api/ia absente).
            Mets a jour le dossier backend/ puis relance-le avec{' '}
            <code className="font-mono">cd backend &amp;&amp; npm run dev</code>.
          </Alert>
        ) : (
          <div className="space-y-6">
            {/* Quand backend/.env impose une cle, elle gagne sur tout ce qui
                est choisi ici. Le taire serait le pire scenario : la personne
                changerait de modele, lirait « enregistre », et rien ne
                bougerait. */}
            {catalogue && catalogue.etat && catalogue.etat.verrouilleParEnv && (
              <Alert variant="warning">
                {catalogue.etat.note
                  || "Le moteur d'IA est impose par le fichier backend/.env de cette installation. "
                  + "Retire OPENAI_API_KEY de ce fichier puis relance le serveur pour choisir toi-meme."}
              </Alert>
            )}

            {erreur && <Alert variant="error" onClose={() => setErreur('')}>{erreur}</Alert>}
            {succes && <Alert variant="success" onClose={() => setSucces('')}>{succes}</Alert>}

            <Etape numero={1} titre="Chez qui tourne le modele ?">
              <ChoixFournisseur
                fournisseurs={fournisseurs}
                valeur={idFournisseur}
                onChange={choisirFournisseur}
              />
              {!idFournisseur && (
                <p className="mt-4 text-sm text-text-muted">
                  Tu hesites ? <strong className="text-text-secondary">Ollama</strong> ne coute rien
                  et garde ton CV sur ton ordinateur. Pour la meilleure qualite de redaction, prends
                  un fournisseur en ligne.
                </p>
              )}
            </Etape>

            {fournisseur && (
              <>
                {/* L'adresse n'est demandee que quand elle ne peut pas etre
                    devinee. Les etapes suivantes se renumerotent donc toutes
                    seules plutot que d'afficher un trou dans la suite. */}
                {adresseModifiable && (
                  <Etape numero={2} titre="L'adresse de l'API">
                    <ChampAdresse fournisseur={fournisseur} valeur={baseURL} onChange={setBaseURL} />
                  </Etape>
                )}

                <Etape
                  numero={numeroEtape(2)}
                  titre={fournisseur.cleRequise ? 'Ta cle API' : 'Une cle ? Pas forcement'}
                >
                  <ChampCle
                    fournisseur={fournisseur}
                    cleMasquee={cleMasquee}
                    valeur={cle}
                    onChange={setCle}
                    visible={cleVisible}
                    onBasculerVisibilite={() => setCleVisible((v) => !v)}
                  />
                </Etape>

                <Etape numero={numeroEtape(3)} titre="Quel modele pour quoi ?">
                  <ChoixModeles
                    modeles={modelesDisponibles}
                    valeurs={modeles}
                    onChange={changerModele}
                    listageDisponible={fournisseur.listageDynamique}
                    listageEnCours={listageEnCours}
                    listageErreur={listageErreur}
                    onRecharger={rechargerModeles}
                    origineListe={modelesDynamiques ? 'direct' : 'catalogue'}
                  />
                </Etape>

                <Etape numero={numeroEtape(4)} titre="Essayer avant d'enregistrer">
                  <p className="mb-4 text-sm text-text-secondary">
                    Mew envoie une consigne courte au modele et regarde ce qui revient : la
                    connexion, la cle, le modele, et surtout si la reponse respecte le format
                    attendu. Rien n&apos;est enregistre a ce stade.
                  </p>

                  <div className="mb-4 flex flex-wrap gap-3">
                    <Button variant="outline" onClick={lancerTest} loading={testEnCours}>
                      Tester la connexion
                    </Button>
                  </div>

                  <ResultatTest resultat={test} enCours={testEnCours} />
                </Etape>

                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-surface p-6">
                  <Button onClick={enregistrer} loading={enregistrementEnCours}>
                    Enregistrer
                  </Button>

                  {manque && <span className="text-sm text-text-muted">{manque}</span>}

                  {configEnregistree && (
                    <div className="ml-auto flex items-center gap-2">
                      {confirmationEffacement ? (
                        <>
                          <span className="text-sm text-text-secondary">Effacer la cle aussi ?</span>
                          <Button variant="danger" size="sm" onClick={effacer}>
                            Oui, tout effacer
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmationEffacement(false)}
                          >
                            Annuler
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmationEffacement(true)}
                        >
                          Effacer la configuration
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {catalogue && catalogue.verifieLe && (
              <p className="text-center text-xs text-text-muted">
                Tarifs du catalogue verifies le {catalogue.verifieLe}. Ils vieillissent vite : seul
                le fournisseur fait foi.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/** Une etape du parcours, dans son encadre numerote. */
function Etape({ numero, titre, children }) {
  return (
    <section className="animate-fade-in rounded-2xl border border-border/60 bg-surface p-6">
      <h2 className="font-display mb-5 flex items-center gap-3 text-lg font-bold text-text-primary">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-light text-sm text-primary"
        >
          {numero}
        </span>
        {titre}
      </h2>
      {children}
    </section>
  );
}

/**
 * La proposition de depart, pour ne pas laisser deux menus vides.
 *
 *   redaction  : le PREMIER modele du role dans le catalogue. Les entrees y
 *                sont rangees du meilleur au plus economique, donc le premier
 *                est le bon defaut pour « prends le meilleur ».
 *   extraction : le MOINS CHER du role, puisque personne ne lira ce texte.
 */
function modeleParDefaut(liste, role) {
  const candidats = liste.filter((m) => m.roles.includes(role));
  if (candidats.length === 0) return '';

  if (role === 'redaction') return candidats[0].id;

  const moinsCher = candidats.reduce(
    (meilleur, actuel) => ((actuel.entree ?? Infinity) < (meilleur.entree ?? Infinity) ? actuel : meilleur),
    candidats[0]
  );
  return moinsCher.id;
}
