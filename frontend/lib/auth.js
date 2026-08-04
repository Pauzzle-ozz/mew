import { getSupabase, supabaseConfigured } from '@/lib/supabase'

/**
 * Authentification a deux modes.
 *
 *   local     : aucun compte, aucun mot de passe (mode par defaut).
 *               L'application s'ouvre directement sur le tableau de bord.
 *               Un identifiant est genere une fois et conserve dans le
 *               navigateur : il sert uniquement a relier tes candidatures
 *               et ton historique entre eux, cote backend.
 *
 *   supabase  : comptes et mots de passe, pour heberger Mew en ligne et
 *               le partager avec plusieurs personnes.
 *
 * Le reste de l'application appelle ces fonctions et ignore le mode actif.
 */

const CLE_IDENTIFIANT = 'mew-local-user-id'

export const authMode = (process.env.NEXT_PUBLIC_AUTH_MODE || 'local') === 'supabase'
  && supabaseConfigured
  ? 'supabase'
  : 'local'

export const estModeLocal = authMode === 'local'

/**
 * Identifiant local stable, cree au premier lancement.
 */
function identifiantLocal() {
  if (typeof window === 'undefined') return null

  let id = window.localStorage.getItem(CLE_IDENTIFIANT)
  if (!id) {
    id = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `local-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
    window.localStorage.setItem(CLE_IDENTIFIANT, id)
  }
  return id
}

/**
 * L'utilisateur courant, ou null s'il faut se connecter.
 * En mode local, il y a toujours un utilisateur : personne n'est jamais
 * bloque devant un formulaire de connexion.
 */
export async function getUser() {
  if (estModeLocal) {
    const id = identifiantLocal()
    return id ? { id, email: 'Vous', local: true } : null
  }

  const { data: { user } } = await getSupabase().auth.getUser()
  return user
}

export async function signIn(email, password) {
  if (estModeLocal) return { error: null }
  return getSupabase().auth.signInWithPassword({ email, password })
}

export async function signUp(email, password) {
  if (estModeLocal) return { error: null }
  return getSupabase().auth.signUp({ email, password })
}

/**
 * @returns {Promise<boolean>} true s'il y avait vraiment une session a
 *   fermer. En mode local il n'y a rien a quitter : les pages s'en servent
 *   pour savoir s'il faut rediriger vers l'ecran de connexion.
 */
export async function signOut() {
  if (estModeLocal) return false
  await getSupabase().auth.signOut()
  return true
}
