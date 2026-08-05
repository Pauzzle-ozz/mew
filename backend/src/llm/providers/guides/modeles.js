/**
 * LES NOTES SUR LES MODELES.
 *
 * CE QUE CE FICHIER N'EST PAS
 * Ce n'est pas un classement. On ne compare pas les modeles entre editeurs, on
 * n'invente pas de score, on ne dit pas « le meilleur ». Ces phrases ne servent
 * qu'a repondre a une question : dans la gamme de CE fournisseur, a quoi sert
 * CE modele, et qu'est-ce que je perds en le choisissant.
 *
 * POURQUOI TOUS LES MODELES N'Y SONT PAS
 * Un modele sans entree ici n'est pas un oubli : l'interface a de quoi le
 * decrire honnetement sans nous, a partir du catalogue — son tarif, sa fenetre,
 * les roles qui lui vont, le cout estime par lettre. Ecrire une phrase creuse
 * pour remplir un blanc serait pire que le blanc. Les modeles decouverts en
 * direct (Ollama, OpenRouter) n'y seront jamais : ils changent tous les jours.
 *
 * La cle est l'identifiant EXACT du modele, tel qu'il figure dans catalogue.js.
 */

const NOTES = {
  /* --- OpenAI ------------------------------------------------------- */
  'gpt-5.6-sol': {
    resume: 'Le haut de gamme d\'OpenAI, celui qu\'on prend quand le texte compte plus que la facture.',
    atouts: ['La meilleure redaction de la gamme OpenAI.', 'Tres grande fenetre de contexte.'],
    limites: ['Le plus cher du catalogue OpenAI.', 'Plus lent que les modeles legers.'],
    pourQui: 'La lettre de motivation d\'une candidature qui compte vraiment.'
  },
  'gpt-5.6-terra': {
    resume: 'Le bon compromis : il redige correctement ET il sait extraire, a un tarif intermediaire.',
    atouts: ['Tient les deux roles : un seul modele suffit.', 'Deux fois et demie moins cher que Sol.'],
    limites: ['Un cran en dessous de Sol sur les textes longs a enjeu.'],
    pourQui: 'Le choix par defaut chez OpenAI si tu ne veux pas te poser de questions.'
  },
  'gpt-5.6-luna': {
    resume: 'Le modele economique : fait pour lire et ranger, pas pour ecrire.',
    atouts: ['Tres bon marche.', 'Rapide.', 'Garde la grande fenetre de contexte.'],
    limites: ['A eviter pour une lettre : le texte manque de relief.'],
    pourQui: 'Lire un CV PDF et en sortir un profil — personne ne lira ce texte.'
  },
  'gpt-4o-mini': {
    resume: 'L\'ancienne generation economique. Toujours la, toujours peu chere.',
    atouts: ['Le moins cher de la gamme OpenAI.', 'Tres eprouve.'],
    limites: ['Fenetre de 128 000 tokens seulement.', 'Generation precedente.'],
    pourQui: 'De l\'extraction quand chaque centime compte.'
  },

  /* --- Anthropic ---------------------------------------------------- */
  'claude-opus-5': {
    resume: 'Le modele de redaction d\'Anthropic. C\'est le choix qualite pour une lettre.',
    atouts: ['Redaction en francais tres soignee.', 'Fenetre d\'un million de tokens.'],
    limites: ['Le plus cher de la gamme Anthropic.', 'Surdimensionne pour lire un CV.'],
    pourQui: 'La lettre de motivation et l\'email d\'approche.'
  },
  'claude-sonnet-5': {
    resume: 'Le couteau suisse d\'Anthropic : il redige bien et il extrait bien.',
    atouts: ['Tient les deux roles.', 'Nettement moins cher qu\'Opus.', 'Grande fenetre.'],
    limites: ['Un cran sous Opus sur un texte a enjeu.'],
    pourQui: 'Le choix par defaut chez Anthropic — et un excellent modele d\'analyse de CV.'
  },
  'claude-haiku-4-5': {
    resume: 'Le rapide et economique de la gamme.',
    atouts: ['Cinq fois moins cher qu\'Opus.', 'Reponses rapides.'],
    limites: ['Fenetre de 200 000 tokens.', 'Redaction moins fine que Sonnet ou Opus.'],
    pourQui: 'Sortir un profil d\'un CV PDF.'
  },

  /* --- Google ------------------------------------------------------- */
  'gemini-3.1-pro-preview': {
    resume: 'Le haut de gamme de Google, en version preview.',
    atouts: ['Bonne redaction.', 'Fenetre d\'un million de tokens.'],
    limites: [
      'Version « preview » : elle peut disparaitre ou changer sans preavis.',
      'Si tu es sur le palier gratuit, lis la ligne confidentialite du fournisseur.'
    ],
    pourQui: 'La redaction, quand on veut rester chez Google.'
  },
  'gemini-3.6-flash': {
    resume: 'Le modele a tout faire de Google : rapide, large, et il tient les deux roles.',
    atouts: ['Rapide.', 'Fenetre d\'un million de tokens.', 'Redige et extrait.'],
    limites: ['Moins fin qu\'un modele de redaction dedie sur une lettre a enjeu.'],
    pourQui: 'Le choix par defaut chez Google.'
  },
  'gemini-3.5-flash-lite': {
    resume: 'Version allegee, pensee pour le volume.',
    atouts: ['Tres bon marche.', 'Garde la fenetre d\'un million de tokens.'],
    limites: ['Pas pour la redaction.'],
    pourQui: 'L\'extraction.'
  },
  'gemini-2.5-flash-lite': {
    resume: 'La generation precedente, et l\'une des entrees les moins cheres de tout le catalogue.',
    atouts: ['Prix minuscule.', 'Fenetre d\'un million de tokens.'],
    limites: ['Generation precedente.', 'Pas pour la redaction.'],
    pourQui: 'Lire des CV en quantite pour presque rien.'
  },

  /* --- Mistral ------------------------------------------------------ */
  'mistral-medium-3.5': {
    resume: 'Le modele de redaction de Mistral, heberge en Europe.',
    atouts: ['Tres bon en francais.', 'Donnees hebergees dans l\'Union europeenne.'],
    limites: ['Fenetre de 128 000 tokens.'],
    pourQui: 'Une lettre en francais, sans envoyer ton CV hors d\'Europe.'
  },
  'mistral-large-3': {
    resume: 'Malgre son nom, c\'est le polyvalent economique de la gamme.',
    atouts: ['Trois fois moins cher que Medium 3.5.', 'Tient les deux roles.'],
    limites: ['Fenetre de 128 000 tokens.'],
    pourQui: 'Le choix par defaut chez Mistral.'
  },
  'mistral-small-4': {
    resume: 'Le petit modele rapide de Mistral.',
    atouts: ['Bon marche.', 'Rapide.', 'Heberge en Europe.'],
    limites: ['Pas pour la redaction.'],
    pourQui: 'L\'extraction, en restant en Europe.'
  },
  'ministral-3-8b': {
    resume: 'Le plus petit de la gamme, pense pour les taches simples et repetees.',
    atouts: ['Meme tarif en entree qu\'en sortie, tres bas.'],
    limites: ['Le moins capable de la gamme Mistral.'],
    pourQui: 'De l\'extraction en volume.'
  },

  /* --- DeepSeek ----------------------------------------------------- */
  'deepseek-v4-pro': {
    resume: 'Une qualite de redaction correcte pour un prix qui defie la concurrence.',
    atouts: ['Redige pour une fraction du prix des grands modeles.', 'Fenetre d\'un million de tokens.'],
    limites: [
      'Serveurs en Chine : ton CV y part en entier.',
      'Francais correct, mais moins fluide que chez Mistral ou Anthropic.'
    ],
    pourQui: 'Rediger beaucoup pour presque rien, si l\'hebergement ne te gene pas.'
  },
  'deepseek-v4-flash': {
    resume: 'L\'entree de gamme DeepSeek, et l\'un des tarifs les plus bas du catalogue.',
    atouts: ['Extremement bon marche.', 'Tient les deux roles.', 'Tres grande fenetre.'],
    limites: ['Serveurs en Chine.', 'Redaction basique.'],
    pourQui: 'Tout faire tourner pour un cout quasi nul.'
  },

  /* --- xAI ---------------------------------------------------------- */
  'grok-4.5': {
    resume: 'Le haut de gamme de xAI.',
    atouts: ['Bonne redaction.', 'Sortie deux fois moins chere que chez les concurrents directs.'],
    limites: ['Le tarif double au-dela de 200 000 tokens envoyes.'],
    pourQui: 'La redaction chez xAI.'
  },
  'grok-4.3': {
    resume: 'Le polyvalent de la gamme, avec une fenetre d\'un million de tokens.',
    atouts: ['Tient les deux roles.', 'Moins cher que Grok 4.5.'],
    limites: ['Generation precedente.'],
    pourQui: 'Le choix par defaut chez xAI.'
  },

  /* --- Groq (modeles ouverts) --------------------------------------- */
  'openai/gpt-oss-120b': {
    resume: 'Un modele ouvert de bonne taille, servi tres vite et pour presque rien.',
    atouts: ['Tres rapide.', 'Tres bon marche.', 'Poids publics : reproductible ailleurs.'],
    limites: ['Fenetre de 131 072 tokens.', 'En dessous des grands modeles proprietaires.'],
    pourQui: 'Tout faire chez Groq, vite et sans se ruiner.'
  },
  'openai/gpt-oss-20b': {
    resume: 'La version reduite : deux fois moins chere encore.',
    atouts: ['Prix minuscule.', 'Tres rapide.'],
    limites: ['Petit modele : la redaction s\'en ressent.'],
    pourQui: 'L\'extraction.'
  },
  'llama-3.3-70b-versatile': {
    resume: 'Un classique des modeles ouverts, tres eprouve.',
    atouts: ['Redaction correcte.', 'Enormement documente.'],
    limites: ['Generation precedente.', 'Fenetre de 131 072 tokens.'],
    pourQui: 'La redaction chez Groq.'
  },
  'llama-3.1-8b-instant': {
    resume: 'Le plus petit et le moins cher de tout le catalogue.',
    atouts: ['Prix quasi nul.', 'Reponses immediates.'],
    limites: ['Petit modele : a reserver aux taches simples.'],
    pourQui: 'De l\'extraction quand la vitesse prime sur la finesse.'
  },

  /* --- Moonshot ----------------------------------------------------- */
  'kimi-k3': {
    resume: 'Le modele de redaction de Moonshot, avec une fenetre d\'un million de tokens.',
    atouts: ['Bonne redaction.', 'Tient les deux roles.'],
    limites: ['Serveurs en Chine.', 'Tarif comparable aux grands modeles occidentaux.'],
    pourQui: 'La redaction chez Moonshot.'
  },
  'kimi-k2.6': {
    resume: 'La generation precedente, trois fois moins chere.',
    atouts: ['Bon marche.', 'Fenetre de 262 144 tokens.'],
    limites: ['Serveurs en Chine.', 'Generation precedente.'],
    pourQui: 'L\'extraction.'
  },

  /* --- Cerebras ----------------------------------------------------- */
  'gpt-oss-120b': {
    resume: 'Le meme modele ouvert que chez Groq, servi par Cerebras.',
    atouts: ['Tres rapide.', 'Tient les deux roles.', 'Palier gratuit quotidien.'],
    limites: ['Un peu plus cher que le meme modele chez Groq.'],
    pourQui: 'Tester Mew gratuitement, tres vite, sans carte bancaire.'
  }
};

/**
 * La note d'un modele, ou null. Ne leve jamais : l'identifiant vient du
 * navigateur ou d'un fichier de reglages.
 *
 * On ne cherche pas par cle d'objet (NOTES[id]) mais dans une liste de cles
 * connues : `__proto__` et `constructor` sont alors des chaines comme les
 * autres, qui ne correspondent simplement a aucune entree.
 *
 * @param {string} id identifiant exact du modele
 * @returns {object|null}
 */
const CLES = Object.freeze(Object.keys(NOTES));

function note(id) {
  if (typeof id !== 'string' || !CLES.includes(id)) return null;
  return NOTES[id];
}

module.exports = { NOTES, note };
