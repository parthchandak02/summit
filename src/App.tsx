import { Suspense, useMemo, useRef, useState, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sky, Stars, Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { damp } from 'maath/easing'
import './App.css'

type PricePoint = { ts: number; price: number; dayLabel: string }

type MarketData = {
  points: PricePoint[]
  current: number
  changePct: number
  source: 'live' | 'fallback'
  updated: string
}

const HEIGHT_SCALE = 6
const Z_SPACING = 3.2

function makeFallback(): MarketData {
  const now = Date.now()
  const base = 95000
  const points: PricePoint[] = []
  for (let i = 0; i < 8; i++) {
    const ts = now - (7 - i) * 86400000
    const wobble = Math.sin(i * 1.1) * 1800 + i * 420
    points.push({
      ts,
      price: base + wobble,
      dayLabel: new Date(ts).toLocaleDateString('en-US', { weekday: 'short' }),
    })
  }
  const current = points[points.length - 1].price
  const start = points[0].price
  return {
    points,
    current,
    changePct: ((current - start) / start) * 100,
    source: 'fallback',
    updated: new Date().toISOString(),
  }
}

async function fetchMarket(): Promise<MarketData> {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7',
  )
  if (!res.ok) throw new Error('api')
  const json = await res.json()
  const raw: [number, number][] = json.prices ?? []
  if (raw.length < 2) throw new Error('empty')

  const byDay = new Map<string, [number, number]>()
  for (const [ts, price] of raw) {
    const key = new Date(ts).toDateString()
    byDay.set(key, [ts, price])
  }
  const sorted = [...byDay.values()].sort((a, b) => a[0] - b[0])
  const points: PricePoint[] = sorted.map(([ts, price]) => ({
    ts,
    price,
    dayLabel: new Date(ts).toLocaleDateString('en-US', { weekday: 'short' }),
  }))

  const current = raw[raw.length - 1][1]
  const start = points[0].price
  return {
    points,
    current,
    changePct: ((current - start) / start) * 100,
    source: 'live',
    updated: new Date().toISOString(),
  }
}

function normalizePrices(points: PricePoint[]) {
  const prices = points.map((p) => p.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const span = Math.max(max - min, 1)
  return points.map((p, i) => ({
    ...p,
    y: ((p.price - min) / span) * HEIGHT_SCALE + 1.2,
    z: i * Z_SPACING - ((points.length - 1) * Z_SPACING) / 2,
  }))
}

function Terrain({ width = 40, depth = 40 }: { width?: number; depth?: number }) {
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(width, depth, 48, 48)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const h =
        Math.sin(x * 0.25) * 0.4 +
        Math.cos(z * 0.18) * 0.35 +
        Math.sin((x + z) * 0.12) * 0.25
      pos.setY(i, h)
    }
    pos.needsUpdate = true
    g.computeVertexNormals()
    return g
  }, [width, depth])

  return (
    <mesh geometry={geom} receiveShadow position={[0, -0.3, 0]}>
      <meshStandardMaterial color="#1a2838" roughness={0.92} metalness={0.05} />
    </mesh>
  )
}

function RidgePath({ nodes }: { nodes: ReturnType<typeof normalizePrices> }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const points = useMemo(
    () => nodes.map((n) => new THREE.Vector3(-4, n.y, n.z)),
    [nodes],
  )

  useEffect(() => {
    document.body.style.cursor = hovered === null ? '' : 'pointer'
    return () => {
      document.body.style.cursor = ''
    }
  }, [hovered])

  return (
    <>
      <Line points={points} color="#7dd3fc" lineWidth={2} />
      {nodes.map((n, i) => {
        const prev = nodes[i - 1]
        const up = prev ? n.price >= prev.price : true
        // Pole runs from the ground (terrain sits around y = -0.3) up to the flag
        const poleBottom = -0.3 - n.y
        const poleTop = 0.2
        const poleHeight = poleTop - poleBottom
        const dayChange = prev ? ((n.price - prev.price) / prev.price) * 100 : null
        return (
          <group
            key={n.ts}
            position={[-4, n.y, n.z]}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHovered(i)
            }}
            onPointerOut={() => setHovered((h) => (h === i ? null : h))}
          >
            <mesh position={[0, poleBottom + poleHeight / 2, 0]}>
              <cylinderGeometry args={[0.04, 0.04, poleHeight, 6]} />
              <meshStandardMaterial color={up ? '#4ade80' : '#f87171'} emissive={up ? '#14532d' : '#7f1d1d'} emissiveIntensity={0.3} />
            </mesh>
            <mesh position={[0.25, 0.15, 0]}>
              <boxGeometry args={[0.5, 0.08, 0.08]} />
              <meshStandardMaterial color={up ? '#22c55e' : '#ef4444'} />
            </mesh>
            {/* Invisible, wider hit area so the thin pole and flag are easy to hover */}
            <mesh position={[0.15, 0, 0]} visible={false}>
              <boxGeometry args={[0.9, 0.9, 0.9]} />
            </mesh>
            <Html distanceFactor={12} style={{ pointerEvents: 'none' }}>
              <div
                style={{
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.7)',
                  whiteSpace: 'nowrap',
                  transform: 'translate(-50%, -120%)',
                }}
              >
                {n.dayLabel}
                <br />
                ${(n.price / 1000).toFixed(1)}k
              </div>
            </Html>
            {hovered === i && (
              <Html style={{ pointerEvents: 'none' }} zIndexRange={[30, 20]}>
                <div className="flag-tooltip">
                  <div className="flag-tooltip-date">
                    {new Date(n.ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                  <div className="flag-tooltip-price">{formatUsd(n.price)}</div>
                  {dayChange !== null && (
                    <div className={`flag-tooltip-change ${dayChange >= 0 ? 'up' : 'down'}`}>
                      {dayChange >= 0 ? '+' : ''}
                      {dayChange.toFixed(2)}% on the day
                    </div>
                  )}
                </div>
              </Html>
            )}
          </group>
        )
      })}
    </>
  )
}

function Climber({ target }: { target: THREE.Vector3 }) {
  const ref = useRef<THREE.Group>(null)
  const pos = useRef(new THREE.Vector3(target.x, target.y, target.z))

  useFrame((_, delta) => {
    if (!ref.current) return
    damp(pos.current, 'x', target.x, 0.8, delta)
    damp(pos.current, 'y', target.y + 0.35, 0.8, delta)
    damp(pos.current, 'z', target.z, 0.8, delta)
    ref.current.position.copy(pos.current)
    ref.current.rotation.y = Math.sin(Date.now() * 0.001) * 0.08
  })

  return (
    <group ref={ref}>
      <mesh castShadow>
        <boxGeometry args={[0.35, 0.55, 0.25]} />
        <meshStandardMaterial color="#fbbf24" emissive="#78350f" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshStandardMaterial color="#fde68a" />
      </mesh>
    </group>
  )
}

function SummitMarker({ position }: { position: THREE.Vector3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.6, 0]}>
        <coneGeometry args={[0.35, 0.9, 4]} />
        <meshStandardMaterial color="#e2e8f0" emissive="#94a3b8" emissiveIntensity={0.2} />
      </mesh>
      <Html distanceFactor={10}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: '#f8fafc',
            letterSpacing: '0.08em',
            transform: 'translate(-50%, -180%)',
          }}
        >
          SUMMIT
        </div>
      </Html>
    </group>
  )
}

function Scene({ data, reducedMotion }: { data: MarketData; reducedMotion: boolean }) {
  const nodes = useMemo(() => normalizePrices(data.points), [data.points])
  const climberTarget = useMemo(() => {
    const last = nodes[nodes.length - 1]
    return new THREE.Vector3(-4, last.y, last.z)
  }, [nodes])
  const summitPos = useMemo(() => {
    const peak = nodes.reduce((a, b) => (a.y > b.y ? a : b))
    return new THREE.Vector3(-4, peak.y + 0.5, peak.z)
  }, [nodes])

  const { camera, size } = useThree()
  // Pull the camera back on narrow screens and aim a little higher, so the ridge
  // and summit cone sit below the headline price instead of behind it
  const aspect = size.width / Math.max(size.height, 1)
  const pullBack = aspect < 0.8 ? 1.9 : aspect < 1.3 ? 1.4 : 1.1
  const lookAtY = 5.2
  useEffect(() => {
    camera.position.set(8 * pullBack, 7 * pullBack, 12 * pullBack)
    camera.lookAt(-2, lookAtY, 0)
  }, [camera, pullBack])

  useFrame(() => {
    if (reducedMotion) return
    camera.position.x = 8 * pullBack + Math.sin(Date.now() * 0.00015) * 0.4
    camera.lookAt(-2, lookAtY, 0)
  })

  const sunPos = useMemo(() => new THREE.Vector3(-20, 12, -10), [])

  return (
    <>
      <Sky
        distance={450000}
        sunPosition={sunPos}
        turbidity={4}
        rayleigh={1.2}
        mieCoefficient={0.004}
        mieDirectionalG={0.85}
      />
      <Stars radius={120} depth={60} count={1200} factor={3} fade speed={0.4} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[10, 18, 6]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
      <fog attach="fog" args={['#0a1628', 18, 55]} />
      <Terrain />
      <RidgePath nodes={nodes} />
      <Climber target={climberTarget} />
      <SummitMarker position={summitPos} />
    </>
  )
}

function Sparkline({ points }: { points: PricePoint[] }) {
  if (points.length < 2) return null
  const prices = points.map((p) => p.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const span = Math.max(max - min, 1)
  const w = 120
  const h = 36
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w
      const y = h - ((p.price - min) / span) * (h - 4) - 2
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <div className="sparkline" aria-hidden>
      <svg viewBox={`0 0 ${w} ${h}`}>
        <path d={d} fill="none" stroke="#7dd3fc" strokeWidth="1.5" />
      </svg>
    </div>
  )
}

function formatUsd(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function App() {
  const [data, setData] = useState<MarketData>(makeFallback)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const fn = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const next = await fetchMarket()
        if (!cancelled) setData(next)
      } catch {
        if (!cancelled) setData((d) => ({ ...d, source: 'fallback' }))
      }
    }
    load()
    const id = setInterval(load, 60000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const changeClass = data.changePct >= 0 ? 'up' : 'down'
  const changeSign = data.changePct >= 0 ? '+' : ''
  const stampTime = new Date(data.updated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="app">
      <Canvas shadows camera={{ position: [8, 7, 12], fov: 45 }} dpr={[1, 2]}>
        <Suspense fallback={null}>
          <Scene data={data} reducedMotion={reducedMotion} />
        </Suspense>
      </Canvas>

      <div className="hero">
        <div className="hero-eyebrow">Bitcoin · 7-day climb</div>
        <div className="hero-value">{formatUsd(data.current)}</div>
        <div className={`hero-change ${changeClass}`}>
          {changeSign}
          {data.changePct.toFixed(2)}% this week
        </div>
      </div>

      <Sparkline points={data.points} />

      <p id="desc">Altitude is Bitcoin&apos;s 7-day price — climb toward the summit</p>

      <div className="stamp">
        CoinGecko · updated {stampTime} · {data.source}
      </div>

      <div className="legend">
        Higher ridge = higher price
        <br />
        Green flag = up day · Red = down
      </div>
    </div>
  )
}

export default App
