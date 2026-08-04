'use strict';

/**
 * Score ATS deterministe.
 *
 * POURQUOI CE FICHIER EXISTE
 * Avant, le score ATS etait produit par cette seule ligne de prompt (optimiseCvPdf.js:66) :
 *   "Commence par : SCORE ATS: [nombre entre 0 et 100]"
 * Aucun critere n'etait donne au modele. Le meme CV envoye deux fois donnait 78, puis 85.
 * Ici, le score est une somme de points : il se recalcule, il s'explique ligne par ligne,
 * et il ne bouge jamais tant que le CV ne bouge pas.
 *
 * LA REGLE QUI COMPTE LE PLUS
 * Un critere qu'on ne peut pas mesurer sur CE CV sort du calcul ET DU DENOMINATEUR.
 * Exemple : si l'utilisateur n'a pas indique d'offre cible, la famille "mots-cles du poste"
 * (14 points) devient applicable:false et le score se calcule sur 86 points.
 * Sans cette regle, une infirmiere prendrait 0/14 sur des mots-cles techniques qui ne la
 * concernent pas, et plafonnerait a 86 % quoi qu'elle fasse. Ce serait exactement le biais
 * qu'on cherche a supprimer.
 *
 * ZERO RESEAU, ZERO ECRITURE : deux JSON lus au chargement, puis que du calcul.
 */

const bareme = require('../../data/fr/ats-bareme.json');
const donneesVerbes = require('../../data/fr/verbes-action.json');

const REGLAGES = bareme.reglages;

// ---------------------------------------------------------------------------
// Motifs de caracteres
//
// Ecrits en \uXXXX plutot qu'en caracteres reels : plusieurs d'entre eux sont
// invisibles (espace insecable, caractere de remplacement, caracteres de controle).
// Une copie/colle ou un editeur mal configure les remplacerait en silence.
// ---------------------------------------------------------------------------

const ACCENTS = /[\u0300-\u036f]/g; // marques laissees par normalize('NFD')
const APOSTROPHES = /[\u2018\u2019\u02bc\u00b4]/g; // apostrophes typographiques des PDF
const ESPACES_EXOTIQUES = /[\u00a0\u202f\u2009\u2007]/g; // espaces insecables et fines
const PUCES_DEBUT = /^[\s\u2022\u25aa\u25e6\u2023\u00b7*\-\u2013\u2014]+/; // marqueurs de puce
const SEPARATEURS_LISTE = /[\n;,\u2022]/;
const CARACTERES_TABLEAU = /[\u2500-\u257f]/; // traits de tableau Unicode (box drawing)
// U+FFFD = le losange a point d'interrogation, signature d'un encodage rate.
// Le reste = caracteres de controle, sauf tabulation, retour chariot et saut de ligne.
const CARACTERES_ILLISIBLES = /[\ufffd\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

// ---------------------------------------------------------------------------
// Outils de texte
// (volontairement locaux : core/texte/normaliser.js n'existe pas encore et ce module
//  doit rester utilisable seul. A dedupliquer au moment du branchement.)
// ---------------------------------------------------------------------------

/** Minuscules, accents retires, apostrophes et espaces du PDF uniformises. */
function normaliser(valeur) {
  if (typeof valeur !== 'string') return '';
  return valeur
    .normalize('NFD')
    .replace(ACCENTS, '')
    .replace(APOSTROPHES, "'")
    .replace(ESPACES_EXOTIQUES, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function compterMots(texte) {
  const trouves = normaliser(texte).match(/[a-z0-9]+(?:['-][a-z0-9]+)*/g);
  return trouves ? trouves.length : 0;
}

function estChaineRemplie(valeur) {
  return typeof valeur === 'string' && valeur.trim().length > 0;
}

function borner(valeur, min, max) {
  if (!Number.isFinite(valeur)) return min;
  return Math.min(max, Math.max(min, valeur));
}

/** Un seul chiffre apres la virgule : le detail affiche doit toujours faire le total. */
function arrondi1(valeur) {
  return Math.round(valeur * 10) / 10;
}

/** 3 -> "3" et 3.5 -> "3,5" (virgule francaise, pour les messages) */
function formaterNombre(valeur) {
  const arrondi = arrondi1(valeur);
  return Number.isInteger(arrondi) ? String(arrondi) : String(arrondi).replace('.', ',');
}

// ---------------------------------------------------------------------------
// Verbes d'action
// ---------------------------------------------------------------------------

// Le dictionnaire sert a RECONNAITRE un debut de puce, jamais a rejeter un CV.
// Toutes les formes sont normalisees : "realise" couvre a la fois l'infinitif, le
// participe passe et le present, puisque les accents disparaissent au passage.
const VERBES = new Set(
  (Array.isArray(donneesVerbes.verbes) ? donneesVerbes.verbes : []).map(normaliser).filter(Boolean)
);

// Une puce peut s'ouvrir par un auxiliaire ou un pronom : on saute ces mots-la avant de
// chercher le verbe, sinon "J'ai realise 12 audits" serait compte comme rate.
const MOTS_SAUTABLES = new Set(["j'ai", 'jai', 'j', 'ai', 'nous', 'avons', 'y', 'ete']);

function puceCommenceParVerbe(puce) {
  const tokens = normaliser(puce).match(/[a-z0-9]+(?:'[a-z]+)?/g);
  if (!tokens) return false;
  for (let i = 0; i < Math.min(tokens.length, 3); i++) {
    if (VERBES.has(tokens[i])) return true;
    if (!MOTS_SAUTABLES.has(tokens[i])) return false;
  }
  return false;
}

/** Une annee (2019, 2024) n'est pas un resultat : on la retire avant de chercher un chiffre. */
function puceContientChiffre(puce) {
  if (typeof puce !== 'string') return false;
  return /\d/.test(puce.replace(/\b(?:19|20)\d{2}\b/g, ' '));
}

// Un pourcentage ou un montant : le seul marqueur de resultat qui vaille dans TOUS les
// secteurs. Volontairement pas de liste d'unites metier ("clients", "patients",
// "chantiers") : ce serait un dictionnaire qui jette, et il finirait par avantager les
// metiers auxquels on aurait pense en l'ecrivant.
const MOTIF_IMPACT = new RegExp(
  '(?:\\d[\\d\\s.,]*\\s*(?:%|pour ?cent|\\u20ac|eur\\b|euros?\\b|k\\u20ac|m\\u20ac|\\$|\\u00a3)' +
    '|(?:%|\\u20ac|\\$|\\u00a3)\\s*\\d)'
);

function puceContientImpact(puce) {
  return MOTIF_IMPACT.test(normaliser(puce));
}

// ---------------------------------------------------------------------------
// Lecture tolerante du profil
//
// Le profil vient de core/cv/profil.js. Comme ce module peut encore evoluer, on accepte
// plusieurs noms de champ pour la meme information plutot que de casser au premier
// renommage. Forme de reference attendue :
//   {
//     contact: { email, telephone, ville },
//     resume: "...",
//     experiences: [{ intitule, dateDebut, dateFin, enCours, puces: [...] }],
//     formations: [...],
//     competences: [...]
//   }
// ---------------------------------------------------------------------------

function premierDefini(...valeurs) {
  for (const valeur of valeurs) {
    if (valeur !== undefined && valeur !== null) return valeur;
  }
  return null;
}

function enTableau(valeur) {
  if (Array.isArray(valeur)) return valeur;
  if (estChaineRemplie(valeur)) {
    return valeur
      .split(SEPARATEURS_LISTE)
      .map((element) => element.trim())
      .filter(Boolean);
  }
  return [];
}

function lirePuces(experience) {
  const brut = premierDefini(
    experience.puces,
    experience.bullets,
    experience.taches,
    experience.missions
  );
  if (Array.isArray(brut)) {
    return brut.map((puce) => String(puce).trim()).filter(Boolean);
  }
  const description = premierDefini(brut, experience.description, experience.detail);
  if (!estChaineRemplie(description)) return [];
  return description
    .split(/\r?\n/)
    .map((ligne) => ligne.replace(PUCES_DEBUT, '').trim())
    .filter(Boolean);
}

function lireExperiences(profil) {
  const brut = enTableau(premierDefini(profil.experiences, profil.experience, profil.parcours));
  return brut
    .filter((element) => element && typeof element === 'object')
    .map((element) => ({
      intitule: String(premierDefini(element.intitule, element.poste, element.titre, '') || ''),
      debut: premierDefini(element.dateDebut, element.debut, element.date_debut),
      fin: premierDefini(element.dateFin, element.fin, element.date_fin),
      enCours: element.enCours === true || element.en_cours === true,
      puces: lirePuces(element)
    }));
}

function lireContact(profil) {
  const contact = profil.contact && typeof profil.contact === 'object' ? profil.contact : profil;
  return {
    email: premierDefini(contact.email, contact.mail, contact.courriel),
    telephone: premierDefini(contact.telephone, contact.tel, contact.phone, contact.mobile),
    ville: premierDefini(
      contact.ville,
      contact.localisation,
      contact.localite,
      contact.codePostal,
      contact.code_postal
    )
  };
}

function construireContexte(profil, options) {
  const source = profil && typeof profil === 'object' ? profil : {};
  const opts = options && typeof options === 'object' ? options : {};

  const experiences = lireExperiences(source);
  const puces = experiences
    .flatMap((experience) => experience.puces)
    .concat(enTableau(source.puces).filter(estChaineRemplie));

  const resume = String(
    premierDefini(source.resume, source.resume_professionnel, source.accroche, source.profil, '') || ''
  );

  const competences = enTableau(
    premierDefini(source.competences, source.competences_cles, source.skills)
  )
    .map((competence) =>
      typeof competence === 'string'
        ? competence
        : String(competence.libelle || competence.nom || '')
    )
    .filter(estChaineRemplie);

  const formations = enTableau(premierDefini(source.formations, source.formation, source.diplomes));
  const contact = lireContact(source);

  // texteBrut absent (undefined/null) = "on n'a pas le texte du PDF" -> les criteres
  // techniques ne sont pas mesurables et sortent du denominateur.
  // texteBrut = "" = "le PDF n'a rien rendu" -> c'est le cas du PDF scanne, et celui-la
  // doit etre sanctionne, surtout pas neutralise.
  const texteBrutFourni = typeof opts.texteBrut === 'string';
  const texteBrut = texteBrutFourni ? opts.texteBrut : '';

  const motsClesPoste = (Array.isArray(opts.motsClesPoste) ? opts.motsClesPoste : [])
    .filter(estChaineRemplie)
    .map((mot) => mot.trim());

  // Le texte reconstruit depuis le profil sert de filet quand le texte brut manque.
  const texteProfil = [
    resume,
    experiences.map((e) => `${e.intitule} ${e.puces.join(' ')}`).join(' '),
    competences.join(' '),
    formations.map((f) => (typeof f === 'string' ? f : Object.values(f).join(' '))).join(' ')
  ].join(' ');

  return {
    experiences,
    puces,
    resume,
    competences,
    formations,
    contact,
    texteBrut,
    texteBrutFourni,
    motsClesPoste,
    texteRecherche: normaliser(`${texteBrut} ${texteProfil}`),
    resumeNormalise: normaliser(resume),
    nbMotsCv: texteBrut.trim() ? compterMots(texteBrut) : compterMots(texteProfil),
    // Seule entree dependante du temps. On la rend injectable pour que les tests ne
    // changent pas de resultat au passage a l'annee suivante.
    anneeReference: Number.isInteger(opts.anneeReference)
      ? opts.anneeReference
      : new Date().getFullYear()
  };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** "2022-03" / "2022" / Date / 2022 -> nombre de mois depuis l'an 0, ou null. */
function enIndexMois(valeur) {
  if (valeur instanceof Date && !Number.isNaN(valeur.getTime())) {
    return valeur.getFullYear() * 12 + valeur.getMonth();
  }
  if (typeof valeur === 'number' && Number.isInteger(valeur) && valeur > 1000) {
    return valeur * 12;
  }
  if (!estChaineRemplie(valeur)) return null;
  const trouve = valeur.trim().match(/^(\d{4})(?:[-/](\d{1,2}))?/);
  if (!trouve) return null;
  const mois = trouve[2] ? Number(trouve[2]) : 1;
  if (mois < 1 || mois > 12) return null;
  return Number(trouve[1]) * 12 + (mois - 1);
}

function anneeDe(indexMois) {
  return Math.floor(indexMois / 12);
}

// ---------------------------------------------------------------------------
// Mots-cles
// ---------------------------------------------------------------------------

function echapperRegex(texte) {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Recherche litterale, sur des bornes de mots, avec tolerance au pluriel simple.
 * Litterale et pas approximative, volontairement : un vrai ATS compare lui aussi des
 * chaines. On ne veut pas annoncer "React trouve" parce que le CV contient "reacteur".
 */
function motCleTrouve(motCle, texteNormalise) {
  const cible = normaliser(motCle).replace(/s$/, '');
  if (!cible) return false;
  return new RegExp(`(?<![a-z0-9])${echapperRegex(cible)}s?(?![a-z0-9])`).test(texteNormalise);
}

// ---------------------------------------------------------------------------
// Les mesures : un critere = une fonction
//
// Chaque fonction rend :
//   applicable : false si le critere n'est pas mesurable sur ce CV
//   ratio      : 0 a 1, la part des points obtenus
//   variables  : de quoi remplir les {x}, {y}... du message
//   cle        : quel message d'action utiliser (Partiel / Sous / Sur)
// ---------------------------------------------------------------------------

/** Note un nombre attendu dans un intervalle, en degradant doucement de part et d'autre. */
function mesurerIntervalle(valeur, min, max) {
  if (valeur >= min && valeur <= max) return { ratio: 1, cle: null };
  if (valeur < min) return { ratio: borner(valeur / min, 0, 1), cle: 'Sous' };
  return { ratio: borner(max / valeur, 0, 1), cle: 'Sur' };
}

const MESURES = {
  structure_experiences(ctx) {
    return {
      applicable: true,
      ratio: ctx.experiences.length > 0 ? 1 : 0,
      variables: { x: ctx.experiences.length }
    };
  },

  structure_formations(ctx) {
    return {
      applicable: true,
      ratio: ctx.formations.length > 0 ? 1 : 0,
      variables: { x: ctx.formations.length }
    };
  },

  structure_competences(ctx) {
    return {
      applicable: true,
      ratio: ctx.competences.length > 0 ? 1 : 0,
      variables: { x: ctx.competences.length }
    };
  },

  structure_resume(ctx) {
    const mots = compterMots(ctx.resume);
    return { applicable: true, ratio: mots > 0 ? 1 : 0, variables: { x: mots } };
  },

  contact_email(ctx) {
    const brut = estChaineRemplie(ctx.contact.email) ? ctx.contact.email.trim() : '';
    if (!brut) return { applicable: true, ratio: 0, variables: {} };
    const valide = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(brut);
    return {
      applicable: true,
      ratio: valide ? 1 : 0,
      variables: { x: brut },
      cle: valide ? null : 'Partiel'
    };
  },

  contact_telephone(ctx) {
    const brut = estChaineRemplie(ctx.contact.telephone) ? ctx.contact.telephone.trim() : '';
    if (!brut) return { applicable: true, ratio: 0, variables: {} };
    const chiffres = brut.replace(/[\s.\-()/]/g, '');
    // Numero francais, ou numero international de longueur plausible.
    const valide = /^(?:\+33|0033|0)[1-9]\d{8}$/.test(chiffres) || /^\+\d{8,15}$/.test(chiffres);
    return {
      applicable: true,
      ratio: valide ? 1 : 0,
      variables: { x: brut },
      cle: valide ? null : 'Partiel'
    };
  },

  contact_ville(ctx) {
    const brut = estChaineRemplie(ctx.contact.ville) ? ctx.contact.ville.trim() : '';
    const valide = brut.length >= 2;
    return { applicable: true, ratio: valide ? 1 : 0, variables: valide ? { x: brut } : {} };
  },

  dates_presentes(ctx) {
    const total = ctx.experiences.length;
    if (total === 0) return { applicable: false };
    const datees = ctx.experiences.filter((e) => enIndexMois(e.debut) !== null).length;
    return { applicable: true, ratio: datees / total, variables: { x: datees, y: total } };
  },

  dates_coherentes(ctx) {
    const datees = ctx.experiences.filter((e) => enIndexMois(e.debut) !== null);
    if (datees.length === 0) return { applicable: false };

    const anneeMin = REGLAGES.anneeExperienceMin;
    const anneeMaxDebut = ctx.anneeReference + REGLAGES.anneeDebutMarge;
    const anneeMaxFin = ctx.anneeReference + REGLAGES.anneeFinMarge;

    const coherentes = datees.filter((experience) => {
      const debut = enIndexMois(experience.debut);
      const anneeDebut = anneeDe(debut);
      if (anneeDebut < anneeMin || anneeDebut > anneeMaxDebut) return false;
      const fin = enIndexMois(experience.fin);
      if (fin === null) return true; // poste en cours : il n'y a rien a verifier
      if (fin < debut) return false;
      const anneeFin = anneeDe(fin);
      return anneeFin >= anneeMin && anneeFin <= anneeMaxFin;
    }).length;

    return {
      applicable: true,
      ratio: coherentes / datees.length,
      variables: { x: coherentes, y: datees.length, z: datees.length - coherentes }
    };
  },

  dates_ordre(ctx) {
    const debuts = ctx.experiences.map((e) => enIndexMois(e.debut)).filter((v) => v !== null);
    if (debuts.length < 2) return { applicable: false };
    const decroissant = debuts.every((valeur, i) => i === 0 || debuts[i - 1] >= valeur);
    return { applicable: true, ratio: decroissant ? 1 : 0, variables: {} };
  },

  longueur_cv(ctx) {
    const min = REGLAGES.longueurCvMotsMin;
    const max = REGLAGES.longueurCvMotsMax;
    const resultat = mesurerIntervalle(ctx.nbMotsCv, min, max);
    return {
      applicable: true,
      ratio: resultat.ratio,
      cle: resultat.cle,
      variables: { x: ctx.nbMotsCv, min, max }
    };
  },

  longueur_resume(ctx) {
    const mots = compterMots(ctx.resume);
    // Pas de resume : deja sanctionne par structure_resume, on ne le facture pas deux fois.
    if (mots === 0) return { applicable: false };
    const min = REGLAGES.longueurResumeMotsMin;
    const max = REGLAGES.longueurResumeMotsMax;
    const resultat = mesurerIntervalle(mots, min, max);
    return {
      applicable: true,
      ratio: resultat.ratio,
      cle: resultat.cle,
      variables: { x: mots, min, max }
    };
  },

  redaction_verbes(ctx) {
    if (ctx.puces.length === 0) return { applicable: false };
    const avecVerbe = ctx.puces.filter(puceCommenceParVerbe).length;
    const part = avecVerbe / ctx.puces.length;
    const cible = REGLAGES.ratioVerbesCible;
    return {
      applicable: true,
      ratio: borner(part / cible, 0, 1),
      variables: {
        x: avecVerbe,
        y: ctx.puces.length,
        pct: Math.round(part * 100),
        cible: Math.round(cible * 100)
      }
    };
  },

  redaction_longueur_puces(ctx) {
    if (ctx.puces.length === 0) return { applicable: false };
    const moyenne =
      ctx.puces.reduce((somme, puce) => somme + compterMots(puce), 0) / ctx.puces.length;
    const min = REGLAGES.longueurPuceMotsMin;
    const max = REGLAGES.longueurPuceMotsMax;
    const resultat = mesurerIntervalle(moyenne, min, max);
    return {
      applicable: true,
      ratio: resultat.ratio,
      cle: resultat.cle,
      variables: { x: Math.round(moyenne), min, max }
    };
  },

  resultats_chiffres(ctx) {
    if (ctx.puces.length === 0) return { applicable: false };
    const avecChiffre = ctx.puces.filter(puceContientChiffre).length;
    const part = avecChiffre / ctx.puces.length;
    const cible = REGLAGES.ratioChiffresCible;
    return {
      applicable: true,
      ratio: borner(part / cible, 0, 1),
      variables: {
        x: avecChiffre,
        y: ctx.puces.length,
        pct: Math.round(part * 100),
        cible: Math.round(cible * 100)
      }
    };
  },

  resultats_impact(ctx) {
    if (ctx.puces.length === 0) return { applicable: false };
    const avecImpact = ctx.puces.filter(puceContientImpact).length;
    return {
      applicable: true,
      ratio: avecImpact > 0 ? 1 : 0,
      variables: { x: avecImpact, y: ctx.puces.length }
    };
  },

  motscles_couverture(ctx) {
    if (ctx.motsClesPoste.length === 0) return { applicable: false };
    const manquants = ctx.motsClesPoste.filter((mot) => !motCleTrouve(mot, ctx.texteRecherche));
    const couverts = ctx.motsClesPoste.length - manquants.length;
    const part = couverts / ctx.motsClesPoste.length;
    const cible = REGLAGES.ratioMotsClesCible;
    const listeManquants = manquants.slice(0, 6).join(', ') + (manquants.length > 6 ? '...' : '');
    return {
      applicable: true,
      ratio: borner(part / cible, 0, 1),
      variables: {
        x: couverts,
        y: ctx.motsClesPoste.length,
        pct: Math.round(part * 100),
        cible: Math.round(cible * 100),
        manquants: listeManquants || 'aucun'
      }
    };
  },

  motscles_resume(ctx) {
    // Non mesurable sans mots-cles, et non mesurable sans resume : l'absence de resume
    // est deja comptee par structure_resume.
    if (ctx.motsClesPoste.length === 0 || !ctx.resumeNormalise) return { applicable: false };
    const dansResume = ctx.motsClesPoste.filter((mot) =>
      motCleTrouve(mot, ctx.resumeNormalise)
    ).length;
    return {
      applicable: true,
      ratio: dansResume > 0 ? 1 : 0,
      variables: { x: dansResume, y: ctx.motsClesPoste.length }
    };
  },

  technique_texte_extractible(ctx) {
    if (!ctx.texteBrutFourni) return { applicable: false };
    const longueur = ctx.texteBrut.trim().length;
    const seuilZero = REGLAGES.caracteresExtraitsMin;
    const seuilOk = REGLAGES.caracteresExtraitsOk;
    return {
      applicable: true,
      ratio: borner((longueur - seuilZero) / (seuilOk - seuilZero), 0, 1),
      variables: { x: longueur }
    };
  },

  technique_mise_en_page(ctx) {
    if (!ctx.texteBrutFourni) return { applicable: false };
    const lignes = ctx.texteBrut.split(/\r?\n/);
    // Caracteres de dessin de tableau, barres verticales multiples, tabulations en
    // rafale : les trois signatures d'une mise en page que pdf-parse a entrelacee.
    const suspecte = (ligne) =>
      CARACTERES_TABLEAU.test(ligne) ||
      (ligne.match(/\|/g) || []).length >= 2 ||
      /\t{2,}/.test(ligne);
    const nbSuspectes = lignes.filter(suspecte).length;
    // Au-dela de 20 % de lignes touchees, le critere tombe a zero.
    return {
      applicable: true,
      ratio: borner(1 - (nbSuspectes / lignes.length) * 5, 0, 1),
      variables: { x: nbSuspectes, y: lignes.length }
    };
  },

  technique_caracteres(ctx) {
    if (!ctx.texteBrutFourni) return { applicable: false };
    const trouves = ctx.texteBrut.match(CARACTERES_ILLISIBLES);
    const nb = trouves ? trouves.length : 0;
    // 10 caracteres illisibles suffisent a annuler le critere.
    return { applicable: true, ratio: borner(1 - nb / 10, 0, 1), variables: { x: nb } };
  }
};

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function remplirModele(modele, variables) {
  if (typeof modele !== 'string') return '';
  return modele.replace(/\{(\w+)\}/g, (motif, nom) =>
    Object.prototype.hasOwnProperty.call(variables, nom) ? String(variables[nom]) : motif
  );
}

function choisirMessage(critere, ratio, cle, variables) {
  if (ratio >= 1) return remplirModele(critere.messageOk, variables);
  const specifique = cle ? critere[`messageAction${cle}`] : null;
  return remplirModele(specifique || critere.messageAction, variables);
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Calcule le score ATS d'un profil de CV.
 *
 * @param {object} profil  sortie de core/cv/profil.js (voir "Lecture tolerante" ci-dessus)
 * @param {object} [options]
 * @param {string} [options.texteBrut]       texte du PDF. Absent = criteres techniques non mesures.
 * @param {string[]} [options.motsClesPoste] mots-cles de l'offre visee. Vide = famille neutralisee.
 * @param {number} [options.anneeReference]  annee servant a juger une date improbable.
 *                                           Par defaut l'annee courante ; a fixer dans les tests.
 * @returns {{score:number, pointsObtenus:number, pointsMaxApplicables:number,
 *            criteres:Array, familles:Array}}
 */
function scoreAts(profil, options) {
  const ctx = construireContexte(profil, options);

  const criteres = bareme.criteres.map((critere) => {
    const mesureur = MESURES[critere.id];
    const brut = mesureur ? mesureur(ctx) : { applicable: false };
    const applicable = brut.applicable !== false;
    const ratio = applicable ? borner(brut.ratio, 0, 1) : 0;
    const obtenu = applicable ? arrondi1(critere.poids * ratio) : 0;

    const variables = Object.assign({}, brut.variables, {
      poids: critere.poids,
      obtenu: formaterNombre(obtenu),
      p: formaterNombre(critere.poids - obtenu)
    });

    return {
      id: critere.id,
      famille: critere.famille,
      libelle: critere.libelle,
      poids: critere.poids,
      obtenu,
      applicable,
      mesure: Object.assign({ ratio: arrondi1(ratio * 100) / 100 }, brut.variables),
      message: applicable
        ? choisirMessage(critere, ratio, brut.cle, variables)
        : 'Critere non mesurable sur ce CV : il est retire du calcul et du total.',
      facilite: critere.facilite
    };
  });

  const applicables = criteres.filter((critere) => critere.applicable);
  const pointsObtenus = arrondi1(applicables.reduce((somme, critere) => somme + critere.obtenu, 0));
  const pointsMaxApplicables = applicables.reduce((somme, critere) => somme + critere.poids, 0);
  const score =
    pointsMaxApplicables > 0 ? Math.round((pointsObtenus / pointsMaxApplicables) * 100) : 0;

  const familles = bareme.familles.map((famille) => {
    const membres = applicables.filter((critere) => critere.famille === famille.id);
    return {
      nom: famille.id,
      libelle: famille.libelle,
      obtenu: arrondi1(membres.reduce((somme, critere) => somme + critere.obtenu, 0)),
      max: membres.reduce((somme, critere) => somme + critere.poids, 0)
    };
  });

  return { score, pointsObtenus, pointsMaxApplicables, criteres, familles };
}

module.exports = {
  scoreAts,
  // Exportes pour les tests, et pour core/cv qui devra selectionner les puces a reecrire.
  normaliser,
  compterMots,
  puceCommenceParVerbe,
  puceContientChiffre,
  puceContientImpact,
  motCleTrouve
};
