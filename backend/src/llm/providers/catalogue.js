/**
 * LE CATALOGUE DES FOURNISSEURS DE MODELES.
 *
 * ------------------------------------------------------------------
 * TARIFS VERIFIES LE 4 AOUT 2026.
 *
 * AVERTISSEMENT : ces prix vieillissent vite. Les fournisseurs changent
 * leurs grilles et renomment leurs modeles sans preavis. Ce fichier sert
 * a AFFICHER un ordre de grandeur, pas a facturer. Seul le fournisseur
 * fait foi : en cas de doute, allez voir sa page de tarifs.
 * ------------------------------------------------------------------
 *
 * POURQUOI CE FICHIER EXISTE
 * Mew ne choisit pas le modele a la place de l'utilisateur. L'utilisateur
 * apporte sa cle et choisit son fournisseur ET son modele. Ce fichier est
 * la liste de ce qu'on sait proposer — c'est de la DONNEE, pas du code.
 *
 * AJOUTER UN FOURNISSEUR
 * Copiez une entree existante, changez les valeurs, et c'est tout. Aucun
 * autre fichier n'a besoin d'etre touche tant que le fournisseur parle
 * l'API d'OpenAI (adaptateur "openai-compatible"), ce qui est le cas de
 * la quasi-totalite d'entre eux. Les tests de backend/test/catalogue.test.js
 * verifieront que votre entree est complete.
 *
 * ET SI LE FOURNISSEUR N'EST PAS DANS LA LISTE ?
 * L'entree "personnalise" existe exactement pour ca : l'utilisateur saisit
 * lui-meme une adresse compatible OpenAI. AUCUN modele n'est hors de portee.
 */

// ---------------------------------------------------------------------------
// Vocabulaire
// ---------------------------------------------------------------------------

/**
 * Les deux seuls roles du projet. Mew n'appelle un modele que pour ecrire :
 *
 *   redaction  : produire un texte lu par un humain (lettre de motivation,
 *                email de candidature, reecriture de CV). La qualite prime.
 *   extraction : structurer ou reformater (lire un CV, en sortir un profil).
 *                La rapidite et le cout priment.
 *
 * Un modele peut porter les deux : c'est frequent chez les modeles
 * intermediaires, et c'est ce qui permet a l'utilisateur de n'en choisir
 * qu'un seul s'il ne veut pas se poser de questions.
 */
const ROLES = ['redaction', 'extraction'];

/**
 * Les trois seuls adaptateurs existants. Un fournisseur qui en reference un
 * autre est une faute de frappe, et le test la rattrape.
 *
 * openai-compatible : la grande majorite. Meme format de requete qu'OpenAI.
 * anthropic         : Claude a son propre format (/v1/messages).
 * google            : Gemini a son propre format (generateContent).
 */
const ADAPTATEURS = ['openai-compatible', 'anthropic', 'google'];

/** Date de la derniere verification des tarifs et des noms de modeles. */
const verifieLe = '2026-08-04';

// ---------------------------------------------------------------------------
// Le catalogue
// ---------------------------------------------------------------------------
//
// Rappel du format d'un modele :
//   id       : la chaine EXACTE envoyee au fournisseur. Un nom faux donne une
//              erreur incomprehensible a l'utilisateur : ne l'inventez jamais.
//   nom      : le nom lisible, affiche dans l'interface.
//   entree   : dollars par MILLION de tokens en entree.
//   sortie   : dollars par MILLION de tokens en sortie.
//   contexte : taille de la fenetre, en tokens.
//   roles    : a quoi ce modele convient (voir ROLES ci-dessus).
//
// On garde 2 a 5 modeles par fournisseur, pas tout son catalogue : trop de
// choix paralyse. Un bon modele de redaction, un modele rapide et economique
// pour l'extraction, eventuellement un intermediaire.

const FOURNISSEURS = [
  // -------------------------------------------------------------------------
  {
    id: 'openai',
    nom: 'OpenAI',
    adaptateur: 'openai-compatible',
    baseURL: 'https://api.openai.com/v1',
    cleRequise: true,
    urlCle: 'https://platform.openai.com/api-keys',
    prefixeCle: 'sk-',
    local: false,
    paliergratuit: false,
    listageDynamique: true,
    note: 'Le plus repandu. Facturation a l\'usage, sans palier gratuit.',
    modeles: [
      // Attention : la famille 5.6 facture plus cher au-dela de 200 000 tokens
      // d'entree (environ le double). On affiche le tarif courant, celui des
      // requetes normales — un CV et une offre d'emploi en sont tres loin.
      { id: 'gpt-5.6-sol', nom: 'GPT-5.6 Sol', entree: 5.00, sortie: 30.00, contexte: 1050000, roles: ['redaction'] },
      { id: 'gpt-5.6-terra', nom: 'GPT-5.6 Terra', entree: 2.00, sortie: 12.00, contexte: 1050000, roles: ['redaction', 'extraction'] },
      { id: 'gpt-5.6-luna', nom: 'GPT-5.6 Luna', entree: 0.20, sortie: 1.20, contexte: 1050000, roles: ['extraction'] },
      { id: 'gpt-4o-mini', nom: 'GPT-4o mini', entree: 0.15, sortie: 0.60, contexte: 128000, roles: ['extraction'] }
    ]
  },

  // -------------------------------------------------------------------------
  {
    id: 'anthropic',
    nom: 'Anthropic (Claude)',
    adaptateur: 'anthropic',
    // Adresse NATIVE, pas /v1 : l'adaptateur anthropic ajoute /v1/messages.
    baseURL: 'https://api.anthropic.com',
    cleRequise: true,
    urlCle: 'https://console.anthropic.com/settings/keys',
    prefixeCle: 'sk-ant-',
    local: false,
    paliergratuit: false,
    listageDynamique: true,
    note: 'Excellent en redaction. Format d\'API different d\'OpenAI, gere par son propre adaptateur.',
    modeles: [
      { id: 'claude-opus-5', nom: 'Claude Opus 5', entree: 5.00, sortie: 25.00, contexte: 1000000, roles: ['redaction'] },
      { id: 'claude-sonnet-5', nom: 'Claude Sonnet 5', entree: 3.00, sortie: 15.00, contexte: 1000000, roles: ['redaction', 'extraction'] },
      { id: 'claude-haiku-4-5', nom: 'Claude Haiku 4.5', entree: 1.00, sortie: 5.00, contexte: 200000, roles: ['extraction'] }
    ]
  },

  // -------------------------------------------------------------------------
  {
    id: 'google',
    nom: 'Google (Gemini)',
    adaptateur: 'google',
    baseURL: 'https://generativelanguage.googleapis.com',
    cleRequise: true,
    urlCle: 'https://aistudio.google.com/apikey',
    prefixeCle: 'AIza',
    local: false,
    // Palier gratuit reel : plusieurs modeles sont utilisables sans payer,
    // avec des limites de debit. En contrepartie Google se sert des requetes
    // pour ameliorer ses produits — a dire a l'utilisateur.
    paliergratuit: true,
    listageDynamique: true,
    note: 'Palier gratuit genereux, mais Google exploite les requetes gratuites. Ne pas y envoyer de CV sensible.',
    modeles: [
      { id: 'gemini-3.1-pro-preview', nom: 'Gemini 3.1 Pro', entree: 2.00, sortie: 12.00, contexte: 1000000, roles: ['redaction'] },
      { id: 'gemini-3.6-flash', nom: 'Gemini 3.6 Flash', entree: 1.50, sortie: 7.50, contexte: 1000000, roles: ['redaction', 'extraction'] },
      { id: 'gemini-3.5-flash-lite', nom: 'Gemini 3.5 Flash-Lite', entree: 0.30, sortie: 2.50, contexte: 1000000, roles: ['extraction'] },
      { id: 'gemini-2.5-flash-lite', nom: 'Gemini 2.5 Flash-Lite', entree: 0.10, sortie: 0.40, contexte: 1000000, roles: ['extraction'] }
    ]
  },

  // -------------------------------------------------------------------------
  {
    id: 'moonshot',
    nom: 'Moonshot (Kimi)',
    adaptateur: 'openai-compatible',
    baseURL: 'https://api.moonshot.ai/v1',
    cleRequise: true,
    urlCle: 'https://platform.moonshot.ai/console/api-keys',
    prefixeCle: 'sk-',
    local: false,
    paliergratuit: false,
    listageDynamique: true,
    note: 'Tres bon rapport qualite/prix. Les noms des modeles K2 changent souvent : utilisez le listage en direct.',
    modeles: [
      { id: 'kimi-k3', nom: 'Kimi K3', entree: 3.00, sortie: 15.00, contexte: 1048576, roles: ['redaction', 'extraction'] },
      { id: 'kimi-k2.6', nom: 'Kimi K2.6', entree: 0.95, sortie: 4.00, contexte: 262144, roles: ['extraction'] }
    ]
  },

  // -------------------------------------------------------------------------
  {
    id: 'mistral',
    nom: 'Mistral AI',
    adaptateur: 'openai-compatible',
    baseURL: 'https://api.mistral.ai/v1',
    cleRequise: true,
    urlCle: 'https://console.mistral.ai/api-keys',
    prefixeCle: null,
    local: false,
    paliergratuit: true,
    listageDynamique: true,
    note: 'Fournisseur francais, donnees hebergees en Europe. Un palier gratuit existe pour experimenter.',
    modeles: [
      { id: 'mistral-medium-3.5', nom: 'Mistral Medium 3.5', entree: 1.50, sortie: 7.50, contexte: 128000, roles: ['redaction'] },
      { id: 'mistral-large-3', nom: 'Mistral Large 3', entree: 0.50, sortie: 1.50, contexte: 128000, roles: ['redaction', 'extraction'] },
      { id: 'mistral-small-4', nom: 'Mistral Small 4', entree: 0.15, sortie: 0.60, contexte: 128000, roles: ['extraction'] },
      { id: 'ministral-3-8b', nom: 'Ministral 3 8B', entree: 0.15, sortie: 0.15, contexte: 128000, roles: ['extraction'] }
    ]
  },

  // -------------------------------------------------------------------------
  {
    id: 'deepseek',
    nom: 'DeepSeek',
    adaptateur: 'openai-compatible',
    baseURL: 'https://api.deepseek.com/v1',
    cleRequise: true,
    urlCle: 'https://platform.deepseek.com/api_keys',
    prefixeCle: 'sk-',
    local: false,
    paliergratuit: false,
    listageDynamique: true,
    // Les anciens alias deepseek-chat / deepseek-reasoner ont ete retires
    // le 24 juillet 2026 : ne les remettez pas dans la liste.
    note: 'Parmi les moins chers du marche. Serveurs en Chine : a savoir avant d\'y envoyer un CV.',
    modeles: [
      { id: 'deepseek-v4-pro', nom: 'DeepSeek V4 Pro', entree: 0.435, sortie: 0.87, contexte: 1000000, roles: ['redaction'] },
      { id: 'deepseek-v4-flash', nom: 'DeepSeek V4 Flash', entree: 0.14, sortie: 0.28, contexte: 1000000, roles: ['redaction', 'extraction'] }
    ]
  },

  // -------------------------------------------------------------------------
  {
    id: 'xai',
    nom: 'xAI (Grok)',
    adaptateur: 'openai-compatible',
    baseURL: 'https://api.x.ai/v1',
    cleRequise: true,
    urlCle: 'https://console.x.ai',
    prefixeCle: 'xai-',
    local: false,
    paliergratuit: false,
    listageDynamique: true,
    note: 'Tarif double au-dela de 200 000 tokens d\'entree ; sans effet sur un CV.',
    modeles: [
      { id: 'grok-4.5', nom: 'Grok 4.5', entree: 2.00, sortie: 6.00, contexte: 500000, roles: ['redaction'] },
      { id: 'grok-4.3', nom: 'Grok 4.3', entree: 1.25, sortie: 2.50, contexte: 1000000, roles: ['redaction', 'extraction'] },
      { id: 'grok-build-0.1', nom: 'Grok Build 0.1', entree: 1.00, sortie: 2.00, contexte: 262144, roles: ['extraction'] }
    ]
  },

  // -------------------------------------------------------------------------
  {
    id: 'groq',
    nom: 'Groq',
    adaptateur: 'openai-compatible',
    // Groq expose son API compatible OpenAI sous /openai/v1, pas /v1.
    baseURL: 'https://api.groq.com/openai/v1',
    cleRequise: true,
    urlCle: 'https://console.groq.com/keys',
    prefixeCle: 'gsk_',
    local: false,
    paliergratuit: true,
    listageDynamique: true,
    note: 'Heberge des modeles ouverts, tres vite et tres peu cher. Palier gratuit limite en debit.',
    modeles: [
      { id: 'openai/gpt-oss-120b', nom: 'GPT-OSS 120B', entree: 0.15, sortie: 0.60, contexte: 131072, roles: ['redaction', 'extraction'] },
      { id: 'openai/gpt-oss-20b', nom: 'GPT-OSS 20B', entree: 0.075, sortie: 0.30, contexte: 131072, roles: ['extraction'] },
      { id: 'llama-3.3-70b-versatile', nom: 'Llama 3.3 70B', entree: 0.59, sortie: 0.79, contexte: 131072, roles: ['redaction'] },
      { id: 'llama-3.1-8b-instant', nom: 'Llama 3.1 8B', entree: 0.05, sortie: 0.08, contexte: 131072, roles: ['extraction'] }
    ]
  },

  // -------------------------------------------------------------------------
  {
    id: 'together',
    nom: 'Together AI',
    adaptateur: 'openai-compatible',
    baseURL: 'https://api.together.xyz/v1',
    cleRequise: true,
    urlCle: 'https://api.together.ai/settings/api-keys',
    prefixeCle: null,
    local: false,
    paliergratuit: false,
    listageDynamique: true,
    note: 'Revendeur de modeles ouverts. Les identifiants gardent le prefixe de l\'editeur.',
    modeles: [
      { id: 'moonshotai/Kimi-K3', nom: 'Kimi K3', entree: 3.00, sortie: 15.00, contexte: 1000000, roles: ['redaction'] },
      { id: 'zai-org/GLM-5.2', nom: 'GLM-5.2', entree: 1.40, sortie: 4.40, contexte: 262144, roles: ['redaction', 'extraction'] },
      { id: 'deepseek-ai/DeepSeek-V4-Flash-0731', nom: 'DeepSeek V4 Flash', entree: 0.14, sortie: 0.28, contexte: 1000000, roles: ['extraction'] },
      { id: 'Qwen/Qwen3.5-9B', nom: 'Qwen 3.5 9B', entree: 0.17, sortie: 0.25, contexte: 262144, roles: ['extraction'] }
    ]
  },

  // -------------------------------------------------------------------------
  {
    id: 'fireworks',
    nom: 'Fireworks AI',
    adaptateur: 'openai-compatible',
    baseURL: 'https://api.fireworks.ai/inference/v1',
    cleRequise: true,
    urlCle: 'https://fireworks.ai/account/api-keys',
    prefixeCle: 'fw_',
    local: false,
    paliergratuit: false,
    listageDynamique: true,
    note: 'Revendeur de modeles ouverts. Les identifiants commencent par "fireworks/".',
    modeles: [
      { id: 'fireworks/kimi-k3', nom: 'Kimi K3', entree: 3.00, sortie: 15.00, contexte: 1000000, roles: ['redaction'] },
      { id: 'fireworks/glm-5p2', nom: 'GLM-5.2', entree: 1.40, sortie: 4.40, contexte: 262144, roles: ['redaction', 'extraction'] },
      { id: 'fireworks/deepseek-v4-flash', nom: 'DeepSeek V4 Flash', entree: 0.14, sortie: 0.28, contexte: 1000000, roles: ['extraction'] },
      { id: 'fireworks/gpt-oss-120b', nom: 'GPT-OSS 120B', entree: 0.15, sortie: 0.60, contexte: 131072, roles: ['extraction'] }
    ]
  },

  // -------------------------------------------------------------------------
  {
    id: 'cerebras',
    nom: 'Cerebras',
    adaptateur: 'openai-compatible',
    baseURL: 'https://api.cerebras.ai/v1',
    cleRequise: true,
    urlCle: 'https://cloud.cerebras.ai',
    prefixeCle: 'csk-',
    local: false,
    paliergratuit: true,
    listageDynamique: true,
    // Le catalogue de Cerebras bouge beaucoup (modeles en preview retires sans
    // preavis) : on n'inscrit en dur que le modele stable, le reste vient du
    // listage en direct.
    note: 'Inference tres rapide et palier gratuit quotidien. Catalogue mouvant : listez les modeles en direct.',
    modeles: [
      { id: 'gpt-oss-120b', nom: 'GPT-OSS 120B', entree: 0.35, sortie: 0.75, contexte: 131072, roles: ['redaction', 'extraction'] }
    ]
  },

  // -------------------------------------------------------------------------
  {
    id: 'openrouter',
    nom: 'OpenRouter',
    adaptateur: 'openai-compatible',
    baseURL: 'https://openrouter.ai/api/v1',
    cleRequise: true,
    urlCle: 'https://openrouter.ai/keys',
    prefixeCle: 'sk-or-',
    local: false,
    paliergratuit: true,
    listageDynamique: true,
    // Une seule cle donne acces a des centaines de modeles de tous les
    // editeurs : c'est le meilleur point d'entree pour quelqu'un qui hesite.
    note: 'Une seule cle pour des centaines de modeles. OpenRouter prend une petite commission sur le tarif de l\'editeur.',
    modeles: [
      { id: 'anthropic/claude-opus-5', nom: 'Claude Opus 5', entree: 5.00, sortie: 25.00, contexte: 1000000, roles: ['redaction'] },
      { id: 'openai/gpt-5.6-terra', nom: 'GPT-5.6 Terra', entree: 2.00, sortie: 12.00, contexte: 1050000, roles: ['redaction', 'extraction'] },
      { id: 'google/gemini-3.6-flash', nom: 'Gemini 3.6 Flash', entree: 1.50, sortie: 7.50, contexte: 1000000, roles: ['redaction', 'extraction'] },
      { id: 'deepseek/deepseek-v4-flash', nom: 'DeepSeek V4 Flash', entree: 0.14, sortie: 0.28, contexte: 1000000, roles: ['extraction'] }
    ]
  },

  // -------------------------------------------------------------------------
  // LES LOCAUX
  //
  // Ils tournent sur la machine de l'utilisateur : pas de cle, pas de cout par
  // requete, et surtout AUCUNE donnee qui sort de chez lui — c'est l'option la
  // plus respectueuse pour un CV.
  //
  // Leur liste `modeles` est VIDE, et ce n'est pas un oubli : elle depend de ce
  // que l'utilisateur a telecharge. Personne ne peut la deviner a l'avance,
  // d'ou `listageDynamique: true` — l'adaptateur ira demander la liste au
  // serveur local au moment ou l'utilisateur ouvre le menu.
  // -------------------------------------------------------------------------
  {
    id: 'ollama',
    nom: 'Ollama (local)',
    adaptateur: 'openai-compatible',
    baseURL: 'http://localhost:11434/v1',
    cleRequise: false,
    urlCle: null,
    prefixeCle: null,
    local: true,
    paliergratuit: true,
    listageDynamique: true,
    note: 'Tourne sur votre machine : gratuit, et aucune donnee ne sort. Ollama doit etre lance.',
    modeles: []
  },

  {
    id: 'lmstudio',
    nom: 'LM Studio (local)',
    adaptateur: 'openai-compatible',
    baseURL: 'http://localhost:1234/v1',
    cleRequise: false,
    urlCle: null,
    prefixeCle: null,
    local: true,
    paliergratuit: true,
    listageDynamique: true,
    note: 'Tourne sur votre machine. Activez le serveur local dans LM Studio (onglet Developer).',
    modeles: []
  },

  {
    id: 'llamacpp',
    nom: 'llama.cpp (local)',
    adaptateur: 'openai-compatible',
    baseURL: 'http://localhost:8080/v1',
    cleRequise: false,
    urlCle: null,
    prefixeCle: null,
    local: true,
    paliergratuit: true,
    listageDynamique: true,
    note: 'Serveur llama-server. Adaptez le port si vous l\'avez lance autrement.',
    modeles: []
  },

  // -------------------------------------------------------------------------
  // LA PORTE DE SORTIE
  //
  // C'est cette entree qui garantit qu'aucun modele n'est hors de portee :
  // n'importe quelle adresse compatible OpenAI (un fournisseur qu'on n'a pas
  // prevu, un proxy d'entreprise, un serveur perso) marche ici.
  // baseURL vaut null : c'est l'utilisateur qui la saisit.
  // -------------------------------------------------------------------------
  {
    id: 'personnalise',
    nom: 'Autre (compatible OpenAI)',
    adaptateur: 'openai-compatible',
    baseURL: null,
    cleRequise: false,
    urlCle: null,
    prefixeCle: null,
    local: false,
    paliergratuit: false,
    listageDynamique: true,
    note: 'Saisissez vous-meme l\'adresse de l\'API (elle finit generalement par /v1) et, si besoin, une cle.',
    modeles: []
  }
];

// ---------------------------------------------------------------------------
// Gel
// ---------------------------------------------------------------------------

/**
 * Fige le catalogue en profondeur.
 *
 * POURQUOI : ce module est un singleton charge une fois pour toute la duree du
 * serveur. Si un appelant modifiait un tarif ou vidait une liste de modeles,
 * le reste du processus verrait la version abimee jusqu'au redemarrage — et le
 * bug serait introuvable. Object.freeze transforme cette erreur silencieuse en
 * erreur immediate (en mode strict) ou en non-operation (sinon).
 */
const geler = (valeur) => {
  if (valeur && typeof valeur === 'object' && !Object.isFrozen(valeur)) {
    Object.freeze(valeur);
    Object.values(valeur).forEach(geler);
  }
  return valeur;
};

geler(FOURNISSEURS);
geler(ROLES);
geler(ADAPTATEURS);

module.exports = { verifieLe, ROLES, ADAPTATEURS, FOURNISSEURS };
