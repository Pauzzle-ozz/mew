const express = require('express');
const pdf = require('pdf-parse');
const router = express.Router();

// Import des services
const cvService = require('../services/cvService');
const { uploadPdf: upload } = require('../middleware/uploadPdf');

// ========================================
// ROUTES ANALYSEUR CV
// ========================================

/**
 * Analyser un CV avec formulaire structuré
 */
router.post('/analyse-cv', async (req, res) => {
  try {
    const cvData = req.body;

    // Validation
    if (!cvData.prenom || !cvData.nom || !cvData.type_poste) {
      return res.status(400).json({
        error: 'Prénom, nom et type de poste sont obligatoires'
      });
    }

    // Appel au service
    const result = await cvService.analyzeCV(cvData);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Erreur analyse CV:', error.message);

    if (error.status === 429) {
      return res.status(503).json({
        success: false,
        error: 'Service IA temporairement surchargé. Réessayez dans quelques instants.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Une erreur est survenue lors de l\'analyse'
    });
  }
});

/**
 * Analyser un CV PDF complet (extraction + analyse IA)
 */
router.post('/analyse-cv-pdf-complete', upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Aucun fichier PDF fourni'
      });
    }

    const { userId } = req.body;
    const pdfData = await pdf(req.file.buffer);

    // Appel au service
    const result = await cvService.analyzePDF(pdfData.text, pdfData.numpages, userId);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Erreur analyse PDF complète:', error.message);

    if (error.status === 429) {
      return res.status(503).json({
        success: false,
        error: 'Service IA temporairement surchargé. Réessayez dans quelques instants.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Impossible d\'analyser le CV'
    });
  }
});

// ========================================
// ROUTES OPTIMISEUR CV
// ========================================

/**
 * Optimiser un CV via upload PDF
 */
router.post('/optimiser-cv-pdf', upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Aucun fichier PDF fourni'
      });
    }

    const { userId, posteCible } = req.body;

    console.log('📄 [OPTIMISEUR-PDF] Début optimisation PDF...');

    // Extraction du texte du PDF
    const pdfData = await pdf(req.file.buffer);

    console.log('📝 [OPTIMISEUR-PDF] Texte extrait, longueur:', pdfData.text.length);

    // Appel au service
    const result = await cvService.optimizeCVPdf(pdfData.text, pdfData.numpages, userId, posteCible);

    console.log('✅ [OPTIMISEUR-PDF] CV optimisé avec succès');

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ [OPTIMISEUR-PDF] Erreur:', error.message);

    if (error.status === 429) {
      return res.status(503).json({
        success: false,
        error: 'Service IA temporairement surchargé. Réessayez dans quelques instants.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Impossible d\'optimiser le CV PDF',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
});

module.exports = router;
