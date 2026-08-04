'use strict';

/**
 * Lecture des exigences d'une offre d'emploi a partir de son texte.
 *
 * REGLE D'OR DU PROJET : aucun dictionnaire ne sert a FILTRER les
 * competences. Si on ne gardait que les termes presents dans une liste de
 * technologies, une offre d'aide-soignant ou de plombier ressortirait avec
 * zero competence — et le score de matching de ces candidats vaudrait zero.
 * Ici on garde donc TOUS les termes significatifs du texte : on ne jette que
 * les mots vides (le, la, pour...) et le jargon d'annonce (poste, candidat,
 * CDI...), qui ne sont jamais des competences quel que soit le metier.
 *
 * Fonction pure : pas de reseau, pas de fichier, meme entree = meme sortie.
 */

// ─────────────────────────────────────────────────────────
// MOTS QU'ON NE RETIENT JAMAIS COMME COMPETENCE
// ─────────────────────────────────────────────────────────

// Mots vides du francais (version compacte ecrite a la main : le projet
// s'interdit toute dependance npm, et data/fr/stopwords.json n'existe pas
// encore au moment ou ce fichier est ecrit).
const MOTS_VIDES = `
le la les un une des du de d au aux a et ou ni mais donc or car que qui quoi
dont ou ce cet cette ces son sa ses leur leurs notre nos votre vos mon ma mes
ton ta tes il elle ils elles on nous vous je tu me te se sy lui y en est sont
etre suis es sommes etes sera seront serez etait etaient ete avoir ai as ont
avons avez avait avaient eu aura auront faire fait fais font ferez pour par
avec sans sous sur dans chez vers entre pendant depuis jusqu jusque afin ainsi
alors aussi autre autres bien beaucoup ceci cela celui celle ceux comme comment
des deja encore ensuite plus moins tres tout tous toute toutes trop peu si non
oui ne pas jamais toujours quand puis chaque meme memes plusieurs quelque
quelques tel telle tels telles etc via lors lorsque selon environ notamment
sera dont apres avant plutot surtout egalement idealement minimum maximum
bonne bon bonnes bons solide solides excellent excellente forte fort grande
grand nouvelle nouveau nouveaux premiere premier deuxieme reel reelle vrai
vraiment permettra permet permettant venez sein cadre part
deux trois quatre cinq six sept huit neuf dix
`.trim().split(/\s+/);

// Jargon des annonces : ces mots decrivent l'annonce elle-meme, pas le
// travail. Les retirer ne fait perdre aucune competence, quel que soit le
// metier — c'est la seule raison pour laquelle cette liste est acceptable.
const JARGON_ANNONCE = `
poste postes offre offres emploi emplois annonce annonces candidat candidats
candidate candidates candidature candidatures cv postuler recrutement recrute
recrutons recherchons recherche recherchez rejoindre rejoignez integrer
mission missions entreprise entreprises societe salaire salaires remuneration
avantages contrat contrats cdi cdd interim stage stagiaire alternance
alternant apprentissage freelance description descriptif propos profil profils
temps plein partiel horaire horaires semaine semaines mois annee annees an ans
jour jours jours heure heures euros euro brut net ville lieu localisation type
date debut immediat possible souhaite souhaitee souhaitees souhaites requis
requise requises apprecie appreciee obligatoire niveau niveaux experience
experiences formation formations diplome diplomes bac connaissance
connaissances maitrise maitriser competence competences capacite capacites
aptitude aptitudes savoir savoirs poste titulaire justifiant justifiez
`.trim().split(/\s+/);

const MOTS_IGNORES = new Set([...MOTS_VIDES, ...JARGON_ANNONCE]);

// Petits mots qui relient deux termes d'une meme competition :
// « pose DE perfusion », « conduite D'engins », « travail EN equipe ».
const CONNECTEURS = new Set(['de', 'd', 'du', 'des', 'la', 'le', 'les', 'a', 'au', 'aux', 'en', 'sur']);

// Termes courts qu'on garde malgre la longueur minimale de 3 caracteres.
const COURTS_ACCEPTES = new Set(['c++', 'c#', 'go', 'r', 'ia', 'bi', 'qa', 'ux', 'ui', '3d', '2d']);

const NOMBRE_MAX_COMPETENCES = 30;

// ─────────────────────────────────────────────────────────
// OUTILS DE TEXTE
// ─────────────────────────────────────────────────────────

/**
 * Retire les accents SANS changer la longueur de la chaine (les caracteres
 * precomposes se decomposent en lettre + accent, on ne supprime que l'accent).
 * On s'en sert pour ecrire des regex simples : /experience/ trouve aussi
 * « expérience ».
 */
function sansAccents(texte) {
  return texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Filet defensif : si on nous passe du HTML au lieu du texte de l'offre,
 * on retire les balises plutot que de compter « div » comme une competence.
 * (Version minimale volontairement : la conversion HTML complete vit dans
 * extraireOffre.js, et ce fichier ne doit pas dependre de lui.)
 */
function texteNettoye(entree) {
  if (typeof entree !== 'string') return '';
  let texte = entree;
  if (/<[a-z!/][^>]*>/i.test(texte)) {
    texte = texte
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');
  }
  return texte.replace(/\r/g, '').replace(/[^\S\n]+/g, ' ');
}

const REGEX_MOT = /[a-zà-öø-ÿ0-9][a-zà-öø-ÿ0-9'’./+#_-]*/gi;

/**
 * Decoupe une ligne aux signes de ponctuation, AVANT de compter les mots.
 * Sans cela on fabriquerait des groupes qui n'existent pas : dans
 * « soudure cuivre, lecture de plans », « cuivre lecture » n'est pas une
 * competence. Le point n'est une coupure que s'il est suivi d'un espace,
 * pour ne pas casser « node.js ».
 */
function decouperEnSegments(ligne) {
  return ligne
    .split(/[,;:!?•·|]+|\.\s+|\.$|\s+[-–—]\s+|[()[\]{}"«»]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/**
 * Decoupe une ligne en mots. On garde volontairement le point, le plus et le
 * diese a l'interieur des mots pour ne pas casser « node.js », « c++ », « c# ».
 */
function decouperEnMots(ligne) {
  const mots = ligne.match(REGEX_MOT) || [];
  return mots
    .map((mot) => mot.toLowerCase().replace(/^[.'’_-]+/, '').replace(/[.'’_/-]+$/, ''))
    .filter(Boolean);
}

/**
 * Forme comparable d'un mot : sans accents et sans l'elision qui le colle au
 * mot precedent. « d'hygiene » et « hygiene » sont le meme mot — mais on ne
 * garde cette forme que pour comparer, l'affichage conserve « d'hygiene »
 * pour rester du francais lisible.
 */
function motNu(mot) {
  return sansAccents(mot).replace(/^(?:qu|[cdjlmnst])['’]/, '');
}

/** Un mot qui peut etre une competence (on ne juge PAS du metier concerne). */
function estSignificatif(mot) {
  const nu = motNu(mot);
  if (COURTS_ACCEPTES.has(nu)) return true;
  if (nu.length < 3) return false;
  if (/^\d+$/.test(nu)) return false;          // « 35 », « 2024 »
  if (/^\d+[a-z]{0,2}$/.test(nu)) return false; // « 35h », « 2eme »
  if (MOTS_IGNORES.has(nu)) return false;
  return true;
}

/**
 * Cle de dedoublonnage : sans accents et sans marque de pluriel, pour que
 * « compétences relationnelles » et « competence relationnelle » comptent
 * pour un seul terme. C'est une lemmatisation minimale, pas une vraie —
 * core/texte/lemmatiserFr.js fera mieux quand il existera.
 */
function cle(terme) {
  return terme
    .split(/\s+/)
    .map(motNu)
    .map((mot) => (mot.length > 4 ? mot.replace(/(?:aux|eaux|s|x)$/, '') : mot))
    .join(' ');
}

// ─────────────────────────────────────────────────────────
// SECTIONS D'EXIGENCES
// ─────────────────────────────────────────────────────────

// Les lignes qui suivent un de ces titres pesent double : c'est la que le
// recruteur ecrit ce qu'il exige vraiment.
const TITRES_EXIGENCES = [
  /profil recherche/i, /votre profil/i, /le profil/i, /profil du candidat/i,
  /profil souhaite/i, /competences?/i, /savoir[- ]faire/i, /savoir[- ]etre/i,
  /pre[- ]?requis/i, /qualifications?/i, /exigences?/i, /qualites requises/i,
  /vous (?:etes|avez|maitrisez|justifiez|disposez|possedez|savez)/i,
  /(?:ce que )?nous recherchons/i, /experience requise/i, /formation requise/i,
];

// ... et ces titres-la ferment la section : on repasse en poids normal.
const TITRES_AUTRES = [
  /avantages/i, /ce que nous (?:offrons|proposons)/i, /notre offre/i,
  /a propos (?:de|du)/i, /qui sommes[- ]nous/i, /notre entreprise/i,
  /comment postuler/i, /processus de recrutement/i, /pour postuler/i,
  /informations? (?:complementaires|pratiques)/i, /remuneration/i,
  /vos missions/i, /^missions?\b/i, /le poste\b/i, /conditions/i,
];

function correspondAUnTitre(ligneNue, motifs) {
  if (ligneNue.length > 120) return false; // une phrase longue n'est pas un titre
  return motifs.some((motif) => motif.test(ligneNue));
}

/**
 * Decoupe le texte en lignes et attribue a chacune un poids :
 * 2 si elle appartient a une section d'exigences, 1 sinon.
 */
function lignesPonderees(texte) {
  const lignes = texte.split('\n').map((l) => l.trim()).filter(Boolean);
  const resultat = [];
  let dansExigences = false;

  for (const ligne of lignes) {
    const nue = sansAccents(ligne).toLowerCase();
    if (correspondAUnTitre(nue, TITRES_EXIGENCES)) dansExigences = true;
    else if (correspondAUnTitre(nue, TITRES_AUTRES)) dansExigences = false;

    resultat.push({ ligne, poids: dansExigences ? 2 : 1 });
  }
  return resultat;
}

// ─────────────────────────────────────────────────────────
// COMPETENCES
// ─────────────────────────────────────────────────────────

/**
 * Termes significatifs de l'offre, les plus specifiques d'abord.
 * On produit des mots seuls ET des groupes de mots (« pose de perfusion »,
 * « lecture de plans ») : c'est le groupe qui porte le sens du metier.
 */
function extraireCompetences(texte) {
  const candidats = new Map(); // cle -> { terme, score, position }
  let position = 0;

  const ajouter = (terme, poids, bonus) => {
    position += 1;
    const identifiant = cle(terme);
    const existant = candidats.get(identifiant);
    if (existant) {
      existant.score += poids + bonus;
      return;
    }
    candidats.set(identifiant, { terme, score: poids + bonus, position });
  };

  for (const { ligne, poids } of lignesPonderees(texte)) {
    for (const segment of decouperEnSegments(ligne)) {
      const mots = decouperEnMots(segment);

      for (let i = 0; i < mots.length; i += 1) {
        const mot = mots[i];
        if (!estSignificatif(mot)) continue;

        ajouter(mot, poids, 0);

        // Groupe de 2 mots colles : « soudure cuivre », « react native ».
        if (i + 1 < mots.length && estSignificatif(mots[i + 1])) {
          ajouter(`${mot} ${mots[i + 1]}`, poids, 1);
        }
        // Groupe relie par un petit mot : « pose de perfusion ».
        if (
          i + 2 < mots.length
          && CONNECTEURS.has(sansAccents(mots[i + 1]))
          && estSignificatif(mots[i + 2])
        ) {
          ajouter(`${mot} ${mots[i + 1]} ${mots[i + 2]}`, poids, 1);
        }
      }
    }
  }

  return [...candidats.values()]
    .sort((a, b) => (b.score - a.score) || (a.position - b.position))
    .slice(0, NOMBRE_MAX_COMPETENCES)
    .map((entree) => entree.terme);
}

// ─────────────────────────────────────────────────────────
// ANNEES D'EXPERIENCE
// ─────────────────────────────────────────────────────────

const NOMBRES_ECRITS = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5,
  six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, quinze: 15,
};

const CHIFFRE = '(\\d{1,2}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|quinze)';

// Chaque motif doit contenir le mot « experience » ou « minimum » a cote du
// nombre : sinon on ramasserait « CDD de 3 ans » ou « 35 heures ».
const MOTIFS_ANNEES = [
  new RegExp(`experience[^.\\n]{0,40}?(?:de|d'|:)?\\s*(?:au moins|minimum|min\\.?|plus de|\\+\\s*de)?\\s*${CHIFFRE}\\s*(?:\\+)?\\s*(?:ans?|annees?)`, 'i'),
  new RegExp(`(?:au moins|minimum|min\\.?|plus de|a partir de)\\s*${CHIFFRE}\\s*(?:ans?|annees?)`, 'i'),
  new RegExp(`${CHIFFRE}\\s*(?:ans?|annees?)\\s*(?:minimum|mini|au minimum|d'anciennete)`, 'i'),
  new RegExp(`${CHIFFRE}\\s*\\+\\s*(?:ans?|annees?)`, 'i'),
  // « d'experience », mais aussi « d experience » : les PDF perdent souvent
  // l'apostrophe au moment de l'extraction du texte.
  new RegExp(`${CHIFFRE}\\s*(?:ans?|annees?)\\s*(?:d['’]?\\s*|de\\s+)(?:experience|exp\\b|pratique)`, 'i'),
];

// Faute de chiffre, le vocabulaire de seniorite donne un ordre de grandeur.
const NIVEAUX_SENIORITE = [
  { motif: /\bexpert\b/i, annees: 8 },
  { motif: /\bsenior\b|\bconfirme[e]?\b|\bexperimente[e]?\b/i, annees: 5 },
  { motif: /\bjunior\b|\bdebutant[e]?\b|premier emploi|sans experience/i, annees: 0 },
];

function convertirNombre(brut) {
  if (/^\d+$/.test(brut)) return parseInt(brut, 10);
  return NOMBRES_ECRITS[sansAccents(brut).toLowerCase()] ?? null;
}

/**
 * Le nombre d'annees demande. On garde le PLUS PETIT trouve : une annonce
 * qui dit « 3 a 5 ans » ou « 3 ans en X, 8 ans en Y » exige en realite 3 ans
 * pour candidater. Prendre le plus grand ferait echouer des candidats
 * legitimes au moment du score.
 */
function extraireAnneesExperience(texte) {
  const nu = sansAccents(texte);
  let minimum = null;

  for (const motif of MOTIFS_ANNEES) {
    const global = new RegExp(motif.source, 'gi');
    let trouve = global.exec(nu);
    while (trouve !== null) {
      const valeur = convertirNombre(trouve[1]);
      if (valeur !== null && valeur <= 40 && (minimum === null || valeur < minimum)) {
        minimum = valeur;
      }
      trouve = global.exec(nu);
    }
  }
  if (minimum !== null) return minimum;

  for (const niveau of NIVEAUX_SENIORITE) {
    if (niveau.motif.test(nu)) return niveau.annees;
  }
  return null;
}

// ─────────────────────────────────────────────────────────
// DIPLOME
// ─────────────────────────────────────────────────────────

/**
 * `casse: true` = on cherche dans le texte d'origine, majuscules comprises.
 * Indispensable pour les sigles : « BUT » est aussi un mot courant francais,
 * « CAP » se cache dans « capable » si on ne verrouille pas la casse.
 */
const DIPLOMES = [
  { motif: /bac\s*\+\s*8|doctorat|\bph\.?d\b/i, niveau: 8, libelle: 'doctorat' },
  { motif: /bac\s*\+\s*5/i, niveau: 5, libelle: 'bac+5' },
  { motif: /master[e]?\b|\bdess\b|\bdea\b/i, niveau: 5, libelle: 'master' },
  { motif: /\bMBA\b/, niveau: 5, libelle: 'master', casse: true },
  { motif: /ecole d['’]?ingenieur|diplome d['’]?ingenieur|ingenieur[e]?\s+diplome/i, niveau: 5, libelle: 'ingenieur' },
  { motif: /bac\s*\+\s*[34]/i, niveau: 3, libelle: 'bac+3' },
  { motif: /licence\s+(?:pro|professionnelle|en|de|d['’])|\bbachelor\b/i, niveau: 3, libelle: 'licence' },
  { motif: /bac\s*\+\s*2/i, niveau: 2, libelle: 'bac+2' },
  { motif: /\bBTS\b/, niveau: 2, libelle: 'BTS', casse: true },
  { motif: /\b(?:DUT|BUT)\b/, niveau: 2, libelle: 'DUT', casse: true },
  { motif: /\b(?:CAP|BEP)\b/, niveau: 1, libelle: 'CAP', casse: true },
  { motif: /bac\s*pro|baccalaureat/i, niveau: 0, libelle: 'bac' },
];

/**
 * Le diplome demande. On retient le PLUS BAS mentionne, pour la meme raison
 * que les annees : « BTS minimum, master apprecie » exige un BTS.
 */
function extraireNiveauDiplome(texte) {
  const nu = sansAccents(texte);
  let meilleur = null;

  for (const diplome of DIPLOMES) {
    const cible = diplome.casse ? texte : nu;
    const trouve = cible.match(diplome.motif);
    if (!trouve) continue;

    const candidat = { niveau: diplome.niveau, libelle: diplome.libelle, index: trouve.index };
    if (
      meilleur === null
      || candidat.niveau < meilleur.niveau
      || (candidat.niveau === meilleur.niveau && candidat.index < meilleur.index)
    ) {
      meilleur = candidat;
    }
  }
  return meilleur ? meilleur.libelle : null;
}

// ─────────────────────────────────────────────────────────
// LANGUES
// ─────────────────────────────────────────────────────────

// Liste fermee : ici le dictionnaire sert a NOMMER, pas a filtrer des
// competences — il n'exclut aucun metier.
const LANGUES = [
  'anglais', 'français', 'allemand', 'espagnol', 'italien', 'portugais',
  'néerlandais', 'chinois', 'mandarin', 'japonais', 'arabe', 'russe',
  'polonais', 'roumain', 'turc', 'suédois', 'norvégien', 'danois', 'grec',
  'hébreu', 'coréen', 'vietnamien', 'hindi',
];

function extraireLangues(texte) {
  const nu = sansAccents(texte).toLowerCase();
  const trouvees = [];

  for (const langue of LANGUES) {
    const motif = new RegExp(`\\b${sansAccents(langue)}(?:e|es|s)?\\b`, 'i');
    const trouve = nu.match(motif);
    if (trouve) trouvees.push({ langue, index: trouve.index });
  }

  return trouvees.sort((a, b) => a.index - b.index).map((t) => t.langue);
}

// ─────────────────────────────────────────────────────────
// CONTRAT ET TELETRAVAIL (partages avec extraireOffre.js)
// ─────────────────────────────────────────────────────────

const CONTRATS = [
  { motif: /\bC\.?D\.?I\.?\b/i, libelle: 'CDI' },
  { motif: /\bC\.?D\.?D\.?\b/i, libelle: 'CDD' },
  { motif: /\bstage\b|\bstagiaire\b|\bintern(?:ship)?\b/i, libelle: 'Stage' },
  { motif: /\balternance\b|\balternant[e]?\b/i, libelle: 'Alternance' },
  { motif: /\bapprentissage\b|\bapprenti[e]?\b/i, libelle: 'Apprentissage' },
  { motif: /\binterim\b|\binterimaire\b|\bmission d'interim\b/i, libelle: 'Intérim' },
  { motif: /\bfreelance\b|\bindependant[e]?\b|portage salarial|\bauto[- ]entrepreneur\b/i, libelle: 'Freelance' },
];

/**
 * Le type de contrat, ou '' si l'annonce ne le dit pas.
 * En cas de mentions multiples on garde la premiere : c'est presque toujours
 * celle de l'en-tete de l'annonce.
 */
function detecterContrat(texte) {
  const nu = sansAccents(String(texte || ''));
  let meilleur = null;

  for (const contrat of CONTRATS) {
    const trouve = nu.match(contrat.motif);
    if (trouve && (meilleur === null || trouve.index < meilleur.index)) {
      meilleur = { libelle: contrat.libelle, index: trouve.index };
    }
  }
  return meilleur ? meilleur.libelle : '';
}

const TELETRAVAIL_AUCUN = /(?:pas|aucun|sans)\s+(?:de\s+)?teletravail|100\s*%?\s*(?:sur site|presentiel)|presentiel (?:uniquement|complet)|sur site uniquement|teletravail\s*:?\s*non/i;
const TELETRAVAIL_TOTAL = /100\s*%?\s*(?:de\s*)?(?:teletravail|remote|a distance)|full[- ]?remote|remote[- ]?first|teletravail (?:total|complet|integral|permanent)|(?:entierement|totalement)\s+a distance/i;
const TELETRAVAIL_PARTIEL = /teletravail partiel|hybride|\d\s*(?:a\s*\d\s*)?jours?\s*(?:par semaine\s*)?(?:de\s*|en\s*)?(?:teletravail|remote|a distance)|teletravail\s*:?\s*\d\s*jours?/i;
const TELETRAVAIL_MENTION = /teletravail|remote|travail a distance/i;

/**
 * 'total' | 'partiel' | 'possible' | 'aucun' | null (non mentionne).
 * L'ordre des tests compte : « pas de teletravail » contient « teletravail ».
 */
function detecterTeletravail(texte) {
  const nu = sansAccents(String(texte || ''));
  if (TELETRAVAIL_AUCUN.test(nu)) return 'aucun';
  if (TELETRAVAIL_TOTAL.test(nu)) return 'total';
  if (TELETRAVAIL_PARTIEL.test(nu)) return 'partiel';
  if (TELETRAVAIL_MENTION.test(nu)) return 'possible';
  return null;
}

// ─────────────────────────────────────────────────────────
// POINT D'ENTREE
// ─────────────────────────────────────────────────────────

/**
 * @param {string} descriptionOffre texte de l'annonce (HTML tolere)
 * @returns {{competences: string[], anneesExperience: number|null,
 *   niveauDiplome: string|null, langues: string[], contrat: string,
 *   teletravail: boolean|null}}
 */
function extraireExigences(descriptionOffre) {
  const texte = texteNettoye(descriptionOffre);
  if (!texte.trim()) {
    return {
      competences: [],
      anneesExperience: null,
      niveauDiplome: null,
      langues: [],
      contrat: '',
      teletravail: null,
    };
  }

  const teletravail = detecterTeletravail(texte);

  return {
    competences: extraireCompetences(texte),
    anneesExperience: extraireAnneesExperience(texte),
    niveauDiplome: extraireNiveauDiplome(texte),
    langues: extraireLangues(texte),
    contrat: detecterContrat(texte),
    // Ici le besoin est binaire : « l'offre permet-elle le teletravail ? »
    teletravail: teletravail === null ? null : teletravail !== 'aucun',
  };
}

module.exports = {
  extraireExigences,
  // Reutilises par extraireOffre.js — meme logique, une seule ecriture.
  detecterContrat,
  detecterTeletravail,
};
