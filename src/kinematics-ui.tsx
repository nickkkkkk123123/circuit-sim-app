// 运动学实验室（测试版）：独立全屏界面，构建思路与电学台完全一致
// .app 布局 + .palette 侧栏 + .stage 画布（getScreenCTM 坐标转换）+ zustand 仓库（撤销/持久化）
import { useEffect, useRef, useState } from 'react'
import { kineticEnergy, stepSandbox, type SandboxParams } from './solver/kinematics-sandbox'
import { segEndpoints, arcPoints } from './solver/kinematics-sandbox'
import { useKin, kinState, type KinSel, type KinTool } from './sandbox-store'
import { GlassToggle } from './glass-toggle'

const BALL_COLORS = ['#5e6ad2', '#e08a97', '#4aa3a2', '#c9a227', '#7a9e4f', '#b06ad2', '#d26a5e', '#6ab0d2']
const BLOCK_COLOR = '#4a9ed2'
const PX_PER_N = 4 // 恒力箭头比例：4px/N（屏上 10N 画 40px 长）

export function KinematicsLab({ onHome }: { onHome: () => void }) {
  const s = useKin()
  const W = s.fw, H = s.fh // 场地尺寸（侧栏可调；世界坐标：y 向下=重力向下）
  const [view, setView] = useState({ scale: 9, tx: 20, ty: 180 })
  const viewRef = useRef(view)
  viewRef.current = view
  // 复位视图：按画布实测尺寸自适应——场地完整入画、地面贴底部（100×40 大场地写死视图必然失配）
  const defaultView = (): { scale: number; tx: number; ty: number } => {
    const { w, h } = vpRef.current
    const scale = Math.max(4, Math.min(30, Math.min(w / (W + 30), h / (H + 26))))
    return { scale, tx: 20, ty: h - (H + 4) * scale }
  }
  const svgRef = useRef<SVGSVGElement | null>(null)
  const worldRef = useRef<SVGGElement | null>(null)
  const trailRef = useRef<Map<number, string[]>>(new Map())
  const dragRef = useRef<
    | { kind: 'place'; placeKind: 'ball' | 'block'; swx: number; swy: number; cwx: number; cwy: number }
    | { kind: 'move'; id: number; lwx: number; lwy: number }
    | { kind: 'moveBlock'; id: number; lwx: number; lwy: number }
    | { kind: 'fdrag'; type: 'ball' | 'block'; id: number }
    | { kind: 'moveStatic'; id: number; lwx: number; lwy: number }
    | { kind: 'vdrag'; id: number }
    | { kind: 'pan'; lpx: number; lpy: number }
    | null
  >(null)
  const [, tickRender] = useState(0)
  // 视口实测尺寸（ResizeObserver）：网格/矢量全部按真实画布大小绘制，不再硬编码 800×450
  const [vp, setVp] = useState({ w: 800, h: 450 })
  useEffect(() => {
    const el = svgRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setVp({ w: Math.max(320, r.width), h: Math.max(240, r.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // 选中球的实时加速度（有限差分：含碰撞冲量，比"只有重力"诚实）
  const accelRef = useRef<Map<number, { ax: number; ay: number }>>(new Map())
  const prevVelRef = useRef<Map<number, { vx: number; vy: number }>>(new Map())

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
      // W/H 必须从 store 实时读：effect 只依赖 s.running，闭包里的 W/H 是启动时的快照，
      // 运行中改场地尺寸若走闭包，物理边界不更新（表现为"改了要重启才生效"）
      const W = st.fw, H = st.fh
      // 记录步进前速度 → 步进后差分出真实加速度（含碰撞/接触力）
      const prevVel = new Map<number, { vx: number; vy: number }>()
      for (const b of st.balls) prevVel.set(b.id, { vx: b.vx, vy: b.vy })
      const params: SandboxParams = { g: st.gOn ? st.g : 0, W, H, ground: st.ground, unlimited: st.unlimited }
      stepSandbox(st.balls, st.statics, params, dt, 4, st.blocks)
      const acc = accelRef.current
      acc.clear()
      for (const b of st.balls) {
        const pv = prevVel.get(b.id)
        if (pv) acc.set(b.id, { ax: (b.vx - pv.vx) / dt, ay: (b.vy - pv.vy) / dt })
      }
      prevVelRef.current = prevVel
      if (!st.ground && !st.unlimited) {
        // 开放空间回收：掉出场地下方或横向飞出边界都回收（无限制模式永不回收）
        const alive = st.balls.filter((b) => b.y < H + 15 && b.x > -15 && b.x < W + 15)
        const aliveB = st.blocks.filter((k) => k.y < H + 15 && k.x > -15 && k.x < W + 15)
        if (alive.length !== st.balls.length || aliveB.length !== st.blocks.length)
          useKin.setState({ balls: alive, blocks: aliveB })
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

  // 滚轮缩放（光标锚定，非 passive 原生监听）。锚点用实测画布尺寸 vp：
  // 硬编码 800×450 时代码画布早已不是这个尺寸，锚点错位会让缩放看起来"失效/乱飘"
  const vpRef = useRef(vp)
  vpRef.current = vp
  // 首次实测到画布尺寸 → 视图吸附到适配默认（大场地入画、地面贴底）
  const viewInitRef = useRef(false)
  useEffect(() => {
    if (!viewInitRef.current && vp.w > 320) {
      viewInitRef.current = true
      setView(defaultView())
    }
  }, [vp])
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const px = ((e.clientX - r.left) / r.width) * vpRef.current.w
      const py = ((e.clientY - r.top) / r.height) * vpRef.current.h
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
      if (e.key === '0') setView(defaultView())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const hitTest = (wx: number, wy: number): KinSel => {
    const st = kinState()
    for (const b of st.balls) {
      if (Math.hypot(b.x - wx, b.y - wy) <= b.r + 0.15) return { type: 'ball', id: b.id }
    }
    for (const k of st.blocks) {
      if (Math.abs(wx - k.x) <= k.hw + 0.15 && Math.abs(wy - k.y) <= k.hh + 0.15) return { type: 'block', id: k.id }
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
    if (st.tool === 'ball' || st.tool === 'block') {
      dragRef.current = { kind: 'place', placeKind: st.tool, swx: w.x, swy: w.y, cwx: w.x, cwy: w.y }
      return
    }
    // 恒力工具：点到球/滑块即选中并进入"拖拽定力"，拖多远力多大（8px ≙ 1N）
    if (st.tool === 'force') {
      const hitF = hitTest(w.x, w.y)
      if (hitF && (hitF.type === 'ball' || hitF.type === 'block')) {
        st.setSel(hitF)
        dragRef.current = { kind: 'fdrag', type: hitF.type, id: hitF.id }
      }
      return
    }
    // 优先级最高：已选中球的速度箭头尖端（必须在 setSel 之前判，否则拖箭头会先取消选中）
    if (s.sel?.type === 'ball') {
      const b0 = st.balls.find((q) => q.id === s.sel!.id)
      if (b0) {
        const px = 18 / viewRef.current.scale
        const tip = { x: b0.x + b0.vx * px, y: b0.y + b0.vy * px }
        if (Math.hypot(w.x - tip.x, w.y - tip.y) < 14 / viewRef.current.scale) {
          dragRef.current = { kind: 'vdrag', id: b0.id }
          return
        }
      }
    }
    const hit = hitTest(w.x, w.y)
    st.setSel(hit)
    if (hit?.type === 'ball') {
      dragRef.current = { kind: 'move', id: hit.id, lwx: w.x, lwy: w.y }
    } else if (hit?.type === 'block') {
      dragRef.current = { kind: 'moveBlock', id: hit.id, lwx: w.x, lwy: w.y }
    } else if (hit?.type === 'static') {
      dragRef.current = { kind: 'moveStatic', id: hit.id, lwx: w.x, lwy: w.y }
    } else dragRef.current = { kind: 'pan', lpx: e.clientX, lpy: e.clientY }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const w = toWorld(e)
    if (d.kind === 'place') { d.cwx = w.x; d.cwy = w.y }
    else if (d.kind === 'move') {
      kinState().moveBall(d.id, w.x - d.lwx, w.y - d.lwy)
      d.lwx = w.x; d.lwy = w.y
    } else if (d.kind === 'moveBlock') {
      kinState().moveBlock(d.id, w.x - d.lwx, w.y - d.lwy)
      d.lwx = w.x; d.lwy = w.y
    } else if (d.kind === 'moveStatic') {
      kinState().moveStatic(d.id, w.x - d.lwx, w.y - d.lwy)
      d.lwx = w.x; d.lwy = w.y
    } else if (d.kind === 'vdrag') {
      // 拖速度箭头尖端 = 直接改速度矢量（箭头即把手）
      const b = kinState().balls.find((q) => q.id === d.id)
      if (b) {
        const px = 18 / viewRef.current.scale
        kinState().updateBall(d.id, { vx: (w.x - b.x) / px, vy: (w.y - b.y) / px })
      }
    } else if (d.kind === 'fdrag') {
      // 恒力拖拽：从物体中心向外拖，8px 屏幕 ≙ 1N，实时写入 fx/fy（拖回中心=清零）
      const N_PER_PX = 1 / 8
      const body = d.type === 'ball' ? kinState().balls.find((q) => q.id === d.id) : kinState().blocks.find((q) => q.id === d.id)
      if (body) {
        const patch = {
          fx: (w.x - body.x) * viewRef.current.scale * N_PER_PX,
          fy: (w.y - body.y) * viewRef.current.scale * N_PER_PX,
        }
        if (d.type === 'ball') kinState().updateBall(d.id, patch)
        else kinState().updateBlock(d.id, patch)
      }
    } else {
      // delta 必须在突变 d.lpx 之前算好：setView 的 updater 是延迟执行的，
      // 若在 updater 里读 d.lpx，读到的永远是突变后的新值（delta 恒 0）
      const dx = e.clientX - d.lpx, dy = e.clientY - d.lpy
      d.lpx = e.clientX; d.lpy = e.clientY
      setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }))
    }
    tickRender((v) => v + 1)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    if (!d || d.kind !== 'place') return
    const w = toWorld(e)
    if (d.swx < 0 || d.swx > W || d.swy < 0 || d.swy > H) return
    const vx = ((w.x - d.swx) * view.scale) / SCALE_VEL
    const vy = ((w.y - d.swy) * view.scale) / SCALE_VEL
    if (d.placeKind === 'block') kinState().addBlock(d.swx, d.swy, vx, vy)
    else kinState().addBall(d.swx, d.swy, vx, vy)
  }
  const SCALE_VEL = 54 // 屏幕 1m 的拖拽 ≙ 3 m/s

  const ke = kineticEnergy(s.balls) + s.blocks.reduce((sum, k) => sum + 0.5 * k.m * (k.vx * k.vx + k.vy * k.vy), 0)
  const selBall = s.sel?.type === 'ball' ? s.balls.find((b) => b.id === s.sel!.id) : undefined
  const selBlock = s.sel?.type === 'block' ? s.blocks.find((k) => k.id === s.sel!.id) : undefined
  const selStatic = s.sel?.type === 'static' ? s.statics.find((q) => q.id === s.sel!.id) : undefined

  const toolBtn = (t: KinTool, label: string, dot: string) => (
    <button className={s.tool === t ? 'active' : ''} onClick={() => kinState().setTool(t)}>
      <span className="dot" style={{ background: dot }} />{label}
    </button>
  )
  // 恒力输入（N）：试验功能——F=ma 的直接操纵面，画布上以青色箭头可视化
  const forceInputs = (fx: number, fy: number, apply: (patch: { fx: number; fy: number }) => void) => (
    <>
      <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        恒力 Fx<input type="number" min={-200} max={200} step={1} value={fx} style={{ width: 64, flex: 'none' }}
          onChange={(e) => apply({ fx: Math.max(-200, Math.min(200, +e.target.value || 0)), fy })} /> N
      </label>
      <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        恒力 Fy<input type="number" min={-200} max={200} step={1} value={fy} style={{ width: 64, flex: 'none' }}
          onChange={(e) => apply({ fx, fy: Math.max(-200, Math.min(200, +e.target.value || 0)) })} /> N
      </label>
    </>
  )

  return (
    <div className="app">
      <aside className="palette">
        <div className="pal-head">
          <h1>运动学实验室</h1>
          <GlassToggle />
          <button className="icon-btn" title="返回主页" onClick={onHome}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 11 12 4l8 7M6.5 9.5V20h11V9.5M10 20v-5h4v5" />
            </svg>
          </button>
        </div>
        <p className="hint">物体</p>
        {toolBtn('ball', '小球（拖拽定初速）', '#5e6ad2')}
        {toolBtn('block', '小滑块（可加恒力）', BLOCK_COLOR)}
        {toolBtn('force', '恒力（点物体拖拽）', '#4ad2e0')}
        {toolBtn('seg', '斜面', '#4aa3a2')}
        {toolBtn('arc', '四分之一圆弧', '#c9a227')}
        {toolBtn('select', '选择 / 编辑', '#9aa3b8')}
        <div className="divider" />
        {selBall ? (
          <>
            <p className="hint">属性 · 小球</p>
            {(() => {
              const v = Math.hypot(selBall.vx, selBall.vy)
              // 方向角用数学惯例（逆时针为正，y 向上）：屏幕 y 向下，atan2 里取 -vy 翻转
              const dir = (Math.atan2(-selBall.vy, selBall.vx) * 180) / Math.PI
              return (
                <>
                  <label>速度 |v| {v.toFixed(1)}m/s
                    <input type="range" min={0} max={30} step={0.5} value={Math.min(30, v)}
                      onChange={(e) => { const a = Math.atan2(selBall.vy, selBall.vx); kinState().updateBall(selBall.id, { vx: +e.target.value * Math.cos(a), vy: +e.target.value * Math.sin(a) }) }} />
                  </label>
                  <label>速度方向 {dir.toFixed(0)}°
                    <input type="range" min={-180} max={180} step={5} value={Math.round(dir)}
                      onChange={(e) => { const a = (+e.target.value * Math.PI) / 180; const nv = Math.hypot(selBall.vx, selBall.vy); kinState().updateBall(selBall.id, { vx: nv * Math.cos(a), vy: -nv * Math.sin(a) }) }} />
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
                  {forceInputs(selBall.fx ?? 0, selBall.fy ?? 0, (patch) => kinState().updateBall(selBall.id, patch))}
                </>
              )
            })()}
            <button className="wide danger" onClick={() => kinState().removeSel()}>删除</button>
          </>
        ) : selBlock ? (
          <>
            <p className="hint">属性 · 小滑块</p>
            <label>宽 {(selBlock.hw * 2).toFixed(1)}m
              <input type="range" min={0.6} max={6} step={0.2} value={selBlock.hw * 2}
                onChange={(e) => kinState().updateBlock(selBlock.id, { hw: +e.target.value / 2 })} />
            </label>
            <label>高 {(selBlock.hh * 2).toFixed(1)}m
              <input type="range" min={0.4} max={4} step={0.2} value={selBlock.hh * 2}
                onChange={(e) => kinState().updateBlock(selBlock.id, { hh: +e.target.value / 2 })} />
            </label>
            <label>质量 {selBlock.m.toFixed(1)}kg
              <input type="range" min={0.5} max={40} step={0.5} value={selBlock.m}
                onChange={(e) => kinState().updateBlock(selBlock.id, { m: +e.target.value })} />
            </label>
            <label>弹性 {selBlock.e.toFixed(2)}
              <input type="range" min={0} max={1} step={0.05} value={selBlock.e}
                onChange={(e) => kinState().updateBlock(selBlock.id, { e: +e.target.value })} />
            </label>
            {forceInputs(selBlock.fx ?? 0, selBlock.fy ?? 0, (patch) => kinState().updateBlock(selBlock.id, patch))}
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
          <input type="checkbox" checked={s.unlimited} onChange={(e) => kinState().setUnlimited(e.target.checked)} />场地无限制（无墙不回收）
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: s.unlimited ? 0.4 : 1 }}>
          场地宽 {s.fw}m
          <input type="range" min={20} max={200} step={5} value={s.fw} disabled={s.unlimited}
            onChange={(e) => kinState().setFw(+e.target.value)} />
          <input type="number" min={20} max={200} step={5} value={s.fw} disabled={s.unlimited}
            style={{ width: 60, flex: 'none' }}
            onChange={(e) => kinState().setFw(Math.max(20, Math.min(200, +e.target.value || 20)))} />
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: s.unlimited ? 0.4 : 1 }}>
          场地高 {s.fh}m
          <input type="range" min={10} max={100} step={5} value={s.fh} disabled={s.unlimited}
            onChange={(e) => kinState().setFh(+e.target.value)} />
          <input type="number" min={10} max={100} step={5} value={s.fh} disabled={s.unlimited}
            style={{ width: 60, flex: 'none' }}
            onChange={(e) => kinState().setFh(Math.max(10, Math.min(100, +e.target.value || 10)))} />
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={s.trails} onChange={(e) => kinState().setTrails(e.target.checked)} />轨迹
        </label>
        <p className="hint" style={{ margin: 0 }}>{s.balls.length} 球 · {s.blocks.length} 滑块 · 总动能 {ke.toFixed(1)} J</p>
        <div className="pal-row">
          <button onClick={() => kinState().setRunning(!s.running)}>{s.running ? '⏸ 暂停' : '▶ 运行'}</button>
          <button onClick={() => kinState().undo()} disabled={!s.histCount}>撤销 {s.histCount ? `(${s.histCount})` : ''}</button>
        </div>
        <div className="pal-row">
          <button onClick={() => { kinState().clear(); trailRef.current.clear() }}>🗑 清空</button>
          <button onClick={() => setView(defaultView())}>⤢ 复位视图</button>
        </div>
        <p className="tips">
          小球+拖拽初速 = 斜抛；<br />
          恒力工具：点球/滑块后拖拽，<br />
          拖多远力多大（8px=1N）；<br />
          斜面/圆弧点击放置，属性里调角度；<br />
          关地面+关重力 = 惯性直线；<br />
          弹性默认 0（放地上不弹跳），1 完全弹性。
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
              const x0 = -view.tx / s2, x1 = (vp.w - view.tx) / s2
              const y0 = -view.ty / s2, y1 = (vp.h - view.ty) / s2
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
            {/* 坐标系：x 轴沿地面（向右），y 轴在 x=0（向上，刻度=离地高度），带单位刻度与箭头 */}
            {(() => {
              const s2 = view.scale
              const step = s2 >= 14 ? 1 : s2 >= 6 ? 5 : 10
              const x0 = -view.tx / s2, x1 = (vp.w - view.tx) / s2
              const y0 = -view.ty / s2, y1 = (vp.h - view.ty) / s2
              const els: React.ReactElement[] = []
              const tick = 0.22, lab = 0.42, fs = 11 / s2
              const fmt = (n: number) => (Math.round(n * 10) / 10).toString()
              // x 轴刻度（沿地面），每 5 格标数字
              for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
                const major = Math.abs(x % (step * 5)) < 1e-6
                if (Math.abs(x) < 1e-6) continue
                els.push(<line key={`axt${x}`} x1={x} y1={H - tick} x2={x} y2={H} stroke="var(--ink)" strokeWidth={1.2 / s2} opacity={major ? 0.9 : 0.5} />)
                if (major) els.push(<text key={`axl${x}`} x={x} y={H + lab + fs * 0.4} fontSize={fs} textAnchor="middle" fill="var(--muted, #889)">{fmt(x)}</text>)
              }
              // y 轴刻度（x=0，向上为正：标注离地高度 H-y）
              for (let y = Math.ceil(y0 / step) * step; y <= Math.min(y1, H); y += step) {
                const h = H - y
                const major = Math.abs(h % (step * 5)) < 1e-6
                if (Math.abs(h) < 1e-6) continue
                els.push(<line key={`ayt${y}`} x1={0} y1={y} x2={tick} y2={y} stroke="var(--ink)" strokeWidth={1.2 / s2} opacity={major ? 0.9 : 0.5} />)
                if (major) els.push(<text key={`ayl${y}`} x={-lab} y={y + fs * 0.35} fontSize={fs} textAnchor="end" fill="var(--muted, #889)">{fmt(h)}</text>)
              }
              // 轴线 + 箭头 + 轴名
              const ah = 0.45, aw = 0.18
              els.push(<line key="axX" x1={x0} y1={H} x2={x1} y2={H} stroke="var(--ink)" strokeWidth={2.5 / s2} opacity={0.85} />)
              els.push(<polygon key="axXh" points={`${x1},${H} ${x1 - ah},${H - aw} ${x1 - ah},${H + aw}`} fill="var(--ink)" opacity={0.85} />)
              els.push(<text key="axXn" x={x1 - 0.3} y={H - 0.5} fontSize={fs * 1.1} textAnchor="end" fill="var(--ink)" opacity={0.85}>x/m</text>)
              els.push(<line key="axY" x1={0} y1={Math.min(y1, H + 2)} x2={0} y2={y0} stroke="var(--ink)" strokeWidth={2.5 / s2} opacity={0.85} />)
              els.push(<polygon key="axYh" points={`0,${y0} ${-aw},${y0 + ah} ${aw},${y0 + ah}`} fill="var(--ink)" opacity={0.85} />)
              els.push(<text key="axYn" x={0.5} y={y0 + fs * 1.2} fontSize={fs * 1.1} fill="var(--ink)" opacity={0.85}>y/m</text>)
              els.push(<text key="axO" x={-lab} y={H + lab + fs * 0.4} fontSize={fs} textAnchor="end" fill="var(--muted, #889)">0</text>)
              return els
            })()}
            {s.ground && !s.unlimited && (() => {
              // 地面开启：封闭场地——地下阴影区 + 左右墙线（墙是真实存在的碰撞体，必须看得见）
              const s2 = view.scale
              const x0 = -view.tx / s2, x1 = (vp.w - view.tx) / s2
              const y0 = -view.ty / s2, y1 = (vp.h - view.ty) / s2
              return (
                <>
                  <rect x={x0} y={H} width={Math.max(0, x1 - x0)} height={Math.max(0, y1 - H)} fill="var(--grid-dot)" opacity={0.5} />
                  <line x1={0} y1={Math.min(y0, H)} x2={0} y2={H} stroke="var(--ink)" strokeWidth={2 / view.scale} opacity={0.5} />
                  <line x1={W} y1={Math.min(y0, H)} x2={W} y2={H} stroke="var(--ink)" strokeWidth={2 / view.scale} opacity={0.5} />
                </>
              )
            })()}
            {s.ground && <line x1={-1000} y1={H} x2={W + 1000} y2={H} stroke="var(--ink)" strokeWidth={3 / view.scale} />}
            {/* 静态体 */}
            {s.statics.map((sh) => {
              const pts = sh.kind === 'seg'
                ? (() => { const ep = segEndpoints(sh); return [[ep.ax, ep.ay], [ep.bx, ep.by]] })()
                : arcPoints(sh).map((q) => [q.x, q.y])
              const d = pts.map(([x, y]) => `${x},${y}`).join(' ')
              const isSel = s.sel?.type === 'static' && s.sel.id === sh.id
              return <polyline key={sh.id} points={d} fill="none" stroke={isSel ? 'var(--accent-soft, #5e6ad2)' : 'var(--ink)'} strokeWidth={(isSel ? 4 : 2.5) / view.scale} strokeLinejoin="round" strokeLinecap="round" />
            })}
            {s.trails && s.balls.map((b) => {
              const arr = trailRef.current.get(b.id) ?? []
              return <polyline key={`t${b.id}`} points={arr.join(' ')} fill="none" stroke={BALL_COLORS[(b.id - 1) % BALL_COLORS.length]} strokeWidth={1 / view.scale} opacity={0.4} />
            })}
            {s.balls.map((b) => {
              const isSel = s.sel?.type === 'ball' && s.sel.id === b.id
              return <circle key={b.id} cx={b.x} cy={b.y} r={b.r} fill={BALL_COLORS[(b.id - 1) % BALL_COLORS.length]} stroke={isSel ? 'var(--accent-soft, #5e6ad2)' : 'none'} strokeWidth={0.15} opacity={0.9} />
            })}
            {s.blocks.map((k) => {
              const isSel = s.sel?.type === 'block' && s.sel.id === k.id
              return (
                <rect key={k.id} x={k.x - k.hw} y={k.y - k.hh} width={k.hw * 2} height={k.hh * 2} rx={0.2}
                  fill={BLOCK_COLOR} opacity={0.92} stroke={isSel ? 'var(--accent-soft, #5e6ad2)' : 'none'} strokeWidth={0.18} />
              )
            })}
            {/* 选中物体的恒力箭头（青色，4px/N；速度/加速度箭头颜色与之区分） */}
            {(() => {
              const body = selBall ?? selBlock
              if (!body) return null
              const fx = body.fx ?? 0, fy = body.fy ?? 0
              const fm = Math.hypot(fx, fy)
              if (fm < 0.5) return null
              const px = PX_PER_N / view.scale
              const tx2 = body.x + fx * px, ty2 = body.y + fy * px
              const ang = Math.atan2(fy, fx)
              const L = 10 / view.scale
              const a1 = ang + Math.PI - 0.42, a2 = ang + Math.PI + 0.42
              return (
                <g key="force">
                  <line x1={body.x} y1={body.y} x2={tx2} y2={ty2} stroke="#4ad2e0" strokeWidth={2.5 / view.scale} />
                  <polygon points={`${tx2},${ty2} ${tx2 + L * Math.cos(a1)},${ty2 + L * Math.sin(a1)} ${tx2 + L * Math.cos(a2)},${ty2 + L * Math.sin(a2)}`} fill="#4ad2e0" />
                  <text x={tx2} y={ty2 - 0.5} fontSize={12 / view.scale} fill="#4ad2e0" textAnchor="middle">F={fm.toFixed(0)}N</text>
                </g>
              )
            })()}
            {/* 选中球的速度/加速度矢量（含正交分量分解，屏幕定长像素比例） */}
            {selBall && (() => {
              const b = selBall
              const px = 18 / view.scale // 每像素→世界换算：18px ≙ 1 m/s / 1 m/s²
              const els: React.ReactElement[] = []
              const arrow = (x: number, y: number, ux: number, uy: number, color: string, key: string) => {
                const L = 10 / view.scale
                const ang = Math.atan2(uy, ux)
                const a1 = ang + Math.PI - 0.42, a2 = ang + Math.PI + 0.42
                els.push(<polygon key={key} points={`${x},${y} ${x + L * Math.cos(a1)},${y + L * Math.sin(a1)} ${x + L * Math.cos(a2)},${y + L * Math.sin(a2)}`} fill={color} />)
              }
              const vec = (dx: number, dy: number, color: string, key: string, w = 2, dash?: string, op = 1) => (
                <line key={key} x1={b.x} y1={b.y} x2={b.x + dx} y2={b.y + dy} stroke={color} strokeWidth={w / view.scale} strokeDasharray={dash} opacity={op} />
              )
              const sp = Math.hypot(b.vx, b.vy)
              if (sp > 0.05) {
                els.push(vec(b.vx * px, 0, '#e0b34e', 'vx', 1.5, `${0.25} ${0.18}`, 0.85))
                els.push(vec(0, b.vy * px, '#e0b34e', 'vy', 1.5, `${0.25} ${0.18}`, 0.85))
                els.push(vec(b.vx * px, b.vy * px, '#5ee6c8', 'v'))
                arrow(b.x + b.vx * px, b.y + b.vy * px, b.vx, b.vy, '#5ee6c8', 'va')
                // 箭头尖端隐形把手：按住拖动直接改速度
                els.push(<circle key="vh" cx={b.x + b.vx * px} cy={b.y + b.vy * px} r={14 / view.scale} fill="transparent" style={{ cursor: 'grab' }}><title>拖动此箭头改变初速度</title></circle>)
              }
              const a = s.running ? accelRef.current.get(b.id) : (s.gOn ? { ax: 0, ay: s.g } : undefined)
              if (a) {
                const am = Math.hypot(a.ax, a.ay)
                if (am > 0.3) {
                  els.push(vec(a.ax * px, 0, '#e08a97', 'ax', 1.5, `${0.25} ${0.18}`, 0.85))
                  els.push(vec(0, a.ay * px, '#e08a97', 'ay', 1.5, `${0.25} ${0.18}`, 0.85))
                  els.push(vec(a.ax * px, a.ay * px, '#e08a97', 'a'))
                  arrow(b.x + a.ax * px, b.y + a.ay * px, a.ax, a.ay, '#e08a97', 'aa')
                  els.push(<circle key="at" cx={b.x + a.ax * px} cy={b.y + a.ay * px} r={12 / view.scale} fill="transparent"><title>加速度由受力（重力/碰撞）实时决定，不可直接拖拽</title></circle>)
                }
              }
              els.push(<text key="vt" x={b.x} y={b.y - 0.6} fontSize={12 / view.scale} fill="#5ee6c8" textAnchor="middle">v={sp.toFixed(1)}m/s</text>)
              return els
            })()}
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
