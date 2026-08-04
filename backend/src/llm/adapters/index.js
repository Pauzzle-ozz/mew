/**
 * Repartiteur d'adaptateurs.
 *
 * POURQUOI CE FICHIER EXISTE
 * Le catalogue des fournisseurs (llm/providers/catalogue.js) ne connait des
 * adaptateurs que leur NOM : `adaptateur: "openai-compatible"`. C'est ici
 * qu'un nom devient du code executable. Le reste du projet n'a donc jamais
 * besoin de savoir quel fichier implemente quel fournisseur.
 *
 * DEUX PRECAUTIONS
 *
 * 1. Chargement PARESSEUX. Chaque adaptateur est derriere une fonction, pas
 *    derriere un `require` direct. Un fichier absent ou casse ne doit pas
 *    empecher le module de se charger — donc pas empecher le serveur de
 *    demarrer. C'est un invariant du projet : Mew demarre toujours, meme sans
 *    la moindre configuration.
 *
 * 2. Erreurs en francais. Si un adaptateur manque, l'utilisateur lit une
 *    phrase qu'il comprend, pas une trace de pile « Cannot find module ».
 */

/**
 * Le registre. Les cles sont les valeurs possibles du champ `adaptateur`
 * d'une entree de catalogue.
 */
const ADAPTATEURS = {
  'openai-compatible': () => require('./openaiCompatible'),
  anthropic: () => require('./anthropic'),
  google: () => require('./google')
};

// Un adaptateur charge est conserve : `require` a deja son propre cache, mais
// on evite aussi de refaire la verification de forme a chaque appel.
const charges = new Map();

function erreurRepartiteur(message) {
  const erreur = new Error(message);
  // Aucun des six codes du contrat ne decrit « le code manque » : c'est un
  // probleme d'installation, pas un probleme de fournisseur. FOURNISSEUR est
  // le fourre-tout prevu pour « tout le reste ».
  erreur.code = 'FOURNISSEUR';
  return erreur;
}

/**
 * Un module ne merite le nom d'adaptateur que s'il honore le contrat.
 * Mieux vaut le dire ici, clairement, que de planter plus tard sur un
 * « completer is not a function ».
 */
function verifierForme(module, id) {
  if (!module || typeof module !== 'object') {
    throw erreurRepartiteur(`L'adaptateur « ${id} » est installe mais ne renvoie rien d'utilisable.`);
  }
  if (typeof module.completer !== 'function') {
    throw erreurRepartiteur(`L'adaptateur « ${id} » est incomplet : il ne sait pas envoyer de requete au modele.`);
  }
  if (typeof module.listerModeles !== 'function') {
    throw erreurRepartiteur(`L'adaptateur « ${id} » est incomplet : il ne sait pas lister les modeles.`);
  }
  return module;
}

/**
 * Rend l'adaptateur correspondant a un identifiant.
 *
 * @param {string} id  ex. « openai-compatible », « anthropic », « google »
 * @returns {{id: string, completer: Function, listerModeles: Function}}
 * @throws {Error} avec .code = 'FOURNISSEUR' et un message en francais
 */
function adaptateur(id) {
  const cle = typeof id === 'string' ? id.trim() : '';

  if (charges.has(cle)) return charges.get(cle);

  // hasOwnProperty : sans lui, adaptateur('constructor') remonterait une
  // fonction heritee d'Object.prototype et on croirait avoir trouve quelque chose.
  if (!Object.prototype.hasOwnProperty.call(ADAPTATEURS, cle)) {
    throw erreurRepartiteur(
      `Le type de connexion « ${cle || '(vide)'} » est inconnu. `
      + `Types disponibles : ${adaptateursDisponibles().join(', ')}.`
    );
  }

  let module;
  try {
    module = ADAPTATEURS[cle]();
  } catch (erreur) {
    // On n'expose jamais l'erreur brute : elle parle anglais et cite des
    // chemins de fichiers qui n'aident personne.
    const cause = erreurRepartiteur(
      `Le connecteur « ${cle} » n'est pas installe dans cette version de Mew. `
      + 'Choisis un autre fournisseur en attendant.'
    );
    cause.detail = erreur && typeof erreur.message === 'string' ? erreur.message.slice(0, 200) : '';
    throw cause;
  }

  const valide = verifierForme(module, cle);
  charges.set(cle, valide);
  return valide;
}

/**
 * Les identifiants d'adaptateurs connus du projet.
 *
 * On liste ce qui est DECLARE, sans rien charger : cette fonction sert entre
 * autres a composer le message d'erreur ci-dessus, elle doit rester sans
 * effet de bord et incapable d'echouer.
 *
 * @returns {string[]}
 */
function adaptateursDisponibles() {
  return Object.keys(ADAPTATEURS);
}

module.exports = { adaptateur, adaptateursDisponibles };
