'use client'

import { useState, useEffect } from 'react'
import { signIn, estModeLocal } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Logo from '@/components/shared/Logo'
import Button from '@/components/shared/Button'
import Alert from '@/components/shared/Alert'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const router = useRouter()

  // En mode local, il n'y a pas de compte : cette page n'a pas lieu d'exister.
  // On renvoie directement vers le tableau de bord plutot que d'accueillir un
  // nouvel utilisateur avec un formulaire de connexion qui ne sert a rien.
  useEffect(() => {
    if (estModeLocal) router.replace('/dashboard')
  }, [router])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await signIn(email, password)

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left: Form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8">
        <div className="w-full max-w-md animate-fade-in">
          <div className="mb-10">
            <Logo size="md" />
            <h1 className="font-display text-3xl font-bold text-text-primary mt-8">
              Connexion
            </h1>
            <p className="text-text-muted mt-2">
              Cette installation de Mew est partagee : le compte sert a retrouver
              vos candidatures et votre historique.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {error && <Alert variant="error">{error}</Alert>}

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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Votre mot de passe"
                className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </Button>

            <p className="text-center text-sm text-text-muted pt-2">
              Pas encore de compte ?{' '}
              <Link href="/signup" className="font-semibold text-primary hover:text-primary-hover transition-colors">
                Creer un compte
              </Link>
            </p>
          </form>
        </div>
      </div>

      {/* Right: Visual panel (desktop) */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-gradient-to-br from-primary/5 via-accent-light to-primary-light relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/4 right-1/4 w-64 h-64 rounded-full bg-primary/10 blur-3xl animate-float" />
          <div className="absolute bottom-1/3 left-1/3 w-48 h-48 rounded-full bg-accent/10 blur-3xl animate-float delay-500" />
        </div>
        <div className="relative text-center px-12">
          <div className="font-display text-7xl font-bold text-primary/20 mb-6">5</div>
          <h2 className="font-display text-2xl font-bold text-text-primary mb-3">Outils pour votre recherche d&apos;emploi</h2>
          <p className="text-text-secondary max-w-sm mx-auto">
            Analyse de CV, score ATS explique critere par critere, adaptation a une
            offre, candidature spontanee et suivi des relances.
          </p>
          <p className="text-text-muted text-sm max-w-sm mx-auto mt-4">
            Mew est un logiciel libre. Vous pouvez aussi l&apos;installer sur votre
            propre machine : sans compte, et sans que votre CV quitte votre ordinateur.
          </p>
        </div>
      </div>
    </div>
  )
}
