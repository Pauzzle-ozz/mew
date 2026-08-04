const { normaliser } = require('../texte/normaliser');
const { tokeniser } = require('../texte/tokeniser');
const { lemmatiser } = require('../texte/lemmatiserFr');

const { moyennePonderee } = require('./moyennePonderee');
const { justifierAdequation, resumerEcart } = require('../gabarits/justifications');

/**
 * Propose des metiers a partir d'un profil, en s'appuyant sur le referentiel
 * ROME de France Travail.
 *
 * CE QUE CE FICHIER REMPLACE
 * Avant, on envoyait le CV a un modele de langage en lui demandant de
 * proposer des metiers ET de leur attribuer des notes. Trois problemes :
 *   - les notes changeaient a chaque appel (aucune temperature n'etait fixee) ;
 *   - le modele pouvait citer comme point fort une competence absente du CV ;
 *   - on lui demandait d'evaluer « le marche de l'emploi » et « le potentiel
 *     salarial », deux informations qu'un modele de langage ne peut pas
 *     connaitre : il produisait un chiffre plausible, pas un chiffre vrai.
 *
 * Ici, tout est calcule a partir de donnees officielles et tracables :
 * 1 911 fiches metier, 14 301 appellations, et la table des mobilites
 * professionnelles. Le meme profil donne toujours le meme resultat, et
 * chaque note peut etre expliquee ligne par ligne a l'utilisateur.
 */

// Les donnees ROME sont volumineuses (~10 Mo). On ne les charge qu'a la
// premiere utilisation reelle : un serveur qui ne fait que du suivi de
// candidatures n'a aucune raison de payer ce temps de demarrage.
let index = null;

function chargerIndex() {
  if (index) return index;

  const metiers = require('../../data/rome/metiers.json');
  const appellations = require('../../data/rome/appellations.json');
  const competences = require('../../data/rome/metier-competences.json');
  const savoirs = require('../../data/rome/metier-savoirs.json');
  const mobilites = require('../../data/rome/metier-mobilites.json');
  const version = require('../../data/rome/VERSION.json');

  const parCode = new Map();
  for (const metier of metiers) {
    parCode.set(metier.c, {
      code: metier.c,
      libelle: metier.l,
      definition: metier.d,
      acces: metier.a,
      secteurs: metier.s || [],
      appellations: [],
      // Sac de mots ponderes : chaque token du vocabulaire du metier porte
      // un poids. Les competences marquees « principales » par France Travail
      // comptent double : ce sont celles qui definissent vraiment le metier.
      vocabulaire: new Map(),
      poidsTotal: 0,
      competences: (competences[metier.c] || []).map((c) => c.l),
      competencesPrincipales: (competences[metier.c] || []).filter((c) => c.p).map((c) => c.l),
      mobilites: mobilites[metier.c] || []
    });
  }

  for (const [libelle, code] of appellations) {
    const metier = parCode.get(code);
    if (metier) metier.appellations.push(libelle);
  }

  const ajouterAuVocabulaire = (metier, texte, poids) => {
    for (const token of tokeniser(texte)) {
      const cle = lemmatiser(token);
      metier.vocabulaire.set(cle, (metier.vocabulaire.get(cle) || 0) + poids);
      metier.poidsTotal += poids;
    }
  };

  for (const metier of parCode.values()) {
    for (const c of competences[metier.code] || []) {
      ajouterAuVocabulaire(metier, c.l, c.p ? 2 : 1);
    }
    for (const s of savoirs[metier.code] || []) {
      ajouterAuVocabulaire(metier, s.l, 1);
    }
    // L'intitule et les appellations pesent lourd : c'est souvent le signal
    // le plus fort (« infirmier » dans un CV designe un metier, pas un mot).
    ajouterAuVocabulaire(metier, metier.libelle, 3);
    for (const a of metier.appellations) ajouterAuVocabulaire(metier, a, 2);
  }

  const mobilitesMax = Math.max(...[...parCode.values()].map((m) => m.mobilites.length), 1);

  // Rarete de chaque mot dans l'ensemble des intitules de metier.
  //
  // Sans cette ponderation, « Aide-soignante » et « Aide d'elevage agricole »
  // se ressemblent a 40 % parce qu'ils partagent le mot « aide » — et un CV
  // d'aide-soignante se voyait proposer des metiers agricoles. Or « aide »
  // apparait dans des centaines d'intitules quand « soignant » n'apparait que
  // dans quelques-uns : ce sont les mots RARES qui identifient un metier.
  const documents = new Map();
  let nbIntitules = 0;
  for (const metier of parCode.values()) {
    for (const intitule of [metier.libelle, ...metier.appellations]) {
      nbIntitules++;
      for (const token of new Set(tokeniser(intitule).map(lemmatiser))) {
        documents.set(token, (documents.get(token) || 0) + 1);
      }
    }
  }
  const raretes = new Map();
  for (const [token, frequence] of documents) {
    raretes.set(token, Math.log(nbIntitules / frequence));
  }

  index = { parCode, mobilitesMax, version, raretes };
  return index;
}

/**
 * Ressemblance entre deux intitules, ponderee par la rarete des mots.
 *
 * C'est un coefficient de Dice classique (deux fois l'intersection divisee
 * par la somme des tailles), sauf que chaque mot compte selon sa rarete
 * plutot que pour une unite.
 */
function ressemblanceIntitules(a, b, raretes) {
  const poids = (token) => raretes.get(token) ?? Math.log(1000);
  const motsA = new Set(tokeniser(a).map(lemmatiser));
  const motsB = new Set(tokeniser(b).map(lemmatiser));
  if (!motsA.size || !motsB.size) return 0;

  let partages = 0;
  for (const token of motsA) if (motsB.has(token)) partages += poids(token);

  let totalA = 0;
  for (const token of motsA) totalA += poids(token);
  let totalB = 0;
  for (const token of motsB) totalB += poids(token);

  return (2 * partages) / (totalA + totalB);
}

/**
 * Transforme un profil en sac de mots lemmatises.
 * On y verse les competences, l'intitule vise et le texte des experiences :
 * ce qu'une personne sait faire s'exprime autant dans ses missions que dans
 * une liste de competences.
 */
function vocabulaireDuProfil(profil) {
  const morceaux = [];

  const ajouter = (valeur) => {
    if (!valeur) return;
    if (Array.isArray(valeur)) valeur.forEach(ajouter);
    else if (typeof valeur === 'string') morceaux.push(valeur);
    else if (typeof valeur === 'object') {
      ['intitule', 'description', 'poste', 'titre', 'libelle'].forEach((cle) => ajouter(valeur[cle]));
    }
  };

  // Le projet fait coexister trois formes de profil : celle du parseur de CV,
  // celle du formulaire d'analyse, et celle du matcher. On les accepte toutes
  // plutot que d'imposer une conversion en amont — un champ oublie ici
  // signifie un ecran vide pour l'utilisateur, sans le moindre message.
  ajouter(profil.competences);
  ajouter(profil.competences_principales);   // formulaire d'analyse
  ajouter(profil.competences_techniques);    // matcher
  ajouter(profil.competences_soft);
  ajouter(profil.soft_skills);               // formulaire d'analyse
  ajouter(profil.outils);
  ajouter(profil.langues);
  ajouter(profil.secteur_preferentiel);
  ajouter(profil.intitulePrincipal);
  ajouter(profil.titre_poste);
  ajouter(profil.type_poste);                // formulaire d'analyse
  ajouter(profil.resume);
  ajouter(profil.experience);                // formulaire : texte libre
  ajouter(profil.experiences);
  ajouter(profil.formations);

  const sac = new Set();
  for (const token of tokeniser(morceaux.join(' . '))) {
    sac.add(lemmatiser(token));
  }
  return sac;
}

/** Tous les intitules par lesquels on peut designer ce profil. */
function intitulesDuProfil(profil) {
  const liste = [];
  if (profil.intitulePrincipal) liste.push(profil.intitulePrincipal);
  if (profil.titre_poste) liste.push(profil.titre_poste);
  if (profil.type_poste) liste.push(profil.type_poste);
  for (const experience of profil.experiences || []) {
    const intitule = typeof experience === 'string' ? experience : experience?.intitule || experience?.poste;
    if (intitule) liste.push(intitule);
  }
  return liste.filter(Boolean);
}

/**
 * Part du vocabulaire du metier que le profil couvre reellement.
 *
 * Une couverture brute de 0,30 correspond deja a une tres bonne
 * correspondance : un CV liste une dizaine de competences la ou une fiche
 * metier en decrit une trentaine, en phrases completes. On ramene donc
 * l'echelle pour que 0,45 vaille 100 %, sans quoi tous les scores
 * s'ecraseraient entre 10 et 30 et ne diraient plus rien.
 */
const SATURATION = 0.45;

function couvertureVocabulaire(metier, sacProfil) {
  if (!metier.poidsTotal) return 0;
  let couvert = 0;
  for (const [token, poids] of metier.vocabulaire) {
    if (sacProfil.has(token)) couvert += poids;
  }
  return Math.min(1, (couvert / metier.poidsTotal) / SATURATION);
}

/** Meilleure ressemblance entre les intitules du profil et ceux du metier. */
function proximiteIntitule(metier, intitules, raretes) {
  if (!intitules.length) return null;
  let meilleure = 0;
  // On compare des ENSEMBLES DE MOTS, jamais avec Jaro-Winkler : sur des
  // expressions, celui-ci rapproche a tort « chef de projet » et « chef de
  // produit » (0,93 contre 0,67 pour une mesure par mots).
  for (const candidat of intitules) {
    meilleure = Math.max(meilleure, ressemblanceIntitules(candidat, metier.libelle, raretes));
    for (const appellation of metier.appellations) {
      meilleure = Math.max(meilleure, ressemblanceIntitules(candidat, appellation, raretes));
      if (meilleure >= 0.95) return meilleure;
    }
  }
  return meilleure;
}

/** Quelles competences du metier le profil demontre, et lesquelles manquent. */
function detaillerCompetences(metier, sacProfil) {
  const communes = [];
  const manquantes = [];

  for (const competence of metier.competencesPrincipales) {
    const tokens = tokeniser(competence).map(lemmatiser);
    if (!tokens.length) continue;
    const couverts = tokens.filter((t) => sacProfil.has(t)).length;
    // Une competence est consideree demontree si le profil couvre au moins
    // la moitie de ses mots porteurs de sens.
    if (couverts / tokens.length >= 0.5) communes.push(competence);
    else manquantes.push(competence);
  }

  return { communes, manquantes };
}

/**
 * Categorie affichee a l'utilisateur, deduite d'un SEUIL sur le score.
 * Avant, c'etait le modele qui choisissait un mot, avec des variations
 * d'accent telles qu'une fonction dediee existait pour les rattraper
 * (cvService.normalizeCategorie). Un seuil ne se trompe pas d'accent.
 */
function categoriePourScore(score) {
  if (score >= 65) return 'ideal';
  if (score >= 40) return 'accessible';
  return 'reconversion';
}

/**
 * Propose les metiers correspondant a un profil.
 *
 * @param {Object} profil - sortie de core/cv/profil.js, ou un profil de
 *   formulaire ({ titre_poste, competences, experiences... }). Les deux
 *   formes sont acceptees.
 * @param {Object} options
 * @param {number} options.limite - nombre de metiers a renvoyer (defaut 6)
 * @param {Function} options.volumeOffres - optionnel : (codeRome) => nombre
 *   d'offres publiees. Fourni par France Travail quand les cles sont
 *   configurees. Sans lui, la note « marche emploi » est marquee indisponible
 *   plutot qu'inventee.
 * @returns {Object} au format attendu par le frontend
 */
function proposerMetiers(profil, options = {}) {
  const { limite = 6, volumeOffres = null } = options;
  const { parCode, mobilitesMax, version, raretes } = chargerIndex();

  const sacProfil = vocabulaireDuProfil(profil || {});
  const intitules = intitulesDuProfil(profil || {});

  const candidats = [];
  for (const metier of parCode.values()) {
    // ATTENTION : moyennePonderee ARRONDIT a l'entier. On lui passe donc des
    // notes deja ramenees sur 100, jamais des fractions entre 0 et 1 — sinon
    // tout s'ecrase sur 0 ou 1 et l'integralite des metiers est filtree.
    const couverture = 100 * couvertureVocabulaire(metier, sacProfil);
    const proximite = proximiteIntitule(metier, intitules, raretes);
    const intitule = proximite === null ? null : 100 * proximite;

    // Adequation : ce que la personne sait faire, face a ce que le metier
    // demande. L'intitule est neutralise quand le profil n'en fournit aucun,
    // et son poids est alors reporte sur les competences.
    const adequation = moyennePonderee(
      intitule === null ? [couverture] : [couverture, intitule],
      intitule === null ? [1] : [0.6, 0.4]
    );

    if (adequation <= 0) continue;

    // Potentiel d'evolution : le nombre de metiers vers lesquels le ROME
    // documente une mobilite depuis celui-ci. C'est une donnee officielle,
    // pas une estimation de salaire inventee par un modele.
    const potentiel = Math.round(100 * Math.min(1, metier.mobilites.length / Math.min(mobilitesMax, 15)));

    // Marche de l'emploi : uniquement si une vraie source est branchee.
    // null signifie « on ne sait pas », ce qui est une reponse honnete et
    // bien plus utile qu'un chiffre invente.
    let marche = null;
    if (typeof volumeOffres === 'function') {
      const nombre = volumeOffres(metier.code);
      if (Number.isFinite(nombre) && nombre >= 0) {
        // Echelle logarithmique : 10 offres donnent 25, 1 000 offres donnent 72.
        marche = Math.min(100, Math.round(24 * Math.log10(1 + nombre)));
      }
    }

    const global = marche === null
      ? moyennePonderee([adequation, potentiel], [0.75, 0.25])
      : moyennePonderee([adequation, marche, potentiel], [0.55, 0.25, 0.2]);

    candidats.push({ metier, adequation, potentiel, marche, global });
  }

  // Le classement se fait sur le score AFFICHE, pas sur un score intermediaire :
  // une liste dont les nombres ne sont pas decroissants passe pour un bug.
  candidats.sort((a, b) => b.global - a.global || b.adequation - a.adequation);

  // On n'affiche que les metiers reellement proches du meilleur : proposer
  // six pistes quand une seule tient la route decredibilise l'ensemble.
  // Le seuil est RELATIF au meilleur resultat, parce qu'un seuil absolu
  // punirait les profils decrits en trois lignes.
  const meilleure = candidats.length ? candidats[0].adequation : 0;
  const plancher = Math.max(25, Math.round(0.55 * meilleure));

  // Garde-fou : plutot qu'un ecran vide, on montre toujours au moins trois
  // pistes, quitte a les qualifier de « reconversion ».
  const pertinents = candidats.filter((c) => c.adequation >= plancher);
  const retenus = (pertinents.length >= 3 ? pertinents : candidats.slice(0, 3)).slice(0, limite);

  const metiersProposes = retenus.map((candidat, rang) => {
    const { metier, adequation, potentiel, marche, global } = candidat;
    const { communes, manquantes } = detaillerCompetences(metier, sacProfil);
    const total = communes.length + manquantes.length;

    return {
      intitule: metier.libelle,
      code_rome: metier.code,
      // La categorie repond a « ce metier me correspond-il ? », donc elle se
      // base sur l'adequation seule. La calculer sur le score global la
      // gonflerait : un metier tres ouvert sur d'autres (beaucoup de
      // mobilites) paraitrait accessible a quelqu'un qui n'en a aucune
      // competence.
      categorie: categoriePourScore(adequation),
      priorite: rang + 1,
      scores: {
        adequation_profil: adequation,
        marche_emploi: marche,
        potentiel_evolution: potentiel,
        global
      },
      justifications: {
        adequation_profil: justifierAdequation({
          competencesCommunes: communes,
          competencesManquantes: manquantes,
          totalRequises: total,
          intituleMetier: metier.libelle
        }),
        marche_emploi: marche === null
          ? "Volume d'offres non disponible : configure les cles France Travail pour l'activer."
          : `Estime a partir du volume d'offres publiees sur France Travail.`,
        potentiel_evolution: metier.mobilites.length
          ? `Le ROME documente ${metier.mobilites.length} evolutions possibles depuis ce metier.`
          : 'Aucune mobilite documentee dans le ROME pour ce metier.'
      },
      conseils: [
        manquantes.length ? resumerEcart({ competencesManquantes: manquantes }) : null,
        metier.acces ? `Acces au metier : ${metier.acces}` : null,
        metier.mobilites.length
          ? `Evolutions possibles : ${metier.mobilites.slice(0, 3).map((m) => m.l).join(', ')}.`
          : null
      ].filter(Boolean),
      mots_cles: metier.appellations.slice(0, 6),
      // Detail non affiche par l'ancienne interface, mais qui permet de
      // rendre le score explicable au lieu de le laisser opaque.
      detail: {
        competencesDemontrees: communes,
        competencesManquantes: manquantes,
        totalCompetencesCles: total,
        definition: metier.definition,
        secteurs: metier.secteurs
      }
    };
  });

  // Les competences cles du profil : celles qui reviennent le plus souvent
  // dans les metiers proposes. Ce sont les mots a mettre en avant.
  const frequence = new Map();
  for (const propose of metiersProposes) {
    for (const competence of propose.detail.competencesDemontrees) {
      frequence.set(competence, (frequence.get(competence) || 0) + 1);
    }
  }
  const competencesCles = [...frequence.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([competence]) => competence);

  // Mots-cles de recherche : les appellations officielles des metiers
  // proposes. Ce sont exactement les termes utilises par les sites d'offres,
  // ce qui les rend directement utilisables dans une barre de recherche.
  const motsClesRecherche = [...new Set(
    metiersProposes.flatMap((m) => m.mots_cles).map((m) => m.trim())
  )].slice(0, 12);

  return {
    metiers_proposes: metiersProposes,
    competences_cles: competencesCles.length ? competencesCles : [...sacProfil].slice(0, 10),
    mots_cles_recherche: motsClesRecherche,
    source: {
      referentiel: 'ROME 4.0 - France Travail',
      version: version.version,
      licence: version.licence
    }
  };
}

/** Recherche un metier par son intitule ou une de ses appellations. */
function chercherMetier(requete) {
  const { parCode } = chargerIndex();
  const cible = normaliser(requete || '');
  if (!cible) return [];

  const resultats = [];
  for (const metier of parCode.values()) {
    const correspond = normaliser(metier.libelle).includes(cible)
      || metier.appellations.some((a) => normaliser(a).includes(cible));
    if (correspond) resultats.push({ code: metier.code, libelle: metier.libelle });
  }
  return resultats;
}

module.exports = { proposerMetiers, chercherMetier, categoriePourScore, chargerIndex };
