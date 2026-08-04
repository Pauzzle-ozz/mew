import { useState } from 'react';
import { cvApi } from '@/lib/api/cvApi';

/**
 * Hook personnalisé pour l'analyse de CV
 * Gère l'état et la logique d'analyse (formulaire + PDF)
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
   * Réinitialiser les résultats
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
    analyzeWithForm,
    analyzeWithPDF,
    reset
  };
}
