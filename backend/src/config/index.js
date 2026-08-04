/**
 * Configuration centrale de Mew.
 *
 * Un seul endroit lit process.env. Partout ailleurs dans le code, on
 * importe cet objet. Ca evite d'avoir des noms de variables ecrits a la
 * main aux quatre coins du projet, et surtout ca permet de repondre a
 * une question simple au demarrage : « qu'est-ce qui est actif ? ».
 *
 * Principe : AUCUNE cle n'est obligatoire. Le serveur demarre toujours.
 * Une cle absente desactive une fonctionnalite, elle ne casse pas l'app.
 */

const nombre = (valeur, defaut) => {
  const n = Number(valeur);
  return Number.isFinite(n) ? n : defaut;
};

const booleen = (valeur, defaut) => {
  if (valeur === undefined || valeur === '') return defaut;
  return valeur === 'true' || valeur === '1';
};

const vide = (valeur) => !valeur || String(valeur).trim() === '';

const config = {
  serveur: {
    port: nombre(process.env.PORT, 5000),
    // 127.0.0.1 = joignable uniquement depuis cette machine.
    // C'est le bon defaut pour une app locale qui n'a pas d'authentification.
    host: process.env.HOST || '127.0.0.1',
    origineFrontend: process.env.FRONTEND_URL || 'http://localhost:3000',
    production: process.env.NODE_ENV === 'production',
    niveauLog: process.env.LOG_LEVEL || 'info'
  },

  ia: {
    cleApi: process.env.OPENAI_API_KEY || '',
    // Vide = API OpenAI officielle. Rempli = n'importe quel service
    // compatible OpenAI (Ollama, LM Studio, Groq, Mistral...).
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    timeoutMs: nombre(process.env.AI_TIMEOUT_MS, 120000),
    // Les modeles sont designes par ROLE, jamais par nom dans le code metier.
    modeles: {
      redaction: process.env.AI_MODEL_REDACTION || 'gpt-4o',
      extraction: process.env.AI_MODEL_EXTRACTION || 'gpt-4.1-mini'
    },
    // 0 = pas de limite. Utile en usage local solo : c'est l'utilisateur
    // qui paie sa propre cle, il n'a pas besoin qu'on le bride.
    limiteRequetes: nombre(process.env.AI_RATE_LIMIT_MAX, 200)
  },

  email: {
    cleApi: process.env.RESEND_API_KEY || '',
    expediteur: process.env.EMAIL_FROM || 'Candidature <onboarding@resend.dev>'
  },

  offres: {
    franceTravailId: process.env.FT_CLIENT_ID || '',
    franceTravailSecret: process.env.FT_CLIENT_SECRET || '',
    scrapingActive: booleen(process.env.SCRAPING_ENABLED, false)
  },

  stockage: {
    // 'json' = fichier local, aucun compte requis (defaut)
    // 'supabase' = base en ligne, pour un usage multi-utilisateur
    driver: process.env.STORAGE_DRIVER || 'json',
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseCle: process.env.SUPABASE_SERVICE_KEY || ''
  }
};

/**
 * Ce que l'application sait faire, compte tenu de ce qui est configure.
 * Sert au message de demarrage et a la route GET /api/capacites, que le
 * frontend interroge pour griser les boutons inutilisables.
 */
config.capacites = {
  get ia() {
    // Un serveur local (Ollama) ignore la cle mais le SDK exige qu'elle
    // soit non vide : une baseURL personnalisee suffit donc.
    return !vide(config.ia.cleApi) || !vide(config.ia.baseURL);
  },
  get envoiEmail() {
    return !vide(config.email.cleApi);
  },
  get franceTravail() {
    return !vide(config.offres.franceTravailId) && !vide(config.offres.franceTravailSecret);
  },
  get scraping() {
    return config.offres.scrapingActive;
  },
  get stockageSupabase() {
    return config.stockage.driver === 'supabase'
      && !vide(config.stockage.supabaseUrl)
      && !vide(config.stockage.supabaseCle);
  }
};

/**
 * Resume lisible affiche au demarrage du serveur.
 */
config.resume = () => {
  const oui = (v) => (v ? 'actif' : 'inactif');
  const moteurIa = config.capacites.ia
    ? (config.ia.baseURL ? `personnalise (${config.ia.baseURL})` : 'OpenAI')
    : 'inactif';

  return [
    `Redaction IA    : ${moteurIa}`,
    `Stockage        : ${config.capacites.stockageSupabase ? 'Supabase' : 'fichier local (backend/data/)'}`,
    `Envoi d'email   : ${oui(config.capacites.envoiEmail)}`,
    `France Travail  : ${oui(config.capacites.franceTravail)}`,
    `Scraping offres : ${oui(config.capacites.scraping)}`
  ];
};

module.exports = config;
