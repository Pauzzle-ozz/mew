'use client'

import { Component } from 'react'

/**
 * Filet de securite : attrape les plantages de rendu React.
 *
 * Sans lui, une erreur dans n'importe quel composant vide toute la page et
 * laisse un ecran blanc, sans un mot pour expliquer ce qui vient de se
 * passer. Ici on affiche au moins un message et un bouton pour repartir.
 *
 * Ce composant doit rester une CLASSE : React ne propose pas d'equivalent
 * en fonction (il n'existe pas de hook « componentDidCatch »).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // La console reste le seul endroit ou l'erreur complete est lisible :
    // rien n'est envoye ailleurs, c'est une application qui tourne chez vous.
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="max-w-md w-full mx-4">
            {/* role="alert" : au moment ou ce bloc remplace la page, un lecteur
                d'ecran doit l'annoncer sans attendre. */}
            <div role="alert" className="bg-surface rounded-2xl border border-border p-8 text-center">
              <h1 className="font-display text-2xl font-bold text-text-primary mb-2">
                Une erreur est survenue
              </h1>
              <p className="text-text-muted mb-2">
                L&apos;application a rencontre un probleme inattendu. Recharger la page
                suffit generalement a repartir.
              </p>
              <p className="text-text-muted text-sm mb-6">
                Si le probleme revient, le detail est dans la console du navigateur
                (touche F12) : c&apos;est ce qu&apos;il faut coller dans un rapport de bug.
              </p>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null })
                  window.location.reload()
                }}
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary-hover transition-colors cursor-pointer"
              >
                Recharger la page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
