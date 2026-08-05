/**
 * LES TACHES CONFIEES A UN MODELE, ET L'OUTIL AUQUEL CHACUNE APPARTIENT.
 *
 * POURQUOI CE FICHIER EXISTE
 * Jusqu'ici Mew ne connaissait que deux ROLES (« redaction », « extraction »).
 * C'etait assez pour choisir un modele cher et un modele economique, mais pas
 * pour repondre a la vraie demande : « je veux que tel modele lise mes CV et
 * que tel autre redige mes lettres ». Une tache est plus fine qu'un role : elle
 * designe UN point d'appel precis dans le code, donc quelque chose que
 * l'utilisateur peut reconnaitre dans l'interface.
 *
 * C'est aussi ce fichier qui permet de dire, outil par outil, ce qui est
 * CALCULE PAR LE CODE et ce qui est REDIGE PAR UN MODELE — la distinction qui
 * structure tout le projet (voir CLAUDE.md).
 *
 * C'EST DE LA DONNEE, PAS DU CODE. Ajouter une tache, c'est copier une entree
 * puis passer `tache: '<id>'` a l'appel d'aiService correspondant.
 *
 * ATTENTION : `id` est ecrit dans backend/data/config-ia.json. Le renommer
 * ferait perdre son reglage a l'utilisateur (la tache retomberait sur le
 * modele par defaut). Si vous devez le faire, prevoyez une reprise dans
 * llm/config/schema.js.
 */

/**
 * Les cinq outils de Mew.
 *
 *   local  : ce que le code calcule tout seul, sans jamais appeler personne.
 *            C'est ce qui continue de fonctionner quand l'IA est coupee, et ce
 *            que l'interface affiche pour rassurer : couper l'IA ne vide pas
 *            l'outil, ca lui retire seulement sa partie redigee.
 */
const OUTILS = [
  {
    id: 'analyse-cv',
    nom: 'Analyseur de CV',
    href: '/solutions/analyse-cv',
    resume: 'Lit ton CV et propose les metiers qui correspondent a ton parcours.',
    local: [
      'lecture du PDF et decoupage en sections',
      'extraction des competences, des dates et du contact',
      'correspondance avec le referentiel ROME',
      'score de correspondance par metier'
    ]
  },
  {
    id: 'optimiseur-cv',
    nom: 'Optimiseur de CV',
    href: '/solutions/optimiseur-cv',
    resume: 'Note ton CV face aux logiciels de tri (ATS) et detaille chaque critere.',
    local: [
      'score ATS sur 100, critere par critere',
      'points forts et axes d\'amelioration',
      'detail du calcul, verifiable ligne a ligne'
    ]
  },
  {
    id: 'matcher-offres',
    nom: 'Matcher d\'Offres',
    href: '/solutions/matcher-offres',
    resume: 'Adapte ton CV a une offre precise et decouvre les offres qui te vont.',
    local: [
      'lecture de l\'offre (JSON-LD, balises, heuristique)',
      'score de correspondance CV / offre',
      'competences presentes et competences manquantes',
      'recherche d\'offres France Travail et Welcome to the Jungle'
    ]
  },
  {
    id: 'candidature-spontanee',
    nom: 'Candidature Spontanee',
    href: '/solutions/candidature-spontanee',
    resume: 'Redige un email d\'approche et l\'envoie avec ton CV en piece jointe.',
    local: [
      'envoi de l\'email et piece jointe',
      'enregistrement dans le suivi de candidatures'
    ]
  },
  {
    id: 'suivi',
    nom: 'Suivi de Candidatures',
    href: '/solutions/matcher-offres',
    resume: 'Garde la trace de tes candidatures et te rappelle quand relancer.',
    local: [
      'statuts, dates et notes',
      'calcul des relances en jours ouvres (feries compris)',
      'statistiques de reponse'
    ]
  }
];

/**
 * Les taches confiees a un modele.
 *
 *   role     : le role historique, garde comme repli. Quand une tache n'a pas
 *              de modele choisi, on retombe sur le modele de ce role — c'est
 *              ce qui fait qu'une installation existante continue de marcher
 *              sans que personne n'ait rien a regler.
 *   sansIa   : ce qui se passe quand l'utilisateur coupe cette tache. Affiche
 *              tel quel dans l'interface : il doit etre exact, pas rassurant.
 *   obligatoire : true quand l'outil n'a plus rien a offrir sans cette tache.
 *              L'interface le dit au lieu de laisser croire a un mode degrade
 *              qui n'existe pas.
 */
const TACHES = [
  {
    id: 'cv-optimise',
    outil: 'optimiseur-cv',
    nom: 'Reecrire le CV optimise',
    role: 'extraction',
    description: 'Reprend ton CV et le reecrit en tenant compte des axes d\'amelioration '
      + 'trouves par le calcul. Un seul appel.',
    sansIa: 'Le score ATS et le detail des criteres restent calcules. Tu n\'as plus la '
      + 'version reecrite : les axes d\'amelioration restent applicables a la main.',
    obligatoire: false
  },
  {
    id: 'profil-cv',
    outil: 'matcher-offres',
    nom: 'Sortir ton profil d\'un CV PDF',
    role: 'extraction',
    description: 'Lit un CV en PDF et en tire un profil structure (metier, competences, '
      + 'experience) qui sert ensuite au calcul de correspondance.',
    sansIa: 'Les modes qui partent d\'un PDF ne peuvent plus deviner ton profil. Le mode '
      + 'saisie manuelle, lui, fonctionne entierement sans modele.',
    obligatoire: false
  },
  {
    id: 'cv-adapte',
    outil: 'matcher-offres',
    nom: 'Adapter ton CV a une offre',
    role: 'redaction',
    description: 'Reformule ton CV pour qu\'il reponde a une offre precise. C\'est un texte '
      + 'que lira un recruteur.',
    sansIa: 'Le score de correspondance, les competences presentes et les competences '
      + 'manquantes restent calcules. Le CV reformule n\'est plus propose.',
    obligatoire: false
  },
  {
    id: 'lettre',
    outil: 'matcher-offres',
    nom: 'Rediger la lettre de motivation',
    role: 'redaction',
    description: 'Ecrit la lettre a partir de ton profil et de l\'offre. C\'est ce que lira '
      + 'un recruteur : c\'est la tache ou la qualite du modele se voit le plus.',
    sansIa: 'Aucune lettre n\'est proposee. Le reste du matcher fonctionne normalement.',
    obligatoire: false
  },
  {
    id: 'email-spontane',
    outil: 'candidature-spontanee',
    nom: 'Rediger l\'email de candidature spontanee',
    role: 'redaction',
    description: 'Ecrit l\'objet et le corps de l\'email d\'approche envoye a une entreprise '
      + 'qui ne recrute pas ouvertement.',
    sansIa: 'Cet outil n\'a que ca a offrir : sans modele, il ne peut rien rediger. '
      + 'Tu peux toujours ecrire l\'email toi-meme et l\'envoyer avec ton CV joint.',
    obligatoire: true
  }
];

/* ------------------------------------------------------------------ */
/* Gel et acces                                                        */
/* ------------------------------------------------------------------ */

// Meme raison que dans le catalogue : ce module est un singleton charge une
// fois pour toute la duree du serveur.
const geler = (valeur) => {
  if (valeur && typeof valeur === 'object' && !Object.isFrozen(valeur)) {
    Object.freeze(valeur);
    Object.values(valeur).forEach(geler);
  }
  return valeur;
};

geler(OUTILS);
geler(TACHES);

/** Tous les identifiants de taches, dans l'ordre d'affichage. */
const IDS = Object.freeze(TACHES.map((t) => t.id));

/**
 * Une tache par son identifiant. Ne leve jamais : l'identifiant peut venir du
 * navigateur ou d'un fichier de reglages edite a la main.
 *
 * @param {string} id
 * @returns {object|null}
 */
function tache(id) {
  if (typeof id !== 'string') return null;
  return TACHES.find((t) => t.id === id) || null;
}

/**
 * Le role historique d'une tache, utilise comme repli quand aucun modele n'a
 * ete choisi pour elle. Une tache inconnue vaut « extraction », le choix
 * economique — jamais « redaction », qui coute cher.
 *
 * @param {string} id
 * @returns {'redaction'|'extraction'}
 */
function roleDe(id) {
  const t = tache(id);
  return t && t.role === 'redaction' ? 'redaction' : 'extraction';
}

/** Les taches d'un outil, dans l'ordre. @returns {Array<object>} */
function tachesDeLOutil(idOutil) {
  if (typeof idOutil !== 'string') return [];
  return TACHES.filter((t) => t.outil === idOutil);
}

module.exports = { OUTILS, TACHES, IDS, tache, roleDe, tachesDeLOutil };
