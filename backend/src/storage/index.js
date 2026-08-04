const config = require('../config');
const { creer } = require('../lib/logger');

const log = creer('Stockage');

/**
 * Point d'entree unique du stockage.
 *
 * Le reste du code ne sait pas OU les donnees sont rangees : il appelle
 * `storage.applications.create(...)` et c'est tout. Changer de mode de
 * stockage se fait avec une variable d'environnement, sans toucher au
 * code metier.
 *
 * Deux adaptateurs, la meme interface :
 *   - json     : un fichier sur la machine de l'utilisateur (defaut)
 *   - supabase : une base PostgreSQL en ligne (multi-utilisateur)
 */

let adaptateur;

if (config.stockage.driver === 'supabase') {
  if (!config.capacites.stockageSupabase) {
    log.warn(
      'STORAGE_DRIVER=supabase mais SUPABASE_URL ou SUPABASE_SERVICE_KEY est absente. '
      + 'Retour au stockage local (backend/data/mew.json).'
    );
    adaptateur = require('./jsonAdapter');
  } else {
    adaptateur = require('./supabaseAdapter');
  }
} else {
  adaptateur = require('./jsonAdapter');
}

module.exports = adaptateur;
