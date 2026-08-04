'use client'

import { useState, useEffect } from 'react'
import { signUp, estModeLocal } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Logo from '@/components/shared/Logo'
import Button from '@/components/shared/Button'
import Alert from '@/components/shared/Alert'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const router = useRouter()

  // En mode local, aucun compte n'est necessaire : on ouvre directement l'app.
  useEffect(() => {
    if (estModeLocal) router.replace('/dashboard')
  }, [router])

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    const { data, error } = await signUp(email, password)
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    // Supabase renvoie un "succes" avec identities vide quand l'email existe deja
    if (data?.user?.identities?.length === 0) {
      setError('Un compte existe déjà avec cet email. Connectez-vous.')
      return
    }

    // Pas de session = confirmation d'email activee : ne pas rediriger vers le dashboard
    if (!data?.session) {
      setSuccess('Compte créé ! Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous.')
      return
    }

    setSuccess('Compte créé ! Redirection...')
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left: Visual panel (desktop) */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-gradient-to-br from-secondary/5 via-primary-light to-accent-light relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/3 left-1/4 w-64 h-64 rounded-full bg-secondary/10 blur-3xl animate-float" />
          <div className="absolute bottom-1/4 right-1/3 w-48 h-48 rounded-full bg-primary/10 blur-3xl animate-float delay-500" />
        </div>
        <div className="relative text-center px-12">
          <div className="font-display text-7xl font-bold text-secondary/20 mb-6">5</div>
          <h2 className="font-display text-2xl font-bold text-text-primary mb-3">Outils pour votre recherche d&apos;emploi</h2>
          <p className="text-text-secondary max-w-sm mx-auto">
            De l&apos;analyse de votre CV au suivi de vos relances. Logiciel libre,
            que vous pouvez aussi installer chez vous sans creer le moindre compte.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {['Analyseur CV', 'Optimiseur ATS', 'Matcher d\'offres', 'Candidature spontanee', 'Suivi'].map(tool => (
              <span key={tool} className="px-3 py-1.5 rounded-full bg-surface/80 text-xs text-text-secondary font-medium border border-border/50">
                {tool}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8">
        <div className="w-full max-w-md animate-fade-in">
          <div className="mb-10">
            <Logo size="md" />
            <h1 className="font-display text-3xl font-bold text-text-primary mt-8">
              Creer un compte
            </h1>
            <p className="text-text-muted mt-2">
              Sur cette installation partagee, le compte sert uniquement a separer
              vos candidatures de celles des autres personnes qui l&apos;utilisent.
            </p>
          </div>

          <form onSubmit={handleSignup} className="space-y-5">
            {error && <Alert variant="error">{error}</Alert>}
            {success && <Alert variant="success">{success}</Alert>}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-2">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                aria-describedby="aide-mot-de-passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6 caracteres minimum"
                className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
              {/* aria-describedby ci-dessus : la contrainte est ainsi lue par
                  le lecteur d'ecran au moment ou le champ prend le focus, et
                  pas seulement au moment ou le formulaire refuse la saisie. */}
              <p id="aide-mot-de-passe" className="mt-2 text-xs text-text-muted">
                6 caracteres minimum.
              </p>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full"
            >
              {loading ? 'Creation...' : 'Creer mon compte'}
            </Button>

            <p className="text-center text-sm text-text-muted pt-2">
              Deja un compte ?{' '}
              <Link href="/login" className="font-semibold text-primary hover:text-primary-hover transition-colors">
                Se connecter
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
