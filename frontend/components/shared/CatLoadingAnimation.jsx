'use client'

// ── Pixel art cat — each "pixel" is a SZ×SZ rect ──────────────────────────
const SZ = 4  // pixels per grid cell

const B = '#64748b'  // body (slate-500)
const P = '#fb7185'  // pink (ears, nose, tongue)
const Y = '#fbbf24'  // amber (eyes)
const K = '#0f172a'  // black (pupils)

// 10-wide × 13-tall grid
// _ = transparent, B = body, P = pink, Y = amber, K = black/pupil
const GRID = [
  '__B____B__',  // 0  ear tips
  '_BPB__BPB_',  // 1  ears with pink inner
  '_BBBBBBBB_',  // 2  head top
  'BBBBBBBBBB',  // 3  head full
  'BBYYBBYYBB',  // 4  eyes (amber)
  'BBYKBBYKBB',  // 5  pupils (black)
  'BBBBBBBBBB',  // 6  cheeks
  'BBBBPPBBBB',  // 7  nose (pink)
  'BBBBBBBBBB',  // 8  chin
  '_BBBBBBBB_',  // 9  body top
  'BBBBBBBBBB',  // 10 body
  'BBBBBBBBBB',  // 11 body
  'BBB____BBB',  // 12 feet (right paw cols 7-9 = animated)
]

const COLORS = { B, P, Y, K }

// Pixels handled separately (animated groups)
const SKIP = new Set([
  '2-4','3-4','2-5','3-5',   // left eye
  '6-4','7-4','6-5','7-5',   // right eye
  '7-12','8-12','9-12',      // right paw
])

const W = 10 * SZ   // 40
const H = 13 * SZ   // 52

const CSS = `
@keyframes _paw { 0%,100%{transform:translateY(0)} 35%,65%{transform:translateY(-${SZ * 3}px)} }
@keyframes _tongue { 0%,32%,80%,100%{opacity:0;transform:scaleY(0)} 44%,68%{opacity:1;transform:scaleY(1)} }
@keyframes _blink { 0%,88%,100%{transform:scaleY(1)} 92%{transform:scaleY(0.1)} }
@keyframes _d1 { 0%,70%,100%{opacity:.2} 20%,50%{opacity:1} }
@keyframes _d2 { 0%,20%,90%,100%{opacity:.2} 40%,70%{opacity:1} }
@keyframes _d3 { 0%,40%,100%{opacity:.2} 60%,90%{opacity:1} }
`

export default function CatLoadingAnimation({ label = 'Optimisation en cours' }) {
  return (
    <div className="flex items-center gap-4 py-4 select-none justify-center">
      <style>{CSS}</style>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W} height={H}
        style={{ imageRendering: 'pixelated', shapeRendering: 'crispEdges' }}
      >
        {/* ── Static body pixels ── */}
        {GRID.map((row, y) =>
          row.split('').map((ch, x) => {
            if (ch === '_') return null
            if (SKIP.has(`${x}-${y}`)) return null
            const fill = COLORS[ch]
            if (!fill) return null
            return <rect key={`${x}-${y}`} x={x * SZ} y={y * SZ} width={SZ} height={SZ} fill={fill} />
          })
        )}

        {/* ── Left eye (blink) ── */}
        <g style={{ transformOrigin: `${2.5 * SZ}px ${4.5 * SZ}px`, animation: '_blink 3.5s ease-in-out infinite' }}>
          <rect x={2 * SZ} y={4 * SZ} width={SZ} height={SZ} fill={Y} />
          <rect x={3 * SZ} y={4 * SZ} width={SZ} height={SZ} fill={Y} />
          <rect x={2 * SZ} y={5 * SZ} width={SZ} height={SZ} fill={Y} />
          <rect x={3 * SZ} y={5 * SZ} width={SZ} height={SZ} fill={K} />
        </g>

        {/* ── Right eye (blink, offset) ── */}
        <g style={{ transformOrigin: `${6.5 * SZ}px ${4.5 * SZ}px`, animation: '_blink 3.5s ease-in-out 0.4s infinite' }}>
          <rect x={6 * SZ} y={4 * SZ} width={SZ} height={SZ} fill={Y} />
          <rect x={7 * SZ} y={4 * SZ} width={SZ} height={SZ} fill={Y} />
          <rect x={6 * SZ} y={5 * SZ} width={SZ} height={SZ} fill={Y} />
          <rect x={7 * SZ} y={5 * SZ} width={SZ} height={SZ} fill={K} />
        </g>

        {/* ── Tongue (appears during lick) ── */}
        <rect
          x={4 * SZ} y={8 * SZ} width={SZ * 2} height={SZ}
          fill={P}
          style={{ transformOrigin: `${5 * SZ}px ${8.5 * SZ}px`, animation: '_tongue 2.4s ease-in-out infinite' }}
        />

        {/* ── Right paw (lifts up to lick) ── */}
        <g style={{ animation: '_paw 2.4s ease-in-out infinite' }}>
          <rect x={7 * SZ} y={12 * SZ} width={SZ} height={SZ} fill={B} />
          <rect x={8 * SZ} y={12 * SZ} width={SZ} height={SZ} fill={B} />
          <rect x={9 * SZ} y={12 * SZ} width={SZ} height={SZ} fill={B} />
        </g>
      </svg>

      {/* ── Text ── */}
      <div>
        <p className="text-text-primary font-semibold text-sm">
          {label}
          <span style={{ animation: '_d1 1.4s ease-in-out infinite' }} className="text-primary">.</span>
          <span style={{ animation: '_d2 1.4s ease-in-out infinite' }} className="text-primary">.</span>
          <span style={{ animation: '_d3 1.4s ease-in-out infinite' }} className="text-primary">.</span>
        </p>
        <p className="text-text-muted text-xs mt-1">Analyse ATS · Réécriture · Optimisation des mots-clés</p>
      </div>
    </div>
  )
}
