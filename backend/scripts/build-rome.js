#!/usr/bin/env node
/**
 * Convertit le referentiel ROME de France Travail en fichiers JSON compacts,
 * utilisables directement par le moteur de scoring des metiers.
 *
 * Le ROME (Repertoire Operationnel des Metiers et des Emplois) est le
 * referentiel officiel utilise par France Travail : 1 911 fiches metier,
 * 14 301 appellations, et le lien entre chaque metier et ses competences.
 * Il est publie en Licence Ouverte (Etalab), donc librement reutilisable.
 *
 * C'est ce qui permet a Mew de proposer des metiers et de calculer une
 * adequation SANS demander a un modele de langage d'inventer une liste.
 *
 * Usage :
 *     npm run data:fetch     # telecharge l'archive dans .cache/
 *     npm run data:build     # ce script : .cache/ -> src/data/rome/
 *
 * DEUX PIEGES D'ENCODAGE, decouverts a la dure :
 *   1. Malgre leur prefixe « unix_ », les fichiers JSON sont encodes en
 *      ISO-8859-1 (latin1), pas en UTF-8. Les lire en UTF-8 donne « carri?re ».
 *   2. Certains champs sont, EN PLUS, de l'UTF-8 double-encode a l'interieur
 *      du latin1 (« Macro-compÃ©tence » au lieu de « Macro-competence »).
 *      La fonction reparerDoubleEncodage ci-dessous corrige ce second cas.
 */

const fs = require('fs');
const path = require('path');

const DOSSIER_SOURCE = path.join(__dirname, '..', '..', '.cache', 'rome');
const DOSSIER_SORTIE = path.join(__dirname, '..', 'src', 'data', 'rome');

// ---------------------------------------------------------------------------
// Lecture et reparation d'encodage
// ---------------------------------------------------------------------------

/**
 * Repare l'UTF-8 double-encode. Quand une chaine UTF-8 a ete relue comme du
 * latin1, « é » (0xC3 0xA9) devient les deux caracteres « Ã© ». On refait
 * l'operation inverse. On ne garde le resultat que s'il ne contient pas de
 * caractere de remplacement : en cas de doute, on ne touche a rien.
 */
function reparerDoubleEncodage(texte) {
  if (typeof texte !== 'string' || !/[ÃÂ][-¿]/.test(texte)) return texte;
  try {
    const repare = Buffer.from(texte, 'latin1').toString('utf8');
    return repare.includes('�') ? texte : repare;
  } catch (_) {
    return texte;
  }
}

function nettoyer(valeur) {
  if (typeof valeur !== 'string') return valeur;
  return reparerDoubleEncodage(valeur).replace(/\s+/g, ' ').trim();
}

function lireJson(nomFichier) {
  const chemin = path.join(DOSSIER_SOURCE, nomFichier);
  if (!fs.existsSync(chemin)) {
    console.error(`\nFichier introuvable : ${chemin}`);
    console.error('Lance d\'abord : npm run data:fetch\n');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(chemin).toString('latin1'));
}

/** Le nom des fichiers porte le numero de version (v461, v462...). */
function trouverFichier(motif) {
  const fichiers = fs.readdirSync(DOSSIER_SOURCE).filter((f) => f.startsWith(motif) && f.endsWith('.json'));
  if (!fichiers.length) {
    console.error(`Aucun fichier ne commence par « ${motif} » dans ${DOSSIER_SOURCE}`);
    process.exit(1);
  }
  return fichiers[0];
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Parcourt les groupes de competences d'une fiche metier.
 * La structure du ROME est imbriquee : competences -> savoir_faire -> enjeux
 * -> items. On aplatit tout ca en une simple liste de libelles.
 */
function aplatirItems(groupe) {
  if (!groupe || typeof groupe !== 'object') return [];
  const listes = groupe.enjeux || groupe.categories || [];
  const resultat = [];
  for (const bloc of listes) {
    for (const item of bloc.items || []) {
      if (!item.libelle) continue;
      resultat.push({
        l: nettoyer(item.libelle),
        // « Principale » signale une competence au coeur du metier : elle
        // pese davantage dans le calcul d'adequation.
        p: item.coeur_metier === 'Principale' ? 1 : 0
      });
    }
  }
  return resultat;
}

/**
 * Les verbes d'action sortent gratuitement du ROME : chaque libelle de
 * savoir-faire commence par un verbe a l'infinitif (« Realiser... »,
 * « Assurer... », « Diagnostiquer... »). C'est une liste bien plus riche,
 * et surtout bien plus representative de TOUS les metiers, que les quelques
 * verbes de bureau qu'on aurait ecrits a la main.
 */
function extraireVerbes(competences) {
  const compte = new Map();
  for (const { libelle } of competences) {
    if (!libelle) continue;
    const premier = libelle.trim().split(/[\s',]/)[0].toLowerCase();
    // Un infinitif francais se termine par -er, -ir, -re ou -oir
    if (premier.length < 4 || !/(er|ir|re|oir)$/.test(premier)) continue;
    if (!/^[a-zàâäéèêëîïôöùûüç]+$/.test(premier)) continue;
    compte.set(premier, (compte.get(premier) || 0) + 1);
  }
  return [...compte.entries()]
    .filter(([, n]) => n >= 2)      // un verbe vu une seule fois est souvent une coquille
    .sort((a, b) => b[1] - a[1])
    .map(([verbe]) => verbe);
}

function ecrire(nom, donnees) {
  const chemin = path.join(DOSSIER_SORTIE, nom);
  fs.writeFileSync(chemin, JSON.stringify(donnees), 'utf8');
  const ko = Math.round(fs.statSync(chemin).size / 1024);
  const taille = Array.isArray(donnees) ? donnees.length : Object.keys(donnees).length;
  console.log(`  ${nom.padEnd(26)} ${String(taille).padStart(6)} entrees   ${String(ko).padStart(5)} Ko`);
  return ko;
}

// ---------------------------------------------------------------------------

function construire() {
  fs.mkdirSync(DOSSIER_SORTIE, { recursive: true });
  console.log('\nConstruction des donnees ROME\n');

  // --- Metiers et appellations ---------------------------------------------
  const fiches = lireJson(trouverFichier('unix_fiche_emploi_metier'));
  const appellationsBrutes = lireJson(trouverFichier('unix_referentiel_appellation'));

  const metiers = [];
  const metierCompetences = {};
  const metierSavoirs = {};
  const metierMobilites = {};
  const softSkills = new Map();
  const toutesCompetences = [];

  for (const fiche of fiches) {
    const code = fiche.rome?.code_rome;
    if (!code) continue;

    const savoirFaire = aplatirItems(fiche.competences?.savoir_faire);
    const savoirs = aplatirItems(fiche.competences?.savoirs);
    const savoirEtre = aplatirItems(fiche.competences?.savoir_etre_professionnel);

    metiers.push({
      c: code,
      l: nettoyer(fiche.rome.intitule),
      // La definition est tronquee : au-dela, on stocke de la prose que
      // personne ne lit et qui triple le poids du fichier.
      d: nettoyer(fiche.definition || '').slice(0, 400),
      a: nettoyer(fiche.acces_metier || '').slice(0, 300),
      s: (fiche.secteurs_activite || []).map((s) => nettoyer(s.libelle)).filter(Boolean)
    });

    metierCompetences[code] = savoirFaire;
    metierSavoirs[code] = savoirs;

    // Table des mobilites professionnelles du ROME : vers quels autres metiers
    // on peut evoluer depuis celui-ci. C'est une donnee officielle et sourcee,
    // qui permet de mesurer un vrai « potentiel d'evolution » au lieu de
    // demander a un modele de langage d'inventer un chiffre sur le salaire et
    // le teletravail, deux informations qu'il ne peut pas connaitre.
    metierMobilites[code] = (fiche.mobilites || [])
      .map((m) => {
        const cible = nettoyer(m.rome_cible || '');
        const separateur = cible.indexOf(' - ');
        return separateur === -1
          ? null
          : { c: cible.slice(0, separateur), l: cible.slice(separateur + 3) };
      })
      .filter(Boolean);
    savoirFaire.forEach((c) => toutesCompetences.push({ libelle: c.l }));
    savoirEtre.forEach((c) => softSkills.set(c.l, true));
  }

  // Index de recherche : [libelle, code_rome]. Les appellations ROME sont
  // deja ecrites aux deux genres (« Developpeur / Developpeuse web »), donc
  // le cas du feminin se resout par une simple recherche de sous-chaine,
  // sans avoir besoin de comparaison approximative.
  const appellations = appellationsBrutes
    .filter((a) => a.libelle && a.code_rome_parent)
    .map((a) => [nettoyer(a.libelle), a.code_rome_parent]);

  const verbes = extraireVerbes(toutesCompetences);

  let total = 0;
  total += ecrire('metiers.json', metiers);
  total += ecrire('appellations.json', appellations);
  total += ecrire('metier-competences.json', metierCompetences);
  total += ecrire('metier-savoirs.json', metierSavoirs);
  total += ecrire('metier-mobilites.json', metierMobilites);
  total += ecrire('soft-skills.json', [...softSkills.keys()].sort());
  total += ecrire('verbes-action.json', verbes);

  // Tracabilite : on doit toujours pouvoir dire a l'utilisateur d'ou vient
  // une donnee et de quand elle date. C'est toute la difference avec un
  // chiffre invente par un modele de langage.
  let version = 'inconnue';
  const cheminVersion = path.join(DOSSIER_SOURCE, 'version.txt');
  if (fs.existsSync(cheminVersion)) {
    const texte = fs.readFileSync(cheminVersion, 'utf8');
    version = (texte.match(/Numero de version\s*:\s*(\d+)/) || [])[1] || 'inconnue';
  }

  ecrire('VERSION.json', {
    source: 'ROME 4.0 - France Travail',
    version,
    licence: 'Licence Ouverte 2.0 (Etalab)',
    url: 'https://www.data.gouv.fr/datasets/repertoire-operationnel-des-metiers-et-des-emplois-rome',
    metiers: metiers.length,
    appellations: appellations.length,
    verbesAction: verbes.length,
    softSkills: softSkills.size
  });

  console.log(`\n  Total : ~${total} Ko`);
  console.log(`  ROME version ${version} - ${metiers.length} metiers, ${appellations.length} appellations`);
  console.log(`  ${verbes.length} verbes d'action extraits, ${softSkills.size} savoir-etre\n`);
}

construire();
