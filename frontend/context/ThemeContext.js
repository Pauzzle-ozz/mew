'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext({ theme: 'system', setTheme: () => {} })

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('system')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem('mew-theme')
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      setTheme(stored)
    }
  }, [])

  useEffect(() => {
    if (!mounted) return

    const root = document.documentElement

    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.toggle('dark', isDark)
      localStorage.removeItem('mew-theme')
    } else {
      root.classList.toggle('dark', theme === 'dark')
      localStorage.setItem('mew-theme', theme)
    }
  }, [theme, mounted])

  // Ecouter les changements OS en mode system
  useEffect(() => {
    if (!mounted || theme !== 'system') return

    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => {
      document.documentElement.classList.toggle('dark', e.matches)
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [theme, mounted])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
