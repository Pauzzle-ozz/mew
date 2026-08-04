'use client';

import { useState } from 'react';
import Link from 'next/link';
import Logo from './Logo';
import Button from './Button';
import ThemeToggle from './ThemeToggle';
import { estModeLocal } from '@/lib/auth';

// En mode local il n'y a ni compte ni session : proposer « Quitter » ou
// « Connexion » n'aurait aucun sens.
const afficherAuth = !estModeLocal;

export default function Header({
  breadcrumbs = [],
  user = null,
  onLogout,
  showAuth = false,
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
          <ThemeToggle />

          {afficherAuth && showAuth && !user && (
            <div className="hidden sm:flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm">Connexion</Button>
              </Link>
              <Link href="/signup">
                <Button variant="primary" size="sm">Commencer</Button>
              </Link>
            </div>
          )}

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
            aria-label="Menu"
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
            {afficherAuth && showAuth && !user && (
              <div className="pt-2 border-t border-border flex gap-2">
                <Link href="/login" className="flex-1" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full">Connexion</Button>
                </Link>
                <Link href="/signup" className="flex-1" onClick={() => setMobileOpen(false)}>
                  <Button variant="primary" size="sm" className="w-full">Commencer</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
