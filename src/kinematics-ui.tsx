// 运动学实验室（测试版）：独立全屏界面。自由沙盒——左侧物体栏放置小球/斜面/圆弧，选中可编辑速度矢量与质量
// 独立组件，仅依赖 solver/kinematics*，与电路模块零耦合
import { useEffect, useRef, useState } from 'react'
import { kineticEnergy, makeBall, stepSandbox, type Ball, type SandboxParams, type StaticShape } from './solver/kinematics-sandbox'
import { segEndpoints, arcPoints } from './solver/kinematics-sandbox'

const BALL_COLORS = ['#5e6ad2', '#e08a97', '#4aa3a2', '#c9a227', '#7a9e4f', '#b06ad2', '#d26a5e', '#6ab0d2']

type Tool = 'select' | 'ball' | 'seg' | 'arc'
type Sel = { type: 'ball' | 'static'; id: number } | null

const SCALE = 18 // px per m
const W = 42, H = 20 // 场地 m
const toPx = (x: number, y: number) => ({ px: 20 + x * SCALE, py: 70 + y * SCALE }) // 世界 y 向下=重力向下

export function KinematicsLab({ onHome }: { onHome: () => void }) {
  const [balls, setBalls] = useState<Ball[]>([])
  const [statics, setStatics] = useState<StaticShape[]>([])
  const [tool, setTool] = useState<Tool>('ball')
  const [sel, setSel] = useState<Sel>(null)
  const [g, setG] = useState(9.8)
  const [eRest, setERest] = useState(1)
  const [running, setRunning] = useState(false)
  const [trails, setTrails] = useState(true)
  const [, setTick] = useState(0)
  const ballsRef = useRef<Ball[]>([])
  const staticsRef = useRef<StaticShape[]>([])
  const trailRef = useRef<Map<number, string[]>>(new Map())
  const dragRef = useRef<{ kind: 'place' | 'move'; sx: number; sy: number; cx: number; cy: number; movedSel: Sel } | null>(null)
  const idRef = useRef(1)
  ballsRef.current = balls
  staticsRef.current = statics

  const nextId = () => idRef.current++

  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const params: SandboxParams = { g, e: eRest, W, H }
      stepSandbox(ballsRef.current, staticsRef.current, params, dt, 4)
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

  const svgPoint = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect()
    return { wx: ((e.clientX - r.left) / r.width) * 800, wy: ((e.clientY - r.top) / r.height) * 450 }
  }
  const worldOf = (d: { x: number; y: number }) => ({ wx: (d.x - 20) / SCALE, wy: (d.y - 70) / SCALE })

  const placeAt = (wx: number, wy: number, vx: number, vy: number) => {
    if (tool === 'ball') {
      if (balls.length >= 30) return
      setBalls((q) => [...q, makeBall(nextId(), wx, wy, 0.7, vx, vy)])
    } else if (tool === 'seg') {
      setStatics((q) => [...q, { id: nextId(), kind: 'seg', cx: wx, cy: wy, len: 8, angleDeg: -25 }])
    } else if (tool === 'arc') {
      setStatics((q) => [...q, { id: nextId(), kind: 'arc', cx: wx, cy: wy, r: 5, angleDeg: Math.PI }])
    }
  }

  const hitTest = (wx: number, wy: number): Sel => {
    for (const b of balls) {
      if (Math.hypot(b.x - wx, b.y - wy) <= b.r + 0.15) return { type: 'ball', id: b.id }
    }
    for (const s of statics) {
      const pts = s.kind === 'seg' ? (() => { const e2 = segEndpoints(s); return [e2.ax, e2.ay, e2.bx, e2.by] })() : (() => { const p2 = arcPoints(s); return p2.flatMap((q) => [q.x, q.y]) })()
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3]
        const abx = bx - ax, aby = by - ay, l2 = abx * abx + aby * aby
        const t = Math.max(0, Math.min(1, ((wx - ax) * abx + (wy - ay) * aby) / (l2 || 1)))
        if (Math.hypot(wx - (ax + t * abx), wy - (ay + t * aby)) < 0.5) return { type: 'static', id: s.id }
      }
    }
    return null
  }

  const ke = kineticEnergy(balls)
  const selBall = sel?.type === 'ball' ? balls.find((b) => b.id === sel.id) : undefined
  const selStatic = sel?.type === 'static' ? statics.find((s) => s.id === sel.id) : undefined

  const addBall = (wx: number, wy: number, vx: number, vy: number) => {
    if (balls.length >= 30) return
    const b = makeBall(nextId(), wx, wy, 0.7, vx, vy)
    setBalls((q) => [...q, b])
  }

  const updBall = (id: number, patch: Partial<Ball>) =>
    setBalls((q) => q.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  const updStatic = (id: number, patch: Partial<StaticShape>) =>
    setStatics((q) => q.map((s) => (s.id === id ? ({ ...s, ...patch } as StaticShape) : s)))
  const removeSel = () => {
    if (!sel) return
    if (sel.type === 'ball') setBalls((q) => q.filter((b) => b.id !== sel.id))
    else setStatics((q) => q.filter((s) => s.id !== sel.id))
    setSel(null)
  }

  return (
    <div className="kin">
      <header className="kin-head">
        <h1 style={{ fontSize: 17, letterSpacing: 2, color: 'var(--ink)', margin: 0 }}>运动学实验室</h1>
        <span className="menu-beta">β 测试版</span>
        <span style={{ flex: 1 }} />
        <button className="icon-btn" title="返回主页" onClick={onHome}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 11 12 4l8 7M6.5 9.5V20h11V9.5M10 20v-5h4v5" />
          </svg>
        </button>
      </header>
      <div className="kin-row">
        {/* 左栏：工具 + 属性 */}
        <aside className="kin-aside">
          <p className="hint" style={{ margin: 0 }}>物体</p>
          {([
            ['ball', '小球（拖拽定初速）'],
            ['seg', '斜面'],
            ['arc', '四分之一圆弧'],
            ['select', '选择 / 编辑'],
          ] as [Tool, string][]).map(([t, label]) => (
            <button key={t} className={tool === t ? 'active' : ''} onClick={() => { setTool(t); setSel(null) }}>{label}</button>
          ))}
          <div className="divider" />
          {selBall ? (
            <>
              <p className="hint" style={{ margin: 0 }}>属性 · 小球 #{selBall.id}</p>
              {(() => {
                const v = Math.hypot(selBall.vx, selBall.vy)
                const dir = (Math.atan2(selBall.vy, selBall.vx) * 180) / Math.PI
                return (
                  <>
                    <label>速度 |v| {v.toFixed(1)}m/s
                      <input type="range" min={0} max={30} step={0.5} value={Math.min(30, v)}
                        onChange={(e2) => { const nv = +e2.target.value; const a = Math.atan2(selBall.vy, selBall.vx); updBall(selBall.id, { vx: nv * Math.cos(a), vy: nv * Math.sin(a) }) }} />
                    </label>
                    <label>方向 {dir.toFixed(0)}°
                      <input type="range" min={-180} max={180} step={5} value={Math.round(dir)}
                        onChange={(e2) => { const a = (+e2.target.value * Math.PI) / 180; const nv = Math.hypot(selBall.vx, selBall.vy); updBall(selBall.id, { vx: nv * Math.cos(a), vy: nv * Math.sin(a) }) }} />
                    </label>
                    <label>质量 {selBall.m.toFixed(1)}kg
                      <input type="range" min={0.5} max={20} step={0.5} value={selBall.m}
                        onChange={(e2) => updBall(selBall.id, { m: +e2.target.value })} />
                    </label>
                    <label>半径 {selBall.r.toFixed(1)}m
                      <input type="range" min={0.3} max={1.5} step={0.1} value={selBall.r}
                        onChange={(e2) => updBall(selBall.id, { r: +e2.target.value })} />
                    </label>
                  </>
                )
              })()}
              <button className="wide danger" onClick={removeSel}>删除</button>
            </>
          ) : selStatic ? (
            <>
              <p className="hint" style={{ margin: 0 }}>属性 · {selStatic.kind === 'seg' ? '斜面' : '圆弧'}</p>
              <label>{selStatic.kind === 'seg' ? '角度' : '旋转'} {selStatic.angleDeg.toFixed(0)}°
                <input type="range" min={selStatic.kind === 'seg' ? -80 : 0} max={selStatic.kind === 'seg' ? 80 : 350} step={5} value={selStatic.angleDeg}
                  onChange={(e2) => updStatic(selStatic.id, { angleDeg: +e2.target.value } as never)} />
              </label>
              <label>{selStatic.kind === 'seg' ? '长度' : '半径'} {(selStatic.kind === 'seg' ? selStatic.len : selStatic.r).toFixed(1)}m
                <input type="range" min={selStatic.kind === 'seg' ? 2 : 2} max={selStatic.kind === 'seg' ? 20 : 10} step={0.5} value={selStatic.kind === 'seg' ? selStatic.len : selStatic.r}
                  onChange={(e2) => updStatic(selStatic.id, (selStatic.kind === 'seg' ? { len: +e2.target.value } : { r: +e2.target.value }) as never)} />
              </label>
              <button className="wide danger" onClick={removeSel}>删除</button>
            </>
          ) : (
            <p className="hint" style={{ margin: 0 }}>先选物体工具放置，<br />再用"选择"工具点它改属性。<br />选中小球可直接改速度矢量与质量。</p>
          )}
        </aside>
        {/* 主区：画布 + 全局控制 */}
        <div className="kin-main">
          <svg
            viewBox="0 0 800 450" style={{ width: '100%', background: 'var(--panel-raise)', borderRadius: 12, border: '1px solid var(--border)', touchAction: 'none', cursor: tool === 'select' ? 'default' : 'crosshair' }}
            onPointerDown={(e) => {
              const { wx, wy } = svgPoint(e)
              ;(e.currentTarget as SVGElement).setPointerCapture(e.pointerId)
              if (tool === 'seg' || tool === 'arc') { placeAt(wx, wy, 0, 0); return } // 斜面/圆弧：点击即放默认尺寸
              dragRef.current = { kind: tool === 'ball' ? 'place' : 'move', sx: wx, sy: wy, cx: wx, cy: wy, movedSel: null }
              if (tool === 'select') setSel(hitTest(wx, wy))
            }}
            onPointerMove={(e) => {
              const d = dragRef.current
              if (!d) return
              const { wx, wy } = svgPoint(e)
              d.cx = wx; d.cy = wy
              if (d.kind === 'move' && tool === 'select' && sel) {
                const dx = (wx - d.cx) / SCALE, dy = (wy - d.cy) / SCALE
                if (sel.type === 'ball') setBalls((q) => q.map((b) => (b.id === sel.id ? { ...b, x: b.x + dx, y: b.y + dy } : b)))
              }
              setTick((v) => v + 1)
            }}
            onPointerUp={(e) => {
              const d = dragRef.current
              dragRef.current = null
              if (!d || d.kind !== 'place') return
              const { wx, wy } = svgPoint(e)
              const a = worldOf({ x: d.sx, y: d.sy })
              if (a.wx < 0 || a.wx > W || a.wy < 0 || a.wy > H) return
              addBall(a.wx, a.wy, ((wx - d.sx) / SCALE) * 3, ((wy - d.sy) / SCALE) * 3)
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
                <line x1={16} y1={70 + (H - m) * SCALE} x2={24} y2={70 + (H - m) * SCALE} stroke="var(--ink)" strokeWidth={1} />
                <text x={4} y={74 + (H - m) * SCALE} fontSize={10} fill="var(--muted, #889)">{m}m</text>
              </g>
            ))}
            {/* 静态体 */}
            {statics.map((s) => {
              const pts = s.kind === 'seg' ? (() => { const ep = segEndpoints(s); return [[ep.ax, ep.ay], [ep.bx, ep.by]] })() : arcPoints(s).map((q) => [q.x, q.y])
              const d = pts.map(([x, y]) => { const { px, py } = toPx(x, y); return `${px},${py}` }).join(' ')
              const isSel = sel?.type === 'static' && sel.id === s.id
              return <polyline key={s.id} points={d} fill="none" stroke={isSel ? 'var(--accent-soft, #5e6ad2)' : 'var(--ink)'} strokeWidth={isSel ? 5 : 4} strokeLinecap="round" />
            })}
            {trails && balls.map((b) => {
              const arr = trailRef.current.get(b.id) ?? []
              return <polyline key={`t${b.id}`} points={arr.join(' ')} fill="none" stroke={BALL_COLORS[(b.id - 1) % BALL_COLORS.length]} strokeWidth={1} opacity={0.4} />
            })}
            {balls.map((b) => {
              const { px, py } = toPx(b.x, b.y)
              const isSel = sel?.type === 'ball' && sel.id === b.id
              return <circle key={b.id} cx={px} cy={py} r={b.r * SCALE} fill={BALL_COLORS[(b.id - 1) % BALL_COLORS.length]} stroke={isSel ? 'var(--accent-soft, #5e6ad2)' : 'none'} strokeWidth={3} opacity={0.9} />
            })}
            {dragRef.current?.kind === 'place' && (
              <line x1={dragRef.current.sx} y1={dragRef.current.sy} x2={dragRef.current.cx} y2={dragRef.current.cy} stroke="#e08a97" strokeWidth={2} />
            )}
            {balls.length === 0 && statics.length === 0 && (
              <text x={400} y={220} fontSize={14} textAnchor="middle" fill="var(--muted, #889)">
                左侧选"小球"，画布上按住拖动再松手：拖出方向和长度 = 初速度
              </text>
            )}
          </svg>
          <div className="exp-card" style={{ cursor: 'default', marginTop: 10 }}>
            <strong>{balls.length} 个球 · 总动能 {ke.toFixed(1)} J</strong>
            <span>碰撞按冲量模型求解。运动学抛体已并入沙盒——小球+拖拽初速就是斜抛，配斜面/圆弧可搭滑行与弹射。</span>
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
            <button onClick={() => { setBalls([]); setStatics([]); trailRef.current.clear(); setSel(null); setRunning(false) }}>🗑 清空</button>
          </div>
        </div>
      </div>
    </div>
  )
}
