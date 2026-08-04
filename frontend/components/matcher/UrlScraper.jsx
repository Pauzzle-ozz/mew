'use client';

import { useId, useState } from 'react';
import { scrapeOfferUrl } from '@/lib/api/matcherApi';

/**
 * Lecture automatique d'une offre depuis son URL.
 * Cinq etats : idle, loading, success, partial, error.
 *
 * DEUX CORRECTIONS FAITES ICI
 * 1) Les couleurs etaient ecrites en dur pour un fond sombre (bg-gray-800,
 *    text-white, text-gray-400). En theme clair, le texte blanc se retrouvait
 *    sur le fond creme #FFFBF5 : illisible. Tout passe par les variables du
 *    theme, donc les deux themes sont corrects par construction.
 * 2) Le fichier contenait des sequences « è » ecrites en clair dans du
 *    texte JSX. JSX ne les interprete pas : l'utilisateur lisait vraiment
 *    « succès » a l'ecran. Les textes sont reecrits sans accents, comme
 *    le reste des chaines JSX du projet.
 *
 * @param {Function} onScrapingComplete appele avec les donnees extraites
 */
export default function UrlScraper({ onScrapingComplete }) {
  const [url, setUrl] = useState('');
  const [statut, setStatut] = useState('idle'); // idle | loading | success | partial | error
  const [messageErreur, setMessageErreur] = useState('');

  // useId : plusieurs UrlScraper peuvent coexister dans une page sans que les
  // deux <label htmlFor> pointent vers le meme champ.
  const idChamp = `url-offre-${useId()}`;
  const idAide = `${idChamp}-aide`;

  const analyser = async () => {
    if (!url.trim()) return;

    setStatut('loading');
    setMessageErreur('');

    try {
      const reponse = await scrapeOfferUrl(url.trim());

      // Le parsing basique a-t-il rempli au moins un champ utile ?
      const basique = reponse.data?.basicOffer || {};
      const aDesDonnees = basique.title || basique.company || basique.location;

      setStatut(aDesDonnees ? 'success' : 'partial');
      onScrapingComplete(reponse.data);
    } catch (erreur) {
      setStatut('error');

      if (erreur.code === 'AUTH_REQUIRED') {
        setMessageErreur(erreur.message);
      } else if (erreur.code === 'SCRAPING_FAILED') {
        setMessageErreur('Impossible de lire cette page. Utilise la saisie manuelle.');
      } else {
        setMessageErreur(erreur.message || 'Une erreur est survenue pendant l\'analyse.');
      }
    }
  };

  const surTouche = (evenement) => {
    if (evenement.key === 'Enter') {
      evenement.preventDefault();
      analyser();
    }
  };

  const reinitialiser = () => {
    setUrl('');
    setStatut('idle');
    setMessageErreur('');
  };

  const enCours = statut === 'loading';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-4xl" aria-hidden="true">
          🔗
        </span>
        <div>
          <h2 className="font-display text-2xl font-bold text-text-primary">Coller un lien</h2>
          <p className="text-sm text-text-secondary">
            Colle l&apos;URL d&apos;une offre d&apos;emploi : les champs se remplissent tout seuls.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor={idChamp} className="mb-2 block text-sm font-medium text-text-secondary">
          Adresse de l&apos;offre
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id={idChamp}
            type="url"
            value={url}
            onChange={(evenement) => setUrl(evenement.target.value)}
            onKeyDown={surTouche}
            placeholder="https://www.welcometothejungle.com/fr/companies/..."
            disabled={enCours}
            aria-describedby={idAide}
            className="flex-1 rounded-lg border border-border bg-surface px-4 py-3 text-text-primary placeholder-text-muted transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
          <button
            type="button"
            onClick={analyser}
            disabled={enCours || !url.trim()}
            className="cursor-pointer whitespace-nowrap rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted"
          >
            {enCours ? 'Analyse...' : 'Analyser l\'offre'}
          </button>
        </div>
      </div>

      {/* role="status" + aria-live : le resultat du scraping arrive plusieurs
          secondes apres le clic. Sans annonce, une personne qui n'a pas les
          yeux sur l'ecran ne sait jamais que l'analyse est terminee. */}
      <div role="status" aria-live="polite">
        {enCours && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-elevated p-4">
            <div
              className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium text-text-primary">Analyse de l&apos;offre en cours...</p>
              <p className="mt-1 text-xs text-text-muted">Cela prend une dizaine de secondes.</p>
            </div>
          </div>
        )}

        {statut === 'success' && (
          <EtatScraping
            ton="success"
            emoji="✅"
            titre="Offre extraite avec succes !"
            aide="Verifie les informations ci-dessous et complete si besoin."
            libelleAction="Nouvelle URL"
            onAction={reinitialiser}
          />
        )}

        {statut === 'partial' && (
          <EtatScraping
            ton="warning"
            emoji="⚠️"
            titre="Extraction partielle"
            aide="Certains champs n'ont pas pu etre extraits. Complete-les a la main."
            libelleAction="Nouvelle URL"
            onAction={reinitialiser}
          />
        )}

        {statut === 'error' && (
          <EtatScraping
            ton="error"
            emoji="❌"
            titre={messageErreur}
            aide="Passe par l'onglet Formulaire pour remplir les champs toi-meme."
            libelleAction="Reessayer"
            onAction={reinitialiser}
          />
        )}
      </div>

      <div id={idAide} className="text-xs text-text-muted">
        <p>
          Sites lisibles : Indeed, Welcome to the Jungle, HelloWork, Apec, France Travail et la plupart des sites
          d&apos;offres d&apos;emploi.
        </p>
        <p className="mt-1">LinkedIn et Glassdoor ne le sont pas : ils exigent une authentification.</p>
      </div>
    </div>
  );
}

/**
 * Les quatre etats de fin partageaient la meme structure a trois mots pres.
 * Un seul composant, un seul endroit ou corriger un probleme de contraste.
 */
function EtatScraping({ ton, emoji, titre, aide, libelleAction, onAction }) {
  const tons = {
    success: 'border-success/25 bg-success/8 text-success',
    warning: 'border-warning/25 bg-warning/8 text-warning',
    error: 'border-error/25 bg-error/8 text-error',
  };

  return (
    <div className={`flex items-center gap-3 rounded-lg border p-4 ${tons[ton]}`}>
      <span className="text-xl" aria-hidden="true">
        {emoji}
      </span>
      <div className="flex-1">
        <p className="font-medium">{titre}</p>
        <p className="mt-1 text-xs text-text-muted">{aide}</p>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="cursor-pointer text-sm text-text-muted transition-colors hover:text-text-primary"
      >
        {libelleAction}
      </button>
    </div>
  );
}
