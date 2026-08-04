'use client'

import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="max-w-md w-full mx-4 text-center">
            <div className="bg-surface rounded-2xl border border-border p-8">
              <div className="text-5xl mb-4">Oups</div>
              <h1 className="text-2xl font-bold text-text-primary mb-2">
                Une erreur est survenue
              </h1>
              <p className="text-text-muted mb-6">
                L&apos;application a rencontre un probleme inattendu. Essayez de recharger la page.
              </p>
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null })
                  window.location.reload()
                }}
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary-hover transition-colors"
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
