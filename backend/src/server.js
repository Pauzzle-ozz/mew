const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');

// Chargement des variables d'environnement.
// Le chemin est calcule depuis CE fichier, pas depuis le dossier de
// lancement : `node backend/src/server.js` depuis la racine du projet
// fonctionne desormais aussi bien que `npm run dev` depuis backend/.
// Pas de `override` : une variable passee dans le terminal
// (PORT=5001 npm run dev) doit pouvoir gagner sur le fichier .env.
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config = require('./config');
const { creer } = require('./lib/logger');
const { aiRateLimiter } = require('./middleware/rateLimiter');
const { auth } = require('./middleware/auth');
const solutionsRoutes = require('./routes/solutions');
const matcherRoutes = require('./routes/matcher');
const applicationsRoutes = require('./routes/applications');
const candidatureSpontaneeRoutes = require('./routes/candidatureSpontanee');
const historyRoutes = require('./routes/history');
const iaRoutes = require('./routes/ia');

const log = creer('Mew');
const app = express();

// Middlewares
app.use(cors({
  origin: config.serveur.origineFrontend,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '2mb' })); // 2 Mo pour le texte scrape des offres

// Routes de l'univers emploi.
// Le limiteur de requetes IA n'est applique que la ou OpenAI est reellement
// appele : brider un calcul local et gratuit n'aurait aucun sens.
app.use('/api/solutions', aiRateLimiter, solutionsRoutes);
app.use('/api/matcher', aiRateLimiter, matcherRoutes);

// Reglages du moteur d'IA : c'est l'utilisateur qui choisit son fournisseur,
// son modele et apporte sa cle, depuis l'interface.
// PAS de limiteur global ici, volontairement : lire le catalogue ou
// enregistrer un choix ne coute rien et n'appelle personne, et brider ces
// routes empecherait de reparer une configuration au pire moment. Seule
// /api/ia/tester, qui fait un vrai appel au fournisseur, est limitee — le
// routeur applique le limiteur lui-meme sur cette route.
app.use('/api/ia', iaRoutes);

// Les trois routes ci-dessous manipulent des donnees personnelles
// (candidatures, historique, envoi d'email) : elles passent par le
// middleware d'authentification, qui pose req.userId.
// AUTH_MODE=local (defaut) fait confiance au navigateur ; AUTH_MODE=supabase
// exige un jeton signe. Voir middleware/auth.js et SECURITY.md.
app.use('/api/applications', auth, applicationsRoutes);
app.use('/api/historique', auth, historyRoutes);
// candidature-spontanee applique `auth` route par route : /envoyer recoit un
// formulaire multipart, dont le corps n'est lisible qu'apres multer.
app.use('/api/candidature-spontanee', candidatureSpontaneeRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Backend Mew operationnel', status: 'OK' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

/**
 * Ce que l'installation courante sait faire.
 * Le frontend interroge cette route pour griser proprement les boutons
 * inutilisables au lieu de laisser l'utilisateur cliquer puis echouer.
 */
app.get('/api/capacites', (req, res) => {
  res.json({
    success: true,
    data: {
      ia: config.capacites.ia,
      envoiEmail: config.capacites.envoiEmail,
      franceTravail: config.capacites.franceTravail,
      scraping: config.capacites.scraping,
      stockage: config.capacites.stockageSupabase ? 'supabase' : 'local',
      // Le frontend peut ainsi savoir s'il doit envoyer un jeton
      // (mode supabase) ou seulement un identifiant (mode local).
      authentification: config.authentification.mode
    }
  });
});

// Gestion globale des erreurs : toujours repondre en JSON, jamais en HTML.
// Attrape notamment les erreurs multer (fichier trop gros, mauvais type) et
// les payloads JSON trop volumineux, que les try/catch des routes ne voient pas.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Le fichier depasse la taille maximale autorisee'
      : "Erreur lors de l'upload du fichier";
    return res.status(400).json({ success: false, error: message });
  }
  if (err.code === 'FICHIER_NON_PDF') {
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Requete trop volumineuse' });
  }
  log.error('Erreur non geree:', err.message);
  res.status(500).json({ success: false, error: 'Erreur serveur inattendue' });
});

/**
 * Message de demarrage.
 *
 * Le serveur ne refuse JAMAIS de demarrer parce qu'une cle manque. Il
 * annonce ce qui est actif et ce qui ne l'est pas, et l'utilisateur decide.
 * Avant, une seule cle absente provoquait un process.exit(1) — ou pire, un
 * crash au chargement d'un module, avec un message en anglais issu d'un SDK
 * tiers, qui ne mentionnait ni Mew ni le fichier .env.
 */
function afficherDemarrage() {
  const url = `http://${config.serveur.host}:${config.serveur.port}`;
  log.info(`Serveur demarre sur ${url}`);
  config.resume().forEach((ligne) => log.info(`  ${ligne}`));

  // Le cas dangereux : un serveur joignable depuis le reseau alors qu'il
  // fait encore confiance a l'identifiant envoye par le navigateur. Il faut
  // le dire fort, c'est exactement la situation ou les donnees fuitent.
  if (config.authentification.mode === 'local' && config.serveur.host !== '127.0.0.1'
      && config.serveur.host !== 'localhost') {
    log.info('');
    log.warn(`  ATTENTION : le serveur ecoute sur ${config.serveur.host} et n'a AUCUNE`);
    log.warn('  authentification (AUTH_MODE=local). Toute personne qui atteint ce port');
    log.warn("  peut lire et modifier les candidatures de n'importe qui, en devinant");
    log.warn('  simplement son identifiant. Mets AUTH_MODE=supabase, ou reviens a');
    log.warn('  HOST=127.0.0.1.');
  }

  if (!config.capacites.ia) {
    log.info('');
    log.info("  Aucun moteur d'IA configure : les analyses, scores et suivis");
    log.info('  fonctionnent normalement (ils sont calcules en local).');
    log.info('  Seule la redaction assistee est indisponible.');
    log.info('  Pour l\'activer : choisis ton fournisseur et colle ta cle dans');
    log.info('  les reglages de l\'interface (ou remplis backend/.env).');
  }
}

app.listen(config.serveur.port, config.serveur.host, afficherDemarrage);
