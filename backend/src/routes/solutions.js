const express = require('express');
const pdf = require('pdf-parse');
const router = express.Router();

// Import des services
const cvService = require('../services/cvService');
const { uploadPdf: upload } = require('../middleware/uploadPdf');
// Traduit les pannes du moteur d'IA (cle refusee, quota, surcharge, moteur
// local eteint) en messages francais actionnables plutot qu'en « Erreur serveur ».
const { repondreErreurIa } = require('./erreursIa');

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

    if (repondreErreurIa(res, error)) return;

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

    const pdfData = await pdf(req.file.buffer);

    // Le userId envoye par le client n'est PLUS transmis : l'analyse
    // n'enregistre rien, et un identifiant venu du navigateur ne prouve pas
    // qui parle. C'est /api/historique, authentifie, qui sauvegarde.
    const result = await cvService.analyzePDF(pdfData.text, pdfData.numpages, null);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Erreur analyse PDF complète:', error.message);

    if (repondreErreurIa(res, error)) return;

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

    // Meme raison qu'au-dessus : on ne recupere que le poste vise, pas
    // l'identifiant. L'optimisation n'ecrit rien dans le stockage.
    const { posteCible } = req.body;

    console.log('📄 [OPTIMISEUR-PDF] Début optimisation PDF...');

    // Extraction du texte du PDF
    const pdfData = await pdf(req.file.buffer);

    console.log('📝 [OPTIMISEUR-PDF] Texte extrait, longueur:', pdfData.text.length);

    // Appel au service
    const result = await cvService.optimizeCVPdf(pdfData.text, pdfData.numpages, null, posteCible);

    console.log('✅ [OPTIMISEUR-PDF] CV optimisé avec succès');

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ [OPTIMISEUR-PDF] Erreur:', error.message);

    if (repondreErreurIa(res, error)) return;

    res.status(500).json({
      success: false,
      error: 'Impossible d\'optimiser le CV PDF',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
});

module.exports = router;
