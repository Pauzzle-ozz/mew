const { Resend } = require('resend');
const config = require('../config');
const { creer, masquerEmail } = require('../lib/logger');

const log = creer('Email');

/**
 * Echappe les caracteres HTML pour prevenir les attaques XSS
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Service d'envoi d'emails (candidature spontanee uniquement).
 *
 * Le client Resend est cree PARESSEUSEMENT. Avant, il etait instancie
 * au chargement du fichier : sans RESEND_API_KEY, le SDK levait
 * « Missing API key » pendant le require, et le serveur ENTIER refusait
 * de demarrer — y compris les 4 outils qui n'envoient jamais d'email.
 */
class EmailService {
  constructor() {
    this._resend = null;
  }

  estDisponible() {
    return config.capacites.envoiEmail;
  }

  client() {
    if (this._resend) return this._resend;

    if (!this.estDisponible()) {
      const erreur = new Error(
        "L'envoi d'email n'est pas configure. Ajoute RESEND_API_KEY dans "
        + 'backend/.env pour activer cette fonctionnalite, ou copie l\'email '
        + 'genere dans ta propre messagerie. Voir backend/.env.example.'
      );
      erreur.code = 'EMAIL_NON_CONFIGURE';
      throw erreur;
    }

    this._resend = new Resend(config.email.cleApi);
    return this._resend;
  }

  /**
   * Envoyer une candidature spontanee avec le CV en piece jointe.
   *
   * @param {string} replyTo - adresse du candidat. SANS elle, le recruteur
   *   qui clique sur « Repondre » ecrit a l'adresse d'expedition technique
   *   et sa reponse part dans le vide : la fonction principale de l'outil
   *   (recevoir une reponse) est alors cassee.
   */
  async sendSpontaneousApplication({ recipientEmail, subject, body, cvBuffer, cvFilename, replyTo }) {
    log.info('Envoi candidature spontanee vers', masquerEmail(recipientEmail));

    if (!recipientEmail || !subject || !body || !cvBuffer) {
      throw new Error('Email destinataire, objet, corps et CV sont obligatoires');
    }

    const safeBody = escapeHtml(body).replace(/\n/g, '<br>');

    const envoi = {
      from: config.email.expediteur,
      to: [recipientEmail],
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; line-height: 1.6; color: #374151;">
          <p>${safeBody}</p>
        </div>
      `,
      attachments: [
        {
          filename: cvFilename || 'CV.pdf',
          content: cvBuffer
        }
      ]
    };

    if (replyTo) envoi.reply_to = replyTo;

    const { data, error } = await this.client().emails.send(envoi);

    if (error) {
      log.error('Erreur envoi candidature spontanee:', error.message || error);
      throw new Error("Impossible d'envoyer l'email de candidature");
    }

    log.info('Candidature spontanee envoyee, ID:', data.id);
    return { success: true, messageId: data.id };
  }
}

module.exports = new EmailService();
