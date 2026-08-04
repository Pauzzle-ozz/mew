const pdf = require('pdf-parse');
const aiService = require('./aiService');
const emailService = require('./emailService');
const applicationService = require('./applicationService');

const { buildPrompt: buildEmailPrompt } = require('../prompts/spontaneEmail');
const { parseEmailGenere } = require('../llm/parseurs/emailSpontane');
const { genererRelance } = require('../core/gabarits/relance');
const { creer } = require('../lib/logger');

const log = creer('CandidatureSpontanee');

const FOLLOW_UP_DAYS = 8;

class CandidatureSpontaneeService {

  /**
   * Pipeline complet : extraire le CV -> generer email IA -> envoyer -> enregistrer
   */
  async sendSpontaneousApplication({
    cvBuffer, recipientEmail, targetPosition, company, contactName, userId,
    candidateName = '', candidateEmail = ''
  }) {
    log.info('Demarrage pipeline candidature spontanee');

    // Etape 1 : extraire le texte du CV
    const pdfData = await pdf(cvBuffer);
    const cvText = pdfData.text;

    if (!cvText || cvText.trim().length < 50) {
      throw new Error("Impossible de lire le texte du CV. Verifiez que le PDF n'est pas une image scannee.");
    }

    // Etape 2 : generer l'email.
    //
    // UN SEUL appel, la ou il y en avait deux. Notre propre prompt impose
    // deja le format « SUBJECT: ... / --- / corps » (voir spontaneEmail.js) :
    // on payait donc un second modele pour decouper un texte dont on avait
    // nous-memes dicte la structure. Un split() suffit, et le parseur gere
    // plus de cas degrades que le modele qu'il remplace.
    const genPrompt = buildEmailPrompt({ cvText, targetPosition, company, contactName });
    const texteGenere = await aiService.generate(genPrompt, { role: 'redaction', temperature: 0.7 });

    const { subject, body } = parseEmailGenere(texteGenere);
    if (!subject || !body) {
      throw new Error("La generation de l'email a echoue : reponse inexploitable");
    }

    // Etape 3 : nom du fichier CV.
    // On prefere TOUJOURS le nom saisi par l'utilisateur a celui devine par
    // le modele : beaucoup de CV commencent par l'intitule du poste en
    // capitales, ce qui donnait des pieces jointes « CV_Infirmier_Diplome.pdf ».
    const nomRetenu = candidateName || emailJSON.candidate_name || '';
    const cvFilename = nomRetenu
      ? `CV_${nomRetenu.trim().replace(/\s+/g, '_')}.pdf`
      : 'CV.pdf';

    // Etape 4 : envoyer l'email avec le CV en piece jointe
    const emailResult = await emailService.sendSpontaneousApplication({
      recipientEmail,
      subject,
      body,
      cvBuffer,
      cvFilename,
      // Sans reply_to, la reponse du recruteur part vers l'adresse technique
      // d'expedition et se perd.
      replyTo: candidateEmail || undefined
    });

    // Etape 5 : enregistrer la candidature dans le tracker
    let application = null;
    if (userId) {
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + FOLLOW_UP_DAYS);

      application = await applicationService.create(userId, {
        offer_title: targetPosition,
        company: company || '',
        offer_url: '',
        location: '',
        contract_type: '',
        status: 'postule',
        notes: `Candidature spontanee envoyee a ${recipientEmail}\nObjet: ${subject}`,
        recipient_email: recipientEmail,
        follow_up_date: followUpDate.toISOString(),
        follow_up_sent: false,
        candidature_type: 'spontanee',
        contact_name: contactName || '',
        // Ranges dans leurs propres champs plutot que noyes dans « notes » :
        // la relance n'a plus besoin de les redecouper a l'expression reguliere.
        candidate_name: nomRetenu,
        original_subject: subject
      });
    }

    log.info('Pipeline candidature spontanee termine');
    return {
      emailResult,
      application,
      generatedEmail: { subject, body, candidate_name: nomRetenu },
      followUpDate: application?.follow_up_date || null
    };
  }

  /**
   * Generer un email de relance a la demande (ne l'envoie PAS)
   */
  /**
   * Generer un email de relance. Zero appel a un modele de langage.
   *
   * Le prompt d'origine imposait deja tout : 80 mots maximum, une formule
   * d'ouverture dictee, une cloture dictee, et l'objet etait litteralement
   * ecrit dedans (« SUBJECT: Re: ... »). Il ne restait aucune liberte reelle
   * au modele — on payait deux appels pour remplir un texte a trous.
   *
   * Et ici le gabarit est MEILLEUR, pas seulement moins cher : un texte
   * relu et valide une fois pour toutes bat un texte different a chaque
   * fois que personne ne relit avant envoi.
   */
  async generateFollowUp({ originalSubject, targetPosition, company, candidateName, daysSince }) {
    log.info('Generation relance (gabarit local)');
    return genererRelance({ originalSubject, targetPosition, company, candidateName, daysSince });
  }
}

module.exports = new CandidatureSpontaneeService();
