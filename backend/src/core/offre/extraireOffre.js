'use strict';

/**
 * Extraction des champs d'une offre d'emploi depuis le HTML de sa page.
 *
 * POURQUOI : aujourd'hui le backend envoie des milliers de mots de page web
 * a GPT-4o pour qu'il en ressorte trois lignes (titre, entreprise, lieu).
 * Ces trois lignes sont deja dans la page, en clair. Ce fichier les lit.
 *
 * CASCADE A 3 NIVEAUX, du plus fiable au moins fiable :
 *   1. JSON-LD schema.org/JobPosting  -> confiance haute
 *   2. Balises meta (og:*) et <title> -> confiance moyenne
 *   3. Heuristiques (h1, regex)       -> confiance faible
 * Les niveaux se COMPLETENT : un champ trouve au niveau 1 n'est plus
 * cherche ensuite, un champ manquant est cherche au niveau suivant.
 *
 * Fonction pure : pas de reseau, pas de fichier. On recoit du HTML.
 */

const { trouverJobPosting } = require('./extraireJsonLd');
const { detecterContrat, detecterTeletravail } = require('./extraireExigences');

const CHAMPS = [
  'titre', 'entreprise', 'lieu', 'contrat',
  'salaire', 'description', 'teletravail', 'datePublication',
];

const NIVEAUX = { jsonld: 1, meta: 2, heuristique: 3 };
const CONFIANCE_PAR_NIVEAU = { jsonld: 'haute', meta: 'moyenne', heuristique: 'faible' };

// ─────────────────────────────────────────────────────────
// HTML -> TEXTE
// ─────────────────────────────────────────────────────────

const ENTITES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à',
  acirc: 'â', auml: 'ä', icirc: 'î', iuml: 'ï', ocirc: 'ô', ouml: 'ö',
  ucirc: 'û', uuml: 'ü', ugrave: 'ù', ccedil: 'ç', oelig: 'œ', OElig: 'Œ',
  laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…', euro: '€',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', deg: '°', middot: '·',
  bull: '•', times: '×', eur: '€', reg: '®', copy: '©', trade: '™',
};

const REGEX_ENTITE = /&(#\d+|#x[0-9a-f]+|[a-z]+);/gi;

function decoderEntites(texte) {
  return texte.replace(REGEX_ENTITE, (entier, corps) => {
    if (corps[0] === '#') {
      const code = corps[1] === 'x' || corps[1] === 'X'
        ? parseInt(corps.slice(2), 16)
        : parseInt(corps.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return entier;
      try {
        return String.fromCodePoint(code);
      } catch (_) {
        return entier;
      }
    }
    if (Object.prototype.hasOwnProperty.call(ENTITES, corps)) return ENTITES[corps];
    const minuscule = corps.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ENTITES, minuscule) ? ENTITES[minuscule] : entier;
  });
}

function retirerTag(html, tags) {
  return html.replace(new RegExp(`<(${tags})\\b[\\s\\S]*?<\\/\\1>`, 'gi'), ' ');
}

/**
 * Convertit du HTML en texte lisible. Les fins de blocs deviennent des
 * lignes vides : c'est ce qui permet, plus bas, de reperer « le plus long
 * bloc de texte » sans avoir de vrai parseur HTML.
 */
function htmlVersTexte(html) {
  if (!html) return '';
  let texte = String(html);

  texte = texte.replace(/<!--[\s\S]*?-->/g, ' ');
  texte = retirerTag(texte, 'script|style|noscript|svg|iframe|template');

  texte = texte.replace(/<br\s*\/?>/gi, '\n');
  texte = texte.replace(/<\/(li|tr|dt|dd|h[1-6])>/gi, '\n');
  texte = texte.replace(/<\/(p|div|section|article|ul|ol|table|main|header|footer|nav|blockquote)>/gi, '\n\n');
  texte = texte.replace(/<[^>]+>/g, ' ');
  texte = decoderEntites(texte);

  // Les descriptions de JSON-LD sont souvent doublement encodees
  // (&lt;p&gt;...) : apres le premier decodage il reste de vraies balises.
  if (/<[a-z][^>]*>/i.test(texte)) {
    texte = texte.replace(/<br\s*\/?>/gi, '\n');
    texte = texte.replace(/<\/(p|div|li|h[1-6])>/gi, '\n');
    texte = texte.replace(/<[^>]+>/g, ' ');
    texte = decoderEntites(texte);
  }

  return texte
    .replace(/\r/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normaliserEspaces(texte) {
  return String(texte).replace(/\s+/g, ' ').trim();
}

/**
 * Meme nettoyage, mais on garde les retours a la ligne : la description est
 * le seul champ ou la mise en forme (une mission par ligne) a du sens, pour
 * l'affichage comme pour le reperage des sections d'exigences.
 */
function normaliserTexteLong(texte) {
  return String(texte)
    .replace(/\r/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─────────────────────────────────────────────────────────
// NIVEAU 1 : JSON-LD
// ─────────────────────────────────────────────────────────

/** Un champ schema.org peut etre une chaine, un objet {name}, ou un tableau. */
function texteDe(valeur) {
  if (typeof valeur === 'string') return normaliserEspaces(valeur);
  if (typeof valeur === 'number') return String(valeur);
  if (Array.isArray(valeur)) {
    for (const element of valeur) {
      const trouve = texteDe(element);
      if (trouve) return trouve;
    }
    return '';
  }
  if (valeur && typeof valeur === 'object') {
    return texteDe(valeur.name ?? valeur['@value'] ?? valeur.value ?? '');
  }
  return '';
}

function lieuDepuisJsonLd(offre) {
  const premier = Array.isArray(offre.jobLocation) ? offre.jobLocation[0] : offre.jobLocation;
  if (!premier) return '';
  if (typeof premier === 'string') return normaliserEspaces(premier);

  const adresse = premier.address || premier;
  if (typeof adresse === 'string') return normaliserEspaces(adresse);
  if (!adresse || typeof adresse !== 'object') return '';

  const ville = texteDe(adresse.addressLocality);
  const codePostal = texteDe(adresse.postalCode);
  const region = texteDe(adresse.addressRegion);

  if (ville && codePostal) return `${ville} (${codePostal})`;
  if (ville) return ville;
  if (codePostal && region) return `${region} (${codePostal})`;
  return codePostal || region || texteDe(adresse.streetAddress);
}

const CONTRATS_SCHEMA = {
  INTERN: 'Stage',
  APPRENTICESHIP: 'Alternance',
  TEMPORARY: 'CDD',
  CONTRACTOR: 'Freelance',
  PER_DIEM: 'Intérim',
};
// FULL_TIME / PART_TIME ne sont pas des types de contrat francais : ils
// disent la duree du travail. On ne les pose qu'en dernier recours, si
// aucun niveau de la cascade n'a trouve « CDI », « CDD »...
const DUREES_SCHEMA = { FULL_TIME: 'Temps plein', PART_TIME: 'Temps partiel' };

function contratDepuisJsonLd(offre) {
  const valeurs = Array.isArray(offre.employmentType) ? offre.employmentType : [offre.employmentType];
  let secours = '';

  for (const valeur of valeurs) {
    if (typeof valeur !== 'string') continue;
    const brut = valeur.trim();
    const majuscules = brut.toUpperCase().replace(/[\s-]+/g, '_');

    // Beaucoup de sites francais mettent directement « CDI » ou « Stage ».
    const francais = detecterContrat(brut);
    if (francais) return { contrat: francais, secours: '' };

    if (CONTRATS_SCHEMA[majuscules]) return { contrat: CONTRATS_SCHEMA[majuscules], secours: '' };
    if (DUREES_SCHEMA[majuscules] && !secours) secours = DUREES_SCHEMA[majuscules];
  }
  return { contrat: '', secours };
}

const DEVISES = { EUR: '€', USD: '$', GBP: '£' };
const PERIODES = {
  YEAR: 'par an', MONTH: 'par mois', WEEK: 'par semaine',
  DAY: 'par jour', HOUR: 'par heure',
};

function formaterNombre(valeur) {
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre)) return '';
  return String(Math.round(nombre)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function salaireDepuisJsonLd(offre) {
  const salaire = offre.baseSalary ?? offre.estimatedSalary;
  if (!salaire) return '';
  if (typeof salaire === 'string' || typeof salaire === 'number') return normaliserEspaces(salaire);
  if (typeof salaire !== 'object') return '';

  const devise = DEVISES[String(salaire.currency || '').toUpperCase()]
    || String(salaire.currency || '').toUpperCase();

  const valeur = salaire.value && typeof salaire.value === 'object' ? salaire.value : salaire;
  const minimum = formaterNombre(valeur.minValue);
  const maximum = formaterNombre(valeur.maxValue);
  const unique = formaterNombre(valeur.value);
  const periode = PERIODES[String(valeur.unitText || '').toUpperCase()] || '';

  let montant = '';
  if (minimum && maximum && minimum !== maximum) montant = `${minimum} - ${maximum}`;
  else montant = minimum || maximum || unique;
  if (!montant) return '';

  return normaliserEspaces([montant, devise, periode].filter(Boolean).join(' '));
}

function dateDepuisJsonLd(offre) {
  const brut = texteDe(offre.datePosted);
  const trouve = brut.match(/^(\d{4}-\d{2}-\d{2})/);
  return trouve ? trouve[1] : '';
}

// ─────────────────────────────────────────────────────────
// NIVEAU 2 : BALISES META ET <title>
// ─────────────────────────────────────────────────────────

function lireAttribut(balise, nom) {
  const trouve = balise.match(new RegExp(`\\b${nom}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  if (!trouve) return '';
  return decoderEntites(trouve[2] ?? trouve[3] ?? trouve[4] ?? '').trim();
}

/** Toutes les balises meta de la page, indexees par property/name. */
function lireMetas(html) {
  const metas = {};
  const balises = html.match(/<meta\b[^>]*>/gi) || [];
  for (const balise of balises) {
    const cle = (lireAttribut(balise, 'property') || lireAttribut(balise, 'name')).toLowerCase();
    const contenu = lireAttribut(balise, 'content');
    if (cle && contenu && !metas[cle]) metas[cle] = normaliserEspaces(contenu);
  }
  return metas;
}

function lireBaliseTitle(html) {
  const trouve = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return trouve ? normaliserEspaces(decoderEntites(trouve[1])) : '';
}

/** « www.welcometothejungle.com » -> « welcometothejungle » */
function nomDeDomaine(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const hote = new URL(url).hostname.replace(/^www\./i, '');
    const morceaux = hote.split('.');
    return morceaux.length > 1 ? morceaux[morceaux.length - 2] : morceaux[0];
  } catch (_) {
    return '';
  }
}

function memeNom(a, b) {
  const nu = (texte) => texte.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const gauche = nu(a);
  const droite = nu(b);
  if (!gauche || !droite || droite.length < 3) return false;
  return gauche === droite || gauche.includes(droite) || droite.includes(gauche);
}

/**
 * Decoupe la balise <title>. Les sites d'emploi y ecrivent presque toujours
 * « Titre du poste - Entreprise - Ville | NomDuSite ». On retire d'abord le
 * nom du site (connu par l'URL ou og:site_name), sinon on le prendrait pour
 * l'employeur.
 */
function decouperTitreDePage(brut, nomsDuSite, lieuConnu) {
  const segments = String(brut)
    .split(/\s+[-–—|·•]\s+|\s+\/\s+|\s*»\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => !nomsDuSite.some((nom) => memeNom(segment, nom)));

  if (segments.length === 0) return { titre: '', entreprise: '' };

  // « Infirmier de nuit chez Clinique Saint-Paul »
  for (const segment of segments) {
    const chez = segment.match(/^(.{3,}?)\s+(?:chez|at)\s+(.{2,})$/i);
    if (chez) return { titre: chez[1].trim(), entreprise: chez[2].trim() };
  }

  const titre = segments[0];
  // Le segment suivant est souvent l'employeur — sauf quand c'est le lieu,
  // qu'on connait deja par un autre niveau de la cascade.
  const suivants = segments.slice(1).filter((segment) => !(lieuConnu && memeNom(segment, lieuConnu)));
  return { titre, entreprise: suivants[0] || '' };
}

// ─────────────────────────────────────────────────────────
// NIVEAU 3 : HEURISTIQUES
// ─────────────────────────────────────────────────────────

function premierH1(html) {
  const trouve = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (!trouve) return '';
  return normaliserEspaces(htmlVersTexte(trouve[1]));
}

// Codes postaux francais : 01000 a 98999 (les 00xxx n'existent pas).
const REGEX_CODE_POSTAL = /\b(0[1-9]|[1-8]\d|9[0-8])\d{3}\b/;

/**
 * On cherche le code postal ET la ville qui le colle, dans les deux ordres :
 * « 75011 Paris » et « Paris (75011) ». Aucune liste de villes en dur : elle
 * laisserait de cote les 34 000 communes qui n'y figurent pas.
 */
function lieuHeuristique(texte) {
  const avecVilleApres = texte.match(
    /\b((?:0[1-9]|[1-8]\d|9[0-8])\d{3})\s*[-–,]?\s+([A-ZÀ-Þ][\wÀ-ÿ'’-]+(?:[ -][A-ZÀ-Þa-zà-ÿ][\wÀ-ÿ'’-]+){0,3})/,
  );
  if (avecVilleApres) return `${avecVilleApres[2].trim()} (${avecVilleApres[1]})`;

  const avecVilleAvant = texte.match(
    /([A-ZÀ-Þ][\wÀ-ÿ'’-]+(?:[ -][A-ZÀ-Þa-zà-ÿ][\wÀ-ÿ'’-]+){0,3})\s*[(,–-]\s*((?:0[1-9]|[1-8]\d|9[0-8])\d{3})/,
  );
  if (avecVilleAvant) return `${avecVilleAvant[1].trim()} (${avecVilleAvant[2]})`;

  const etiquette = texte.match(/(?:lieu|localisation|ville|localite)\s*:\s*([^\n]{2,60})/i);
  if (etiquette) return normaliserEspaces(etiquette[1]);

  const seulementLeCode = texte.match(REGEX_CODE_POSTAL);
  return seulementLeCode ? seulementLeCode[0] : '';
}

function entrepriseHeuristique(texte) {
  const etiquette = texte.match(/(?:entreprise|societe|société|employeur|recruteur|raison sociale)\s*:\s*([^\n]{2,60})/i);
  if (etiquette) return normaliserEspaces(etiquette[1]);

  // « Rejoignez Acme Industries », « chez Clinique Saint-Paul »
  const chez = texte.match(/(?:chez|rejoignez|rejoindre)\s+((?:[A-ZÀ-Þ][\wÀ-ÿ&'’.-]*)(?:\s+(?:[A-ZÀ-Þ][\wÀ-ÿ&'’.-]*|de|des|du|la|le)){0,3})/);
  return chez ? normaliserEspaces(chez[1]) : '';
}

const REGEX_SALAIRE = [
  // « entre 45 000 et 55 000 € brut annuel », « 32000 euros par an »
  /(?:entre\s+)?\d[\d\s.,]{2,9}\s*(?:€|euros?)\s*(?:brut|net)?\s*(?:(?:a|à|-|–|et)\s*\d[\d\s.,]{2,9}\s*(?:€|euros?)\s*(?:brut|net)?\s*)?(?:\/|par\s+)?\s*(?:an|mois|heure|annuels?|mensuels?)?/i,
  // « 45 - 55 k€ », « 45k€ »
  /\d{2,3}\s*(?:[-–à]\s*\d{2,3}\s*)?k€?\b/i,
];

function salaireHeuristique(texte) {
  for (const motif of REGEX_SALAIRE) {
    const trouve = texte.match(motif);
    if (trouve && /\d/.test(trouve[0])) {
      const valeur = normaliserEspaces(trouve[0]).replace(/[\s,;.-]+$/, '');
      if (valeur.length >= 3) return valeur;
    }
  }
  return '';
}

// Un vrai bloc de description contient au moins un de ces reperes.
const MARQUEURS_OFFRE = /missions?|profil recherch|votre r[oô]le|ce que nous offrons|comp[ée]tences? requises|nous recherchons|vos? responsabilit|le poste|votre quotidien|t[âa]ches/i;
const TAILLE_MINIMALE_BLOC = 120;
const TAILLE_MINIMALE_SECOURS = 400;

const TAILLE_MAXIMALE_DESCRIPTION = 8000;

/**
 * Un titre de section (« Vos missions ») forme son propre bloc en HTML,
 * separe du paragraphe qu'il annonce. On le recolle : sinon le marqueur
 * d'offre se retrouve seul dans un bloc de 12 caracteres et le paragraphe
 * utile, lui, n'a plus de marqueur.
 */
function recollerLesTitres(blocs) {
  const recolles = [];
  let titreEnAttente = '';

  for (const bloc of blocs) {
    const estTitre = bloc.length < 80 && !/[.!?]$/.test(bloc);
    if (estTitre) {
      // On ne garde que le dernier : les lignes courtes qui precedent
      // (« Contrat : CDI », « Lieu : ... ») sont des etiquettes deja
      // extraites dans leurs propres champs, pas de la description.
      titreEnAttente = bloc;
      continue;
    }
    recolles.push(titreEnAttente ? `${titreEnAttente}\n${bloc}` : bloc);
    titreEnAttente = '';
  }
  if (titreEnAttente) recolles.push(titreEnAttente);
  return recolles;
}

/**
 * La description : les blocs de texte qui portent un repere d'offre
 * d'emploi (« missions », « profil recherche »...), du premier au dernier.
 *
 * On ne garde pas seulement le plus long : les missions et le profil
 * recherche sont presque toujours dans deux blocs distincts, et jeter le
 * second reviendrait a perdre toutes les exigences du poste.
 * Sans aucun repere, on se rabat sur le plus long bloc de la page s'il est
 * vraiment long — un menu de navigation ne fait pas 400 caracteres d'un
 * seul tenant.
 */
function descriptionHeuristique(html) {
  const sansNavigation = retirerTag(html, 'nav|header|footer|aside|form|select');
  const blocs = recollerLesTitres(
    htmlVersTexte(sansNavigation).split(/\n\s*\n/).map((bloc) => bloc.trim()).filter(Boolean),
  ).filter((bloc) => bloc.length >= TAILLE_MINIMALE_BLOC);

  const premier = blocs.findIndex((bloc) => MARQUEURS_OFFRE.test(bloc));
  if (premier !== -1) {
    let dernier = premier;
    for (let i = blocs.length - 1; i > premier; i -= 1) {
      if (MARQUEURS_OFFRE.test(blocs[i])) { dernier = i; break; }
    }
    const retenu = blocs.slice(premier, dernier + 1).join('\n\n');
    if (retenu.length <= TAILLE_MAXIMALE_DESCRIPTION) return retenu;
    return blocs.slice(premier, dernier + 1)
      .reduce((meilleur, bloc) => (bloc.length > meilleur.length ? bloc : meilleur), '');
  }

  const plusLong = blocs.reduce((meilleur, bloc) => (bloc.length > meilleur.length ? bloc : meilleur), '');
  return plusLong.length >= TAILLE_MINIMALE_SECOURS ? plusLong : '';
}

const TELETRAVAIL_LISIBLE = {
  total: 'oui', possible: 'oui', partiel: 'partiel', aucun: 'non',
};

// ─────────────────────────────────────────────────────────
// CASCADE
// ─────────────────────────────────────────────────────────

function offreVide() {
  const offre = {};
  for (const champ of CHAMPS) offre[champ] = '';
  return { ...offre, source: 'heuristique', confiance: 'faible', champsTrouves: [] };
}

/**
 * Le champ titre, l'entreprise, le lieu... : ils viennent du HTML d'un site
 * inconnu. On coupe ce qui est manifestement trop long pour etre un intitule
 * plutot que de renvoyer une page entiere dans le champ « titre ».
 */
const LONGUEURS_MAX = { titre: 200, entreprise: 120, lieu: 120, contrat: 60, salaire: 80, teletravail: 20, datePublication: 30 };

function extraireOffre(html, url) {
  const offre = offreVide();
  const origine = {};                 // champ -> niveau qui l'a fourni
  if (!html || typeof html !== 'string') return offre;

  const poser = (champ, valeur, niveau) => {
    if (offre[champ]) return;         // le niveau precedent a deja repondu
    const propre = champ === 'description'
      ? normaliserTexteLong(valeur ?? '')
      : normaliserEspaces(valeur ?? '');
    if (!propre) return;
    const maximum = LONGUEURS_MAX[champ];
    offre[champ] = maximum && propre.length > maximum ? propre.slice(0, maximum).trim() : propre;
    origine[champ] = niveau;
  };

  // ── Niveau 1 : JSON-LD ──────────────────────────────────
  const jobPosting = trouverJobPosting(html);
  let contratDeSecours = '';

  if (jobPosting) {
    poser('titre', texteDe(jobPosting.title), 'jsonld');
    poser('entreprise', texteDe(jobPosting.hiringOrganization), 'jsonld');
    poser('lieu', lieuDepuisJsonLd(jobPosting), 'jsonld');

    const { contrat, secours } = contratDepuisJsonLd(jobPosting);
    poser('contrat', contrat, 'jsonld');
    contratDeSecours = secours;

    poser('salaire', salaireDepuisJsonLd(jobPosting), 'jsonld');
    poser('description', htmlVersTexte(texteDe(jobPosting.description)), 'jsonld');
    poser('datePublication', dateDepuisJsonLd(jobPosting), 'jsonld');

    const type = String(texteDe(jobPosting.jobLocationType)).toUpperCase();
    if (type.includes('TELECOMMUTE')) poser('teletravail', 'oui', 'jsonld');
  }

  // ── Niveau 2 : balises meta et <title> ──────────────────
  const metas = lireMetas(html);
  const nomsDuSite = [metas['og:site_name'], metas['application-name'], nomDeDomaine(url)]
    .filter(Boolean);

  // og:title et <title> contiennent souvent « Poste - Employeur - Ville » :
  // on les decoupe avant de se rabattre sur og:site_name, qui vaut le nom du
  // site d'emploi (« Indeed ») et pas celui de l'employeur des que l'offre
  // n'est pas publiee sur le site de l'entreprise elle-meme.
  const decoupeOg = decouperTitreDePage(
    metas['og:title'] || metas['twitter:title'] || '', nomsDuSite, offre.lieu,
  );
  const decoupeTitre = decouperTitreDePage(lireBaliseTitle(html), nomsDuSite, offre.lieu);

  poser('titre', decoupeOg.titre, 'meta');
  poser('titre', decoupeTitre.titre, 'meta');
  poser('entreprise', decoupeOg.entreprise, 'meta');
  poser('entreprise', decoupeTitre.entreprise, 'meta');
  poser('entreprise', metas['og:site_name'], 'meta');

  poser('description', metas['og:description'] || metas['twitter:description'] || metas.description, 'meta');
  poser('datePublication', (metas['article:published_time'] || '').slice(0, 10), 'meta');

  // ── Niveau 3 : heuristiques ─────────────────────────────
  const texteDeLaPage = htmlVersTexte(html);

  poser('titre', premierH1(html), 'heuristique');
  poser('entreprise', entrepriseHeuristique(texteDeLaPage), 'heuristique');
  poser('lieu', lieuHeuristique(texteDeLaPage), 'heuristique');
  poser('salaire', salaireHeuristique(texteDeLaPage), 'heuristique');
  poser('description', descriptionHeuristique(html), 'heuristique');

  // Contrat et teletravail se cherchent aussi dans la description : quand
  // elle vient d'une balise meta, elle contient du texte qui n'est nulle
  // part dans le corps de la page.
  const texteComplet = `${offre.description}\n${texteDeLaPage}`;
  poser('contrat', detecterContrat(texteComplet), 'heuristique');

  const teletravail = detecterTeletravail(texteComplet);
  if (teletravail) poser('teletravail', TELETRAVAIL_LISIBLE[teletravail], 'heuristique');

  // Duree du travail : uniquement si personne n'a trouve de vrai contrat.
  poser('contrat', contratDeSecours, 'jsonld');

  // ── Confiance ───────────────────────────────────────────
  // Elle vaut celle du niveau qui a fourni titre ET entreprise : ce sont les
  // deux champs sans lesquels l'offre n'est pas identifiable. Un champ
  // absent compte comme le pire niveau.
  const niveauTitre = NIVEAUX[origine.titre] || NIVEAUX.heuristique;
  const niveauEntreprise = NIVEAUX[origine.entreprise] || NIVEAUX.heuristique;
  const pire = Math.max(niveauTitre, niveauEntreprise);
  offre.source = Object.keys(NIVEAUX).find((nom) => NIVEAUX[nom] === pire);
  offre.confiance = CONFIANCE_PAR_NIVEAU[offre.source];

  offre.champsTrouves = CHAMPS.filter((champ) => offre[champ] !== '');
  return offre;
}

module.exports = { extraireOffre };
