'use client'

import { useEffect, useState } from 'react'
import { getUser, signOut } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/shared/Header'
import Logo from '@/components/shared/Logo'

const SOLUTIONS = [
  { href: '/solutions/analyse-cv', title: 'Analyseur de CV', desc: 'Analysez votre CV et decouvrez les metiers qui vous correspondent', tags: ['PDF', 'Formulaire', 'IA'], icon: DocIcon },
  { href: '/solutions/optimiseur-cv', title: 'Optimiseur de CV', desc: 'Optimisez votre CV pour les ATS avec score, points forts et axes d\'amelioration', tags: ['Score ATS', 'Points forts'], icon: SparkleIcon },
  { href: '/solutions/matcher-offres', title: "Matcher d'Offres", desc: 'Adaptez votre CV a chaque offre et decouvrez les offres faites pour vous', tags: ['CV adapte', 'Lettre', 'Decouverte'], icon: TargetIcon },
  { href: '/solutions/candidature-spontanee', title: 'Candidature Spontanee', desc: "L'IA redige et envoie un email percutant avec votre CV en piece jointe", tags: ['Email', 'CV joint'], icon: MailIcon },
  { href: '/solutions/matcher-offres/candidatures', title: 'Suivi de Candidatures', desc: 'Suivez toutes vos candidatures : a postuler, postule, entretien, offre', tags: ['Tracker', 'Relances'], icon: ClipboardIcon },
]

export default function DashboardPage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const check = async () => {
      const user = await getUser()
      if (!user) router.push('/login')
      else { setUser(user); setLoading(false) }
    }
    check()
  }, [router])

  const handleLogout = async () => {
    if (await signOut()) router.push('/login')
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="min-h-screen bg-background">
      <Header
        user={user}
        onLogout={handleLogout}
        breadcrumbs={[{ label: 'Dashboard' }]}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="rounded-2xl bg-gradient-to-r from-orange-500/8 to-amber-500/4 p-8 mb-8 animate-fade-in">
          <h1 className="font-display text-3xl font-bold text-text-primary mb-2">Recherche d&apos;emploi</h1>
          <p className="text-text-secondary">Optimisez votre profil et trouvez le job parfait</p>
        </div>

        {/* Solution cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SOLUTIONS.map((sol, i) => (
            <SolutionCard key={sol.href} sol={sol} index={i} />
          ))}
        </div>
      </main>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <Logo size="md" link={false} />
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

/* ── Solution Card ── */
function SolutionCard({ sol, index }) {
  const Icon = sol.icon
  return (
    <Link href={sol.href}>
      <div className="group relative rounded-2xl p-6 bg-surface border border-border/60 h-full transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:-translate-y-0.5 animate-fade-in-up" style={{ animationDelay: `${index * 80}ms` }}>
        {/* Icon */}
        <div className="w-11 h-11 rounded-xl bg-primary-light flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
          <Icon className="w-5 h-5 text-primary" />
        </div>

        {/* Content */}
        <h3 className="font-display text-lg font-bold text-text-primary mb-1.5 group-hover:text-primary transition-colors">
          {sol.title}
        </h3>
        <p className="text-sm text-text-muted mb-4 leading-relaxed">{sol.desc}</p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {sol.tags.map(tag => (
            <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium bg-surface-elevated text-text-secondary">
              {tag}
            </span>
          ))}
        </div>

        {/* Action */}
        <span className="text-primary text-sm font-semibold inline-flex items-center gap-1 group-hover:gap-2 transition-all">
          Utiliser
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </span>
      </div>
    </Link>
  )
}

/* ── Icons ── */
function DocIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function SparkleIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  )
}

function TargetIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function MailIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  )
}

function ClipboardIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
    </svg>
  )
}
