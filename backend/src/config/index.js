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

const configUtilisateur = require('../llm/configUtilisateur');
const { fournisseur: fournisseurDuCatalogue } = require('../llm/providers');

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
    timeoutMs: nombre(process.env.AI_TIMEOUT_MS, 120000),
    // 0 = pas de limite. Utile en usage local solo : c'est l'utilisateur
    // qui paie sa propre cle, il n'a pas besoin qu'on le bride.
    limiteRequetes: nombre(process.env.AI_RATE_LIMIT_MAX, 200)
    // cleApi, baseURL, modeles, fournisseur, adaptateur et source sont
    // ajoutes plus bas : ce sont des proprietes CALCULEES, parce que
    // l'utilisateur peut changer de fournisseur pendant que le serveur
    // tourne (voir la section « moteur d'IA effectif »).
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
  },

  authentification: {
    // 'local' (defaut) : une seule personne, sur sa propre machine, serveur
    //   en ecoute sur 127.0.0.1. On accepte l'identifiant envoye par le
    //   navigateur tel quel. C'est assume, et sans consequence tant qu'il
    //   n'y a qu'un utilisateur.
    // 'supabase' : chaque requete doit porter un jeton signe, verifie
    //   cote serveur. Obligatoire des que Mew est expose a plusieurs
    //   personnes. Voir backend/src/middleware/auth.js et SECURITY.md.
    mode: String(process.env.AUTH_MODE || 'local').trim().toLowerCase(),
    supabaseUrl: process.env.SUPABASE_URL || '',
    // La cle « anon » suffit pour VERIFIER un jeton : c'est exactement ce
    // que fait le navigateur. On accepte la service_role en repli pour ne
    // pas imposer une variable de plus a qui utilise deja Supabase.
    supabaseCle: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY || ''
  }
};

/* ------------------------------------------------------------------ */
/* LE MOTEUR D'IA EFFECTIF                                             */
/* ------------------------------------------------------------------ */
/**
 * Mew a desormais DEUX sources possibles pour son moteur d'IA :
 *
 *   1. backend/.env, quand il definit OPENAI_API_KEY. Prioritaire, toujours.
 *      Quelqu'un peut installer Mew POUR d'autres (serveur partage,
 *      association, centre de formation) et vouloir imposer sa configuration :
 *      dans ce cas, l'interface affiche le choix comme verrouille.
 *   2. backend/data/config-ia.json, le choix fait par l'utilisateur depuis
 *      l'interface (voir src/llm/configUtilisateur.js).
 *   3. Rien du tout — et Mew demarre quand meme. C'est un invariant du projet.
 *
 * Ces valeurs sont exposees comme des proprietes CALCULEES et non figees a
 * l'import : l'utilisateur peut changer de fournisseur pendant que le serveur
 * tourne, et le prochain appel doit en tenir compte sans redemarrage.
 * `config.ia.cleApi`, `config.ia.baseURL` et `config.ia.modeles` gardent
 * exactement le meme sens et le meme type qu'avant : aucun appelant existant
 * n'a besoin d'etre modifie.
 */

// Ce que le .env dit, une fois pour toutes. Ce fichier reste le seul du projet
// a lire process.env.
const IA_ENV = {
  cleApi: process.env.OPENAI_API_KEY || '',
  // Vide = API OpenAI officielle. Rempli = n'importe quel service compatible
  // OpenAI (Ollama, LM Studio, Groq, Mistral...).
  baseURL: process.env.OPENAI_BASE_URL || '',
  modeles: {
    redaction: process.env.AI_MODEL_REDACTION || '',
    extraction: process.env.AI_MODEL_EXTRACTION || ''
  }
};

// Les modeles sont designes par ROLE, jamais par nom, dans le code metier.
const MODELES_DEFAUT = { redaction: 'gpt-4o', extraction: 'gpt-4.1-mini' };

/**
 * Qui a le dernier mot ?
 * @returns {'env'|'fichier'|'aucune'}
 */
function sourceIa() {
  if (!vide(IA_ENV.cleApi)) return 'env';
  // Le fichier utilisateur ne compte que s'il est reellement exploitable :
  // une configuration a moitie remplie ne doit pas masquer un OPENAI_BASE_URL
  // parfaitement valide.
  if (configUtilisateur.estConfigure()) return 'fichier';
  if (!vide(IA_ENV.baseURL)) return 'env';
  return 'aucune';
}

/**
 * La configuration reellement utilisee pour appeler un modele.
 * Recalculee a chaque lecture : c'est bon marche (un objet en memoire) et ca
 * evite tout probleme de valeur perimee.
 */
function iaEffective() {
  const source = sourceIa();

  if (source === 'fichier') {
    const choix = configUtilisateur.lire();
    const f = fournisseurDuCatalogue(choix.fournisseur);
    return {
      source,
      fournisseur: choix.fournisseur,
      adaptateur: (f && f.adaptateur) || 'openai-compatible',
      cleApi: choix.cleApi,
      // Repli sur le catalogue : un fichier ecrit a la main peut ne pas
      // porter d'adresse alors que son fournisseur en a une.
      baseURL: choix.baseURL || (f && f.baseURL) || '',
      modeles: {
        redaction: choix.modeles.redaction || choix.modeles.extraction || MODELES_DEFAUT.redaction,
        extraction: choix.modeles.extraction || choix.modeles.redaction || MODELES_DEFAUT.extraction
      }
    };
  }

  return {
    source,
    // Une adresse personnalisee dans le .env, c'est par definition un service
    // qu'on ne nomme pas ; sinon c'est OpenAI.
    fournisseur: source === 'env' ? (vide(IA_ENV.baseURL) ? 'openai' : 'personnalise') : '',
    adaptateur: 'openai-compatible',
    cleApi: IA_ENV.cleApi,
    baseURL: IA_ENV.baseURL,
    modeles: {
      redaction: IA_ENV.modeles.redaction || MODELES_DEFAUT.redaction,
      extraction: IA_ENV.modeles.extraction || MODELES_DEFAUT.extraction
    }
  };
}

/**
 * Le repli par role quand il n'y en a pas : voir le commentaire dans
 * iaPourTache, c'est un choix, pas un oubli.
 */
const MODELES_VIDES = Object.freeze({ redaction: '', extraction: '' });

/**
 * La configuration a appliquer POUR UNE TACHE PRECISE.
 *
 * C'est ce qui permet « tel modele lit mes CV, tel autre redige mes lettres »,
 * y compris quand les deux ne sont pas chez le meme fournisseur : chaque tache
 * remonte son propre acces, donc sa propre cle.
 *
 * L'ARBITRAGE EST LE MEME QUE POUR LE RESTE, et c'est important : quand
 * backend/.env impose une cle, il l'impose a TOUTES les taches. Une
 * installation faite pour d'autres ne doit pas pouvoir etre contournee tache
 * par tache depuis l'interface.
 *
 * @param {string} idTache
 * @returns {{source: string, fournisseur: string, adaptateur: string,
 *            cleApi: string, baseURL: string, modele: string,
 *            coupee: boolean}|null}
 *   null quand rien n'est configure. `coupee` a true quand l'utilisateur a
 *   explicitement eteint cette tache : ce n'est pas une panne, c'est un choix,
 *   et le message a lui montrer n'est pas le meme.
 */
function iaPourTache(idTache) {
  const source = sourceIa();
  if (source === 'aucune') return null;

  // Le .env gagne : il s'applique tel quel a toutes les taches. Lui seul
  // raisonne encore en ROLES, d'ou le `modeles` transmis en repli.
  if (source === 'env') {
    const effective = iaEffective();
    return {
      source,
      fournisseur: effective.fournisseur,
      adaptateur: effective.adaptateur,
      cleApi: effective.cleApi,
      baseURL: effective.baseURL,
      modele: '',
      modeles: effective.modeles,
      coupee: false
    };
  }

  if (configUtilisateur.tacheCoupee(idTache)) {
    return {
      source,
      fournisseur: '',
      adaptateur: '',
      cleApi: '',
      baseURL: '',
      modele: '',
      modeles: MODELES_VIDES,
      coupee: true
    };
  }

  const reglage = configUtilisateur.pourTache(idTache);
  if (!reglage) return null;

  const f = fournisseurDuCatalogue(reglage.fournisseur);
  return {
    source,
    fournisseur: reglage.fournisseur,
    adaptateur: (f && f.adaptateur) || 'openai-compatible',
    cleApi: reglage.cleApi,
    // Repli sur le catalogue : un fichier ecrit a la main peut ne pas porter
    // d'adresse alors que son fournisseur en a une.
    baseURL: reglage.baseURL || (f && f.baseURL) || '',
    modele: reglage.modele,
    // Vide pour une tache connue, et surtout pas MODELES_DEFAUT : le bon repli
    // est alors le catalogue DU FOURNISSEUR DE CETTE TACHE, ce que aiService
    // sait faire. Proposer « gpt-4o » a une cle Anthropic donnerait une erreur
    // « modele introuvable » incomprehensible. Sans tache connue, en revanche,
    // configUtilisateur remonte le reglage general par role.
    modeles: reglage.modeles || MODELES_VIDES,
    coupee: false
  };
}

Object.defineProperties(config.ia, {
  source: { enumerable: true, get: () => iaEffective().source },
  fournisseur: { enumerable: true, get: () => iaEffective().fournisseur },
  adaptateur: { enumerable: true, get: () => iaEffective().adaptateur },
  cleApi: { enumerable: true, get: () => iaEffective().cleApi },
  baseURL: {
    enumerable: true,
    // undefined et non '' : le SDK OpenAI attend soit une adresse, soit rien
    // du tout. Une chaine vide le ferait appeler « /chat/completions » sur le
    // vide. C'etait deja le comportement avant, on le preserve.
    get: () => iaEffective().baseURL || undefined
  },
  modeles: { enumerable: true, get: () => iaEffective().modeles },
  // La configuration MASQUEE du fichier utilisateur, pour les routes de
  // reglages. La cle en clair ne passe jamais par ici.
  choixUtilisateur: { enumerable: false, get: () => configUtilisateur.lireMasquee() },
  // Non enumerable : c'est une FONCTION, elle n'a rien a faire dans un
  // JSON.stringify(config.ia) ni dans le resume de demarrage.
  pourTache: { enumerable: false, value: iaPourTache }
});

/**
 * Ce que l'application sait faire, compte tenu de ce qui est configure.
 * Sert au message de demarrage et a la route GET /api/capacites, que le
 * frontend interroge pour griser les boutons inutilisables.
 */
config.capacites = {
  get ia() {
    // Aucune source, ni .env ni choix de l'utilisateur : rien a faire.
    if (config.ia.source === 'aucune') return false;
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
  },
  /**
   * Le serveur verifie-t-il REELLEMENT qui parle ?
   * Faux en mode local (assume), faux aussi si AUTH_MODE=supabase mais que
   * l'URL ou la cle manque — dans ce cas rien n'est laisse ouvert : le
   * middleware refuse toutes les requetes plutot que de faire semblant.
   */
  get authentificationVerifiee() {
    return config.authentification.mode === 'supabase'
      && !vide(config.authentification.supabaseUrl)
      && !vide(config.authentification.supabaseCle);
  }
};

/**
 * Resume lisible affiche au demarrage du serveur.
 */
config.resume = () => {
  const oui = (v) => (v ? 'actif' : 'inactif');

  // On nomme la source : c'est la premiere question de quelqu'un qui a
  // configure son moteur depuis l'interface et se demande si c'est bien
  // celui-la qui sert (ou pourquoi le .env gagne).
  let moteurIa;
  if (!config.capacites.ia) {
    moteurIa = 'inactif';
  } else {
    const ia = config.ia;
    const ou = ia.source === 'fichier' ? 'choisi dans l\'interface' : 'impose par backend/.env';
    const nom = ia.fournisseur === 'personnalise' || !ia.fournisseur
      ? (ia.baseURL || 'personnalise')
      : ia.fournisseur;
    moteurIa = `${nom} - ${ia.modeles.redaction} / ${ia.modeles.extraction} (${ou})`;
  }

  // On dit la verite sur l'authentification au demarrage : c'est la seule
  // ligne qui indique si les donnees sont protegees ou non.
  let authentification;
  if (config.authentification.mode === 'local') {
    authentification = 'aucune (mode local, mono-utilisateur)';
  } else if (config.capacites.authentificationVerifiee) {
    authentification = 'jeton Supabase verifie a chaque requete';
  } else {
    authentification = `mode « ${config.authentification.mode} » incomplet : toutes les requetes seront refusees`;
  }

  return [
    `Redaction IA    : ${moteurIa}`,
    `Stockage        : ${config.capacites.stockageSupabase ? 'Supabase' : 'fichier local (backend/data/)'}`,
    `Authentification: ${authentification}`,
    `Envoi d'email   : ${oui(config.capacites.envoiEmail)}`,
    `France Travail  : ${oui(config.capacites.franceTravail)}`,
    `Scraping offres : ${oui(config.capacites.scraping)}`
  ];
};

module.exports = config;
