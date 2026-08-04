/**
 * Email de relance d'une candidature spontanee.
 *
 * POURQUOI ce fichier existe : le prompt qu'il remplace
 * (prompts/spontaneFollowUp.js) imposait deja 80 mots maximum, la formule
 * d'ouverture, la cloture, et l'objet y etait ecrit en toutes lettres. Il ne
 * restait aucune liberte reelle au modele -- juste le droit de se tromper.
 *
 * Ici le gabarit n'est pas seulement moins cher : il est MEILLEUR. Un texte
 * relu et valide une fois pour toutes bat un texte different a chaque envoi
 * que personne ne relit avant qu'il parte chez un recruteur.
 *
 * Choix de redaction assume : contrairement au reste du projet, ces textes
 * portent leurs accents. Ils sortent de l'application pour etre lus par un
 * recruteur ; un email francais sans accents se remarque immediatement.
 *
 * Aucune formulation ne s'accorde en genre ("je serais ravi(e)" est banni) :
 * on ne connait pas le genre du candidat et on ne veut pas le deviner.
 */

const { rendre } = require('./moteur');
const { articleDe } = require('./justifications');

// Au-dela de trois semaines, insister une nouvelle fois se retourne contre
// le candidat. On change de registre : un dernier message, plus court, qui
// laisse la porte ouverte sans rien reclamer.
const SEUIL_DERNIER_POINT = 21;

const CORPS_STANDARD = `Madame, Monsieur,

Je me permets de revenir vers vous au sujet de ma candidature spontanée{{#poste}} au poste {{poste}}{{/poste}}{{#delai}}, que je vous ai adressée {{delai}}{{/delai}}.

Mon intérêt pour {{cible}} reste entier et je me tiens disponible pour échanger avec vous au moment qui vous conviendra.

Je vous remercie pour l'attention portée à ma candidature.

Cordialement,
{{nom}}`;

const CORPS_DERNIER_POINT = `Madame, Monsieur,

Je me permets un dernier message au sujet de ma candidature spontanée{{#poste}} au poste {{poste}}{{/poste}}{{#delai}}, envoyée {{delai}}{{/delai}}.

Je comprends qu'aucune opportunité ne corresponde à mon profil aujourd'hui. Je reste disponible si un besoin se présente chez {{cible}}, et vous souhaite une très bonne continuation.

Cordialement,
{{nom}}`;

// Objet de repli, quand on ignore l'objet du message initial.
const OBJET_REPLI = 'Relance - candidature spontanée{{#poste}} au poste {{poste}}{{/poste}}{{#entreprise}} - {{entreprise}}{{/entreprise}}';

// "Re:", "RE :", "Rep:", "Rép :" ... eventuellement empiles.
const MOTIF_PREFIXE_REPONSE = /^(?:\s*(?:re|ref|rep|rép)\s*:\s*)+/i;

/**
 * "il y a 8 jours", "il y a 1 jour", ou rien du tout si le delai est inconnu
 * ou absurde. Mieux vaut une phrase sans delai qu'une phrase fausse.
 */
function formulerDelai(daysSince) {
  const jours = Math.floor(Number(daysSince));
  if (!Number.isFinite(jours) || jours < 1) return '';
  return jours === 1 ? 'il y a 1 jour' : `il y a ${jours} jours`;
}

/**
 * "de commercial" ou "d'infirmier" : le gabarit dit "au poste {{poste}}",
 * l'article voyage avec l'intitule.
 */
function formulerPoste(targetPosition) {
  const intitule = String(targetPosition || '').trim();
  return intitule ? `${articleDe(intitule)}${intitule}` : '';
}

/**
 * Construit l'objet. On repond au fil initial quand on le connait : c'est ce
 * qui donne le plus de chances que le recruteur retrouve la candidature.
 */
function construireObjet({ originalSubject, targetPosition, company }) {
  const original = String(originalSubject || '').trim();

  if (original !== '') {
    // On evite "Re: Re: ..." si l'objet initial portait deja un prefixe.
    const nu = original.replace(MOTIF_PREFIXE_REPONSE, '').trim();
    return `Re: ${nu || original}`;
  }

  return rendre(OBJET_REPLI, {
    poste: formulerPoste(targetPosition),
    entreprise: String(company || '').trim()
  });
}

/**
 * @param {object} params
 * @param {string} params.candidateName   nom qui signe l'email
 * @param {string} params.targetPosition  intitule du poste vise
 * @param {string} params.company         entreprise ciblee (facultatif)
 * @param {string} params.originalSubject objet du premier email (facultatif)
 * @param {number} params.daysSince       jours ecoules depuis l'envoi initial
 * @returns {{subject: string, body: string}}
 */
function genererRelance({
  candidateName = '',
  targetPosition = '',
  company = '',
  originalSubject = '',
  daysSince = 0
} = {}) {
  const jours = Math.floor(Number(daysSince));
  const gabarit =
    Number.isFinite(jours) && jours > SEUIL_DERNIER_POINT ? CORPS_DERNIER_POINT : CORPS_STANDARD;

  const variables = {
    poste: formulerPoste(targetPosition),
    delai: formulerDelai(daysSince),
    // Toujours renseigne : sans nom d'entreprise, "votre entreprise" fait le
    // travail et la phrase reste naturelle.
    cible: String(company || '').trim() || 'votre entreprise',
    nom: String(candidateName || '').trim()
  };

  return {
    subject: construireObjet({ originalSubject, targetPosition, company }),
    body: rendre(gabarit, variables)
  };
}

module.exports = { genererRelance };
