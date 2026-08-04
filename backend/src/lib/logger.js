/**
 * Logger minimaliste, sans aucune dependance.
 *
 * Deux raisons d'exister :
 *   1. Pouvoir baisser le bruit en production (LOG_LEVEL=warn).
 *   2. Ne PLUS ecrire de donnees personnelles dans les logs.
 *
 * Mew manipule des CV : des noms, des emails, des telephones, et les
 * coordonnees de recruteurs qui n'ont rien demande a personne. Le README
 * promet que ces donnees ne sont pas conservees — ce fichier est la pour
 * que ce soit vrai, et pas seulement ecrit.
 *
 * Regle : on journalise des FAITS (« CV analyse, 4 experiences »), jamais
 * des IDENTITES (« CV de Jean Dupont, jean@exemple.fr »).
 */

const NIVEAUX = { error: 0, warn: 1, info: 2, debug: 3 };

const niveauActuel = () => {
  const demande = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return NIVEAUX[demande] !== undefined ? NIVEAUX[demande] : NIVEAUX.info;
};

const ecrire = (niveau, sortie, prefixe, args) => {
  if (NIVEAUX[niveau] > niveauActuel()) return;
  sortie(`[${prefixe}]`, ...args);
};

/**
 * Masque une adresse email pour pouvoir la tracer sans l'exposer.
 * « recruteur@grande-entreprise.fr » devient « r***@grande-entreprise.fr ».
 * Suffisant pour deboguer, insuffisant pour identifier quelqu'un.
 */
const masquerEmail = (email) => {
  if (typeof email !== 'string' || !email.includes('@')) return '(email absent)';
  const [nom, domaine] = email.split('@');
  return `${nom.slice(0, 1)}***@${domaine}`;
};

/**
 * Remplace un nom par sa seule initiale.
 */
const masquerNom = (nom) => {
  if (typeof nom !== 'string' || nom.trim() === '') return '(anonyme)';
  return nom.trim().split(/\s+/).map((mot) => `${mot[0]}.`).join(' ');
};

const creer = (prefixe) => ({
  error: (...args) => ecrire('error', console.error, prefixe, args),
  warn: (...args) => ecrire('warn', console.warn, prefixe, args),
  info: (...args) => ecrire('info', console.log, prefixe, args),
  debug: (...args) => ecrire('debug', console.log, prefixe, args)
});

module.exports = { creer, masquerEmail, masquerNom };
