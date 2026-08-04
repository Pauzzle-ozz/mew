const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

/**
 * Stockage local dans un simple fichier JSON.
 *
 * C'est le mode par defaut de Mew : aucun compte a creer, aucune cle,
 * aucune ligne de SQL a executer. Les donnees vivent dans
 * backend/data/mew.json, sur la machine de l'utilisateur, qui peut les
 * sauvegarder, les inspecter ou les effacer lui-meme.
 *
 * C'est aussi la reponse la plus simple au RGPD : on ne peut pas fuiter
 * des donnees qu'on n'heberge pas.
 */

const DOSSIER = path.join(__dirname, '..', '..', 'data');
const FICHIER = path.join(DOSSIER, 'mew.json');

const VIDE = {
  version: 1,
  job_applications: [],
  tool_usage_history: []
};

// Toutes les ecritures passent par cette chaine de promesses : deux
// requetes simultanees ne peuvent pas ecraser le travail l'une de l'autre.
let file = Promise.resolve();

const maintenant = () => new Date().toISOString();

async function lire() {
  try {
    const brut = await fs.readFile(FICHIER, 'utf8');
    const donnees = JSON.parse(brut);
    return { ...VIDE, ...donnees };
  } catch (erreur) {
    if (erreur.code === 'ENOENT') return { ...VIDE };
    // Fichier corrompu : on le met de cote plutot que de le perdre.
    if (erreur instanceof SyntaxError) {
      await fs.rename(FICHIER, `${FICHIER}.corrompu-${Date.now()}`).catch(() => {});
      return { ...VIDE };
    }
    throw erreur;
  }
}

async function ecrire(donnees) {
  await fs.mkdir(DOSSIER, { recursive: true });
  // Ecriture dans un fichier temporaire puis renommage : si le processus
  // s'arrete au mauvais moment, mew.json reste intact.
  const temporaire = `${FICHIER}.tmp`;
  await fs.writeFile(temporaire, JSON.stringify(donnees, null, 2), 'utf8');
  await fs.rename(temporaire, FICHIER);
}

/**
 * Serialise une operation de lecture-modification-ecriture.
 */
function transaction(operation) {
  const suivante = file.then(async () => {
    const donnees = await lire();
    const resultat = await operation(donnees);
    await ecrire(donnees);
    return resultat;
  });
  // La chaine ne doit pas se rompre si une operation echoue.
  file = suivante.catch(() => {});
  return suivante;
}

const applications = {
  async create(userId, data) {
    return transaction((donnees) => {
      const application = {
        id: crypto.randomUUID(),
        user_id: userId,
        offer_title: data.offer_title,
        company: data.company || '',
        offer_url: data.offer_url || '',
        location: data.location || '',
        contract_type: data.contract_type || '',
        status: data.status || 'a_postuler',
        notes: data.notes || '',
        recipient_email: data.recipient_email || '',
        contact_name: data.contact_name || '',
        candidature_type: data.candidature_type || 'offre',
        candidate_name: data.candidate_name || '',
        original_subject: data.original_subject || '',
        follow_up_date: data.follow_up_date || null,
        follow_up_sent: data.follow_up_sent ?? false,
        // Une candidature creee avec le statut « postule » a forcement ete
        // envoyee maintenant. Sans cette date, toute statistique de delai
        // de reponse serait fausse.
        applied_at: data.applied_at || (data.status === 'postule' ? maintenant() : null),
        created_at: maintenant(),
        updated_at: maintenant()
      };
      donnees.job_applications.unshift(application);
      return application;
    });
  },

  async getByUser(userId) {
    const donnees = await lire();
    return donnees.job_applications
      .filter((a) => a.user_id === userId)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  },

  async getById(id, userId) {
    const donnees = await lire();
    return donnees.job_applications.find((a) => a.id === id && a.user_id === userId) || null;
  },

  async update(id, userId, data) {
    return transaction((donnees) => {
      const application = donnees.job_applications.find((a) => a.id === id && a.user_id === userId);
      if (!application) throw new Error('Candidature introuvable');

      const champs = [
        'status', 'notes', 'offer_title', 'company', 'offer_url', 'location',
        'contract_type', 'recipient_email', 'follow_up_date', 'follow_up_sent',
        'candidature_type', 'contact_name', 'candidate_name', 'original_subject'
      ];
      champs.forEach((champ) => {
        if (data[champ] !== undefined) application[champ] = data[champ];
      });

      if (data.status === 'postule' && data.applied_at !== null && !application.applied_at) {
        application.applied_at = data.applied_at || maintenant();
      }
      application.updated_at = maintenant();
      return application;
    });
  },

  async delete(id, userId) {
    return transaction((donnees) => {
      const avant = donnees.job_applications.length;
      donnees.job_applications = donnees.job_applications.filter(
        (a) => !(a.id === id && a.user_id === userId)
      );
      if (donnees.job_applications.length === avant) throw new Error('Candidature introuvable');
    });
  }
};

const history = {
  async save(userId, toolType, title, inputSummary, resultSummary, status = 'completed') {
    return transaction((donnees) => {
      const entree = {
        id: crypto.randomUUID(),
        user_id: userId,
        tool_type: toolType,
        title: title || '',
        input_summary: inputSummary || {},
        result_summary: resultSummary || {},
        status,
        created_at: maintenant()
      };
      donnees.tool_usage_history.unshift(entree);
      return entree;
    });
  },

  async list(userId, filters = {}) {
    const donnees = await lire();
    let resultat = donnees.tool_usage_history
      .filter((e) => e.user_id === userId)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

    if (filters.toolType) resultat = resultat.filter((e) => e.tool_type === filters.toolType);
    if (filters.limit) resultat = resultat.slice(0, Number(filters.limit));
    return resultat;
  },

  async delete(id, userId) {
    return transaction((donnees) => {
      const avant = donnees.tool_usage_history.length;
      donnees.tool_usage_history = donnees.tool_usage_history.filter(
        (e) => !(e.id === id && e.user_id === userId)
      );
      if (donnees.tool_usage_history.length === avant) throw new Error('Entree introuvable');
      return true;
    });
  }
};

module.exports = { applications, history, FICHIER };
