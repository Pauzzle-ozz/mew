'use client';

import { useState } from 'react';
import { scrapeOfferUrl } from '@/lib/api/matcherApi';

/**
 * Composant de scraping d'URL d'offre d'emploi
 * 5 états : idle, loading, success, partial, error
 *
 * @param {Function} onScrapingComplete - Callback avec les données extraites
 */
export default function UrlScraper({ onScrapingComplete }) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | partial | error
  const [errorMessage, setErrorMessage] = useState('');

  const handleScrape = async () => {
    if (!url.trim()) return;

    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await scrapeOfferUrl(url.trim());

      // Vérifier si le parsing basique a trouvé des champs
      const basic = response.data?.basicOffer || {};
      const hasBasicData = basic.title || basic.company || basic.location;

      setStatus(hasBasicData ? 'success' : 'partial');

      // Envoyer rawText + basicOffer au parent
      onScrapingComplete(response.data);

    } catch (error) {
      setStatus('error');

      if (error.code === 'AUTH_REQUIRED') {
        setErrorMessage(error.message);
      } else if (error.code === 'SCRAPING_FAILED') {
        setErrorMessage('Impossible de lire cette page. Utilisez la saisie manuelle.');
      } else {
        setErrorMessage(error.message || 'Une erreur est survenue lors de l\'analyse.');
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleScrape();
    }
  };

  const handleReset = () => {
    setUrl('');
    setStatus('idle');
    setErrorMessage('');
  };

  return (
    <div className="space-y-6">
      {/* En-t\u00eate */}
      <div className="flex items-center gap-3">
        <div className="text-4xl">🔗</div>
        <div>
          <h2 className="text-2xl font-bold text-white">Coller un lien</h2>
          <p className="text-gray-400 text-sm">
            Collez l'URL d'une offre d'emploi et les champs se rempliront automatiquement
          </p>
        </div>
      </div>

      {/* Input URL + Bouton */}
      <div className="flex gap-3">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="https://www.welcometothejungle.com/fr/companies/..."
          disabled={status === 'loading'}
          className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-colors disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleScrape}
          disabled={status === 'loading' || !url.trim()}
          className="px-6 py-3 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          {status === 'loading' ? 'Analyse...' : 'Analyser l\'offre'}
        </button>
      </div>

      {/* \u00c9tat : Loading */}
      {status === 'loading' && (
        <div className="flex items-center gap-3 p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-pink-500" />
          <div>
            <p className="text-white font-medium">Analyse de l'offre en cours...</p>
            <p className="text-xs text-gray-400 mt-1">Cela peut prendre environ 10 secondes</p>
          </div>
        </div>
      )}

      {/* \u00c9tat : Success */}
      {status === 'success' && (
        <div className="flex items-center gap-3 p-4 bg-green-900/20 border border-green-600/30 rounded-lg">
          <span className="text-xl">✅</span>
          <div className="flex-1">
            <p className="text-green-400 font-medium">Offre extraite avec succ\u00e8s !</p>
            <p className="text-xs text-gray-400 mt-1">V\u00e9rifiez les informations ci-dessous et compl\u00e9tez si besoin</p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Nouvelle URL
          </button>
        </div>
      )}

      {/* \u00c9tat : Partial */}
      {status === 'partial' && (
        <div className="flex items-center gap-3 p-4 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
          <span className="text-xl">⚠️</span>
          <div className="flex-1">
            <p className="text-yellow-400 font-medium">Extraction partielle</p>
            <p className="text-xs text-gray-400 mt-1">Certains champs n'ont pas pu \u00eatre extraits. Compl\u00e9tez les champs manquants manuellement.</p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Nouvelle URL
          </button>
        </div>
      )}

      {/* \u00c9tat : Error */}
      {status === 'error' && (
        <div className="flex items-center gap-3 p-4 bg-red-900/20 border border-red-600/30 rounded-lg">
          <span className="text-xl">❌</span>
          <div className="flex-1">
            <p className="text-red-400 font-medium">{errorMessage}</p>
            <p className="text-xs text-gray-400 mt-1">Utilisez l'onglet "Saisie manuelle" pour remplir les champs vous-m\u00eame.</p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            R\u00e9essayer
          </button>
        </div>
      )}

      {/* Sites support\u00e9s */}
      <div className="text-xs text-gray-500">
        <p>Sites support\u00e9s : Indeed, Welcome to the Jungle, HelloWork, Apec, P\u00f4le Emploi et la plupart des sites d'offres d'emploi.</p>
        <p className="mt-1">LinkedIn et Glassdoor ne sont pas support\u00e9s (authentification requise).</p>
      </div>
    </div>
  );
}
