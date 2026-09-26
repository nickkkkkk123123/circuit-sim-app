// 运动学实验室（测试版）：双模式——抛体演示 / 自由沙盒。独立组件，仅依赖 solver/kinematics*，与电路模块零耦合
import { useEffect, useRef, useState } from 'react'
import { apexHeight, apexTime, flightTime, positionAt, range, type ProjParams } from './solver/kinematics'
import { kineticEnergy, makeBall, stepSandbox, type Ball, type SandboxParams } from './solver/kinematics-sandbox'

const G_PRESETS: { label: string; g: number }[] = [
  { label: '地球 9.8', g: 9.8 },
  { label: '月球 1.62', g: 1.62 },
  { label: '火星 3.71', g: 3.71 },
  { label: '木星 24.8', g: 24.8 },
]

const BALL_COLORS = ['#5e6ad2', '#e08a97', '#4aa3a2', '#c9a227', '#7a9e4f', '#b06ad2', '#d26a5e', '#6ab0d2']

/** 沙盒模式：自由摆放小球，拖拽定初速，重力+弹性碰撞，运行/暂停 */
function SandboxView() {
  const [balls, setBalls] = useState<Ball[]>([])
  const [g, setG] = useState(9.8)
  const [eRest, setERest] = useState(1)
  const [running, setRunning] = useState(false)
  const [trails, setTrails] = useState(true)
  const [, setTick] = useState(0)
  const ballsRef = useRef<Ball[]>([])
  const trailRef = useRef<Map<number, string[]>>(new Map())
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const idRef = useRef(1)
  ballsRef.current = balls

  const SCALE = 18 // px per m
  const W = 42, H = 20 // 场地 m
  const toPx = (x: number, y: number) => ({ px: 20 + x * SCALE, py: 430 - y * SCALE })

  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const params: SandboxParams = { g, e: eRest, W, H }
      stepSandbox(ballsRef.current, params, dt, 4)
      if (trails) {
        for (const b of ballsRef.current) {
          const arr = trailRef.current.get(b.id) ?? []
          const { px, py } = toPx(b.x, b.y)
          arr.push(`${px},${py}`)
          if (arr.length > 120) arr.shift()
          trailRef.current.set(b.id, arr)
        }
      }
      setTick((v) => v + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [running, g, eRest, trails])

  const addBall = (wx: number, wy: number, vx: number, vy: number) => {
    if (ballsRef.current.length >= 30) return
    const b = makeBall(idRef.current++, wx, wy, 0.7, vx, vy)
    setBalls((q) => [...q, b])
  }
  const svgPoint = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect()
    return { wx: ((e.clientX - r.left) / r.width) * 800, wy: ((e.clientY - r.top) / r.height) * 450 }
  }
  const ke = kineticEnergy(balls)
  const drag = dragRef.current

  return (
    <>
      <svg
        viewBox="0 0 800 450" style={{ width: '100%', background: 'var(--panel-raise)', borderRadius: 10, border: '1px solid var(--border)', touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={(e) => {
          const { wx, wy } = svgPoint(e)
          dragRef.current = { x: wx, y: wy, cx: wx, cy: wy }
          ;(e.currentTarget as SVGElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return
          const { wx, wy } = svgPoint(e)
          dragRef.current.cx = wx; dragRef.current.cy = wy
          setTick((v) => v + 1)
        }}
        onPointerUp={(e) => {
          const d = dragRef.current
          dragRef.current = null
          if (!d) return
          const { wx, wy } = svgPoint(e)
          const w0x = (d.x - 20) / SCALE, w0y = (430 - d.y) / SCALE
          if (w0x < 0 || w0x > W || w0y < 0 || w0y > H) return
          // 拖拽向量 → 初速度（屏幕 1m ≙ 3 m/s），松手即发射
          addBall(w0x, w0y, ((wx - d.x) / SCALE) * 3, -((wy - d.y) / SCALE) * 3)
        }}
      >
        <line x1={10} y1={430} x2={790} y2={430} stroke="var(--ink)" strokeWidth={2} />
        {[5, 10, 15, 20, 25, 30, 35, 40].map((m) => (
          <g key={m}>
            <line x1={20 + m * SCALE} y1={426} x2={20 + m * SCALE} y2={434} stroke="var(--ink)" strokeWidth={1} />
            <text x={20 + m * SCALE} y={446} fontSize={10} textAnchor="middle" fill="var(--muted, #889)">{m}m</text>
          </g>
        ))}
        {[5, 10, 15].map((m) => (
          <g key={m}>
            <line x1={16} y1={430 - m * SCALE} x2={24} y2={430 - m * SCALE} stroke="var(--ink)" strokeWidth={1} />
            <text x={4} y={434 - m * SCALE} fontSize={10} fill="var(--muted, #889)">{m}m</text>
          </g>
        ))}
        {trails && balls.map((b) => {
          const arr = trailRef.current.get(b.id) ?? []
          return <polyline key={`t${b.id}`} points={arr.join(' ')} fill="none" stroke={BALL_COLORS[(b.id - 1) % BALL_COLORS.length]} strokeWidth={1} opacity={0.4} />
        })}
        {balls.map((b) => {
          const { px, py } = toPx(b.x, b.y)
          return <circle key={b.id} cx={px} cy={py} r={b.r * SCALE} fill={BALL_COLORS[(b.id - 1) % BALL_COLORS.length]} opacity={0.85} />
        })}
        {drag && <line x1={drag.x} y1={drag.y} x2={drag.cx} y2={drag.cy} stroke="#e08a97" strokeWidth={2} />}
        {balls.length === 0 && !drag && (
          <text x={400} y={220} fontSize={14} textAnchor="middle" fill="var(--muted, #889)">
            在画布任意处按住拖动再松手：拖出方向和长度 = 小球的初速度
          </text>
        )}
      </svg>
      <div className="exp-card" style={{ cursor: 'default', marginTop: 10 }}>
        <strong>{balls.length} 个球 · 总动能 {ke.toFixed(1)} J</strong>
        <span>碰撞按冲量模型求解（恢复系数可调）。试两球对撞、叠罗汉、弹弓打墙——暂停键随时冻结画面观察瞬间。</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 10 }}>
        <label style={{ flex: 1, minWidth: 150 }}>
          重力 {g}m/s²
          <input type="range" min={0} max={25} step={0.1} value={g} onChange={(e) => setG(+e.target.value)} />
        </label>
        <label style={{ flex: 1, minWidth: 150 }}>
          弹性系数 {eRest.toFixed(2)}
          <input type="range" min={0} max={1} step={0.05} value={eRest} onChange={(e) => setERest(+e.target.value)} />
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={trails} onChange={(e) => setTrails(e.target.checked)} />轨迹
        </label>
      </div>
      <div className="pal-row" style={{ marginTop: 10 }}>
        <button onClick={() => setRunning((v) => !v)}>{running ? '⏸ 暂停' : '▶ 运行'}</button>
        <button onClick={() => { setBalls([]); trailRef.current.clear(); setRunning(false) }}>🗑 清空</button>
      </div>
    </>
  )
}

/** 抛体演示模式：单发解析解演示 */
function ProjectileView({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState<ProjParams>({ v0: 20, angleDeg: 45, h0: 0, g: 9.8 })
  const [speed, setSpeed] = useState(0.5)
  const [running, setRunning] = useState(false)
  const tRef = useRef(0)
  const [, setTick] = useState(0)

  const T = flightTime(p)
  const R = range(p)
  const H = apexHeight(p)

  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      tRef.current += dt * speed
      if (tRef.current >= T) { tRef.current = T; setRunning(false) }
      setTick((v) => v + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [running, speed, T])

  const reset = () => { tRef.current = 0; setRunning(false); setTick((v) => v + 1) }
  const setParam = (key: keyof ProjParams, v: number) => { setP((q) => ({ ...q, [key]: v })); tRef.current = 0; setRunning(false) }

  const scale = 620 / Math.max(R, H / 1.2, 8)
  const toPx = (x: number, y: number) => ({ px: 70 + x * scale, py: 400 - y * scale })
  const st = positionAt(p, tRef.current)
  const ball = toPx(st.x, st.y)
  const origin = toPx(0, p.h0)
  const apexPx = toPx(range(p) === 0 ? 0 : Math.min(apexTime(p), T) * positionAt(p, 0).vx, H)
  const landPx = toPx(R, 0)

  const trail: string[] = []
  for (let i = 0; i <= 80; i++) {
    const s = positionAt(p, (T * i) / 80)
    const { px, py } = toPx(s.x, s.y)
    trail.push(`${px},${py}`)
  }

  const ink = 'var(--ink)'
  const muted = 'var(--muted, #889)'

  return (
    <>
      <svg viewBox="0 0 800 450" style={{ width: '100%', background: 'var(--panel-raise)', borderRadius: 10, border: '1px solid var(--border)' }}>
        <line x1={40} y1={400} x2={780} y2={400} stroke={ink} strokeWidth={2} />
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <g key={i}>
            <line x1={70 + i * 100} y1={396} x2={70 + i * 100} y2={404} stroke={ink} strokeWidth={1} />
            <text x={70 + i * 100} y={420} fontSize={10} textAnchor="middle" fill={muted}>
              {((i * 100 - 70) / scale > 0 ? (i * 100 - 70) / scale : 0).toFixed(0)}m
            </text>
          </g>
        ))}
        {p.h0 > 0 && <rect x={origin.px - 6} y={origin.py} width={12} height={400 - origin.py} fill="none" stroke={ink} strokeWidth={1.5} />}
        <polyline points={trail.join(' ')} fill="none" stroke="var(--accent-soft, #5e6ad2)" strokeWidth={1.5} strokeDasharray="4 3" />
        {T > 0 && (
          <>
            <circle cx={apexPx.px} cy={apexPx.py} r={3} fill={ink} />
            <text x={apexPx.px} y={apexPx.py - 10} fontSize={11} textAnchor="middle" fill={ink}>最高 {H.toFixed(1)}m</text>
            <circle cx={landPx.px} cy={400} r={3} fill={ink} />
            <text x={landPx.px} y={390} fontSize={11} textAnchor="middle" fill={ink}>射程 {R.toFixed(1)}m</text>
          </>
        )}
        {(() => {
          const vScale = 3
          return (
            <>
              <circle cx={ball.px} cy={ball.py} r={6} fill="var(--accent-soft, #5e6ad2)" />
              <line x1={ball.px} y1={ball.py} x2={ball.px + st.vx * vScale} y2={ball.py - st.vy * vScale} stroke="#e08a97" strokeWidth={2} />
              <circle cx={ball.px + st.vx * vScale} cy={ball.py - st.vy * vScale} r={2.5} fill="#e08a97" />
            </>
          )
        })()}
      </svg>
      <div className="exp-cards" style={{ marginTop: 10 }}>
        <div className="exp-card" style={{ cursor: 'default' }}>
          <strong>实时状态 t={st.t.toFixed(2)}s</strong>
          <span>x={st.x.toFixed(1)}m · y={st.y.toFixed(1)}m · vx={st.vx.toFixed(1)}m/s · vy={st.vy.toFixed(1)}m/s</span>
        </div>
        <div className="exp-card" style={{ cursor: 'default' }}>
          <strong>三个关键量（解析解）</strong>
          <span>飞行 T={T.toFixed(2)}s · 射程 {R.toFixed(1)}m · 最高 {H.toFixed(1)}m</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        <label style={{ flex: 1, minWidth: 160 }}>
          初速率 {p.v0}m/s
          <input type="range" min={2} max={40} step={1} value={p.v0} onChange={(e) => setParam('v0', +e.target.value)} />
        </label>
        <label style={{ flex: 1, minWidth: 160 }}>
          发射角 {p.angleDeg}°
          <input type="range" min={0} max={90} step={5} value={p.angleDeg} onChange={(e) => setParam('angleDeg', +e.target.value)} />
        </label>
        <label style={{ flex: 1, minWidth: 160 }}>
          初始高度 {p.h0}m
          <input type="range" min={0} max={30} step={1} value={p.h0} onChange={(e) => setParam('h0', +e.target.value)} />
        </label>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 8 }}>
        <label style={{ flex: 1, minWidth: 160 }}>
          重力 {p.g}m/s²
          <input type="range" min={1} max={25} step={0.01} value={p.g} onChange={(e) => setParam('g', +e.target.value)} />
        </label>
        {G_PRESETS.map((q) => (
          <button key={q.label} className={p.g === q.g ? 'active' : ''} onClick={() => setParam('g', q.g)}>{q.label}</button>
        ))}
      </div>
      <div className="pal-row" style={{ marginTop: 12 }}>
        <button onClick={() => { tRef.current = 0; setRunning(true) }}>▶ 发射</button>
        <button onClick={() => setRunning((v) => !v)}>{running ? '⏸ 暂停' : '⏵ 继续'}</button>
        <button onClick={reset}>↺ 复位</button>
        <button onClick={() => setSpeed((v) => (v >= 1 ? 0.1 : v + 0.25))}>倍率 ×{speed}</button>
      </div>
      <p className="warn" style={{ marginTop: 10 }}>
        水平方向匀速（vx 不变）、竖直方向匀加速（vy 每秒减 g）——两方向独立又同时进行，这就是抛体运动的全部。
        粉色箭头 = 速度矢量。试试互补角 30°/60° 射程一样，月球上射程约地球 6 倍。
      </p>
      <button className="wide" onClick={onClose}>关闭</button>
    </>
  )
}

export function KinematicsLab({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'throw' | 'sandbox'>('throw')
  return (
    <div className="dial-overlay" onClick={onClose}>
      <div className="exp-picker" style={{ maxWidth: 860, width: '92%' }} onClick={(e) => e.stopPropagation()}>
        <div className="exp-picker-head">
          <h2>运动学实验室（测试版）</h2>
          <button className="icon-btn" onClick={onClose} title="关闭">×</button>
        </div>
        <div className="pal-row" style={{ marginBottom: 10 }}>
          <button className={mode === 'throw' ? 'active' : ''} onClick={() => setMode('throw')}>抛体演示</button>
          <button className={mode === 'sandbox' ? 'active' : ''} onClick={() => setMode('sandbox')}>自由沙盒</button>
        </div>
        {mode === 'throw' ? <ProjectileView onClose={onClose} /> : <SandboxView />}
      </div>
    </div>
  )
}
