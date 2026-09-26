// 运动学实验室（测试版）：独立全屏界面。自由沙盒——左侧物体栏放置小球/斜面/圆弧，选中可编辑速度矢量与质量
// 独立组件，仅依赖 solver/kinematics*，与电路模块零耦合
import { useEffect, useRef, useState } from 'react'
import { kineticEnergy, makeBall, stepSandbox, type Ball, type SandboxParams, type StaticShape } from './solver/kinematics-sandbox'
import { segEndpoints, arcPoints } from './solver/kinematics-sandbox'

const BALL_COLORS = ['#5e6ad2', '#e08a97', '#4aa3a2', '#c9a227', '#7a9e4f', '#b06ad2', '#d26a5e', '#6ab0d2']

type Tool = 'select' | 'ball' | 'seg' | 'arc'
type Sel = { type: 'ball' | 'static'; id: number } | null

const W = 42, H = 20 // 场地 m（世界坐标：y 向下=重力向下）

export function KinematicsLab({ onHome }: { onHome: () => void }) {
  const [balls, setBalls] = useState<Ball[]>([])
  const [statics, setStatics] = useState<StaticShape[]>([])
  const [tool, setTool] = useState<Tool>('ball')
  const [sel, setSel] = useState<Sel>(null)
  const [g, setG] = useState(9.8)
  const [gOn, setGOn] = useState(true)
  const [ground, setGround] = useState(true)
  const [running, setRunning] = useState(false)
  const [trails, setTrails] = useState(true)
  const [view, setView] = useState({ scale: 18, tx: 20, ty: 70 }) // 世界 m → viewBox px：px = world·scale + t
  const [, setTick] = useState(0)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const ballsRef = useRef<Ball[]>([])
  const staticsRef = useRef<StaticShape[]>([])
  const trailRef = useRef<Map<number, string[]>>(new Map())
  const dragRef = useRef<{ kind: 'place' | 'move' | 'pan'; sx: number; sy: number; cx: number; cy: number; movedSel: Sel } | null>(null)
  const idRef = useRef(1)
  ballsRef.current = balls
  staticsRef.current = statics

  const nextId = () => idRef.current++
  const toPx = (x: number, y: number) => ({ px: x * view.scale + view.tx, py: y * view.scale + view.ty })

  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const params: SandboxParams = { g: gOn ? g : 0, W, H, ground }
      stepSandbox(ballsRef.current, staticsRef.current, params, dt, 4)
      // 无地面时：掉出场地深处的球回收
      if (!ground) {
        const alive = ballsRef.current.filter((b) => b.y < H + 15)
        if (alive.length !== ballsRef.current.length) {
          setBalls(alive)
          ballsRef.current = alive
          for (const b of alive) if (!trailRef.current.has(b.id)) trailRef.current.delete(0)
        }
      }
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
  }, [running, g, gOn, ground, trails])

  // 滚轮缩放（光标锚定）——React onWheel 是 passive，必须走原生监听
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const px = ((e.clientX - r.left) / r.width) * 800
      const py = ((e.clientY - r.top) / r.height) * 450
      setView((v) => {
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
        const scale = Math.max(4, Math.min(60, v.scale * factor))
        const f = scale / v.scale
        return { scale, tx: px - (px - v.tx) * f, ty: py - (py - v.ty) * f }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const svgPoint = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect()
    return { wx: ((e.clientX - r.left) / r.width) * 800, wy: ((e.clientY - r.top) / r.height) * 450 }
  }
  const worldOf = (d: { x: number; y: number }) => ({ wx: (d.x - view.tx) / view.scale, wy: (d.y - view.ty) / view.scale })

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
                    <label>弹性系数 {selBall.e.toFixed(2)}（0=泥球 1=完全弹性）
                      <input type="range" min={0} max={1} step={0.05} value={selBall.e}
                        onChange={(e2) => updBall(selBall.id, { e: +e2.target.value })} />
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
            ref={svgRef}
            viewBox="0 0 800 450" style={{ width: '100%', background: 'var(--panel-raise)', borderRadius: 12, border: '1px solid var(--border)', touchAction: 'none', cursor: tool === 'select' ? 'default' : 'crosshair' }}
            onPointerDown={(e) => {
              const { wx, wy } = svgPoint(e)
              ;(e.currentTarget as SVGElement).setPointerCapture(e.pointerId)
              const w = worldOf({ x: wx, y: wy }) // svgPoint 是 viewBox 像素坐标，必须先转世界米坐标！
              if (tool === 'seg' || tool === 'arc') { placeAt(w.wx, w.wy, 0, 0); return } // 斜面/圆弧：点击即放默认尺寸
              dragRef.current = { kind: tool === 'ball' ? 'place' : 'move', sx: wx, sy: wy, cx: wx, cy: wy, movedSel: null }
              if (tool === 'select') {
                const hit = hitTest(w.wx, w.wy)
                setSel(hit)
                if (!hit) dragRef.current.kind = 'pan' // 空白处拖动 = 平移视图（电学台同款）
              }
            }}
            onPointerMove={(e) => {
              const d = dragRef.current
              if (!d) return
              const { wx, wy } = svgPoint(e)
              const dx = wx - d.cx, dy = wy - d.cy
              d.cx = wx; d.cy = wy
              if (d.kind === 'pan') {
                setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }))
              } else if (d.kind === 'move' && tool === 'select' && sel) {
                const wdx = dx / view.scale, wdy = dy / view.scale
                if (sel.type === 'ball') setBalls((q) => q.map((b) => (b.id === sel.id ? { ...b, x: b.x + wdx, y: b.y + wdy } : b)))
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
              addBall(a.wx, a.wy, ((wx - d.sx) / view.scale) * 3, ((wy - d.sy) / view.scale) * 3)
            }}
          >
            {/* 网格：随缩放换步长（电学台坐标系同款） */}
            {(() => {
              const s = view.scale
              const step = s >= 14 ? 1 : s >= 6 ? 5 : 10
              const x0 = (20 - view.tx) / s, x1 = (780 - view.tx) / s
              const y0 = (70 - view.ty) / s, y1 = (430 - view.ty) / s
              const lines: React.ReactElement[] = []
              for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
                const { px } = toPx(x, 0)
                const major = Math.abs(x % (step * 5)) < 1e-6
                lines.push(<line key={`gx${x}`} x1={px} y1={70} x2={px} y2={430} stroke="var(--border)" strokeWidth={major ? 1 : 0.5} opacity={major ? 0.7 : 0.35} />)
                if (major) lines.push(<text key={`gxl${x}`} x={px} y={444} fontSize={9} textAnchor="middle" fill="var(--muted, #889)">{x}m</text>)
              }
              for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
                const { py } = toPx(0, y)
                const major = Math.abs(y % (step * 5)) < 1e-6
                lines.push(<line key={`gy${y}`} x1={20} y1={py} x2={780} y2={py} stroke="var(--border)" strokeWidth={major ? 1 : 0.5} opacity={major ? 0.7 : 0.35} />)
                if (major && y !== 0) lines.push(<text key={`gyl${y}`} x={6} y={py + 3} fontSize={9} fill="var(--muted, #889)">{y}m</text>)
              }
              return lines
            })()}
            {/* 地面（可关闭）：关闭后球掉出场地即回收 */}
            {ground && (() => {
              const f = toPx(0, H)
              return <line x1={10} y1={f.py} x2={790} y2={f.py} stroke="var(--ink)" strokeWidth={2.5} />
            })()}
            {/* 静态体 */}
            {statics.map((s) => {
              const pts = s.kind === 'seg' ? (() => { const ep = segEndpoints(s); return [[ep.ax, ep.ay], [ep.bx, ep.by]] })() : arcPoints(s).map((q) => [q.x, q.y])
              const d = pts.map(([x, y]) => { const { px, py } = toPx(x, y); return `${px},${py}` }).join(' ')
              const isSel = sel?.type === 'static' && sel.id === s.id
              return <polyline key={s.id} points={d} fill="none" stroke={isSel ? 'var(--accent-soft, #5e6ad2)' : 'var(--ink)'} strokeWidth={Math.max(2, 0.14 * view.scale)} strokeLinecap="round" />
            })}
            {trails && balls.map((b) => {
              const arr = trailRef.current.get(b.id) ?? []
              return <polyline key={`t${b.id}`} points={arr.join(' ')} fill="none" stroke={BALL_COLORS[(b.id - 1) % BALL_COLORS.length]} strokeWidth={1} opacity={0.4} />
            })}
            {balls.map((b) => {
              const { px, py } = toPx(b.x, b.y)
              const isSel = sel?.type === 'ball' && sel.id === b.id
              return <circle key={b.id} cx={px} cy={py} r={b.r * view.scale} fill={BALL_COLORS[(b.id - 1) % BALL_COLORS.length]} stroke={isSel ? 'var(--accent-soft, #5e6ad2)' : 'none'} strokeWidth={3} opacity={0.9} />
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
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={gOn} onChange={(e) => setGOn(e.target.checked)} />重力
            </label>
            <label style={{ flex: 1, minWidth: 150, opacity: gOn ? 1 : 0.4 }}>
              重力 {gOn ? g : 0}m/s²
              <input type="range" min={0.5} max={25} step={0.1} value={g} disabled={!gOn} onChange={(e) => setG(+e.target.value)} />
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={ground} onChange={(e) => setGround(e.target.checked)} />地面
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={trails} onChange={(e) => setTrails(e.target.checked)} />轨迹
            </label>
            <button onClick={() => { setView({ scale: 18, tx: 20, ty: 70 }) }}>⤢ 复位视图</button>
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
