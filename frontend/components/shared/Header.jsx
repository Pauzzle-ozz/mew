'use client';

import { useState } from 'react';
import Link from 'next/link';
import Logo from './Logo';
import Button from './Button';
import ThemeToggle from './ThemeToggle';
import { estModeLocal } from '@/lib/auth';

// En mode local il n'y a ni compte ni session : proposer « Quitter »
// n'aurait aucun sens.
//
// Il y avait ici une prop `showAuth` qui affichait deux boutons
// « Connexion / Commencer ». Aucun appelant ne la passait : elle restait a
// false partout, donc ces ~20 lignes de JSX n'ont jamais ete rendues. Elles
// sont supprimees. Si un jour une page publique en a besoin, /login et
// /signup existent toujours.
const afficherAuth = !estModeLocal;

/**
 * Acces aux parametres : le choix du fournisseur de modele et de la cle API.
 *
 * POURQUOI UNE ROUE DENTEE ET PAS UN LIEN ECRIT
 * C'est un reglage qu'on fait une fois puis qu'on oublie : il doit etre
 * atteignable depuis n'importe quelle page, sans jamais disputer la place au
 * contenu. La roue dentee est le symbole que tout le monde connait — mais elle
 * ne suffit pas seule : aria-label donne le mot aux lecteurs d'ecran, et title
 * l'affiche au survol pour ceux qui hesitent.
 *
 * L'icone est ecrite ici plutot que dans icons.jsx : ce fichier partage est
 * touche par d'autres travaux en cours, et une roue dentee de 4 lignes ne
 * justifie pas un conflit.
 */
function LienParametres() {
  return (
    <Link
      href="/parametres"
      aria-label="Parametres"
      title="Parametres"
      className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary"
    >
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.7}
        aria-hidden="true"
        focusable="false"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.03 7.03 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    </Link>
  );
}

export default function Header({
  breadcrumbs = [],
  user = null,
  onLogout,
  actions = null,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-surface-glass backdrop-blur-xl border-b border-border/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Logo + Breadcrumbs */}
        <div className="flex items-center gap-3">
          <Logo size="sm" />

          {breadcrumbs.length > 0 && (
            <nav className="hidden sm:flex items-center gap-1.5 text-sm">
              {breadcrumbs.map((crumb, index) => (
                <span key={index} className="flex items-center gap-1.5">
                  <span className="text-text-muted/50">/</span>
                  {crumb.href ? (
                    <Link href={crumb.href} className="text-text-muted hover:text-primary transition-colors">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-text-secondary font-medium">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {actions}
          <LienParametres />
          <ThemeToggle />

          {user && (
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">
                  {user.email?.[0]?.toUpperCase()}
                </span>
              </div>
              {afficherAuth && onLogout && (
                <Button variant="ghost" size="sm" onClick={onLogout}>
                  Quitter
                </Button>
              )}
            </div>
          )}

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="sm:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer"
            aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={mobileOpen}
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-border bg-surface animate-fade-in">
          <div className="px-4 py-3 space-y-2">
            {/* Le meme lien qu'en haut a droite : la roue dentee y est cachee
                sur petit ecran, il faut donc une entree ecrite ici, sinon les
                parametres deviennent inatteignables au telephone. */}
            <Link
              href="/parametres"
              className="block py-2 text-sm text-text-secondary hover:text-primary"
              onClick={() => setMobileOpen(false)}
            >
              Parametres
            </Link>

            {breadcrumbs.map((crumb, index) => (
              <div key={index}>
                {crumb.href ? (
                  <Link href={crumb.href} className="block py-2 text-sm text-text-secondary hover:text-primary" onClick={() => setMobileOpen(false)}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="block py-2 text-sm font-medium text-text-primary">{crumb.label}</span>
                )}
              </div>
            ))}
            {user && (
              <div className="pt-2 border-t border-border">
                <div className="text-sm text-text-muted py-2">{user.email}</div>
                {afficherAuth && onLogout && (
                  <button onClick={() => { onLogout(); setMobileOpen(false); }} className="text-sm text-error py-2 cursor-pointer">
                    Deconnexion
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
