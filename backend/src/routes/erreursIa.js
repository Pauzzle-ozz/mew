/**
 * Traduction des pannes du moteur d'IA en reponses HTTP comprehensibles.
 *
 * POURQUOI CE FICHIER
 * Chaque route repetait le meme bloc pour la seule erreur 429 (« trop de
 * requetes »). Toutes les autres finissaient en « Erreur serveur » : une
 * cle API refusee (401) donnait exactement le meme message qu'un bug, alors
 * que la correction tient en une ligne de .env. On perd des heures a
 * chercher un probleme que le serveur connaissait deja.
 *
 * On repond 503 dans tous les cas : le probleme vient du service d'IA ou de
 * sa configuration, pas de la requete de l'utilisateur. Le frontend affiche
 * le champ `error` tel quel, donc le message doit etre lisible par quelqu'un
 * qui ne programme pas.
 *
 * DEPUIS LE CHOIX LIBRE DU FOURNISSEUR
 * Les adaptateurs (src/llm/adapters/) levent des erreurs qui portent deja un
 * `.code` du contrat commun et un message en francais, redige pour un non
 * programmeur et DEJA MASQUE (aucune cle API ne s'y trouve). Pour ces
 * erreurs-la, on ne reecrit rien : on relaie le message et on ajoute
 * simplement ou aller le corriger. Reecrire nous ferait perdre le nom du
 * service et du modele, que l'adaptateur est le seul a connaitre.
 *
 * Les anciennes branches (statut HTTP brut du SDK OpenAI) restent en dessous :
 * elles servent encore au code qui n'est pas passe par un adaptateur.
 */

/** Ou l'utilisateur va corriger son choix de fournisseur et sa cle. */
const OU_CORRIGER = 'Ouvre l\'ecran Parametres de Mew pour verifier ton fournisseur, ta cle et ton modele.';

/**
 * Complement d'action a ajouter au message de l'adaptateur, par code.
 * Le message de l'adaptateur dit CE QUI s'est passe ; celui-ci dit QUOI FAIRE.
 */
const CONSEIL_PAR_CODE = {
  CLE_INVALIDE: OU_CORRIGER,
  QUOTA_DEPASSE: 'Recharge ton compte chez ce fournisseur, ou choisis-en un autre '
    + 'depuis l\'ecran Parametres (un modele local ne coute rien).',
  MODELE_INTROUVABLE: OU_CORRIGER,
  TIMEOUT: 'Reessaie dans un moment, ou choisis un modele plus rapide depuis l\'ecran Parametres.',
  RESEAU: 'Si ton modele tourne sur ta machine (Ollama, LM Studio), verifie qu\'il est bien demarre. '
    + 'Sinon, verifie ta connexion internet.',
  FOURNISSEUR: 'Si cela se reproduit, essaie un autre modele depuis l\'ecran Parametres.'
};

/**
 * @param {Object} res - la reponse Express
 * @param {Error} erreur - l'erreur attrapee
 * @returns {boolean} true si la reponse a ete envoyee (l'appelant s'arrete la)
 */
function repondreErreurIa(res, erreur) {
  if (!erreur) return false;

  const message = String(erreur.message || '');
  const code = typeof erreur.code === 'string' ? erreur.code : '';

  // Aucune cle configuree : l'erreur vient de notre propre code (aiService).
  if (code === 'IA_NON_CONFIGUREE') {
    res.status(503).json({ success: false, error: message, code });
    return true;
  }

  // Les six codes du contrat des adaptateurs. On relaie le message tel quel
  // (deja en francais, deja masque) en y ajoutant la marche a suivre.
  //
  // On ne renvoie JAMAIS erreur.detail : c'est le texte brut du fournisseur,
  // utile dans les journaux, mais ce n'est pas a montrer a l'utilisateur.
  if (Object.prototype.hasOwnProperty.call(CONSEIL_PAR_CODE, code)) {
    const conseil = CONSEIL_PAR_CODE[code];
    res.status(503).json({
      success: false,
      error: message ? `${message} ${conseil}` : conseil,
      code
    });
    return true;
  }

  // 401 : la cle existe mais le fournisseur la refuse (faute de frappe, cle
  // revoquee, espace en trop, cle d'un autre compte).
  if (erreur.status === 401 || code === 'invalid_api_key') {
    res.status(503).json({
      success: false,
      error: `La cle du moteur d'IA a ete refusee (401). ${OU_CORRIGER}`,
      code: 'CLE_INVALIDE'
    });
    return true;
  }

  // 403 : cle valide mais qui n'a pas le droit d'utiliser ce modele.
  if (erreur.status === 403) {
    res.status(503).json({
      success: false,
      error: 'Le moteur d\'IA refuse l\'acces a ce modele (403). Ton compte n\'y a '
        + `peut-etre pas droit. ${OU_CORRIGER}`,
      code: 'CLE_INVALIDE'
    });
    return true;
  }

  // Quota epuise : c'est un 429 chez OpenAI, mais reessayer n'y changera
  // rien — il faut recharger le compte. Le distinguer evite d'attendre pour rien.
  if (code === 'insufficient_quota' || erreur.status === 402
      || (erreur.status === 429 && /quota|billing/i.test(message))) {
    res.status(503).json({
      success: false,
      error: `Le credit de ton compte est epuise. ${CONSEIL_PAR_CODE.QUOTA_DEPASSE}`,
      code: 'QUOTA_DEPASSE'
    });
    return true;
  }

  if (erreur.status === 429) {
    res.status(503).json({
      success: false,
      error: 'Le moteur d\'IA est temporairement surcharge. Reessaie dans quelques instants.',
      code: 'QUOTA_DEPASSE'
    });
    return true;
  }

  // Le moteur ne repond pas du tout : typiquement une adresse qui pointe vers
  // un Ollama ou un LM Studio qui n'est pas demarre.
  if (code === 'ECONNREFUSED' || erreur.name === 'APIConnectionError'
      || erreur.name === 'APIConnectionTimeoutError') {
    res.status(503).json({
      success: false,
      error: `Impossible de joindre le moteur d'IA. ${CONSEIL_PAR_CODE.RESEAU}`,
      code: 'RESEAU'
    });
    return true;
  }

  return false;
}

module.exports = { repondreErreurIa };
