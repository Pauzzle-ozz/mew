'use client'

import Link from 'next/link'

const sizes = {
  sm: 'text-xl',
  md: 'text-3xl',
  lg: 'text-5xl md:text-6xl',
  xl: 'text-7xl md:text-8xl',
}

export default function Logo({ size = 'md', link = true, className = '' }) {
  const fontSize = sizes[size] || sizes.md

  const content = (
    <span className={`font-display font-bold tracking-tight select-none ${fontSize} ${className}`}>
      <span className="text-primary">mew</span>
      <span className="text-text-primary opacity-30 mx-[0.15em]">/</span>
      <span className="text-text-primary">mew</span>
    </span>
  )

  if (link) {
    return <Link href="/" className="inline-flex items-center hover:opacity-80 transition-opacity">{content}</Link>
  }
  return content
}
