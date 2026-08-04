import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Supabase est-il configure ?
 * Mew fonctionne par defaut sans aucun compte : ce client n'est utile que
 * si l'on veut heberger l'application en ligne pour plusieurs personnes.
 */
export const supabaseConfigured = Boolean(url && anonKey)

let client = null

/**
 * Cree le client a la premiere utilisation, jamais au chargement du module.
 *
 * Avant, `createClient(url, key)` s'executait des l'import. Sans fichier
 * .env.local, la bibliotheque levait « supabaseUrl is required » et les
 * NEUF fichiers qui importaient ce module plantaient en cascade :
 * l'utilisateur voyait un ecran d'erreur generique, sans le moindre indice
 * sur ce qui manquait.
 */
export function getSupabase() {
  if (!supabaseConfigured) {
    throw new Error(
      "Supabase n'est pas configure. Renseigne NEXT_PUBLIC_SUPABASE_URL et "
      + 'NEXT_PUBLIC_SUPABASE_ANON_KEY dans frontend/.env.local, ou reste en '
      + 'mode local (NEXT_PUBLIC_AUTH_MODE=local, le defaut).'
    )
  }
  if (!client) client = createClient(url, anonKey)
  return client
}
