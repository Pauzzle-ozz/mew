/**
 * Decoupe un email genere en { subject, body }.
 *
 * POURQUOI ce fichier existe : notre propre prompt (prompts/spontaneEmail.js,
 * lignes 42-45) impose deja au modele de repondre "SUBJECT: ..." puis une
 * ligne de trois tirets puis le corps. On envoyait pourtant ce texte a un
 * SECOND modele, uniquement pour le couper en deux. On payait un appel API,
 * une seconde d'attente et un risque de reformulation... pour un split.
 *
 * Un parseur ne peut etre plus lent, plus cher ou moins fidele que le modele
 * qu'il remplace. Il doit juste etre au moins aussi robuste. D'ou la longue
 * liste de cas degrades traites ci-dessous : marqueur en francais, gras
 * markdown, separateur absent ou repete, texte vide. Il ne leve JAMAIS
 * d'exception : un email a envoyer ne doit pas faire tomber la requete.
 */

// Accents normalises un caractere pour un caractere : les positions restent
// alignees sur le texte d'origine, ce qui permet de recuperer l'objet avec
// ses accents et ses majuscules intacts.
const TABLE_ACCENTS = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ç: 'c', ñ: 'n', ý: 'y', ÿ: 'y',
  À: 'A', Á: 'A', Â: 'A', Ã: 'A', Ä: 'A', Å: 'A',
  È: 'E', É: 'E', Ê: 'E', Ë: 'E',
  Ì: 'I', Í: 'I', Î: 'I', Ï: 'I',
  Ò: 'O', Ó: 'O', Ô: 'O', Õ: 'O', Ö: 'O',
  Ù: 'U', Ú: 'U', Û: 'U', Ü: 'U',
  Ç: 'C', Ñ: 'N', Ý: 'Y'
};

// SUBJECT:, Subject :, OBJET :, Objet:, **Sujet** : ...
// Les caracteres * _ # > absorbes autour du mot couvrent le gras markdown,
// les titres et les citations que les modeles ajoutent parfois d'eux-memes.
const MOTIF_OBJET = /^[\s*_#>]*(?:subject|object|objet|sujet)[\s*_]*[:\-][\s*_]*(.*)$/i;

// Une ligne qui ne contient qu'un separateur : ---, ***, ___, ===, em-dashes.
const MOTIF_SEPARATEUR = /^\s*(?:-{3,}|\*{3,}|_{3,}|={3,}|—{1,}|–{3,})\s*$/;

// Une premiere ligne qui commence par une formule d'appel n'est pas un objet,
// c'est deja le corps. Sans ce garde-fou, un email sans marqueur partait avec
// "Madame, Monsieur," en objet et un corps ampute de sa salutation.
const MOTIF_SALUTATION = /^\s*(?:madame|monsieur|mesdames|messieurs|bonjour|bonsoir|cher|chere|a l'attention)\b/i;

// Au-dela, ce n'est plus un objet d'email mais une phrase : on ne la promeut
// pas en objet, on la laisse dans le corps.
const LONGUEUR_MAX_OBJET = 120;

// Guillemets et crochets qui entourent parfois l'objet, notamment parce que
// notre propre prompt ecrit "[objet de l'email en 6-10 mots]" et que certains
// modeles recopient les crochets.
const PAIRES_ENTOURANTES = [['"', '"'], ["'", "'"], ['«', '»'], ['[', ']'], ['(', ')'], ['<', '>']];

function sansAccents(texte) {
  return texte.replace(/[À-ÿ]/g, (c) => TABLE_ACCENTS[c] || c);
}

function estSeparateur(ligne) {
  return MOTIF_SEPARATEUR.test(ligne);
}

/**
 * Retire un bloc de code markdown qui enveloppe toute la reponse.
 */
function retirerBlocDeCode(texte) {
  const correspondance = texte.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?\s*```$/);
  return correspondance ? correspondance[1].trim() : texte;
}

/**
 * Renvoie l'objet trouve sur cette ligne, ou null si la ligne ne porte pas de
 * marqueur. Attention : une chaine vide est une reponse valable ("SUBJECT:"
 * tout seul), d'ou la distinction avec null.
 */
function extraireObjet(ligne) {
  const correspondance = MOTIF_OBJET.exec(sansAccents(ligne));
  if (!correspondance) return null;

  // La normalisation preserve les longueurs : on peut donc decouper la ligne
  // d'origine a la meme position et garder les accents.
  const debut = ligne.length - correspondance[1].length;
  return ligne.slice(debut).trim();
}

function nettoyerObjet(objet) {
  let resultat = String(objet).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

  // On ne retire une paire que si elle entoure vraiment tout l'objet : sinon
  // "Candidature spontanee (CDI)" perdrait sa parenthese fermante.
  for (let passe = 0; passe < 3; passe += 1) {
    const paire = PAIRES_ENTOURANTES.find(
      ([gauche, droite]) =>
        resultat.length > 1 && resultat.startsWith(gauche) && resultat.endsWith(droite)
    );
    if (!paire) break;
    resultat = resultat.slice(1, -1).trim();
  }

  return resultat;
}

/**
 * Recompose le corps : on jette les lignes vides et les separateurs en tete
 * (cas des separateurs repetes), et les lignes vides en fin.
 */
function assemblerCorps(lignes) {
  const utiles = lignes.slice();
  while (utiles.length && (utiles[0].trim() === '' || estSeparateur(utiles[0]))) utiles.shift();
  while (utiles.length && utiles[utiles.length - 1].trim() === '') utiles.pop();
  return utiles.join('\n').trim();
}

/**
 * @param {string} texte le texte brut renvoye par le modele
 * @returns {{subject: string, body: string}} jamais null, jamais d'exception
 */
function parseEmailGenere(texte) {
  const vide = { subject: '', body: '' };

  // Couvre null, undefined, un nombre, un objet... tout ce qui n'est pas du texte.
  if (typeof texte !== 'string') return vide;

  const contenu = retirerBlocDeCode(texte.replace(/\r\n?/g, '\n').trim());
  if (contenu === '') return vide;

  const lignes = contenu.split('\n');

  // Le PREMIER separateur fait foi. Les suivants appartiennent au corps.
  const indexSeparateur = lignes.findIndex(estSeparateur);
  const finEntete = indexSeparateur === -1 ? lignes.length : indexSeparateur;

  // 1. Chercher un marqueur d'objet dans la zone d'en-tete.
  let indexObjet = -1;
  let objet = '';
  for (let i = 0; i < finEntete; i += 1) {
    const trouve = extraireObjet(lignes[i]);
    if (trouve !== null) {
      indexObjet = i;
      objet = trouve;
      break;
    }
  }

  // Cas "SUBJECT:" seul sur sa ligne : l'objet est sur la ligne suivante.
  let derniereLigneEntete = indexObjet;
  if (indexObjet !== -1 && objet === '') {
    for (let i = indexObjet + 1; i < finEntete; i += 1) {
      if (lignes[i].trim() !== '' && !estSeparateur(lignes[i])) {
        objet = lignes[i].trim();
        derniereLigneEntete = i;
        break;
      }
    }
  }

  // 2. Aucun marqueur : on retombe sur la regle "premiere ligne = objet".
  if (indexObjet === -1) {
    const premiereUtile = lignes.findIndex((l) => l.trim() !== '' && !estSeparateur(l));

    if (premiereUtile !== -1 && premiereUtile < finEntete) {
      const candidat = lignes[premiereUtile].trim();

      // Deux exceptions : une formule d'appel ou une phrase entiere ne sont
      // pas des objets. Dans ces deux cas, mieux vaut un objet vide (que
      // l'appelant peut completer) qu'un objet grotesque envoye tel quel.
      const estUnVraiObjet =
        !MOTIF_SALUTATION.test(sansAccents(candidat)) &&
        (indexSeparateur !== -1 || candidat.length <= LONGUEUR_MAX_OBJET);

      if (estUnVraiObjet) {
        objet = candidat;
        derniereLigneEntete = premiereUtile;
      } else {
        derniereLigneEntete = premiereUtile - 1;
      }
    }
  }

  // 3. Le corps commence apres le separateur s'il existe, sinon apres l'objet.
  const debutCorps = indexSeparateur !== -1 ? indexSeparateur + 1 : derniereLigneEntete + 1;

  return {
    subject: nettoyerObjet(objet),
    body: assemblerCorps(lignes.slice(debutCorps))
  };
}

module.exports = { parseEmailGenere };
