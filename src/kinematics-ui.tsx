// 运动学实验室（测试版）：独立全屏界面，构建思路与电学台完全一致
// .app 布局 + .palette 侧栏 + .stage 画布（getScreenCTM 坐标转换）+ zustand 仓库（撤销/持久化）
import { useEffect, useRef, useState } from 'react'
import { kineticEnergy, stepSandbox, type SandboxParams } from './solver/kinematics-sandbox'
import { segEndpoints, arcPoints } from './solver/kinematics-sandbox'
import { useKin, kinState, type KinSel, type KinTool } from './sandbox-store'

const BALL_COLORS = ['#5e6ad2', '#e08a97', '#4aa3a2', '#c9a227', '#7a9e4f', '#b06ad2', '#d26a5e', '#6ab0d2']
const W = 42, H = 20 // 场地 m（世界坐标：y 向下=重力向下）

export function KinematicsLab({ onHome }: { onHome: () => void }) {
  const s = useKin()
  const [view, setView] = useState({ scale: 18, tx: 20, ty: 70 })
  const viewRef = useRef(view)
  viewRef.current = view
  const svgRef = useRef<SVGSVGElement | null>(null)
  const worldRef = useRef<SVGGElement | null>(null)
  const trailRef = useRef<Map<number, string[]>>(new Map())
  const dragRef = useRef<
    | { kind: 'place'; swx: number; swy: number; cwx: number; cwy: number }
    | { kind: 'move'; id: number; lwx: number; lwy: number }
    | { kind: 'pan'; lpx: number; lpy: number }
    | null
  >(null)
  const [, tickRender] = useState(0)

  // 坐标转换：getScreenCTM 直接把屏幕事件坐标映射到世界米——缩放/平移全自动正确
  const toWorld = (e: React.PointerEvent | React.MouseEvent): { x: number; y: number } => {
    const el = worldRef.current ?? svgRef.current
    const ctm = el?.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  // 物理循环：rAF 驱动，直接改 store 里的球对象再强制重渲染（电学台瞬态引擎同款）
  useEffect(() => {
    if (!s.running) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const st = kinState()
      const params: SandboxParams = { g: st.gOn ? st.g : 0, W, H, ground: st.ground }
      stepSandbox(st.balls, st.statics, params, dt, 4)
      if (!st.ground) {
        const alive = st.balls.filter((b) => b.y < H + 15)
        if (alive.length !== st.balls.length) useKin.setState({ balls: alive })
      }
      if (st.trails) {
        for (const b of st.balls) {
          const arr = trailRef.current.get(b.id) ?? []
          const v = viewRef.current
          arr.push(`${b.x * v.scale + v.tx},${b.y * v.scale + v.ty}`)
          if (arr.length > 120) arr.shift()
          trailRef.current.set(b.id, arr)
        }
      }
      tickRender((v) => v + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [s.running])

  // 滚轮缩放（光标锚定，非 passive 原生监听）
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const px = ((e.clientX - r.left) / r.width) * 800
      const py = ((e.clientY - r.top) / r.height) * 450
      setView((v) => {
        const scale = Math.max(4, Math.min(60, v.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))
        const f = scale / v.scale
        return { scale, tx: px - (px - v.tx) * f, ty: py - (py - v.ty) * f }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // 键盘：Del 删除选中，0 复位视图
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') kinState().removeSel()
      if (e.key === '0') setView({ scale: 18, tx: 20, ty: 70 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const hitTest = (wx: number, wy: number): KinSel => {
    const st = kinState()
    for (const b of st.balls) {
      if (Math.hypot(b.x - wx, b.y - wy) <= b.r + 0.15) return { type: 'ball', id: b.id }
    }
    for (const sh of st.statics) {
      const pts = sh.kind === 'seg'
        ? (() => { const ep = segEndpoints(sh); return [[ep.ax, ep.ay], [ep.bx, ep.by]] })()
        : arcPoints(sh).map((q) => [q.x, q.y])
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1]
        const abx = bx - ax, aby = by - ay, l2 = abx * abx + aby * aby
        const t = Math.max(0, Math.min(1, ((wx - ax) * abx + (wy - ay) * aby) / (l2 || 1)))
        if (Math.hypot(wx - (ax + t * abx), wy - (ay + t * aby)) < 0.5) return { type: 'static', id: sh.id }
      }
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.currentTarget as SVGElement).setPointerCapture(e.pointerId)
    const w = toWorld(e)
    const st = kinState()
    if (st.tool === 'seg' || st.tool === 'arc') {
      st.addStatic(st.tool === 'seg'
        ? { kind: 'seg', cx: w.x, cy: w.y, len: 8, angleDeg: -25 }
        : { kind: 'arc', cx: w.x, cy: w.y, r: 5, angleDeg: Math.PI })
      return
    }
    if (st.tool === 'ball') {
      dragRef.current = { kind: 'place', swx: w.x, swy: w.y, cwx: w.x, cwy: w.y }
      return
    }
    const hit = hitTest(w.x, w.y)
    st.setSel(hit)
    if (hit?.type === 'ball') dragRef.current = { kind: 'move', id: hit.id, lwx: w.x, lwy: w.y }
    else dragRef.current = { kind: 'pan', lpx: e.clientX, lpy: e.clientY }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const w = toWorld(e)
    if (d.kind === 'place') { d.cwx = w.x; d.cwy = w.y }
    else if (d.kind === 'move') {
      kinState().moveBall(d.id, w.x - d.lwx, w.y - d.lwy)
      d.lwx = w.x; d.lwy = w.y
    } else {
      setView((v) => ({ ...v, tx: v.tx + (e.clientX - d.lpx), ty: v.ty + (e.clientY - d.lpy) }))
      d.lpx = e.clientX; d.lpy = e.clientY
    }
    tickRender((v) => v + 1)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    if (!d || d.kind !== 'place') return
    const w = toWorld(e)
    if (d.swx < 0 || d.swx > W || d.swy < 0 || d.swy > H) return
    kinState().addBall(d.swx, d.swy, ((w.x - d.swx) * view.scale) / SCALE_VEL, ((w.y - d.swy) * view.scale) / SCALE_VEL)
  }
  const SCALE_VEL = 54 // 屏幕 1m 的拖拽 ≙ 3 m/s

  const ke = kineticEnergy(s.balls)
  const selBall = s.sel?.type === 'ball' ? s.balls.find((b) => b.id === s.sel!.id) : undefined
  const selStatic = s.sel?.type === 'static' ? s.statics.find((q) => q.id === s.sel!.id) : undefined

  const toolBtn = (t: KinTool, label: string, dot: string) => (
    <button className={s.tool === t ? 'active' : ''} onClick={() => kinState().setTool(t)}>
      <span className="dot" style={{ background: dot }} />{label}
    </button>
  )

  return (
    <div className="app">
      <aside className="palette">
        <div className="pal-head">
          <h1>运动学实验室</h1>
          <button className="icon-btn" title="返回主页" onClick={onHome}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 11 12 4l8 7M6.5 9.5V20h11V9.5M10 20v-5h4v5" />
            </svg>
          </button>
        </div>
        <p className="hint">物体</p>
        {toolBtn('ball', '小球（拖拽定初速）', '#5e6ad2')}
        {toolBtn('seg', '斜面', '#4aa3a2')}
        {toolBtn('arc', '四分之一圆弧', '#c9a227')}
        {toolBtn('select', '选择 / 编辑', '#9aa3b8')}
        <div className="divider" />
        {selBall ? (
          <>
            <p className="hint">属性 · 小球</p>
            {(() => {
              const v = Math.hypot(selBall.vx, selBall.vy)
              const dir = (Math.atan2(selBall.vy, selBall.vx) * 180) / Math.PI
              return (
                <>
                  <label>速度 |v| {v.toFixed(1)}m/s
                    <input type="range" min={0} max={30} step={0.5} value={Math.min(30, v)}
                      onChange={(e) => { const a = Math.atan2(selBall.vy, selBall.vx); kinState().updateBall(selBall.id, { vx: +e.target.value * Math.cos(a), vy: +e.target.value * Math.sin(a) }) }} />
                  </label>
                  <label>方向 {dir.toFixed(0)}°
                    <input type="range" min={-180} max={180} step={5} value={Math.round(dir)}
                      onChange={(e) => { const a = (+e.target.value * Math.PI) / 180; const nv = Math.hypot(selBall.vx, selBall.vy); kinState().updateBall(selBall.id, { vx: nv * Math.cos(a), vy: nv * Math.sin(a) }) }} />
                  </label>
                  <label>质量 {selBall.m.toFixed(1)}kg
                    <input type="range" min={0.5} max={20} step={0.5} value={selBall.m}
                      onChange={(e) => kinState().updateBall(selBall.id, { m: +e.target.value })} />
                  </label>
                  <label>半径 {selBall.r.toFixed(1)}m
                    <input type="range" min={0.3} max={1.5} step={0.1} value={selBall.r}
                      onChange={(e) => kinState().updateBall(selBall.id, { r: +e.target.value })} />
                  </label>
                  <label>弹性 {selBall.e.toFixed(2)}
                    <input type="range" min={0} max={1} step={0.05} value={selBall.e}
                      onChange={(e) => kinState().updateBall(selBall.id, { e: +e.target.value })} />
                  </label>
                </>
              )
            })()}
            <button className="wide danger" onClick={() => kinState().removeSel()}>删除</button>
          </>
        ) : selStatic ? (
          <>
            <p className="hint">属性 · {selStatic.kind === 'seg' ? '斜面' : '圆弧'}</p>
            <label>{selStatic.kind === 'seg' ? '角度' : '旋转'} {selStatic.angleDeg.toFixed(0)}°
              <input type="range" min={selStatic.kind === 'seg' ? -80 : 0} max={selStatic.kind === 'seg' ? 80 : 350} step={5} value={selStatic.angleDeg}
                onChange={(e) => kinState().updateStatic(selStatic.id, { angleDeg: +e.target.value } as never)} />
            </label>
            <label>{selStatic.kind === 'seg' ? '长度' : '半径'} {(selStatic.kind === 'seg' ? selStatic.len : selStatic.r).toFixed(1)}m
              <input type="range" min={2} max={selStatic.kind === 'seg' ? 20 : 10} step={0.5} value={selStatic.kind === 'seg' ? selStatic.len : selStatic.r}
                onChange={(e) => kinState().updateStatic(selStatic.id, (selStatic.kind === 'seg' ? { len: +e.target.value } : { r: +e.target.value }) as never)} />
            </label>
            <button className="wide danger" onClick={() => kinState().removeSel()}>删除</button>
          </>
        ) : (
          <p className="hint">选物体工具放置。<br />"选择"工具点击物体改属性、<br />拖动小球挪位置。<br />Del 删除选中 · 0 复位视图。<br />滚轮缩放 · 空白拖拽平移。</p>
        )}
        <div className="divider" />
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={s.gOn} onChange={(e) => kinState().setGOn(e.target.checked)} />重力
        </label>
        <label style={{ opacity: s.gOn ? 1 : 0.4 }}>
          重力 {s.gOn ? s.g : 0}m/s²
          <input type="range" min={0.5} max={25} step={0.1} value={s.g} disabled={!s.gOn}
            onChange={(e) => kinState().setG(+e.target.value)} />
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={s.ground} onChange={(e) => kinState().setGround(e.target.checked)} />地面
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={s.trails} onChange={(e) => kinState().setTrails(e.target.checked)} />轨迹
        </label>
        <p className="hint" style={{ margin: 0 }}>{s.balls.length} 个球 · 总动能 {ke.toFixed(1)} J</p>
        <div className="pal-row">
          <button onClick={() => kinState().setRunning(!s.running)}>{s.running ? '⏸ 暂停' : '▶ 运行'}</button>
          <button onClick={() => kinState().undo()} disabled={!s.histCount}>撤销 {s.histCount ? `(${s.histCount})` : ''}</button>
        </div>
        <div className="pal-row">
          <button onClick={() => { kinState().clear(); trailRef.current.clear() }}>🗑 清空</button>
          <button onClick={() => setView({ scale: 18, tx: 20, ty: 70 })}>⤢ 复位视图</button>
        </div>
        <p className="tips">
          小球+拖拽初速 = 斜抛；<br />
          斜面/圆弧点击放置，属性里调角度；<br />
          关地面+关重力 = 惯性直线；<br />
          弹性 0 泥球 / 1 完全弹性。
        </p>
      </aside>
      <div className="stage">
        <svg ref={svgRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <g ref={worldRef} transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
            {/* 网格（世界坐标直线，随视图平移缩放） */}
            {(() => {
              const s2 = view.scale
              const step = s2 >= 14 ? 1 : s2 >= 6 ? 5 : 10
              const x0 = -view.tx / s2, x1 = (800 - view.tx) / s2
              const y0 = -view.ty / s2, y1 = (450 - view.ty) / s2
              const lines: React.ReactElement[] = []
              for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
                const major = Math.abs(x % (step * 5)) < 1e-6
                lines.push(<line key={`gx${x}`} x1={x} y1={y0} x2={x} y2={y1} stroke="var(--border)" strokeWidth={1 / s2} opacity={major ? 0.8 : 0.4} />)
              }
              for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
                const major = Math.abs(y % (step * 5)) < 1e-6
                lines.push(<line key={`gy${y}`} x1={x0} y1={y} x2={x1} y2={y} stroke="var(--border)" strokeWidth={1 / s2} opacity={major ? 0.8 : 0.4} />)
              }
              return lines
            })()}
            {s.ground && <line x1={-1000} y1={H} x2={W + 1000} y2={H} stroke="var(--ink)" strokeWidth={3 / view.scale} />}
            {/* 静态体 */}
            {s.statics.map((sh) => {
              const pts = sh.kind === 'seg'
                ? (() => { const ep = segEndpoints(sh); return [[ep.ax, ep.ay], [ep.bx, ep.by]] })()
                : arcPoints(sh).map((q) => [q.x, q.y])
              const d = pts.map(([x, y]) => `${x},${y}`).join(' ')
              const isSel = s.sel?.type === 'static' && s.sel.id === sh.id
              return <polyline key={sh.id} points={d} fill="none" stroke={isSel ? 'var(--accent-soft, #5e6ad2)' : 'var(--ink)'} strokeWidth={(isSel ? 0.3 : 0.22) * 12 / view.scale * view.scale / 12 + 0.15} strokeLinejoin="round" strokeLinecap="round" />
            })}
            {s.trails && s.balls.map((b) => {
              const arr = trailRef.current.get(b.id) ?? []
              return <polyline key={`t${b.id}`} points={arr.join(' ')} fill="none" stroke={BALL_COLORS[(b.id - 1) % BALL_COLORS.length]} strokeWidth={1 / view.scale} opacity={0.4} />
            })}
            {s.balls.map((b) => {
              const isSel = s.sel?.type === 'ball' && s.sel.id === b.id
              return <circle key={b.id} cx={b.x} cy={b.y} r={b.r} fill={BALL_COLORS[(b.id - 1) % BALL_COLORS.length]} stroke={isSel ? 'var(--accent-soft, #5e6ad2)' : 'none'} strokeWidth={0.15} opacity={0.9} />
            })}
            {dragRef.current?.kind === 'place' && (() => {
              const d = dragRef.current
              return (
                <>
                  <line x1={d.swx} y1={d.swy} x2={d.cwx} y2={d.cwy} stroke="#e08a97" strokeWidth={2 / view.scale} />
                  <circle cx={d.swx} cy={d.swy} r={0.7} fill="none" stroke="#e08a97" strokeWidth={1.5 / view.scale} strokeDasharray={`${0.3} ${0.2}`} />
                </>
              )
            })()}
            {s.balls.length === 0 && s.statics.length === 0 && (
              <text x={W / 2} y={H / 2} fontSize={0.9} textAnchor="middle" fill="var(--muted, #889)">
                左侧选"小球"，画布上按住拖动再松手：拖出方向和长度 = 初速度
              </text>
            )}
          </g>
        </svg>
      </div>
    </div>
  )
}
