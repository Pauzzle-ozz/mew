/**
 * Suivi des candidatures : qui faut-il relancer, et ou en est-on ?
 *
 * POURQUOI CE FICHIER EXISTE
 * Relancer une candidature restee sans reponse est le geste qui rapporte le
 * plus dans une recherche d'emploi, et c'est celui qu'on oublie. Tout ce qui
 * est ici est du calcul de dates : c'est 100% local, instantane et gratuit.
 * Aucun modele de langage n'a besoin d'etre appele pour compter des jours.
 *
 * REGLE DE PRUDENCE
 * Les donnees viennent d'un fichier JSON ou d'une base editee a la main :
 * une date peut etre nulle, vide, mal formee ou dans le futur. Aucune de ces
 * situations ne doit faire planter le suivi de candidatures de quelqu'un.
 * Chaque date passe donc par versDate(), qui renvoie null plutot que de
 * propager un NaN silencieux.
 */

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

// Au-dela de 30 jours sans reponse, une candidature est consideree comme
// dormante : ce n'est pas un echec, mais elle ne bougera plus toute seule.
const JOURS_AVANT_DORMANCE = 30;

// Statuts qui signifient « la candidature est partie ».
const STATUTS_ENVOYES = ['postule', 'entretien', 'offre', 'refuse'];

// Statuts qui signifient « l'entreprise a repondu ». Un refus EST une
// reponse : le taux de reponse mesure si le CV declenche une reaction, pas
// si la reaction est bonne.
const STATUTS_REPONSE = ['entretien', 'offre', 'refuse'];

const TOUS_STATUTS = ['a_postuler', 'postule', 'entretien', 'offre', 'refuse'];

/**
 * Calendrier des jours ouvres.
 *
 * Ce module est ecrit en parallele par quelqu'un d'autre. Tant qu'il n'est
 * pas la, on retombe sur une version de secours qui saute simplement les
 * samedis et dimanches (sans les jours feries). Des que joursOuvres.js
 * existe, c'est LUI qui est utilise, sans rien changer ici.
 */
let calendrier = null;
try {
  const modul = require('./joursOuvres');
  if (modul && typeof modul.ajouterJoursOuvres === 'function') calendrier = modul;
} catch (_) {
  calendrier = null;
}

const estWeekend = (date) => date.getDay() === 0 || date.getDay() === 6;

/** Version de secours : voir le commentaire ci-dessus. */
const secours = {
  prochainJourOuvre(date) {
    const resultat = new Date(date.getTime());
    while (estWeekend(resultat)) resultat.setDate(resultat.getDate() + 1);
    return resultat;
  },
  ajouterJoursOuvres(date, jours) {
    const resultat = new Date(date.getTime());
    let restants = Math.max(0, Math.trunc(jours));
    while (restants > 0) {
      resultat.setDate(resultat.getDate() + 1);
      if (!estWeekend(resultat)) restants -= 1;
    }
    return secours.prochainJourOuvre(resultat);
  }
};

/**
 * Convertit n'importe quoi en Date utilisable, ou null.
 * Accepte une Date, une chaine ISO, un timestamp.
 */
function versDate(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const date = valeur instanceof Date ? new Date(valeur.getTime()) : new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Date d'envoi reelle d'une candidature.
 * applied_at est la bonne source ; created_at sert de filet pour les
 * candidatures importees ou creees avant que ce champ existe.
 */
function dateEnvoi(candidature) {
  if (!candidature || typeof candidature !== 'object') return null;
  return versDate(candidature.applied_at) || versDate(candidature.created_at);
}

/**
 * Nombre de jours de CALENDRIER entre deux dates.
 *
 * On ramene les deux dates a minuit avant de soustraire. Sans ca, deux pieges :
 * une candidature envoyee hier a 23 h compterait pour 0 jour ce matin a 8 h,
 * et un changement d'heure (mars / octobre) transforme une journee en 23 h,
 * donc en « 0 jour » apres arrondi vers le bas. Un suivi de candidatures qui
 * perd un jour deux fois par an fait rater des relances sans rien signaler.
 */
const aMinuit = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const joursEntre = (debut, fin) => Math.round((aMinuit(fin) - aMinuit(debut)) / MS_PAR_JOUR);

const arrondir = (valeur, decimales) => {
  const facteur = 10 ** decimales;
  return Math.round(valeur * facteur) / facteur;
};

/**
 * A quelle date faut-il relancer une candidature envoyee tel jour ?
 *
 * On compte en jours OUVRES : une candidature envoyee un vendredi ne se
 * relance pas le samedi suivant. 8 jours ouvres, c'est une dizaine de jours
 * calendaires — assez pour laisser le recruteur travailler, assez tot pour
 * que le dossier soit encore ouvert.
 *
 * @param {Date|string|number} dateCandidature
 * @param {number} [joursOuvres=8]
 * @returns {Date|null} null si la date fournie est inexploitable
 */
function dateRelance(dateCandidature, joursOuvres = 8) {
  const depart = versDate(dateCandidature);
  if (!depart) return null;

  const nombreJours = Number(joursOuvres);
  const delai = Number.isFinite(nombreJours) ? Math.max(0, Math.trunc(nombreJours)) : 8;

  const outil = calendrier || secours;
  try {
    const brut = delai === 0
      ? (outil.prochainJourOuvre ? outil.prochainJourOuvre(depart) : depart)
      : outil.ajouterJoursOuvres(depart, delai);
    // Le module voisin peut renvoyer une Date ou une chaine ISO : on accepte
    // les deux plutot que d'imposer un format a un module qu'on ne possede pas.
    const converti = versDate(brut);
    if (converti) return converti;
  } catch (_) {
    // On retombe sur le secours plus bas.
  }
  // Le calendrier voisin a leve une erreur ou renvoye quelque chose
  // d'inutilisable : mieux vaut une date approchee (sans jours feries) que
  // pas de relance du tout — sans date, la candidature disparait de la liste.
  return versDate(secours.ajouterJoursOuvres(depart, delai));
}

/**
 * Liste les candidatures qu'il est temps de relancer.
 *
 * Sont ecartees : celles pas encore envoyees (a_postuler), celles qui ont
 * deja recu une reponse (relancer apres un refus n'a pas de sens), et celles
 * deja relancees (follow_up_sent).
 *
 * @param {Array} candidatures
 * @param {Date|string} [aujourdhui=new Date()]
 * @returns {Array<{candidature: Object, dateRelance: Date, joursDepuisEnvoi: number}>}
 *          triees de la plus urgente (la plus ancienne) a la moins urgente
 */
function relancesAFaire(candidatures, aujourdhui = new Date()) {
  if (!Array.isArray(candidatures)) return [];
  const reference = versDate(aujourdhui) || new Date();

  const resultat = [];

  for (const candidature of candidatures) {
    if (!candidature || typeof candidature !== 'object') continue;
    if (candidature.status !== 'postule') continue;
    if (candidature.follow_up_sent) continue;

    const envoi = dateEnvoi(candidature);
    if (!envoi) continue;

    // Une date de relance deja fixee sur la fiche fait autorite : c'est un
    // choix de l'utilisateur, on ne le recalcule pas dans son dos.
    const echeance = versDate(candidature.follow_up_date) || dateRelance(envoi);
    if (!echeance) continue;

    if (echeance.getTime() <= reference.getTime()) {
      resultat.push({
        candidature,
        dateRelance: echeance,
        joursDepuisEnvoi: Math.max(0, joursEntre(envoi, reference))
      });
    }
  }

  return resultat.sort((a, b) => a.dateRelance - b.dateRelance);
}

/**
 * Tableau de bord de la recherche d'emploi.
 *
 * @param {Array} candidatures
 * @param {Date|string} [aujourdhui=new Date()] - injectable pour les tests
 * @returns {{
 *   total: number,
 *   parStatut: Object,
 *   tauxReponse: number,
 *   delaiMoyenReponseJours: number|null,
 *   candidaturesDormantes: number,
 *   cadenceHebdomadaire: number
 * }}
 */
function statistiques(candidatures, aujourdhui = new Date()) {
  const liste = Array.isArray(candidatures)
    ? candidatures.filter((c) => c && typeof c === 'object')
    : [];
  const reference = versDate(aujourdhui) || new Date();

  // Object.create(null) : un objet SANS heritage. Avec un objet normal, un
  // statut nomme « constructor » (base editee a la main) lirait une fonction
  // d'Object.prototype au lieu de 0, et « __proto__ » ne se compterait pas du
  // tout. Le compteur est reconverti en objet ordinaire au retour.
  const parStatut = Object.create(null);
  TOUS_STATUTS.forEach((statut) => { parStatut[statut] = 0; });

  let envoyees = 0;
  let reponses = 0;
  let dormantes = 0;
  const delais = [];
  let premierEnvoi = null;

  for (const candidature of liste) {
    const statut = typeof candidature.status === 'string' ? candidature.status : 'a_postuler';
    // Un statut inconnu (base editee a la main, futur statut) est compte tel
    // quel plutot qu'ignore : mieux vaut un total juste qu'un total propre.
    parStatut[statut] = (parStatut[statut] || 0) + 1;

    if (!STATUTS_ENVOYES.includes(statut)) continue;
    envoyees += 1;

    const envoi = dateEnvoi(candidature);
    if (envoi && (!premierEnvoi || envoi < premierEnvoi)) premierEnvoi = envoi;

    if (STATUTS_REPONSE.includes(statut)) {
      reponses += 1;
      // updated_at est la meilleure approximation de la date de reponse :
      // le statut passe a « entretien » ou « refuse » le jour ou on l'apprend.
      const reponse = versDate(candidature.updated_at);
      if (envoi && reponse) {
        const delai = joursEntre(envoi, reponse);
        if (delai >= 0) delais.push(delai);
      }
    } else if (statut === 'postule' && envoi) {
      if (joursEntre(envoi, reference) > JOURS_AVANT_DORMANCE) dormantes += 1;
    }
  }

  // Cadence : rythme d'envoi depuis la toute premiere candidature. Une
  // periode plus courte qu'une semaine est comptee comme une semaine, sinon
  // « 3 candidatures en 2 jours » afficherait une cadence de 10,5 par
  // semaine, ce qui ne veut rien dire.
  let cadenceHebdomadaire = 0;
  if (envoyees > 0 && premierEnvoi) {
    const jours = Math.max(0, joursEntre(premierEnvoi, reference));
    const semaines = Math.max(1, (jours + 1) / 7);
    cadenceHebdomadaire = arrondir(envoyees / semaines, 1);
  }

  return {
    total: liste.length,
    // Le spread recopie les cles telles quelles, y compris « __proto__ »,
    // la ou Object.assign declencherait le setter et perdrait la valeur.
    parStatut: { ...parStatut },
    // En pourcentage (0 a 100), avec une decimale : c'est ce qu'on affiche.
    tauxReponse: envoyees > 0 ? arrondir((reponses / envoyees) * 100, 1) : 0,
    // null, et non 0 : « aucune reponse encore » n'est pas « repondu en 0 jour ».
    delaiMoyenReponseJours: delais.length > 0
      ? arrondir(delais.reduce((a, b) => a + b, 0) / delais.length, 1)
      : null,
    candidaturesDormantes: dormantes,
    cadenceHebdomadaire
  };
}

module.exports = {
  dateRelance,
  relancesAFaire,
  statistiques,
  JOURS_AVANT_DORMANCE,
  STATUTS_ENVOYES,
  STATUTS_REPONSE
};
