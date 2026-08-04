import { redirect } from 'next/navigation'

/**
 * Pas de page d'accueil : Mew est une application qu'on installe, pas un site
 * qu'on visite. Ouvrir l'adresse doit donner directement les outils.
 *
 * En mode local (le mode par defaut) le tableau de bord s'affiche tel quel.
 * En mode Supabase — quand quelqu'un heberge Mew pour plusieurs personnes —
 * c'est le tableau de bord qui renvoie vers /login s'il n'y a pas de session.
 */
export default function Home() {
  redirect('/dashboard')
}
