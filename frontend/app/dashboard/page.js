'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { getCapacites } from '@/lib/api/capacitesApi'
import Header from '@/components/shared/Header'
import LoadingScreen from '@/components/shared/LoadingScreen'
import {
  DocIcon,
  SparkleIcon,
  TargetIcon,
  MailIcon,
  ClipboardIcon,
  IconArrowRight,
} from '@/components/shared/icons'

/**
 * Les cinq outils, et ce dont ils ont besoin pour tourner AU MIEUX.
 *
 * `requiert` ne veut pas dire « bloquant ». Aucun outil ne se ferme quand une
 * cle manque : le calcul local (score ATS, correspondance CV/offre, metiers
 * ROME) fonctionne toujours. Ce qui tombe, c'est uniquement la partie redigee
 * par un modele. La carte reste donc cliquable et se contente de le dire.
 */
const OUTILS = [
  {
    href: '/solutions/analyse-cv',
    titre: 'Analyseur de CV',
    description: 'Lit votre CV et propose les metiers qui correspondent a votre parcours',
    tags: ['PDF', 'Formulaire', 'Referentiel ROME'],
    icone: DocIcon,
    requiert: [],
  },
  {
    href: '/solutions/optimiseur-cv',
    titre: 'Optimiseur de CV',
    description: 'Note votre CV face aux logiciels de tri (ATS) et detaille chaque critere',
    tags: ['Score ATS', 'Detail du calcul'],
    icone: SparkleIcon,
    requiert: ['ia'],
  },
  {
    href: '/solutions/matcher-offres',
    titre: "Matcher d'Offres",
    description: 'Adapte votre CV a une offre precise et decouvre les offres qui vous vont',
    tags: ['CV adapte', 'Lettre', 'Decouverte'],
    icone: TargetIcon,
    requiert: ['ia', 'scraping'],
  },
  {
    href: '/solutions/candidature-spontanee',
    titre: 'Candidature Spontanee',
    description: "Redige un email d'approche et l'envoie avec votre CV en piece jointe",
    tags: ['Email', 'CV joint'],
    icone: MailIcon,
    requiert: ['ia', 'envoiEmail'],
  },
  {
    href: '/solutions/matcher-offres/candidatures',
    titre: 'Suivi de Candidatures',
    description: 'Vos candidatures, leur statut et les relances a faire',
    tags: ['Tracker', 'Relances'],
    icone: ClipboardIcon,
    requiert: [],
  },
]

/** Ce qu'on dit a l'utilisateur quand une capacite manque, en clair. */
const MENTIONS_MANQUANTES = {
  ia: 'Redaction IA non configuree',
  envoiEmail: "Envoi d'email non configure",
  scraping: 'Lecture des offres en ligne desactivee',
  franceTravail: 'Offres France Travail non configurees',
}

/** Les capacites resumees en bas de l'en-tete, dans cet ordre. */
const CAPACITES_RESUMEES = [
  { cle: 'ia', libelle: 'Redaction IA' },
  { cle: 'envoiEmail', libelle: "Envoi d'email" },
  { cle: 'scraping', libelle: 'Lecture des offres' },
  { cle: 'franceTravail', libelle: 'France Travail' },
]

/**
 * Interroge le backend sur ce que cette installation sait faire.
 *
 * Renvoie `null` tant qu'on ne sait pas, ET si l'appel echoue. C'est
 * volontaire : backend eteint = on n'affiche aucun indicateur, plutot que
 * d'annoncer a tort que tout est desactive.
 *
 * L'appel reseau vit dans lib/api/capacitesApi.js, comme tous les autres
 * appels backend du projet ; ce hook ne fait que le brancher sur React.
 */
function useCapacites() {
  const [capacites, setCapacites] = useState(null)

  useEffect(() => {
    let monte = true

    // getCapacites() renvoie deja null au lieu de lever : il n'y a donc
    // rien a rattraper ici.
    getCapacites().then((donnees) => {
      if (monte && donnees) setCapacites(donnees)
    })

    return () => { monte = false }
  }, [])

  return capacites
}

export default function DashboardPage() {
  const { user, loading, logout } = useAuth()
  const capacites = useCapacites()

  if (loading) return <LoadingScreen message="Ouverture de vos outils..." />

  return (
    <div className="min-h-screen bg-background">
      <Header user={user} onLogout={logout} breadcrumbs={[{ label: 'Tableau de bord' }]} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-2xl bg-gradient-to-r from-orange-500/8 to-amber-500/4 p-8 mb-8 animate-fade-in">
          <h1 className="font-display text-3xl font-bold text-text-primary mb-2">Recherche d&apos;emploi</h1>
          <p className="text-text-secondary">
            Cinq outils pour avancer sur vos candidatures. Tout tourne sur votre machine.
          </p>

          <ResumeCapacites capacites={capacites} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {OUTILS.map((outil, index) => (
            <CarteOutil key={outil.href} outil={outil} index={index} capacites={capacites} />
          ))}
        </div>
      </main>
    </div>
  )
}

/**
 * Etat de l'installation, en petit sous le titre.
 * Rien ne s'affiche tant que le backend n'a pas repondu.
 */
function ResumeCapacites({ capacites }) {
  if (!capacites) return null

  const stockageLocal = capacites.stockage !== 'supabase'

  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
      {CAPACITES_RESUMEES.map(({ cle, libelle }) => (
        <span key={cle} className="inline-flex items-center gap-1.5">
          {/* Le point ne porte pas l'information a lui seul : le mot « active »
              ou « non configuree » est ecrit juste a cote, pour que la couleur
              ne soit pas le seul canal (daltonisme, lecteur d'ecran). */}
          <span
            aria-hidden="true"
            className={`w-1.5 h-1.5 rounded-full ${capacites[cle] ? 'bg-success' : 'bg-text-muted/40'}`}
          />
          {libelle} {capacites[cle] ? 'active' : 'non configuree'}
        </span>
      ))}

      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-success" />
        {stockageLocal ? 'Donnees sur cette machine' : 'Donnees dans votre Supabase'}
      </span>
    </div>
  )
}

function CarteOutil({ outil, index, capacites }) {
  const Icone = outil.icone

  // Tant que `capacites` est null (backend injoignable ou reponse en cours),
  // la liste reste vide : on n'affiche jamais d'avertissement suppose.
  const manques = capacites
    ? outil.requiert.filter((cle) => capacites[cle] === false)
    : []

  return (
    <Link
      href={outil.href}
      className="group block h-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div
        className="relative flex h-full flex-col rounded-2xl p-6 bg-surface border border-border/60 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:-translate-y-0.5 animate-fade-in-up"
        style={{ animationDelay: `${index * 80}ms` }}
      >
        <div className="w-11 h-11 rounded-xl bg-primary-light flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
          <Icone className="w-5 h-5 text-primary" />
        </div>

        <h2 className="font-display text-lg font-bold text-text-primary mb-1.5 group-hover:text-primary transition-colors">
          {outil.titre}
        </h2>
        <p className="text-sm text-text-muted mb-4 leading-relaxed">{outil.description}</p>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {outil.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium bg-surface-elevated text-text-secondary">
              {tag}
            </span>
          ))}
        </div>

        {manques.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {manques.map((cle) => (
              <span key={cle} className="px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning">
                {MENTIONS_MANQUANTES[cle]}
              </span>
            ))}
          </div>
        )}

        {/* mt-auto : la fleche reste collee en bas quelle que soit la hauteur
            du texte, sinon les cartes d'une meme ligne se decalent. */}
        <span className="mt-auto text-primary text-sm font-semibold inline-flex items-center gap-1 group-hover:gap-2 transition-all">
          Utiliser
          <IconArrowRight className="w-4 h-4" />
        </span>
      </div>
    </Link>
  )
}
