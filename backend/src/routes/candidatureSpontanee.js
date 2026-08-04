const express = require('express');
const router = express.Router();

const candidatureSpontaneeService = require('../services/candidatureSpontaneeService');
const applicationService = require('../services/applicationService');
const { aiRateLimiter } = require('../middleware/rateLimiter');
const { uploadPdf: upload } = require('../middleware/uploadPdf');

/**
 * Envoyer une candidature spontanee
 * POST /api/candidature-spontanee/envoyer
 */
router.post('/envoyer', aiRateLimiter, upload.single('cv'), async (req, res) => {
  try {
    const { recipientEmail, targetPosition, company, contactName, userId, candidateName, candidateEmail } = req.body;
    const cvFile = req.file;

    if (!cvFile) {
      return res.status(400).json({ success: false, error: 'Fichier CV (PDF) manquant' });
    }
    if (!recipientEmail) {
      return res.status(400).json({ success: false, error: 'Email du recruteur requis' });
    }
    if (!targetPosition) {
      return res.status(400).json({ success: false, error: 'Poste vise requis' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      return res.status(400).json({ success: false, error: 'Format email invalide' });
    }

    const result = await candidatureSpontaneeService.sendSpontaneousApplication({
      cvBuffer: cvFile.buffer,
      recipientEmail,
      targetPosition,
      company: company || '',
      contactName: contactName || '',
      userId: userId || null,
      // Facultatifs mais recommandes : le nom sert a nommer la piece jointe
      // sans avoir a le deviner, et l'email permet au recruteur de repondre.
      candidateName: candidateName || '',
      candidateEmail: candidateEmail || ''
    });

    res.json({ success: true, data: result });

  } catch (error) {
    console.error('[Route CandidatureSpontanee] Erreur:', error.message);

    if (error.status === 429) {
      return res.status(503).json({
        success: false,
        error: 'Service IA temporairement surcharge. Reessayez dans quelques instants.'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Impossible d'envoyer la candidature"
    });
  }
});

/**
 * Generer un email de relance (sans l'envoyer)
 * POST /api/candidature-spontanee/generer-relance
 */
router.post('/generer-relance', aiRateLimiter, async (req, res) => {
  try {
    const { applicationId, userId } = req.body;

    if (!applicationId || !userId) {
      return res.status(400).json({ success: false, error: 'applicationId et userId requis' });
    }

    const app = await applicationService.getById(applicationId, userId);

    if (!app) {
      return res.status(404).json({ success: false, error: 'Candidature introuvable' });
    }

    if (app.candidature_type !== 'spontanee') {
      return res.status(400).json({ success: false, error: "Cette candidature n'est pas une candidature spontanee" });
    }

    const appliedAt = new Date(app.applied_at || app.created_at);
    const daysSince = Math.floor((Date.now() - appliedAt.getTime()) / (1000 * 60 * 60 * 24));

    // Le nom et l'objet sont desormais stockes dans leurs propres colonnes.
    // Avant, on les rextrayait du champ « notes » avec une expression
    // reguliere gourmande : un objet contenant un tiret (« Candidature
    // spontanee - Developpeur Web ») faisait signer la relance
    // « Developpeur Web » au lieu du nom du candidat.
    // Le repli sur « notes » ne sert que pour les candidatures deja enregistrees.
    const candidateName = app.candidate_name
      || app.notes?.match(/^Objet: .+? - (.+)$/m)?.[1]
      || 'Candidat';

    const result = await candidatureSpontaneeService.generateFollowUp({
      originalSubject: app.original_subject
        || app.notes?.match(/^Objet: (.+)$/m)?.[1]
        || `Candidature - ${app.offer_title}`,
      targetPosition: app.offer_title,
      company: app.company || '',
      candidateName,
      daysSince
    });

    res.json({ success: true, data: result });

  } catch (error) {
    console.error('[Route Relance] Erreur:', error.message);

    if (error.status === 429) {
      return res.status(503).json({
        success: false,
        error: 'Service IA temporairement surcharge. Reessayez dans quelques instants.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Impossible de generer la relance'
    });
  }
});

/**
 * Marquer la relance comme envoyee
 * PUT /api/candidature-spontanee/:applicationId/relance-envoyee
 */
router.put('/:applicationId/relance-envoyee', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { userId } = req.body;

    if (!userId) return res.status(400).json({ success: false, error: 'userId requis' });

    const updated = await applicationService.update(applicationId, userId, {
      follow_up_sent: true
    });

    res.json({ success: true, data: updated });

  } catch (error) {
    console.error('[Route Relance] Erreur marquage:', error.message);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
