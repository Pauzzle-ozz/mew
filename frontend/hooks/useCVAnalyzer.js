import { useState } from 'react';
import { cvApi } from '@/lib/api/cvApi';

/**
 * Hook d'analyse de CV : etat + appels au backend (formulaire ou PDF).
 *
 * Il expose a la fois `setResult` et `reset` :
 *   - `setResult` sert a INJECTER un resultat venu d'ailleurs, typiquement une
 *     analyse archivee que l'utilisateur rejoue depuis l'historique ;
 *   - `reset` sert a repartir de zero (bouton « Nouvelle analyse »). Il efface
 *     aussi l'erreur, ce qu'un simple `setResult(null)` ne faisait pas : un
 *     message d'echec restait affiche au-dessus d'un formulaire vierge.
 */
export function useCVAnalyzer() {
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  /**
   * Analyser un CV via formulaire structuré
   */
  const analyzeWithForm = async (formData, userId) => {
    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const response = await cvApi.analyzeCV({
        userId,
        ...formData
      });

      if (response.success) {
        setResult(response.data);
        return response.data;
      } else {
        throw new Error(response.error || 'Erreur lors de l\'analyse');
      }
    } catch (err) {
      console.error('[useCVAnalyzer] Erreur:', err);
      setError(err.message || 'Impossible de contacter le serveur');
      throw err;
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Analyser un CV via upload PDF
   */
  const analyzeWithPDF = async (file, userId) => {
    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const response = await cvApi.analyzePDF(file, userId);

      if (response.success) {
        setResult(response.data);
        return response.data;
      } else {
        throw new Error(response.error || 'Erreur lors de l\'analyse du PDF');
      }
    } catch (err) {
      console.error('[useCVAnalyzer] Erreur PDF:', err);
      setError(err.message || 'Erreur lors de l\'analyse du CV');
      throw err;
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Tout remettre a zero : resultat, erreur et indicateur de traitement.
   */
  const reset = () => {
    setResult(null);
    setError(null);
    setProcessing(false);
  };

  return {
    processing,
    result,
    setResult,
    error,
    setError,
    analyzeWithForm,
    analyzeWithPDF,
    reset
  };
}
