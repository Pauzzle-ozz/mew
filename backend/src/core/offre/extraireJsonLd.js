'use strict';

/**
 * Lecture des blocs <script type="application/ld+json"> d'une page web.
 *
 * POURQUOI ce fichier existe : presque tous les sites d'emploi publient deja
 * le titre, l'entreprise, le lieu et le salaire de l'offre en JSON dans leur
 * page, au format schema.org/JobPosting — parce que Google for Jobs l'exige
 * pour les referencer. Cette donnee est gratuite, structuree et fiable :
 * la lire coute 0 euro et 0 milliseconde, contre un appel a GPT-4o sur
 * 12 000 tokens de page web.
 *
 * Aucun reseau, aucun fichier lu : on recoit du HTML, on rend des objets.
 */

// On capture les attributs (groupe 1) et le contenu (groupe 2) de chaque
// <script>. Le contenu est capture en non-greedy pour s'arreter au premier
// </script> : un JSON valide ne peut pas contenir cette chaine telle quelle.
const REGEX_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

// L'attribut type peut s'ecrire avec ou sans guillemets, avec des espaces,
// et parfois avec un charset a la suite (application/ld+json; charset=utf-8).
const REGEX_TYPE_JSONLD = /type\s*=\s*["']?\s*application\/ld\+json/i;

// Entites HTML minimales : certains CMS echappent les guillemets du JSON-LD
// (&quot;) alors que le JSON les veut bruts. On ne s'en sert qu'en secours,
// apres un premier JSON.parse rate, pour ne pas abimer un JSON deja valide.
const ENTITES_MINIMALES = {
  '&quot;': '"',
  '&#34;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&amp;': '&',
  '&#38;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
};

/**
 * Retire ce que les CMS ajoutent parfois autour du JSON : marqueur CDATA,
 * commentaire HTML englobant, BOM.
 */
function nettoyerContenu(contenu) {
  return String(contenu)
    .replace(/^﻿/, '')
    .replace(/^\s*<!--/, '')
    .replace(/-->\s*$/, '')
    .replace(/^\s*(?:\/\/|\/\*)?\s*<!\[CDATA\[/i, '')
    .replace(/\]\]>\s*(?:\*\/)?\s*$/, '')
    .trim();
}

/**
 * JSON.parse qui ne fait jamais planter l'appelant : un bloc casse est
 * ignore et les autres blocs de la page continuent d'etre lus.
 */
function parserTolerant(contenu) {
  if (!contenu) return undefined;

  try {
    return JSON.parse(contenu);
  } catch (_) {
    // Deuxieme chance : le JSON etait peut-etre echappe en entites HTML.
  }

  let deEchappe = contenu;
  for (const [entite, caractere] of Object.entries(ENTITES_MINIMALES)) {
    deEchappe = deEchappe.split(entite).join(caractere);
  }
  if (deEchappe === contenu) return undefined;

  try {
    return JSON.parse(deEchappe);
  } catch (_) {
    return undefined;
  }
}

/**
 * Met a plat ce qu'un bloc peut contenir : un objet seul, un tableau
 * d'objets a la racine, ou un objet enveloppe qui range tout dans @graph
 * (habitude de Yoast et de la plupart des plugins SEO WordPress).
 */
function aplatir(valeur, sortie) {
  if (Array.isArray(valeur)) {
    for (const element of valeur) aplatir(element, sortie);
    return;
  }
  if (!valeur || typeof valeur !== 'object') return;

  sortie.push(valeur);

  if (valeur['@graph']) aplatir(valeur['@graph'], sortie);
}

/**
 * Tous les objets JSON-LD d'une page, a plat.
 *
 * @param {string} html
 * @returns {Object[]} liste eventuellement vide, jamais null
 */
function extraireBlocsJsonLd(html) {
  const blocs = [];
  if (!html || typeof html !== 'string') return blocs;

  // lastIndex est partage entre les appels sur une regex /g : on repart de 0.
  REGEX_SCRIPT.lastIndex = 0;

  let correspondance = REGEX_SCRIPT.exec(html);
  while (correspondance !== null) {
    const attributs = correspondance[1] || '';
    if (REGEX_TYPE_JSONLD.test(attributs)) {
      const valeur = parserTolerant(nettoyerContenu(correspondance[2]));
      if (valeur !== undefined) aplatir(valeur, blocs);
    }
    correspondance = REGEX_SCRIPT.exec(html);
  }

  return blocs;
}

/**
 * Compare un @type a un type schema.org.
 * @type peut valoir "JobPosting", ["JobPosting", "Thing"], ou l'URL complete
 * "https://schema.org/JobPosting" selon le generateur du site.
 */
function typeCorrespond(typeDeclare, typeCherche) {
  const attendu = typeCherche.toLowerCase();
  const valeurs = Array.isArray(typeDeclare) ? typeDeclare : [typeDeclare];

  return valeurs.some((valeur) => {
    if (typeof valeur !== 'string') return false;
    // On ne garde que le dernier segment : ".../JobPosting" -> "JobPosting"
    const nom = valeur.trim().split(/[/#]/).pop();
    return nom.toLowerCase() === attendu;
  });
}

/**
 * Le premier objet JobPosting de la page, ou null.
 *
 * @param {string} html
 * @returns {Object|null}
 */
function trouverJobPosting(html) {
  const blocs = extraireBlocsJsonLd(html);
  for (const bloc of blocs) {
    if (typeCorrespond(bloc['@type'], 'JobPosting')) return bloc;
  }
  return null;
}

module.exports = { extraireBlocsJsonLd, trouverJobPosting, typeCorrespond };
