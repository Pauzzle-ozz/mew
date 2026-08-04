'use client'

import { useTheme } from '@/context/ThemeContext'
import { useEffect, useState } from 'react'

export default function ThemeToggle({ className = '' }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const cycleTheme = () => {
    const next = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'
    setTheme(next)
  }

  // Placeholder avant mount pour eviter layout shift
  if (!mounted) {
    return <div className={`w-9 h-9 rounded-lg bg-surface-elevated ${className}`} />
  }

  const icons = {
    light: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    dark: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
    ),
    system: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  }

  const labels = {
    light: 'Mode clair',
    dark: 'Mode sombre',
    system: 'Suivre le systeme',
  }

  return (
    <button
      onClick={cycleTheme}
      className={`w-9 h-9 rounded-lg bg-surface-elevated hover:bg-border flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors cursor-pointer ${className}`}
      title={labels[theme]}
      aria-label={labels[theme]}
    >
      {icons[theme]}
    </button>
  )
}
