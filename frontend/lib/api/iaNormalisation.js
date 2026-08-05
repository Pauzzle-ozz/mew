/**
 * MISE EN FORME DE CE QUE RENVOIE /api/ia.
 *
 * POURQUOI CE FICHIER EXISTE, SEPARE DE iaApi.js
 * iaApi.js s'occupe du transport : appeler, traduire une panne reseau en
 * phrase lisible, deballer { success, data }. Ce fichier-ci s'occupe de la
 * FORME : accepter plusieurs ecritures plausibles d'un meme renseignement et
 * n'en rendre qu'une seule au reste de l'interface.
 *
 * LA REGLE QUI GOUVERNE TOUT ICI
 * Une difference de nommage entre les deux moities du projet doit couter un
 * champ manquant, jamais un ecran vide. On ne rejette rien, on complete : un
 * tarif absent devient `null` (affiche « tarif inconnu »), jamais NaN ; une
 * liste absente devient `[]`, jamais undefined.
 *
 * ET LA CLE, ELLE, NE PASSE JAMAIS. Le backend n'envoie qu'une version
 * masquee ; masquerParPrudence re-masque tout ce qui arriverait entier.
 */

/** Chaine non vide, ou null. Evite les « undefined » affiches dans l'interface. */
export const texte = (valeur) => (
  typeof valeur === 'string' && valeur.trim() !== '' ? valeur.trim() : null
);

/** Nombre fini, ou null. Un prix absent ne doit pas devenir NaN a l'ecran. */
export const nombre = (valeur) => {
  const n = Number(valeur);
  return Number.isFinite(n) ? n : null;
};

/** Une liste de phrases, debarrassee de ce qui n'en est pas. */
const phrases = (valeur) => (
  Array.isArray(valeur) ? valeur.map(texte).filter(Boolean) : []
);

/**
 * Re-masque une cle qui arriverait entiere.
 *
 * Le backend masque deja. Ce filet sert au cas ou : une cle affichee en clair
 * dans une page ouverte au bureau, c'est une cle compromise. On garde le debut
 * (il identifie le fournisseur) et la fin (il identifie la cle), on efface le
 * milieu.
 */
export function masquerParPrudence(valeur) {
  const brut = texte(valeur);
  if (!brut) return null;

  // Deja masquee par le backend : on n'y touche pas.
  if (/\.\.\.|…|\*{2,}|•{2,}/.test(brut)) return brut;

  // Trop courte pour etre une vraie cle : probablement deja un resume.
  if (brut.length <= 12) return brut;

  return `${brut.slice(0, 5)}...${brut.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/* Le catalogue                                                        */
/* ------------------------------------------------------------------ */

/**
 * Ce qu'on sait dire d'un modele en dehors de ses chiffres : ses atouts, ses
 * limites, a qui il s'adresse. Absent pour la plupart des modeles decouverts
 * en direct — l'interface se rabat alors sur les faits du catalogue, ce qui
 * reste honnete.
 */
function normaliserNote(brut) {
  if (!brut || typeof brut !== 'object') return null;

  const note = {
    resume: texte(brut.resume),
    atouts: phrases(brut.atouts),
    limites: phrases(brut.limites),
    pourQui: texte(brut.pourQui),
  };

  // Une note entierement vide vaut mieux absente : elle ferait afficher un
  // encadre sans rien dedans.
  const vide = !note.resume && !note.pourQui
    && note.atouts.length === 0 && note.limites.length === 0;
  return vide ? null : note;
}

/**
 * Un modele du catalogue, dans la forme attendue par l'interface.
 * `entree`, `sortie` et `contexte` valent null quand on ne les connait pas :
 * c'est le cas des modeles decouverts en direct chez Ollama ou OpenRouter.
 * L'interface affiche alors « tarif inconnu » plutot qu'un faux zero.
 */
export function normaliserModele(brut) {
  if (!brut) return null;

  // Le listage en direct peut renvoyer une simple liste de chaines.
  if (typeof brut === 'string') {
    return { id: brut, nom: brut, entree: null, sortie: null, contexte: null, roles: [], note: null };
  }

  const id = texte(brut.id) || texte(brut.modele) || texte(brut.name);
  if (!id) return null;

  return {
    id,
    nom: texte(brut.nom) || texte(brut.name) || id,
    entree: nombre(brut.entree),
    sortie: nombre(brut.sortie),
    contexte: nombre(brut.contexte),
    roles: Array.isArray(brut.roles) ? brut.roles.filter((r) => typeof r === 'string') : [],
    note: normaliserNote(brut.note),
  };
}

/**
 * Le guide d'un fournisseur : ce qui aide a CHOISIR, par opposition a ce qui
 * sert a appeler. Les limites ne sont pas facultatives — un guide qui ne dit
 * que du bien n'aide personne.
 */
function normaliserGuide(brut) {
  if (!brut || typeof brut !== 'object') return null;
  const cle = (brut.cle && typeof brut.cle === 'object') ? brut.cle : {};

  return {
    atouts: phrases(brut.atouts),
    limites: phrases(brut.limites),
    confidentialite: texte(brut.confidentialite),
    cle: {
      etapes: phrases(cle.etapes),
      urlTarifs: texte(cle.urlTarifs),
      carteBancaire: cle.carteBancaire === true,
      pourEssayer: texte(cle.pourEssayer),
    },
  };
}

export function normaliserFournisseur(brut) {
  const id = texte(brut && brut.id);
  if (!id) return null;

  return {
    id,
    nom: texte(brut.nom) || id,
    adaptateur: texte(brut.adaptateur) || 'openai-compatible',
    baseURL: texte(brut.baseURL) || texte(brut.baseUrl),
    // Par defaut on suppose qu'une cle est demandee : c'est le cas le plus
    // frequent, et se tromper dans ce sens fait au pire afficher un champ
    // inutile, alors que l'inverse cacherait un champ indispensable.
    cleRequise: brut.cleRequise !== false,
    urlCle: texte(brut.urlCle),
    prefixeCle: texte(brut.prefixeCle),
    local: brut.local === true,
    paliergratuit: brut.paliergratuit === true || brut.palierGratuit === true,
    listageDynamique: brut.listageDynamique === true,
    note: texte(brut.note) || '',
    // Les fournisseurs mis en avant sont montres d'emblee ; les autres
    // attendent derriere « voir les autres ». Sans l'information, on met tout
    // en avant : mieux vaut une liste trop longue qu'un fournisseur invisible.
    enAvant: brut.enAvant !== false,
    guide: normaliserGuide(brut.guide),
    modeles: (Array.isArray(brut.modeles) ? brut.modeles : []).map(normaliserModele).filter(Boolean),
  };
}

/* ------------------------------------------------------------------ */
/* Les outils et les taches                                            */
/* ------------------------------------------------------------------ */

/** Un outil de Mew, et ce qu'il calcule TOUT SEUL, sans appeler personne. */
export function normaliserOutil(brut) {
  const id = texte(brut && brut.id);
  if (!id) return null;

  return {
    id,
    nom: texte(brut.nom) || id,
    href: texte(brut.href),
    resume: texte(brut.resume) || '',
    local: phrases(brut.local),
  };
}

/** Un point ou Mew appelle un modele. */
export function normaliserTache(brut) {
  const id = texte(brut && brut.id);
  if (!id) return null;

  return {
    id,
    outil: texte(brut.outil) || '',
    nom: texte(brut.nom) || id,
    role: brut.role === 'redaction' ? 'redaction' : 'extraction',
    description: texte(brut.description) || '',
    // Ce qui reste quand on coupe l'IA pour cette tache. Affiche tel quel :
    // il doit etre exact, pas rassurant.
    sansIa: texte(brut.sansIa) || '',
    obligatoire: brut.obligatoire === true,
  };
}

/* ------------------------------------------------------------------ */
/* L'etat enregistre                                                   */
/* ------------------------------------------------------------------ */

/**
 * D'ou vient la configuration reellement utilisee par le backend.
 *
 * `verrouilleParEnv` est le champ important : quand backend/.env impose une
 * cle, tout ce que l'utilisateur enregistre ici reste sans effet. Le lui
 * cacher serait le pire des scenarios — il changerait de modele, verrait
 * « enregistre », et rien ne bougerait.
 */
export function normaliserSource(brut) {
  if (!brut || typeof brut !== 'object') return null;

  return {
    source: texte(brut.source),                 // 'env' | 'fichier' | 'aucune'
    verrouilleParEnv: brut.verrouilleParEnv === true,
    active: brut.active === true,
    note: texte(brut.note),
  };
}

/** Un acces enregistre. La cle n'y figure QUE masquee. */
function normaliserCompte(brut) {
  const fournisseur = texte(brut && brut.fournisseur);
  if (!fournisseur) return null;

  return {
    fournisseur,
    cleMasquee: masquerParPrudence(brut.cleMasquee || brut.cleApi),
    aUneCle: brut.aUneCle === true || brut.cleEnregistree === true || Boolean(texte(brut.cleMasquee)),
    baseURL: texte(brut.baseURL) || texte(brut.baseUrl),
    // Le backend a deja fait le raisonnement « Mew saurait-il s'en servir » :
    // le refaire ici serait risquer deux verdicts differents a l'ecran.
    utilisable: brut.utilisable === true,
  };
}

/** Le reglage d'une tache. */
function normaliserReglageTache(brut) {
  const objet = (brut && typeof brut === 'object') ? brut : {};
  return {
    // Une tache dont on ne sait rien est consideree comme allumee : on ne
    // coupe que ce que l'utilisateur a explicitement coupe.
    actif: objet.actif !== false,
    fournisseur: texte(objet.fournisseur) || '',
    modele: texte(objet.modele) || '',
    // Ce qui SERA reellement utilise, repli compris : permet d'ecrire
    // « suit ton reglage general (OpenAI) » au lieu d'un champ vide.
    fournisseurEffectif: texte(objet.fournisseurEffectif) || '',
    utilisable: objet.utilisable === true,
  };
}

/**
 * Tout l'etat enregistre : les acces et l'affectation des taches.
 *
 * @returns {{comptes: Array, taches: object, configure: boolean, source: object|null}}
 */
export function normaliserEtat(data) {
  const brut = (data && typeof data === 'object') ? data : {};
  const tachesBrutes = (brut.taches && typeof brut.taches === 'object') ? brut.taches : {};

  const taches = {};
  Object.keys(tachesBrutes).forEach((id) => {
    taches[id] = normaliserReglageTache(tachesBrutes[id]);
  });

  return {
    comptes: (Array.isArray(brut.comptes) ? brut.comptes : [])
      .map(normaliserCompte)
      .filter(Boolean),
    taches,
    configure: brut.configure === true,
    source: normaliserSource(brut.etat),
    avertissements: phrases(brut.avertissements),
  };
}

/* ------------------------------------------------------------------ */
/* Le test de connexion                                                */
/* ------------------------------------------------------------------ */

/** Met la reponse du test dans une forme unique, quelle que soit son ecriture. */
export function normaliserTest(data, okParDefaut) {
  const brut = data && typeof data === 'object' ? data : {};

  // Un avertissement peut arriver seul ou en liste (« format non respecte »,
  // « le modele a ajoute du texte autour »...).
  const avertissements = []
    .concat(brut.avertissement || [], brut.avertissements || [])
    .map(texte)
    .filter(Boolean);

  // Le backend nomme ce champ `coutEstime` (testConnexion.js) ; `cout` est
  // accepte au cas ou il serait renomme un jour.
  const brutCout = brut.coutEstime || brut.cout;
  const cout = brutCout && typeof brutCout === 'object'
    ? { eur: nombre(brutCout.eur), usd: nombre(brutCout.usd) }
    : null;

  const usage = brut.usage && typeof brut.usage === 'object'
    ? {
      tokensEntree: nombre(brut.usage.tokensEntree ?? brut.usage.prompt_tokens),
      tokensSortie: nombre(brut.usage.tokensSortie ?? brut.usage.completion_tokens),
    }
    : null;

  return {
    ok: brut.ok === undefined ? okParDefaut !== false : brut.ok === true,
    // Jusqu'ou le test est alle : 'connexion', 'authentification', 'format'.
    etape: texte(brut.etape),
    // LE champ decisif quand ok vaut true : le modele a repondu, mais a-t-il
    // respecte le format que Mew lui demande ? Un « non » ne bloque rien, il
    // annonce des lettres mal decoupees. Absent = on ne suppose pas le pire.
    suitLesConsignes: brut.suitLesConsignes !== false,
    latenceMs: nombre(brut.latenceMs ?? brut.latence ?? brut.dureeMs),
    cout,
    usage,
    modele: texte(brut.modele),
    avertissement: avertissements.length > 0 ? avertissements.join(' ') : null,
    message: texte(brut.message) || texte(brut.erreur),
    code: texte(brut.code),
  };
}
