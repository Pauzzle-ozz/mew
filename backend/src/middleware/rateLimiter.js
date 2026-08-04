const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * Limiteur de requetes pour les routes qui appellent un modele d'IA.
 *
 * Ce n'est PAS une limite imposee par OpenAI : c'est un garde-fou local.
 * En usage personnel, c'est l'utilisateur qui paie sa propre cle et qui
 * decide de sa consommation — d'ou une limite large par defaut (200 par
 * quart d'heure), et la possibilite de la retirer completement avec
 * AI_RATE_LIMIT_MAX=0 dans backend/.env.
 *
 * L'ancienne valeur (20) suffisait a bloquer un simple mode Decouverte.
 */
const limite = config.ia.limiteRequetes;

const aiRateLimiter = limite === 0
  ? (req, res, next) => next()
  : rateLimit({
    windowMs: 15 * 60 * 1000,
    max: limite,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: `Limite locale de ${limite} requetes IA par quart d'heure atteinte. `
        + 'Ce n\'est pas une limite d\'OpenAI : tu peux l\'ajuster avec '
        + 'AI_RATE_LIMIT_MAX dans backend/.env (0 pour la desactiver).'
    }
  });

module.exports = { aiRateLimiter };
