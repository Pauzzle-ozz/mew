const crypto = require('crypto');
const config = require('../config');
const { creer } = require('../lib/logger');
const cout = require('../llm/cout');

const log = creer('IA');

/**
 * Service IA centralise.
 *
 * CE QUI A CHANGE, ET POURQUOI
 * Avant, ce fichier creait lui-meme un client OpenAI : le fournisseur etait
 * decide par celui qui lance le serveur, dans un .env. Mew laisse desormais
 * l'utilisateur choisir SON fournisseur et SON modele — ChatGPT, Claude,
 * Gemini, Kimi, Mistral, un modele local — la seule condition etant qu'il
 * apporte sa propre cle. Ce service ne sait donc plus parler a personne en
 * particulier. Il se contente de :
 *
 *   1. lire la configuration effective (reglages de l'utilisateur, .env) ;
 *   2. trouver le fournisseur correspondant dans le catalogue ;
 *   3. demander au repartiteur l'adaptateur qui sait lui parler ;
 *   4. traduire un ROLE (« redaction », « extraction ») en nom de modele ;
 *   5. appeler l'adaptateur et mesurer le cout avec les tarifs du catalogue.
 *
 * TROIS REGLES QUI STRUCTURENT LE FICHIER
 *
 * 1. Rien n'est charge a l'import. Sans configuration, le serveur demarre
 *    quand meme : les outils qui n'ont pas besoin d'IA continuent de marcher,
 *    et ceux qui en ont besoin expliquent ou aller la configurer.
 *
 * 2. La configuration peut changer PENDANT que le serveur tourne (l'utilisateur
 *    la modifie depuis l'ecran Parametres). Rien n'est donc mis en cache
 *    definitivement : on garde une empreinte de la configuration et on
 *    reconstruit des qu'elle bouge. Sinon il faudrait redemarrer le serveur,
 *    et personne ne comprendrait pourquoi.
 *
 * 3. Une cle API ne sort jamais d'ici : ni vers le navigateur, ni dans un log,
 *    ni dans un message d'erreur. Meme l'empreinte gardee en memoire pour
 *    detecter un changement est un hachage, pas la cle.
 *
 * LES SIGNATURES PUBLIQUES N'ONT PAS BOUGE : generate(), generateJSON(),
 * generateThenConvert(), estDisponible() et reparerJson s'utilisent
 * exactement comme avant.
 */

/* ------------------------------------------------------------------ */
/* Chargement tolerant des modules voisins                             */
/* ------------------------------------------------------------------ */

/**
 * Le catalogue et le repartiteur sont charges PARESSEUSEMENT, sous try/catch.
 *
 * POURQUOI tant de precautions pour un simple require : ce service est
 * importe par cvService, matcherService et candidatureSpontaneeService, donc
 * par le serveur entier. Une erreur ici empecherait Mew de demarrer — or
 * « Mew demarre toujours » est un invariant du projet.
 */
const chargeur = (chemin) => {
  let module = null;
  let tente = false;
  return () => {
    if (tente) return module;
    tente = true;
    try {
      module = require(chemin);
    } catch (_) {
      module = null;
    }
    return module;
  };
};

const registreFournisseurs = chargeur('../llm/providers');
const registreAdaptateurs = chargeur('../llm/adapters');

/* ------------------------------------------------------------------ */
/* Ou se trouve la configuration de l'utilisateur                      */
/* ------------------------------------------------------------------ */

/**
 * Ce service ne lit AUCUN fichier de reglages lui-meme.
 *
 * config/index.js est le seul endroit du projet qui arbitre entre le .env
 * (prioritaire, pour qui installe Mew pour d'autres) et le choix enregistre
 * par l'utilisateur depuis l'ecran Parametres. Il expose le resultat sous
 * forme de proprietes CALCULEES a chaque lecture — ce qui est exactement ce
 * dont on a besoin ici : l'utilisateur peut changer de fournisseur pendant
 * que le serveur tourne.
 *
 * `sourceInjectee` n'existe que pour les tests : elle permet d'imposer une
 * configuration sans toucher au disque ni aux variables d'environnement.
 */
let sourceInjectee = null;

function lireReglages() {
  if (typeof sourceInjectee === 'function') {
    try {
      return sourceInjectee();
    } catch (_) {
      return null;
    }
  }

  // config.ia.source vaut « aucune » tant que personne n'a rien configure.
  if (!config.ia || config.ia.source === 'aucune') return null;
  return config.ia;
}

/**
 * Les taches, chargees paresseusement comme le reste : ce module est importe
 * par le serveur entier, et « Mew demarre toujours » est un invariant.
 */
const registreTaches = chargeur('../llm/taches');

/** Le role d'une tache, sans jamais lever. Une tache inconnue vaut extraction. */
function roleDeLaTache(idTache) {
  const registre = registreTaches();
  if (!registre) return 'extraction';
  return registre.roleDe(idTache);
}

/* ------------------------------------------------------------------ */
/* Normalisation : d'ou qu'elle vienne, la configuration a une forme   */
/* ------------------------------------------------------------------ */

const texte = (...valeurs) => {
  for (const valeur of valeurs) {
    if (typeof valeur === 'string' && valeur.trim() !== '') return valeur.trim();
  }
  return '';
};

/**
 * Ramene la configuration a la seule forme que ce fichier manipule :
 * { fournisseurId, adaptateurId, baseURL, cleApi, modeles, timeoutMs }.
 *
 * On accepte plusieurs noms de champs (fournisseur / provider, cleApi / cle /
 * apiKey...) : cette fonction lit aussi bien config.ia que l'objet qu'un test
 * lui glisse a la main, et un renommage ailleurs ne doit pas casser les
 * appels au modele.
 *
 * @returns {Object|null} null si rien n'est exploitable
 */
function normaliser(brut) {
  if (!brut || typeof brut !== 'object') return null;

  const source = (brut.ia && typeof brut.ia === 'object') ? brut.ia : brut;

  const modeles = (source.modeles && typeof source.modeles === 'object') ? source.modeles : {};
  const timeout = Number(source.timeoutMs !== undefined ? source.timeoutMs : source.timeout);

  return {
    coupee: false,
    fournisseurId: texte(
      source.fournisseur && typeof source.fournisseur === 'object' ? source.fournisseur.id : source.fournisseur,
      source.idFournisseur,
      source.provider
    ),
    adaptateurId: texte(source.adaptateur),
    baseURL: texte(source.baseURL, source.baseUrl, source.adresse, source.url),
    cleApi: texte(source.cleApi, source.cle, source.apiKey),
    modeles: {
      redaction: texte(modeles.redaction, source.modeleRedaction),
      extraction: texte(modeles.extraction, source.modeleExtraction)
    },
    // Le modele choisi pour CETTE tache precise. Vide quand la configuration
    // ne raisonne qu'en roles (fichier .env, tests) : on retombe alors sur
    // `modeles`, exactement comme avant.
    modeleTache: texte(source.modele),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 0
  };
}

/**
 * La configuration reellement appliquee POUR UNE TACHE, quelle que soit sa
 * provenance (.env prioritaire, puis le choix de l'utilisateur : l'arbitrage
 * est fait dans config/index.js).
 *
 * Deux chemins, et c'est voulu :
 *   - une source injectee (les tests, un branchement) raisonne en ROLES, comme
 *     avant. Rien n'a change pour elle.
 *   - sinon on passe par config.ia.pourTache(), qui sait remonter un acces
 *     DIFFERENT selon la tache — c'est ce qui permet a un modele de lire les
 *     CV pendant qu'un autre, chez un autre fournisseur, redige les lettres.
 *
 * @returns {Object|null} null si rien n'est exploitable ; `{coupee: true}`
 *   quand l'utilisateur a explicitement eteint cette tache.
 */
function configurationEffective(idTache) {
  if (typeof sourceInjectee === 'function') return normaliser(lireReglages());

  // Le garde sur `pourTache` protege le cas ou config/ serait une version
  // anterieure (module recharge, installation partiellement mise a jour) :
  // on retombe alors sur l'ancien raisonnement par roles au lieu de planter.
  if (!config.ia || typeof config.ia.pourTache !== 'function') {
    return normaliser(lireReglages());
  }

  let pour;
  try {
    pour = config.ia.pourTache(idTache);
  } catch (_) {
    return normaliser(lireReglages());
  }

  if (!pour) return null;
  if (pour.coupee) return { coupee: true };

  return normaliser({
    fournisseur: pour.fournisseur,
    adaptateur: pour.adaptateur,
    baseURL: pour.baseURL,
    cleApi: pour.cleApi,
    modele: pour.modele,
    // Repli par role. Rempli seulement quand le .env pilote l'installation :
    // ailleurs il est vide a dessein, pour que le repli soit le catalogue DU
    // FOURNISSEUR DE LA TACHE et pas un nom de modele venu d'ailleurs.
    modeles: pour.modeles
  });
}

/* ------------------------------------------------------------------ */
/* Erreurs                                                             */
/* ------------------------------------------------------------------ */

// Ou l'utilisateur doit aller. Repete dans chaque message : « pas de cle »
// tout seul ne dit pas quoi faire.
const OU_CONFIGURER = 'Ouvre l\'ecran Parametres de Mew pour choisir un fournisseur '
  + 'et coller ta cle API. Un modele local (Ollama, LM Studio) fonctionne aussi, sans cle.';

/**
 * Le code IA_NON_CONFIGUREE est celui que routes/erreursIa.js reconnait pour
 * repondre 503 avec le message tel quel : il doit rester lisible par
 * quelqu'un qui ne programme pas.
 */
function erreurConfiguration(message) {
  const erreur = new Error(`${message} ${OU_CONFIGURER}`);
  erreur.code = 'IA_NON_CONFIGUREE';
  return erreur;
}

/**
 * L'utilisateur a COUPE cette tache depuis les Parametres.
 *
 * Ce n'est pas une panne, c'est un choix — et le distinguer compte : le
 * message ne doit pas envoyer verifier une cle qui va tres bien, il doit
 * rappeler ou rallumer l'interrupteur.
 */
function erreurDesactivee(idTache) {
  const registre = registreTaches();
  const t = registre ? registre.tache(idTache) : null;

  const erreur = new Error(
    `L'IA est coupee pour « ${t ? t.nom : idTache} » dans tes Parametres (onglet `
    + '« Outils & modeles »). Le reste de cet outil continue de fonctionner : '
    + 'rallume cette tache si tu veux aussi le texte redige.'
  );
  erreur.code = 'IA_DESACTIVEE';
  return erreur;
}

/* ------------------------------------------------------------------ */
/* Le service                                                          */
/* ------------------------------------------------------------------ */

class AIService {
  constructor() {
    // Ce qui a ete resolu la derniere fois, PAR TACHE, avec l'empreinte de la
    // configuration qui l'a produit. Pas un cache definitif : une simple
    // memoire, invalidee des que la configuration change.
    //
    // Indexee par tache depuis que deux taches peuvent viser deux fournisseurs
    // differents : une memoire unique se serait fait ecraser a chaque
    // alternance entre « lire un CV » et « rediger une lettre ».
    this._memo = new Map();
    // Point d'injection pour les tests : un faux adaptateur, sans reseau.
    this._adaptateurInjecte = null;
  }

  /**
   * Pont de compatibilite avec routes/ia.js.
   *
   * Cette route ecrit `aiService._client = null` apres un changement de
   * reglages, pour « oublier le client garde en memoire ». Il n'y a plus de
   * client a oublier — les adaptateurs en fabriquent un par appel — mais
   * l'intention reste juste : on en profite pour oublier la configuration
   * resolue. Sans ce pont, l'ecriture ne ferait rien du tout.
   *
   * (La memoire s'invalide de toute facon toute seule : elle est indexee sur
   * une empreinte de la configuration.)
   */
  get _client() {
    return this._memo.size > 0 ? this._memo : null;
  }

  set _client(valeur) {
    if (!valeur) this._memo.clear();
  }

  /* --- Tests et branchements ---------------------------------------- */

  /**
   * Remplace la lecture des reglages par une fonction a soi.
   * Reserve aux tests et au branchement de l'ecran Parametres.
   * @param {Function|null} lecteur
   */
  _utiliserConfiguration(lecteur) {
    sourceInjectee = typeof lecteur === 'function' ? lecteur : null;
    this._memo.clear();
  }

  /**
   * Remplace l'adaptateur reel par un faux, pour tester sans reseau.
   * @param {Object|null} adaptateur un module respectant le contrat
   */
  _utiliserAdaptateur(adaptateur) {
    this._adaptateurInjecte = adaptateur || null;
    this._memo.clear();
  }

  /* --- Resolution de la configuration ------------------------------- */

  /**
   * Empreinte de la configuration, pour savoir si elle a bouge.
   * La cle est HACHEE : elle ne doit exister en clair nulle part ailleurs
   * que dans l'appel au fournisseur.
   */
  _empreinte(c) {
    const cle = c.cleApi ? crypto.createHash('sha256').update(c.cleApi).digest('hex') : '';
    return [
      c.fournisseurId, c.adaptateurId, c.baseURL, cle,
      c.modeleTache, c.modeles.redaction, c.modeles.extraction, c.timeoutMs
    ].join('|');
  }

  /**
   * Tout ce qu'il faut pour appeler un modele, sauf le modele lui-meme.
   *
   * @param {string} [idTache] la tache pour laquelle on appelle. Absente, on
   *   retombe sur le raisonnement par roles — c'est le cas du .env et des tests.
   * @throws {Error} code IA_NON_CONFIGUREE ou IA_DESACTIVEE, message en francais
   */
  _base(idTache) {
    const brute = configurationEffective(idTache);

    // L'utilisateur a coupe cette tache : ce n'est pas une panne, et le
    // message ne doit surtout pas l'envoyer verifier sa cle.
    if (brute && brute.coupee) throw erreurDesactivee(idTache);

    if (!brute || !brute.fournisseurId) {
      throw erreurConfiguration('Aucun fournisseur d\'IA n\'est configure.');
    }

    const cleMemo = `${idTache || ''}|${this._empreinte(brute)}`;
    const memorise = this._memo.get(cleMemo);
    if (memorise && !this._adaptateurInjecte) return memorise;

    const acces = registreFournisseurs();
    const connu = acces ? acces.fournisseur(brute.fournisseurId) : null;

    // Un fournisseur absent du catalogue reste utilisable s'il a une adresse :
    // c'est le cas d'un proxy d'entreprise, ou d'un fichier de reglages ecrit
    // a la main. Refuser serait contraire a la liberte promise.
    const fournisseur = connu || {
      id: brute.fournisseurId,
      nom: brute.fournisseurId,
      adaptateur: brute.adaptateurId || 'openai-compatible',
      baseURL: '',
      cleRequise: false,
      local: false
    };

    const baseURL = brute.baseURL || fournisseur.baseURL || '';
    if (!baseURL) {
      throw erreurConfiguration(connu
        ? `Aucune adresse d'API n'est enregistree pour ${fournisseur.nom}.`
        : `Le fournisseur « ${brute.fournisseurId} » n'existe pas dans la liste de Mew, `
          + 'et aucune adresse d\'API n\'est enregistree pour lui.');
    }

    if (fournisseur.cleRequise && !brute.cleApi) {
      throw erreurConfiguration(`Aucune cle API n'est enregistree pour ${fournisseur.nom}.`);
    }

    let adaptateur = this._adaptateurInjecte;
    if (!adaptateur) {
      const repartiteur = registreAdaptateurs();
      if (!repartiteur) {
        throw erreurConfiguration('Les connecteurs de fournisseurs sont introuvables dans cette installation.');
      }
      // Le repartiteur leve deja une erreur en francais, avec .code.
      adaptateur = repartiteur.adaptateur(brute.adaptateurId || fournisseur.adaptateur);
    }

    const base = {
      fournisseur,
      adaptateur,
      baseURL,
      cleApi: brute.cleApi,
      modeles: brute.modeles,
      modeleTache: brute.modeleTache,
      timeoutMs: brute.timeoutMs || Number(config.ia.timeoutMs) || undefined
    };

    this._memo.set(cleMemo, base);
    return base;
  }

  /**
   * Traduit une tache (ou un role) en nom de modele.
   *
   * Ordre, du plus precis au plus general :
   *   1. le nom explicitement demande par l'appelant ;
   *   2. le modele choisi pour CETTE tache dans les Parametres ;
   *   3. le modele du role (installation pilotee par .env, tests) ;
   *   4. l'autre role — mieux vaut un modele un peu cher qu'aucun modele ;
   *   5. le premier modele du catalogue capable de tenir ce role chez ce
   *      fournisseur.
   */
  _modele({ tache, role, model }, base) {
    if (typeof model === 'string' && model.trim() !== '') return model.trim();
    if (base.modeleTache) return base.modeleTache;

    // Le projet n'a que deux roles. Un role absent, farfelu, ou portant un nom
    // qui existe deja sur tout objet JavaScript (« constructor ») vaut
    // « extraction », le choix economique. A defaut de role explicite, c'est la
    // tache qui le donne.
    const demande = role === undefined && tache !== undefined ? roleDeLaTache(tache) : role;
    const roleReel = demande === 'redaction' ? 'redaction' : 'extraction';

    const choisi = base.modeles[roleReel] || base.modeles.extraction || base.modeles.redaction;
    if (choisi) return choisi;

    const acces = registreFournisseurs();
    if (acces) {
      const candidats = acces.modelesPourRole(base.fournisseur.id, roleReel);
      if (candidats.length > 0) return candidats[0].id;
    }

    throw erreurConfiguration(
      `Aucun modele n'est choisi pour ${base.fournisseur.nom}.`
    );
  }

  /**
   * Cette instance peut-elle appeler un modele ?
   *
   * Permet aux services d'offrir un mode degrade au lieu de planter — c'est ce
   * qui fait qu'un outil coupe continue d'afficher tout ce que le code calcule
   * tout seul. Ne leve jamais : une question ne doit pas pouvoir casser une page.
   *
   * @param {string} [idTache] pose la question POUR CETTE TACHE : elle peut
   *   avoir ete coupee, ou viser un fournisseur sans cle, alors que le reste
   *   de l'installation fonctionne tres bien.
   */
  estDisponible(idTache) {
    try {
      const base = this._base(idTache);
      this._modele(
        idTache === undefined ? { role: 'extraction' } : { tache: idTache },
        base
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * POURQUOI cette tache n'est pas disponible.
   *
   * « Tu l'as coupee » et « aucune cle n'est enregistree » se corrigent a deux
   * endroits differents : les confondre envoie l'utilisateur verifier une cle
   * qui va tres bien. Les services s'en servent pour ecrire le bon message.
   *
   * @param {string} [idTache]
   * @returns {'coupee'|'non-configuree'|null} null quand tout va bien
   */
  raisonIndisponible(idTache) {
    try {
      const base = this._base(idTache);
      this._modele(
        idTache === undefined ? { role: 'extraction' } : { tache: idTache },
        base
      );
      return null;
    } catch (erreur) {
      return erreur && erreur.code === 'IA_DESACTIVEE' ? 'coupee' : 'non-configuree';
    }
  }

  /**
   * Journalise ce qu'a coute l'appel, et l'ajoute au cumul de la session.
   * Sans ca, toute promesse d'economie dans la documentation reste
   * inverifiable. Les tarifs viennent du catalogue, par fournisseur ET par
   * modele : un modele local ou inconnu coute zero, ce qui est exact.
   */
  _mesurer(fournisseurId, modele, usage) {
    try {
      cout.enregistrer(modele, usage, fournisseurId);
      log.info(cout.formater(modele, usage, fournisseurId));
    } catch (_) {
      // Compter des tokens ne doit jamais faire echouer un appel reussi.
    }
  }

  /**
   * Un appel complet : resolution, appel de l'adaptateur, mesure.
   * @returns {Promise<string>} le texte renvoye par le modele
   */
  async _appeler(prompt, options, jsonMode) {
    const base = this._base(options.tache);
    const modele = this._modele(options, base);

    const reponse = await base.adaptateur.completer({
      baseURL: base.baseURL,
      cleApi: base.cleApi,
      modele,
      prompt,
      // Une temperature non precisee vaut 1.0 chez la plupart des
      // fournisseurs, soit le maximum de variabilite : le meme CV donnait 78,
      // puis 85, puis 81. Pour tout ce qui n'est pas de la redaction
      // creative, on veut de la stabilite.
      temperature: options.temperature !== undefined ? options.temperature : 0.2,
      maxTokens: options.maxTokens,
      jsonMode: Boolean(jsonMode),
      timeoutMs: base.timeoutMs
    });

    const reel = (reponse && typeof reponse.modele === 'string' && reponse.modele !== '')
      ? reponse.modele
      : modele;
    this._mesurer(base.fournisseur.id, reel, reponse && reponse.usage);

    return reponse && typeof reponse.texte === 'string' ? reponse.texte : '';
  }

  /**
   * Generer du texte libre.
   * @param {string} prompt
   * @param {Object} options - { role, model, temperature, maxTokens }
   * @returns {Promise<string>}
   */
  async generate(prompt, options = {}) {
    return this._appeler(prompt, options, false);
  }

  /**
   * Generer du JSON.
   *
   * En cas de JSON invalide, on tente d'abord une reparation LOCALE et
   * gratuite (retirer un bloc markdown, une virgule en trop). Ce n'est
   * que si elle echoue qu'on relance un appel payant.
   *
   * Le mode JSON n'est qu'une DEMANDE : beaucoup de petits modeles locaux ne
   * le connaissent pas, et l'adaptateur reessaie alors sans l'option. C'est
   * exactement pour ces modeles-la que la reparation locale existe.
   */
  async generateJSON(prompt, options = {}) {
    const texteJson = await this._appeler(prompt, options, true);

    try {
      return JSON.parse(texteJson);
    } catch (_) {
      const repare = reparerJson(texteJson);
      if (repare !== null) {
        log.debug('JSON repare localement, aucun appel supplementaire');
        return repare;
      }

      log.warn('JSON invalide et non reparable, nouvel appel');
      const insistant = `Reponds UNIQUEMENT avec du JSON valide. Aucun texte, aucun markdown.\n\n${prompt}`;
      const seconde = await this._appeler(insistant, options, true);

      const rattrape = reparerJson(seconde);
      if (rattrape !== null) return rattrape;
      // Un JSON toujours invalide : JSON.parse leve une erreur explicite,
      // c'est encore le message le plus parlant.
      return JSON.parse(seconde);
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
function reparerJson(texteBrut) {
  if (typeof texteBrut !== 'string') return null;

  let t = texteBrut.trim();

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

/**
 * Ce qui est REELLEMENT applique, sous une forme montrable.
 *
 * L'ecran Parametres a besoin de dire « tu utilises Claude Sonnet 5 » — il
 * n'a aucun besoin de la cle, et celle-ci ne doit jamais repartir vers le
 * navigateur. On ne renvoie donc qu'un booleen : une cle est enregistree,
 * ou non.
 *
 * @returns {{fournisseur: string, baseURL: string, modeles: Object, cleEnregistree: boolean}|null}
 */
function decrireConfiguration() {
  const c = configurationEffective();
  if (!c) return null;
  return {
    fournisseur: c.fournisseurId,
    baseURL: c.baseURL,
    modeles: { ...c.modeles },
    cleEnregistree: Boolean(c.cleApi)
  };
}

module.exports.decrireConfiguration = decrireConfiguration;
