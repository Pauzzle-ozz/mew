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
 */

/**
 * @param {Object} res - la reponse Express
 * @param {Error} erreur - l'erreur attrapee
 * @returns {boolean} true si la reponse a ete envoyee (l'appelant s'arrete la)
 */
function repondreErreurIa(res, erreur) {
  if (!erreur) return false;

  const message = String(erreur.message || '');

  // Aucune cle configuree : l'erreur vient de notre propre code (aiService).
  if (erreur.code === 'IA_NON_CONFIGUREE') {
    res.status(503).json({ success: false, error: erreur.message });
    return true;
  }

  // 401 : la cle existe mais le fournisseur la refuse (faute de frappe, cle
  // revoquee, espace en trop, cle d'un autre compte).
  if (erreur.status === 401 || erreur.code === 'invalid_api_key') {
    res.status(503).json({
      success: false,
      error: 'La cle du moteur d\'IA a ete refusee (401). Verifie OPENAI_API_KEY dans '
        + 'backend/.env : cle expiree, revoquee, ou copiee incompletement.'
    });
    return true;
  }

  // 403 : cle valide mais qui n'a pas le droit d'utiliser ce modele.
  if (erreur.status === 403) {
    res.status(503).json({
      success: false,
      error: 'Le moteur d\'IA refuse l\'acces a ce modele (403). Verifie AI_MODEL_REDACTION '
        + 'et AI_MODEL_EXTRACTION dans backend/.env : ton compte n\'y a peut-etre pas droit.'
    });
    return true;
  }

  // Quota epuise : c'est un 429 chez OpenAI, mais reessayer n'y changera
  // rien — il faut recharger le compte. Le distinguer evite d'attendre pour rien.
  if (erreur.code === 'insufficient_quota' || erreur.status === 402
      || (erreur.status === 429 && /quota|billing/i.test(message))) {
    res.status(503).json({
      success: false,
      error: 'Le credit du compte OpenAI est epuise. Recharge-le sur '
        + 'platform.openai.com, ou utilise un modele local avec OPENAI_BASE_URL.'
    });
    return true;
  }

  if (erreur.status === 429) {
    res.status(503).json({
      success: false,
      error: 'Service IA temporairement surchargé. Réessayez dans quelques instants.'
    });
    return true;
  }

  // Le moteur ne repond pas du tout : typiquement un OPENAI_BASE_URL qui
  // pointe vers un Ollama ou un LM Studio qui n'est pas demarre.
  if (erreur.code === 'ECONNREFUSED' || erreur.name === 'APIConnectionError'
      || erreur.name === 'APIConnectionTimeoutError') {
    res.status(503).json({
      success: false,
      error: 'Impossible de joindre le moteur d\'IA. S\'il tourne sur ta machine '
        + '(Ollama, LM Studio), verifie qu\'il est demarre et que OPENAI_BASE_URL est correcte.'
    });
    return true;
  }

  return false;
}

module.exports = { repondreErreurIa };
