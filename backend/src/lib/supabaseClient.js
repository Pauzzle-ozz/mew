const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

/**
 * Client Supabase partage, cree PARESSEUSEMENT.
 *
 * Mew fonctionne par defaut avec un stockage local (backend/data/), sans
 * aucun compte cloud. Instancier le client au chargement du fichier
 * obligeait tout le monde a creer un projet Supabase, meme pour utiliser
 * l'analyseur de CV qui ne touche jamais a la base de donnees.
 *
 * ATTENTION : la cle utilisee ici est la cle « service_role ». Elle
 * contourne TOUTES les regles de securite de la base. Elle ne doit jamais
 * quitter le backend, ni se retrouver dans une variable NEXT_PUBLIC_*.
 */
let client = null;

function getSupabase() {
  if (client) return client;

  if (!config.capacites.stockageSupabase) {
    const erreur = new Error(
      "Le stockage Supabase n'est pas configure. Mets STORAGE_DRIVER=supabase "
      + 'et renseigne SUPABASE_URL et SUPABASE_SERVICE_KEY dans backend/.env, '
      + 'ou reste sur le stockage local (STORAGE_DRIVER=json, le defaut).'
    );
    erreur.code = 'STOCKAGE_NON_CONFIGURE';
    throw erreur;
  }

  client = createClient(config.stockage.supabaseUrl, config.stockage.supabaseCle);
  return client;
}

// Facade : le code appelant ecrit `supabase.from('table')`, et le client
// n'est reellement cree qu'a cet instant. `.from` est la seule methode
// utilisee dans tout le projet.
module.exports = {
  from: (...args) => getSupabase().from(...args),
  getSupabase
};
