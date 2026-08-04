const OpenAI = require('openai');
const config = require('../config');
const { creer } = require('../lib/logger');

const log = creer('IA');

/**
 * Tarifs publics, en dollars par million de tokens.
 * Sert uniquement a afficher un ordre de grandeur dans les logs : sans
 * mesure, impossible de savoir si une optimisation sert a quelque chose.
 * Un modele inconnu (local, autre fournisseur) est compte a 0.
 */
const TARIFS = {
  'gpt-4o': { entree: 2.5, sortie: 10 },
  'gpt-4o-mini': { entree: 0.15, sortie: 0.6 },
  'gpt-4.1': { entree: 2, sortie: 8 },
  'gpt-4.1-mini': { entree: 0.4, sortie: 1.6 },
  'gpt-4.1-nano': { entree: 0.1, sortie: 0.4 }
};

const USD_VERS_EUR = 0.92;

/**
 * Service IA centralise.
 *
 * Deux regles importantes :
 *
 * 1. Le client OpenAI est cree PARESSEUSEMENT, a la premiere utilisation.
 *    Avant, il etait cree au chargement du fichier : sans cle API, le
 *    `require` lui-meme plantait et c'est TOUT le serveur qui refusait de
 *    demarrer, y compris les 4 outils qui n'ont pas besoin d'IA.
 *
 * 2. On designe les modeles par ROLE ('redaction', 'extraction') plutot
 *    que par nom. Changer de modele ou de fournisseur devient une ligne
 *    dans le .env, au lieu de 25 remplacements dans le code.
 */
class AIService {
  constructor() {
    this._client = null;
  }

  /**
   * Cette instance peut-elle appeler un modele ?
   * Permet aux services d'offrir un mode degrade au lieu de planter.
   */
  estDisponible() {
    return config.capacites.ia;
  }

  /**
   * Cree le client au premier appel reel, jamais a l'import.
   */
  client() {
    if (this._client) return this._client;

    if (!this.estDisponible()) {
      const erreur = new Error(
        "Aucun moteur d'IA configure. Ajoute OPENAI_API_KEY dans backend/.env "
        + '(ou OPENAI_BASE_URL pour utiliser un modele local). '
        + 'Voir backend/.env.example.'
      );
      erreur.code = 'IA_NON_CONFIGUREE';
      throw erreur;
    }

    this._client = new OpenAI({
      // Un serveur local ignore la valeur, mais le SDK exige une chaine non vide.
      apiKey: config.ia.cleApi || 'local',
      baseURL: config.ia.baseURL,
      timeout: config.ia.timeoutMs
    });
    return this._client;
  }

  /**
   * Traduit un role en nom de modele. Accepte aussi un nom brut, pour
   * rester compatible avec le code qui n'a pas encore ete migre.
   */
  _modele({ role, model }) {
    if (model) return model;
    return config.ia.modeles[role] || config.ia.modeles.extraction;
  }

  /**
   * Journalise ce qu'a coute l'appel. Sans ca, toute promesse d'economie
   * dans la documentation reste inverifiable.
   */
  _mesurer(modele, usage) {
    if (!usage) return;
    const tarif = TARIFS[modele];
    const entree = usage.prompt_tokens || 0;
    const sortie = usage.completion_tokens || 0;

    if (!tarif) {
      log.info(`${modele} - ${entree} tokens entree, ${sortie} sortie`);
      return;
    }

    const cout = ((entree / 1e6) * tarif.entree + (sortie / 1e6) * tarif.sortie) * USD_VERS_EUR;
    log.info(`${modele} - ${entree} tokens entree, ${sortie} sortie - ${cout.toFixed(4)} EUR`);
  }

  _params(prompt, options) {
    const modele = this._modele(options);
    const params = {
      model: modele,
      messages: [{ role: 'user', content: prompt }]
    };

    // Une temperature non precisee vaut 1.0 chez OpenAI, soit le maximum
    // de variabilite : le meme CV donnait 78, puis 85, puis 81. Pour tout
    // ce qui n'est pas de la redaction creative, on veut de la stabilite.
    params.temperature = options.temperature !== undefined ? options.temperature : 0.2;
    if (options.maxTokens) params.max_tokens = options.maxTokens;

    return { modele, params };
  }

  /**
   * Generer du texte libre.
   * @param {string} prompt
   * @param {Object} options - { role, model, temperature, maxTokens }
   * @returns {Promise<string>}
   */
  async generate(prompt, options = {}) {
    const { modele, params } = this._params(prompt, options);
    const response = await this.client().chat.completions.create(params);
    this._mesurer(modele, response.usage);
    return response.choices[0].message.content;
  }

  /**
   * Generer du JSON.
   *
   * En cas de JSON invalide, on tente d'abord une reparation LOCALE et
   * gratuite (retirer un bloc markdown, une virgule en trop). Ce n'est
   * que si elle echoue qu'on relance un appel payant.
   */
  async generateJSON(prompt, options = {}) {
    const { modele, params } = this._params(prompt, options);
    params.response_format = { type: 'json_object' };

    const response = await this.client().chat.completions.create(params);
    this._mesurer(modele, response.usage);
    const texte = response.choices[0].message.content;

    try {
      return JSON.parse(texte);
    } catch (_) {
      const repare = reparerJson(texte);
      if (repare !== null) {
        log.debug('JSON repare localement, aucun appel supplementaire');
        return repare;
      }

      log.warn('JSON invalide et non reparable, nouvel appel');
      const retry = await this.client().chat.completions.create({
        ...params,
        messages: [{
          role: 'user',
          content: `Reponds UNIQUEMENT avec du JSON valide. Aucun texte, aucun markdown.\n\n${prompt}`
        }]
      });
      this._mesurer(modele, retry.usage);
      return JSON.parse(retry.choices[0].message.content);
    }
  }

  /**
   * Pipeline en 2 etapes : generer du texte, puis le convertir en JSON.
   *
   * ATTENTION : cette methode coute DEUX appels pour une seule information.
   * Elle est conservee le temps de la migration, mais chaque usage doit
   * disparaitre au profit d'un decoupage en JavaScript (le format du texte
   * est impose par notre propre prompt, donc il est parfaitement previsible).
   * Voir docs/refonte/02-architecture-code-vs-llm.md.
   */
  async generateThenConvert(generationPrompt, jsonConversionPrompt, genOptions = {}, convOptions = {}) {
    const generatedText = await this.generate(generationPrompt, genOptions);

    // Le remplacement DOIT passer par une fonction : avec une chaine, les
    // motifs $&, $' et $` presents dans le texte (un CV qui parle de
    // salaires en dollars) seraient interpretes et corromperaient le prompt.
    const fullPrompt = jsonConversionPrompt.replace('{{GENERATED_TEXT}}', () => generatedText);

    return this.generateJSON(fullPrompt, { role: 'extraction', ...convOptions });
  }
}

/**
 * Repare les defauts de JSON les plus courants, sans appeler personne.
 * Chaque reparation reussie ici, c'est un appel API economise.
 * @returns {Object|null} l'objet, ou null si irrecuperable
 */
function reparerJson(texte) {
  if (typeof texte !== 'string') return null;

  let t = texte.trim();

  // 1. Retirer un bloc de code markdown : ```json ... ```
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  // 2. Ne garder que ce qui est entre la premiere accolade et la derniere
  //    (le modele ajoute parfois « Voici le resultat : » avant).
  const debut = t.indexOf('{');
  const fin = t.lastIndexOf('}');
  if (debut === -1 || fin === -1 || fin < debut) return null;
  t = t.slice(debut, fin + 1);

  // 3. Supprimer les virgules qui trainent avant une fermeture
  t = t.replace(/,(\s*[}\]])/g, '$1');

  try {
    return JSON.parse(t);
  } catch (_) {
    return null;
  }
}

module.exports = new AIService();
module.exports.reparerJson = reparerJson;
