/**
 * LE BOUTON « TESTER ».
 *
 * POURQUOI CE FICHIER EST LE PLUS IMPORTANT DE LA FONCTIONNALITE
 *
 * Un test qui verifie seulement que la cle est acceptee ne sert a rien. Mew
 * laisse l'utilisateur brancher N'IMPORTE QUEL modele — y compris un tout
 * petit modele qui tourne sur son ordinateur portable. Ce modele-la repondra
 * fierement 200 a la requete, puis ignorera completement le format qu'on lui
 * demande. L'utilisateur ne s'en apercevra qu'a la fin, devant une lettre de
 * motivation ou l'objet de l'email s'est retrouve dans le corps du texte.
 *
 * Alors on teste ce qui compte VRAIMENT : ce modele-la, avec cette cle-la,
 * sait-il suivre nos consignes de format ? On lui envoie donc une version
 * miniature d'une vraie demande du projet (quelques dizaines de tokens, moins
 * d'un dixieme de centime), et on decoupe sa reponse avec le VRAI parseur du
 * projet — celui-la meme qui servira en production.
 *
 * TROIS VERDICTS POSSIBLES, ET C'EST LA TOUTE L'IDEE
 *   ok: false                          -> quelque chose est casse (etape le dit)
 *   ok: true, suitLesConsignes: false  -> ca marche, mais la qualite sera aleatoire
 *   ok: true, suitLesConsignes: true   -> tout va bien
 *
 * Le cas du milieu n'est PAS une erreur bloquante : un modele local imparfait
 * reste un modele gratuit qui ne fait sortir aucune donnee de la machine.
 * L'utilisateur a le droit de le choisir en connaissance de cause.
 */

const { adaptateur: chargerAdaptateur } = require('./adapters');
const { fournisseur: fournisseurDuCatalogue, tarif } = require('./providers');
const { parseEmailGenere } = require('./parseurs/emailSpontane');
const { USD_VERS_EUR } = require('./cout');

/**
 * Le prompt de test : une imitation miniature de prompts/spontaneEmail.js.
 *
 * Il doit rester COURT (le test doit etre quasi gratuit et rapide) tout en
 * exigeant exactement la meme structure que les vraies demandes : un marqueur
 * SUBJECT, une ligne de tirets, un corps. Si un modele echoue ici, il echouera
 * en production.
 */
const PROMPT_TEST = [
  'Tu produis UNIQUEMENT le format demande, sans introduction ni commentaire.',
  '',
  'Ecris un tres court email de candidature spontanee pour un poste de jardinier.',
  '',
  'Format EXACT de ta reponse :',
  'SUBJECT: [objet de l\'email, 6 a 10 mots]',
  '---',
  '[deux phrases maximum]'
].join('\n');

// Assez pour deux phrases et un objet, meme avec un modele bavard. Au-dela,
// c'est que le modele n'a pas compris la consigne — inutile de payer plus.
const MAX_TOKENS_TEST = 300;

// Un peu de liberte, mais pas trop : on veut voir le comportement habituel du
// modele, pas son meilleur jour.
const TEMPERATURE_TEST = 0.3;

// Un modele local charge parfois plusieurs gigaoctets avant de repondre au
// premier appel. Attendre est desagreable ; abandonner trop tot est pire,
// parce que l'utilisateur conclut a tort que sa configuration est fausse.
const DELAI_TEST_MS = 90000;

// L'adaptateur utilise quand on teste une adresse qui n'est dans aucun
// catalogue : la quasi-totalite des services parlent le protocole d'OpenAI.
const ADAPTATEUR_DEFAUT = 'openai-compatible';

/* ------------------------------------------------------------------ */
/* De l'erreur a l'etape                                               */
/* ------------------------------------------------------------------ */

/**
 * Traduit le code d'erreur du contrat en etape du test.
 *
 * L'interet est de dire a l'utilisateur OU ca s'arrete, parce que le geste a
 * faire n'est pas du tout le meme : relancer Ollama, recopier une cle,
 * recharger un compte ou corriger un nom de modele.
 */
const ETAPE_PAR_CODE = {
  RESEAU: 'connexion',
  TIMEOUT: 'connexion',
  CLE_INVALIDE: 'authentification',
  QUOTA_DEPASSE: 'generation',
  MODELE_INTROUVABLE: 'generation',
  FOURNISSEUR: 'generation'
};

const etapePour = (code) => (
  Object.prototype.hasOwnProperty.call(ETAPE_PAR_CODE, code) ? ETAPE_PAR_CODE[code] : 'generation'
);

/**
 * Fabrique un echec. Aucun objet d'erreur ne remonte : uniquement un message
 * en francais, deja nettoye de tout ce qui pourrait ressembler a une cle
 * (les adaptateurs s'en chargent avant de lever).
 */
function echec(etape, message, extra = {}) {
  return {
    ok: false,
    etape,
    message,
    modele: extra.modele || '',
    latenceMs: extra.latenceMs || 0,
    usage: { tokensEntree: 0, tokensSortie: 0 },
    coutEstime: { usd: 0, eur: 0 },
    suitLesConsignes: false,
    avertissements: [],
    ...(extra.code ? { code: extra.code } : {})
  };
}

/* ------------------------------------------------------------------ */
/* Cout                                                                */
/* ------------------------------------------------------------------ */

const arrondir = (valeur, decimales) => {
  if (!Number.isFinite(valeur)) return 0;
  const facteur = 10 ** decimales;
  return Math.round(valeur * facteur) / facteur;
};

/**
 * Ce que ce test a coute, d'apres le catalogue.
 *
 * Un modele inconnu du catalogue (modele local, nom recent) est compte a zero.
 * Pour un modele local c'est la verite ; pour un modele recent c'est une
 * approximation assumee : le catalogue previent lui-meme qu'il sert a donner
 * un ordre de grandeur, pas a facturer.
 */
function estimerCout(idFournisseur, idModele, usage) {
  const grille = tarif(idFournisseur, idModele);
  if (!grille) return { usd: 0, eur: 0 };

  const usd = (usage.tokensEntree / 1e6) * grille.entree
    + (usage.tokensSortie / 1e6) * grille.sortie;

  return { usd: arrondir(usd, 6), eur: arrondir(usd * USD_VERS_EUR, 6) };
}

/* ------------------------------------------------------------------ */
/* Analyse du format                                                   */
/* ------------------------------------------------------------------ */

// Le modele a-t-il ecrit le marqueur qu'on lui demandait ? On accepte les
// memes variantes que le parseur (gras markdown, francais, deux-points).
const MOTIF_MARQUEUR = /(^|\n)[\s*_#>]*(?:subject|objet|sujet)[\s*_]*[:\-]/i;
const MOTIF_SEPARATEUR = /(^|\n)\s*(?:-{3,}|\*{3,}|_{3,}|={3,})\s*(\n|$)/;

/**
 * Le modele a-t-il respecte la structure demandee ?
 *
 * On combine deux verdicts complementaires :
 *   - le parseur du projet retrouve-t-il un objet ET un corps ? C'est le seul
 *     critere qui compte vraiment, puisque c'est ce code qui tournera demain ;
 *   - les marqueurs sont-ils la ? Le parseur sait se rattraper sans eux (il
 *     promeut la premiere ligne en objet), mais un modele qui les ignore
 *     aujourd'hui produira demain des resultats imprevisibles.
 *
 * @returns {{suit: boolean, marqueur: boolean, separateur: boolean, objet: string, corps: string}}
 */
function analyserFormat(texte) {
  const brut = typeof texte === 'string' ? texte : '';
  const { subject, body } = parseEmailGenere(brut);

  const marqueur = MOTIF_MARQUEUR.test(brut);
  const separateur = MOTIF_SEPARATEUR.test(brut);

  return {
    suit: subject !== '' && body !== '' && marqueur,
    marqueur,
    separateur,
    objet: subject,
    corps: body
  };
}

/**
 * Explique le resultat du test en une phrase, pour quelqu'un qui ne programme
 * pas. C'est ce texte que l'interface affiche telle quelle.
 */
function messageDeReussite(format, nomModele, latenceMs) {
  const secondes = (latenceMs / 1000).toFixed(1).replace('.', ',');

  if (format.suit) {
    return `${nomModele} repond correctement et respecte le format demande (${secondes} s). Tout est pret.`;
  }

  if (format.objet === '' || format.corps === '') {
    return `${nomModele} repond bien, mais sa reponse n'a pas la structure attendue : `
      + 'Mew n\'a pas su y retrouver un objet et un corps de message. '
      + 'Les lettres et emails generes risquent d\'etre mal decoupes. '
      + 'Un modele plus gros donnerait de meilleurs resultats.';
  }

  return `${nomModele} repond bien (${secondes} s), mais il n'ecrit pas les reperes demandes `
    + '(la ligne « SUBJECT: » et les tirets). Mew arrive quand meme a decouper sa reponse, '
    + 'mais la qualite sera irreguliere d\'une fois sur l\'autre.';
}

/* ------------------------------------------------------------------ */
/* Le test                                                             */
/* ------------------------------------------------------------------ */

/**
 * Teste une configuration SANS l'enregistrer.
 *
 * @param {object} options
 * @param {string} options.fournisseur  identifiant du catalogue (ex. « ollama »)
 * @param {string} [options.cleApi]     cle de l'utilisateur (inutile en local)
 * @param {string} [options.baseURL]    adresse ; celle du catalogue par defaut
 * @param {string} options.modele       le modele a eprouver
 * @param {number} [options.timeoutMs]
 * @param {object} [dependances]        injection pour les tests uniquement
 * @returns {Promise<{ok: boolean, etape: string, message: string, modele: string,
 *                    latenceMs: number, usage: object, coutEstime: object,
 *                    suitLesConsignes: boolean, avertissements: string[]}>}
 *
 * Cette fonction ne leve JAMAIS : un test qui plante n'apprend rien a personne.
 * Tout probleme ressort sous la forme d'un resultat ok: false.
 */
async function testerConnexion(options = {}, dependances = {}) {
  const idFournisseur = typeof options.fournisseur === 'string' ? options.fournisseur.trim() : '';
  const modele = typeof options.modele === 'string' ? options.modele.trim() : '';
  const cleApi = typeof options.cleApi === 'string' ? options.cleApi.trim() : '';

  const f = fournisseurDuCatalogue(idFournisseur);
  const baseURL = (typeof options.baseURL === 'string' && options.baseURL.trim() !== '')
    ? options.baseURL.trim()
    : (f && f.baseURL) || '';

  const nomService = f ? f.nom : (baseURL || 'ce service');

  // ---- Etape 0 : ce qu'on peut refuser sans toucher au reseau -----------
  if (modele === '') {
    return echec('connexion', 'Choisis un modele avant de lancer le test.');
  }
  if (!f && baseURL === '') {
    return echec('connexion',
      'Aucune adresse a tester : choisis un fournisseur dans la liste, ou saisis l\'adresse de ton service.');
  }
  if (f && f.cleRequise && cleApi === '') {
    return echec('authentification',
      `${f.nom} exige une cle API. `
      + (f.urlCle ? `Cree-la sur ${f.urlCle}, puis colle-la avant de tester.` : 'Ajoute la tienne avant de tester.'),
      { modele });
  }

  // ---- Chargement de l'adaptateur ---------------------------------------
  let adaptateur;
  try {
    adaptateur = dependances.adaptateur
      || chargerAdaptateur((f && f.adaptateur) || ADAPTATEUR_DEFAUT);
  } catch (erreur) {
    // Le repartiteur produit deja un message en francais.
    return echec('connexion', erreur.message, { modele, code: erreur.code });
  }

  // ---- L'appel reel ------------------------------------------------------
  const depart = Date.now();
  let reponse;
  try {
    reponse = await adaptateur.completer({
      baseURL,
      cleApi,
      modele,
      prompt: PROMPT_TEST,
      temperature: TEMPERATURE_TEST,
      maxTokens: MAX_TOKENS_TEST,
      jsonMode: false,
      timeoutMs: Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
        ? Number(options.timeoutMs)
        : DELAI_TEST_MS
    });
  } catch (erreur) {
    const code = erreur && typeof erreur.code === 'string' ? erreur.code : 'FOURNISSEUR';
    const message = erreur && typeof erreur.message === 'string' && erreur.message !== ''
      ? erreur.message
      : `${nomService} n'a pas pu etre teste.`;

    return echec(etapePour(code), message, { modele, code, latenceMs: Date.now() - depart });
  }

  const latenceMs = Date.now() - depart;

  // ---- Etape « format » : la seule qui juge la QUALITE du modele ---------
  const usage = (reponse && reponse.usage) || { tokensEntree: 0, tokensSortie: 0 };
  const modeleReel = (reponse && typeof reponse.modele === 'string' && reponse.modele !== '')
    ? reponse.modele
    : modele;

  const format = analyserFormat(reponse && reponse.texte);

  const avertissements = [];
  if (!format.suit) {
    avertissements.push(
      'Ce modele ne suit pas fidelement les consignes de format. '
      + 'Tu peux l\'utiliser, mais les lettres et emails generes seront moins reguliers.'
    );
  }
  if (modeleReel !== modele) {
    avertissements.push(`Le fournisseur a repondu avec « ${modeleReel} » plutot que « ${modele} ».`);
  }

  return {
    ok: true,
    etape: 'format',
    message: messageDeReussite(format, f ? f.nom : nomService, latenceMs),
    modele: modeleReel,
    latenceMs,
    usage: {
      tokensEntree: Number(usage.tokensEntree) || 0,
      tokensSortie: Number(usage.tokensSortie) || 0
    },
    coutEstime: estimerCout(idFournisseur, modele, {
      tokensEntree: Number(usage.tokensEntree) || 0,
      tokensSortie: Number(usage.tokensSortie) || 0
    }),
    suitLesConsignes: format.suit,
    // Ce que le modele a reellement produit, pour que l'interface puisse le
    // montrer : voir la reponse est bien plus convaincant qu'un verdict.
    apercu: {
      objet: format.objet.slice(0, 120),
      corps: format.corps.slice(0, 400),
      marqueurTrouve: format.marqueur,
      separateurTrouve: format.separateur
    },
    avertissements
  };
}

module.exports = {
  testerConnexion,
  PROMPT_TEST,

  /** Rouages internes, exposes UNIQUEMENT pour les tests. */
  interne: { analyserFormat, estimerCout, etapePour, DELAI_TEST_MS }
};
