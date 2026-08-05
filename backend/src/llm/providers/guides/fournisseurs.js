/**
 * LE GUIDE DE CHAQUE FOURNISSEUR.
 *
 * ------------------------------------------------------------------
 * VERIFIE LE 4 AOUT 2026. Les pages d'inscription et les grilles de
 * tarifs changent. Ce guide sert a ORIENTER, pas a faire autorite : le
 * lien vers les tarifs officiels est donne a chaque fois, et c'est lui
 * qui fait foi.
 * ------------------------------------------------------------------
 *
 * POURQUOI CE FICHIER EST SEPARE DU CATALOGUE
 * catalogue.js contient ce dont le CODE a besoin pour appeler un modele :
 * adresse, adaptateur, identifiants, tarifs. Ce fichier-ci contient ce dont
 * l'UTILISATEUR a besoin pour choisir : ce que ce fournisseur fait bien, ce
 * qu'il fait mal, ou va son CV, et comment obtenir une cle. Deux publics, deux
 * fichiers — et le catalogue reste lisible.
 *
 * REGLE D'HONNETETE
 * Les « limites » ne sont pas facultatives. Un guide qui ne dit que du bien
 * n'aide personne a choisir. On ecrit ce qu'on sait, on n'invente pas de
 * classement : pas de « le meilleur du marche », pas de score compare.
 */

/**
 * Les fournisseurs montres d'emblee dans l'interface, dans cet ordre.
 *
 * POURQUOI SEULEMENT HUIT : le catalogue en compte seize. Affiches d'un bloc,
 * ils se ressemblent tous et le choix devient un tirage au sort. On met en
 * avant ceux dont le nom parle a quelqu'un qui n'a jamais paye d'API, plus les
 * deux facons de tout faire tourner chez soi. Les autres restent a un clic,
 * derriere « voir les autres » — ils ne sont ni caches ni moins bons, ils sont
 * juste moins connus.
 */
const MISE_EN_AVANT = [
  'ollama',
  'openai',
  'anthropic',
  'google',
  'mistral',
  'deepseek',
  'openrouter',
  'lmstudio'
];

/**
 * Forme d'une entree :
 *   atouts / limites   : listes de phrases courtes, affichees en puces.
 *   confidentialite    : ou part le CV. LE point le plus important de l'ecran.
 *   cle.etapes         : la marche a suivre, telle qu'on la ferait soi-meme.
 *   cle.urlTarifs      : la page officielle des prix. Elle fait foi.
 *   cle.carteBancaire  : faut-il enregistrer une carte pour commencer ?
 *   cle.pourEssayer    : ce qu'on peut faire sans payer, en une phrase.
 */
const GUIDES = {
  openai: {
    atouts: [
      'Le plus repandu : la plupart des tutoriels et des outils parlent son langage.',
      'Une gamme complete, du modele economique au modele de redaction.',
      'Les identifiants de modeles sont stables et bien documentes.'
    ],
    limites: [
      'Aucun palier gratuit : il faut crediter le compte avant le premier appel.',
      'Les tarifs sont dans la fourchette haute par rapport aux fournisseurs recents.'
    ],
    confidentialite: 'Ton CV part sur les serveurs d\'OpenAI (Etats-Unis). OpenAI annonce '
      + 'ne pas entrainer ses modeles sur les donnees envoyees par l\'API.',
    cle: {
      etapes: [
        'Cree un compte sur platform.openai.com.',
        'Ajoute un moyen de paiement et credite le compte (5 $ suffisent largement).',
        'Ouvre « API keys » puis « Create new secret key ».',
        'Copie la cle IMMEDIATEMENT : elle ne sera plus jamais reaffichee.'
      ],
      urlTarifs: 'https://openai.com/api/pricing',
      carteBancaire: true,
      pourEssayer: 'Rien de gratuit. Compte quelques centimes par lettre : 5 $ durent longtemps.'
    }
  },

  anthropic: {
    atouts: [
      'Reputee pour la qualite de redaction en francais : c\'est ce que Mew demande le plus.',
      'Des fenetres de contexte tres larges : un CV et une offre entiers passent sans souci.',
      'Une gamme lisible : Opus pour ecrire, Sonnet pour tout faire, Haiku pour aller vite.'
    ],
    limites: [
      'Aucun palier gratuit sur l\'API (l\'abonnement claude.ai ne donne PAS de cle API).',
      'Format d\'API different d\'OpenAI : sans importance dans Mew, qui a son propre adaptateur.'
    ],
    confidentialite: 'Ton CV part sur les serveurs d\'Anthropic (Etats-Unis). Anthropic annonce '
      + 'ne pas entrainer ses modeles sur les donnees envoyees par l\'API.',
    cle: {
      etapes: [
        'Cree un compte sur console.anthropic.com.',
        'Ouvre « Plans & Billing » et achete un premier credit (5 $ suffisent).',
        'Va dans « API keys » puis « Create Key ».',
        'Copie la cle : elle commence par sk-ant- et ne sera plus reaffichee.'
      ],
      urlTarifs: 'https://www.anthropic.com/pricing',
      carteBancaire: true,
      pourEssayer: 'Un abonnement claude.ai ne suffit pas : la cle API se paie separement.'
    }
  },

  google: {
    atouts: [
      'Un palier gratuit reellement utilisable : de quoi tester Mew sans sortir de carte.',
      'Des fenetres de contexte enormes, meme sur les modeles economiques.',
      'La cle s\'obtient en deux clics depuis AI Studio, sans moyen de paiement.'
    ],
    limites: [
      'Sur le palier gratuit, Google se sert des requetes pour ameliorer ses produits.',
      'Les limites de debit du palier gratuit se rencontrent vite si tu enchaines.',
      'Les noms de modeles changent souvent, et les versions « preview » disparaissent.'
    ],
    confidentialite: 'ATTENTION : sur le palier GRATUIT, Google se reserve le droit de faire '
      + 'relire les echanges par des humains et de s\'en servir pour ameliorer ses modeles. '
      + 'N\'y envoie pas un CV que tu ne montrerais pas a un inconnu. Le palier payant, lui, '
      + 'est couvert par les engagements habituels.',
    cle: {
      etapes: [
        'Va sur aistudio.google.com/apikey avec un compte Google.',
        'Clique « Create API key » et choisis un projet (ou laisse-le en creer un).',
        'Copie la cle : elle commence par AIza.'
      ],
      urlTarifs: 'https://ai.google.dev/pricing',
      carteBancaire: false,
      pourEssayer: 'Gratuit d\'emblee, avec des limites de debit — mais lis la ligne '
        + 'confidentialite avant d\'y envoyer ton vrai CV.'
    }
  },

  mistral: {
    atouts: [
      'Fournisseur francais : donnees hebergees en Europe, RGPD applique de plein droit.',
      'Tres bon en francais, ce qui compte pour une lettre de motivation.',
      'Un palier gratuit existe pour experimenter.'
    ],
    limites: [
      'Fenetres de contexte plus petites que la concurrence (128 000 tokens).',
      'Catalogue plus reduit : moins de choix entre « pas cher » et « tres bon ».'
    ],
    confidentialite: 'Ton CV reste en Europe. C\'est le meilleur compromis si tu veux de la '
      + 'qualite en ligne sans envoyer tes donnees hors de l\'Union europeenne.',
    cle: {
      etapes: [
        'Cree un compte sur console.mistral.ai.',
        'Ouvre « API Keys » puis « Create new key ».',
        'Le palier gratuit s\'active sans carte ; le payant en demande une.'
      ],
      urlTarifs: 'https://mistral.ai/pricing',
      carteBancaire: false,
      pourEssayer: 'Palier gratuit disponible, limite en debit.'
    }
  },

  deepseek: {
    atouts: [
      'Parmi les tarifs les plus bas du marche, de tres loin.',
      'Des fenetres de contexte tres larges malgre le prix.',
      'Compatible OpenAI : rien de particulier a regler.'
    ],
    limites: [
      'Serveurs en Chine : c\'est le point a peser avant tout le reste.',
      'Le francais est correct mais moins fluide que chez les fournisseurs europeens ou americains.',
      'Les noms de modeles ont deja change sans preavis.'
    ],
    confidentialite: 'ATTENTION : ton CV part sur des serveurs situes en Chine, hors RGPD. '
      + 'Un CV contient ton nom, ton adresse, ton telephone et ton parcours. A eviter si ces '
      + 'informations te semblent sensibles.',
    cle: {
      etapes: [
        'Cree un compte sur platform.deepseek.com.',
        'Credite le compte (le minimum est tres bas).',
        'Ouvre « API keys » puis cree une cle.'
      ],
      urlTarifs: 'https://api-docs.deepseek.com/quick_start/pricing',
      carteBancaire: true,
      pourEssayer: 'Pas de palier gratuit, mais quelques euros durent tres longtemps.'
    }
  },

  openrouter: {
    atouts: [
      'UNE seule cle pour des centaines de modeles de tous les editeurs.',
      'Idealement place pour comparer : change de modele sans recreer de compte.',
      'Quelques modeles gratuits sont accessibles pour tester.'
    ],
    limites: [
      'Une petite commission s\'ajoute au tarif de l\'editeur.',
      'Tes requetes transitent par un intermediaire de plus.',
      'La liste est si longue qu\'elle peut donner le vertige : sers-toi de la recherche.'
    ],
    confidentialite: 'Ton CV passe par OpenRouter PUIS par l\'editeur du modele choisi. Deux '
      + 'entreprises le voient au lieu d\'une. OpenRouter permet de refuser les fournisseurs '
      + 'qui conservent les donnees, depuis les reglages de ton compte.',
    cle: {
      etapes: [
        'Cree un compte sur openrouter.ai.',
        'Credite-le (quelques dollars suffisent) — ou reste sur les modeles gratuits.',
        'Ouvre « Keys » puis « Create Key ». La cle commence par sk-or-.'
      ],
      urlTarifs: 'https://openrouter.ai/models',
      carteBancaire: false,
      pourEssayer: 'Des modeles gratuits existent, en debit limite. Parfait pour comparer.'
    }
  },

  moonshot: {
    atouts: [
      'Tres bon rapport qualite/prix sur la redaction.',
      'Fenetres de contexte tres larges.'
    ],
    limites: [
      'Serveurs en Chine.',
      'Les noms de modeles changent souvent : utilise « Chercher les modeles disponibles ».'
    ],
    confidentialite: 'Ton CV part sur des serveurs situes en Chine, hors RGPD.',
    cle: {
      etapes: [
        'Cree un compte sur platform.moonshot.ai.',
        'Credite le compte, puis ouvre la console « API keys ».'
      ],
      urlTarifs: 'https://platform.moonshot.ai/docs/pricing',
      carteBancaire: true,
      pourEssayer: 'Un petit credit de bienvenue est parfois offert a l\'inscription.'
    }
  },

  xai: {
    atouts: [
      'Fenetres de contexte tres larges.',
      'Compatible OpenAI, rien de particulier a regler.'
    ],
    limites: [
      'Le tarif double au-dela de 200 000 tokens envoyes (sans effet sur un CV).',
      'Ecosysteme plus jeune, moins de documentation en francais.'
    ],
    confidentialite: 'Ton CV part sur les serveurs de xAI (Etats-Unis).',
    cle: {
      etapes: [
        'Cree un compte sur console.x.ai.',
        'Credite-le, puis genere une cle (elle commence par xai-).'
      ],
      urlTarifs: 'https://x.ai/api',
      carteBancaire: true,
      pourEssayer: 'Des credits d\'essai sont proposes de temps a autre.'
    }
  },

  groq: {
    atouts: [
      'Reponses quasi instantanees : c\'est sa raison d\'etre.',
      'Tarifs tres bas, et un palier gratuit pour essayer.',
      'Heberge des modeles ouverts, dont les poids sont publics.'
    ],
    limites: [
      'Le palier gratuit est vite limite en debit.',
      'Pas de modele « haut de gamme » proprietaire : la redaction est bonne, pas exceptionnelle.'
    ],
    confidentialite: 'Ton CV part sur les serveurs de Groq (Etats-Unis). Les modeles sont '
      + 'ouverts, mais l\'hebergeur voit quand meme tes requetes.',
    cle: {
      etapes: [
        'Cree un compte sur console.groq.com.',
        'Ouvre « API Keys » puis « Create API Key ». La cle commence par gsk_.'
      ],
      urlTarifs: 'https://groq.com/pricing',
      carteBancaire: false,
      pourEssayer: 'Palier gratuit immediat, sans carte. Le plus rapide pour tester Mew en ligne.'
    }
  },

  together: {
    atouts: [
      'Large choix de modeles ouverts, souvent moins chers que chez leur editeur.',
      'Compatible OpenAI.'
    ],
    limites: [
      'Les identifiants gardent le prefixe de l\'editeur (« moonshotai/... ») : facile a se tromper.',
      'Pas de palier gratuit permanent.'
    ],
    confidentialite: 'Ton CV part sur les serveurs de Together AI (Etats-Unis).',
    cle: {
      etapes: [
        'Cree un compte sur together.ai.',
        'Ouvre les reglages puis « API Keys ».'
      ],
      urlTarifs: 'https://www.together.ai/pricing',
      carteBancaire: true,
      pourEssayer: 'Un credit de bienvenue est generalement offert a l\'inscription.'
    }
  },

  fireworks: {
    atouts: [
      'Modeles ouverts servis rapidement, tarifs contenus.',
      'Compatible OpenAI.'
    ],
    limites: [
      'Les identifiants commencent tous par « fireworks/ » ou « accounts/ » : a copier a l\'exact.',
      'Plutot destine aux developpeurs : l\'interface est moins accueillante.'
    ],
    confidentialite: 'Ton CV part sur les serveurs de Fireworks AI (Etats-Unis).',
    cle: {
      etapes: [
        'Cree un compte sur fireworks.ai.',
        'Ouvre « Account » puis « API Keys ». La cle commence par fw_.'
      ],
      urlTarifs: 'https://fireworks.ai/pricing',
      carteBancaire: true,
      pourEssayer: 'Un credit de bienvenue est generalement offert.'
    }
  },

  cerebras: {
    atouts: [
      'Vitesse remarquable, du meme ordre que Groq.',
      'Un palier gratuit quotidien, sans carte bancaire.'
    ],
    limites: [
      'Catalogue tres mouvant : des modeles en preview disparaissent sans preavis.',
      'Peu de modeles disponibles a un instant donne.'
    ],
    confidentialite: 'Ton CV part sur les serveurs de Cerebras (Etats-Unis).',
    cle: {
      etapes: [
        'Cree un compte sur cloud.cerebras.ai.',
        'Genere une cle depuis le tableau de bord (elle commence par csk-).',
        'Dans Mew, clique « Chercher les modeles disponibles » : la liste bouge souvent.'
      ],
      urlTarifs: 'https://www.cerebras.ai/pricing',
      carteBancaire: false,
      pourEssayer: 'Palier gratuit quotidien, immediat.'
    }
  },

  ollama: {
    atouts: [
      'Entierement gratuit : aucune facture, aucune cle, aucune limite de debit.',
      'Ton CV ne quitte JAMAIS ton ordinateur. C\'est l\'option la plus respectueuse.',
      'Installation en une commande, et des dizaines de modeles a telecharger.'
    ],
    limites: [
      'La qualite de redaction est en dessous des grands modeles en ligne.',
      'Il faut une machine correcte : compte 8 Go de RAM libre pour un modele de 7 a 8 milliards.',
      'C\'est plus lent, surtout sans carte graphique dediee.',
      'Ollama doit etre lance pour que Mew puisse s\'en servir.'
    ],
    confidentialite: 'Rien ne sort de ta machine. Aucun serveur, aucune entreprise, aucun '
      + 'journal ailleurs que chez toi. Si ton CV te parait sensible, c\'est ce qu\'il te faut.',
    cle: {
      etapes: [
        'Installe Ollama depuis ollama.com (Windows, macOS et Linux).',
        'Ouvre un terminal et tape : ollama pull llama3.1:8b',
        'Verifie qu\'Ollama tourne (icone dans la barre des taches).',
        'Dans Mew, clique « Chercher les modeles disponibles » : aucune cle a saisir.'
      ],
      urlTarifs: 'https://ollama.com/library',
      carteBancaire: false,
      pourEssayer: 'Gratuit et illimite, pour toujours. Seule ta machine travaille.'
    }
  },

  lmstudio: {
    atouts: [
      'Gratuit, et ton CV ne quitte pas ton ordinateur.',
      'Interface graphique : on choisit et telecharge ses modeles a la souris, sans terminal.',
      'Affiche clairement si un modele tient dans la memoire de ta machine.'
    ],
    limites: [
      'Le serveur local n\'est pas actif par defaut : il faut l\'allumer.',
      'Meme limite de qualite et de vitesse que tout modele local.'
    ],
    confidentialite: 'Rien ne sort de ta machine.',
    cle: {
      etapes: [
        'Installe LM Studio depuis lmstudio.ai.',
        'Telecharge un modele depuis l\'onglet de recherche.',
        'Ouvre l\'onglet « Developer » et demarre le serveur local (port 1234).',
        'Dans Mew, clique « Chercher les modeles disponibles ».'
      ],
      urlTarifs: 'https://lmstudio.ai',
      carteBancaire: false,
      pourEssayer: 'Gratuit et illimite. Le plus simple des deux si le terminal te rebute.'
    }
  },

  llamacpp: {
    atouts: [
      'Gratuit, local, et le plus leger des trois : il tourne sur de petites machines.',
      'Controle total sur les reglages du modele.'
    ],
    limites: [
      'Reserve a qui est a l\'aise avec le terminal : il faut lancer llama-server a la main.',
      'Aucune interface : le telechargement des modeles est a ta charge.'
    ],
    confidentialite: 'Rien ne sort de ta machine.',
    cle: {
      etapes: [
        'Installe llama.cpp, puis lance : llama-server -m ton-modele.gguf --port 8080',
        'Verifie l\'adresse dans Mew si tu as choisi un autre port.'
      ],
      urlTarifs: 'https://github.com/ggml-org/llama.cpp',
      carteBancaire: false,
      pourEssayer: 'Gratuit et illimite.'
    }
  },

  personnalise: {
    atouts: [
      'La porte de sortie : n\'importe quelle adresse compatible OpenAI fonctionne.',
      'Utile pour un proxy d\'entreprise, un fournisseur absent du catalogue, un serveur perso.'
    ],
    limites: [
      'Mew ne connait ni les tarifs ni les modeles : aucun cout ne sera estime.',
      'C\'est a toi de saisir l\'adresse exacte et l\'identifiant exact du modele.'
    ],
    confidentialite: 'Cela depend entierement du service que tu indiques. Tu es le seul a '
      + 'savoir ou vont tes donnees.',
    cle: {
      etapes: [
        'Recupere l\'adresse de l\'API du service (elle finit generalement par /v1).',
        'Colle-la dans le champ adresse, ajoute une cle si le service en demande une.',
        'Clique « Chercher les modeles disponibles » pour verifier que ca repond.'
      ],
      urlTarifs: null,
      carteBancaire: false,
      pourEssayer: 'Depend du service choisi.'
    }
  }
};

module.exports = { MISE_EN_AVANT, GUIDES };
