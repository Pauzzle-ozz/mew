/**
 * LE POINT DE CONTROLE DES REGLAGES.
 *
 * Ces fonctions ne se contentent pas de dire oui ou non : elles COMPLETENT
 * (l'adresse du fournisseur quand elle est connue, le second modele quand un
 * seul est choisi) et elles AVERTISSENT (prefixe de cle inhabituel, modele
 * absent du catalogue). Un avertissement n'empeche jamais l'enregistrement :
 * notre catalogue vieillit plus vite que les fournisseurs ne sortent des
 * modeles, et refuser un modele qu'on ne connait pas encore serait exactement
 * l'inverse de la liberte promise.
 *
 * TOUT MESSAGE ECRIT ICI EST LU PAR QUELQU'UN QUI NE PROGRAMME PAS. Il dit ce
 * qui ne va pas ET quoi faire ensuite. Jamais un code d'erreur nu, jamais un
 * message de SDK en anglais.
 */

const { fournisseur: fournisseurDuCatalogue, ROLES } = require('../providers');
const { IDS: IDS_TACHES, tache: tacheDuCatalogue, roleDe } = require('../taches');
const { normaliserCompte, normaliserTaches } = require('./schema');

/** Fabrique un refus lisible. */
const refuser = (message) => ({ ok: false, erreur: message, avertissements: [], config: null });

/**
 * Verifie une adresse d'API saisie a la main.
 * On n'accepte que http et https : file://, data: ou un chemin local n'ont
 * aucun sens ici et ouvriraient une porte inutile.
 */
function verifierAdresse(valeur) {
  let url;
  try {
    url = new URL(valeur);
  } catch (_) {
    return {
      ok: false,
      erreur: `« ${valeur} » n'est pas une adresse valide. Elle doit commencer par http:// ou https:// `
        + '(par exemple http://localhost:11434/v1).'
    };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      erreur: `L'adresse « ${valeur} » utilise « ${url.protocol} », qui n'est pas gere. `
        + 'Utilise une adresse en http:// ou https://.'
    };
  }

  // On retire le slash final : « .../v1/ » et « .../v1 » doivent produire la
  // meme configuration, sinon on obtient des URL avec un double slash.
  return { ok: true, url: valeur.trim().replace(/\/+$/, '') };
}

/* ------------------------------------------------------------------ */
/* Un compte                                                           */
/* ------------------------------------------------------------------ */

/**
 * Valide UN acces chez UN fournisseur : sa cle et son adresse.
 *
 * C'est tout ce qu'un compte contient — le choix des modeles, lui, appartient
 * desormais aux taches. Cette separation est la raison d'etre de la v2 :
 * enregistrer une cle chez Anthropic ne doit plus obliger a decider dans la
 * foulee ce qu'on va lui faire faire.
 *
 * @param {object} entree { fournisseur, cleApi, baseURL }
 * @returns {{ok: boolean, erreur?: string, avertissements: string[], compte: object|null}}
 */
function validerCompte(entree) {
  const propose = normaliserCompte(entree);
  const avertissements = [];

  if (!propose) {
    return { ...refuser('Choisis un fournisseur avant d\'enregistrer.'), compte: null };
  }

  const f = fournisseurDuCatalogue(propose.fournisseur);
  if (!f) {
    return {
      ...refuser(
        `Le fournisseur « ${propose.fournisseur} » n'existe pas dans Mew. `
        + 'Choisis-en un dans la liste, ou prends « Autre (compatible OpenAI) » '
        + 'pour saisir toi-meme une adresse.'
      ),
      compte: null
    };
  }

  // ---- Adresse ----------------------------------------------------------
  // Celle du catalogue sert de valeur par defaut ; celle de l'utilisateur
  // gagne toujours (un Ollama sur un autre port, un proxy d'entreprise...).
  const adresseBrute = propose.baseURL || f.baseURL || '';
  if (adresseBrute === '') {
    return {
      ...refuser(
        `${f.nom} n'a pas d'adresse par defaut : saisis celle de ton service. `
        + 'Elle finit generalement par /v1.'
      ),
      compte: null
    };
  }
  const adresse = verifierAdresse(adresseBrute);
  if (!adresse.ok) return { ...refuser(adresse.erreur), compte: null };

  // ---- Cle --------------------------------------------------------------
  if (f.cleRequise && propose.cleApi === '') {
    return {
      ...refuser(
        `${f.nom} exige une cle API. `
        + (f.urlCle ? `Cree-la sur ${f.urlCle}, puis colle-la ici.` : 'Ajoute la tienne pour continuer.')
      ),
      compte: null
    };
  }
  if (f.prefixeCle && propose.cleApi !== '' && !propose.cleApi.startsWith(f.prefixeCle)) {
    // Indicatif seulement : les fournisseurs changent leurs prefixes.
    avertissements.push(
      `Les cles ${f.nom} commencent d'habitude par « ${f.prefixeCle} ». `
      + 'Verifie que tu as bien copie la cle en entier.'
    );
  }

  return {
    ok: true,
    avertissements,
    compte: { fournisseur: f.id, cleApi: propose.cleApi, baseURL: adresse.url }
  };
}

/* ------------------------------------------------------------------ */
/* Un modele, pour une tache ou pour un role                           */
/* ------------------------------------------------------------------ */

/**
 * Le modele existe-t-il chez ce fournisseur, et lui va-t-il ?
 *
 * @returns {{erreur: string|null, avertissements: string[]}} une erreur seulement
 *   quand le fournisseur a une liste FERMEE et que le modele n'y est pas.
 */
function verifierModele(f, id, role) {
  const avertissements = [];

  // Local ou personnalise : la liste statique est vide par construction, il
  // n'y a rien a verifier.
  if (!f || f.modeles.length === 0) return { erreur: null, avertissements };

  const connu = f.modeles.find((m) => m.id === id);
  if (connu) {
    if (role && ROLES.includes(role) && !connu.roles.includes(role)) {
      avertissements.push(
        `« ${connu.nom} » n'est pas le mieux place pour ${role === 'redaction' ? 'la redaction' : 'l\'extraction'}, `
        + 'mais rien ne t\'empeche de l\'utiliser.'
      );
    }
    return { erreur: null, avertissements };
  }

  if (!f.listageDynamique) {
    return {
      erreur: `Le modele « ${id} » n'existe pas chez ${f.nom}. `
        + `Modeles connus : ${f.modeles.map((m) => m.id).join(', ')}.`,
      avertissements
    };
  }

  avertissements.push(
    `Le modele « ${id} » n'est pas dans notre liste pour ${f.nom}. `
    + 'Si c\'est un modele recent, c\'est normal ; sinon verifie son nom exact.'
  );
  return { erreur: null, avertissements };
}

/* ------------------------------------------------------------------ */
/* L'affectation des taches                                            */
/* ------------------------------------------------------------------ */

/**
 * Valide « quel modele de quel compte pour quelle tache ».
 *
 * CE QU'ON REFUSE : une tache active qui designe un fournisseur chez qui
 * aucune cle n'est enregistree. C'est le seul cas ou l'utilisateur croirait
 * avoir regle quelque chose qui ne peut pas fonctionner.
 *
 * CE QU'ON LAISSE PASSER, avec un mot : une tache active sans modele choisi.
 * Elle retombera sur le modele du role, ce qui est le comportement historique
 * et reste utilisable.
 *
 * @param {object} tachesBrutes
 * @param {Array<object>} comptes les comptes DEJA enregistres
 * @returns {{ok: boolean, erreur?: string, avertissements: string[], taches: object|null}}
 */
function validerTaches(tachesBrutes, comptes) {
  const taches = normaliserTaches(tachesBrutes);
  const liste = Array.isArray(comptes) ? comptes : [];
  const avertissements = [];

  for (const id of IDS_TACHES) {
    const reglage = taches[id];
    if (!reglage.actif) continue;

    const nomTache = (tacheDuCatalogue(id) || { nom: id }).nom;

    if (reglage.fournisseur === '') {
      // Aucun fournisseur designe : la tache suivra le compte principal. Rien
      // a signaler tant qu'un compte existe.
      if (liste.length === 0) {
        avertissements.push(
          `« ${nomTache} » est active mais aucun acces n'est enregistre : elle ne pourra pas s'executer.`
        );
      }
      continue;
    }

    const compteDeLaTache = liste.find((c) => c.fournisseur === reglage.fournisseur);
    if (!compteDeLaTache) {
      const f = fournisseurDuCatalogue(reglage.fournisseur);
      return {
        ...refuser(
          `« ${nomTache} » est reglee sur ${f ? f.nom : reglage.fournisseur}, mais aucun acces `
          + 'n\'est enregistre chez eux. Ajoute-les d\'abord dans l\'onglet « Mes IA », '
          + 'ou choisis un modele chez un fournisseur que tu as deja.'
        ),
        taches: null
      };
    }

    if (reglage.modele === '') {
      avertissements.push(
        `Aucun modele n'est choisi pour « ${nomTache} » : Mew prendra celui de ton `
        + 'reglage general.'
      );
      continue;
    }

    const controle = verifierModele(
      fournisseurDuCatalogue(reglage.fournisseur), reglage.modele, roleDe(id)
    );
    if (controle.erreur) return { ...refuser(controle.erreur), taches: null };
    avertissements.push(...controle.avertissements);
  }

  return { ok: true, avertissements, taches };
}

/* ------------------------------------------------------------------ */
/* L'ancienne validation, telle quelle                                 */
/* ------------------------------------------------------------------ */

/**
 * Valide une configuration a l'ANCIENNE forme :
 * { fournisseur, cleApi, baseURL, modeles: { redaction, extraction } }
 *
 * Toujours utilisee par PUT /api/ia/config, que rien n'oblige a casser, et par
 * les tests qui garantissent que cette route reste sure. Elle rend un `config`
 * a l'ancienne forme : c'est un contrat, ne le changez pas.
 *
 * @returns {{ok: boolean, erreur?: string, avertissements: string[], config: object|null}}
 */
function validerV1(entree) {
  const objet = (entree && typeof entree === 'object' && !Array.isArray(entree)) ? entree : {};
  const modelesBruts = (objet.modeles && typeof objet.modeles === 'object' && !Array.isArray(objet.modeles))
    ? objet.modeles
    : {};

  const resultatCompte = validerCompte(objet);
  if (!resultatCompte.ok) return refuser(resultatCompte.erreur);

  const avertissements = [...resultatCompte.avertissements];
  const f = fournisseurDuCatalogue(resultatCompte.compte.fournisseur);

  // Un seul modele suffit : on le reutilise pour les deux roles. C'est le
  // choix par defaut de quelqu'un qui ne veut pas se poser de questions.
  const propre = (valeur) => (typeof valeur === 'string' ? valeur.trim() : '');
  const redaction = propre(modelesBruts.redaction) || propre(modelesBruts.extraction);
  const extraction = propre(modelesBruts.extraction) || propre(modelesBruts.redaction);

  if (redaction === '') {
    return refuser('Choisis au moins un modele. Le meme peut servir pour la redaction et pour l\'extraction.');
  }

  for (const [id, role] of [[redaction, ROLES[0]], [extraction, ROLES[1]]]) {
    const controle = verifierModele(f, id, role);
    if (controle.erreur) return refuser(controle.erreur);
    avertissements.push(...controle.avertissements);
  }

  return {
    ok: true,
    avertissements,
    config: { ...resultatCompte.compte, modeles: { redaction, extraction } }
  };
}

module.exports = { verifierAdresse, verifierModele, validerCompte, validerTaches, validerV1 };
