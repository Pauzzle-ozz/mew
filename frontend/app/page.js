import { redirect } from 'next/navigation'

// Pas de landing page : on arrive directement sur l'univers emploi.
// Le dashboard redirige vers /login si l'utilisateur n'est pas connecte.
export default function Home() {
  redirect('/dashboard')
}
