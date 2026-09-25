import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, STORAGE_KEY } from './store'
import { solve } from './solver/mna'
import { terminalPos, terminalsOf, TERMINAL_OFFSET, type Comp, type CompKind } from './solver/types'
import { THEME as T } from './theme'

const W = 1600
const H = 900

const KIND_NAME: Record<CompKind, string> = {
  battery: '电源',
  resistor: '定值电阻',
  bulb: '小灯泡',
  switch: '开关',
  rheostat: '滑动变阻器',
}

function useCursorPos(svgRef: React.RefObject<SVGSVGElement | null>) {
  return (e: React.PointerEvent | React.MouseEvent) => {
    const svg = svgRef.current!
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    // 精确逆变换：自动处理 letterbox 与缩放，不会错位
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }
}

/** 元件符号渲染（IEC 风格，中心对齐） */
function CompSymbol({ c, selected, solved, onPointerDown, onContextMenu }: {
  c: Comp
  selected: boolean
  solved?: { current: number; power: number; dv: number }
  onPointerDown: (e: React.PointerEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const d = TERMINAL_OFFSET[c.kind]
  const stroke = selected ? T.inkSelected : T.ink
  const body = (
    <>
      {c.kind === 'battery' && (
        <>
          <line x1={-6} y1={-18} x2={-6} y2={18} stroke={stroke} strokeWidth={3} />
          <line x1={6} y1={-10} x2={6} y2={10} stroke={stroke} strokeWidth={6} />
        </>
      )}
      {c.kind === 'resistor' && (
        <rect x={-20} y={-9} width={40} height={18} fill="none" stroke={stroke} strokeWidth={2.5} rx={2} />
      )}
      {c.kind === 'bulb' && (() => {
        const lit = !!solved && solved.power > 0.05
        const ratio = lit ? Math.min(solved!.power / c.ratedP, 1.5) : 0
        const alpha = lit ? Math.min(0.3 + ratio * 0.6, 0.95) : 0
        // 始终渲染，亮度变化走 CSS transition → 灯光"缓缓亮起/熄灭"
        return (
          <>
            <circle r={26} style={{ fill: T.bulb.halo(alpha), transition: 'fill 0.45s' }} />
            <circle
              r={16}
              style={{ fill: lit ? T.bulb.body(alpha) : 'rgba(255,200,90,0)', transition: 'fill 0.45s' }}
              stroke={lit ? T.bulb.rim : stroke}
              strokeWidth={2.5}
            />
            <line x1={-11} y1={-11} x2={11} y2={11} stroke={lit ? T.bulb.filament : stroke} strokeWidth={1.8} />
            <line x1={-11} y1={11} x2={11} y2={-11} stroke={lit ? T.bulb.filament : stroke} strokeWidth={1.8} />
          </>
        )
      })()}
      {c.kind === 'switch' && (
        <>
          <circle cx={-14} cy={0} r={3} fill={stroke} />
          <circle cx={14} cy={0} r={3} fill={stroke} />
          {c.closed ? (
            <line x1={-14} y1={0} x2={14} y2={0} stroke={stroke} strokeWidth={2.5} />
          ) : (
            <line x1={-14} y1={0} x2={10} y2={-14} stroke={stroke} strokeWidth={2.5} />
          )}
        </>
      )}
      {c.kind === 'rheostat' && (c.expanded ? (() => {
        // 展开态：上=金属杆（c/d 端子），下=电阻丝（a/b 端子），滑片 P 随 pos 移动
        const bx = -20 + 40 * c.pos
        return (
          <>
            <line x1={-20} y1={0} x2={-32} y2={0} stroke={stroke} strokeWidth={2} />
            <line x1={20} y1={0} x2={32} y2={0} stroke={stroke} strokeWidth={2} />
            <rect x={-20} y={-8} width={40} height={16} fill="none" stroke={stroke} strokeWidth={2.5} rx={2} />
            <line x1={-32} y1={-24} x2={32} y2={-24} stroke={stroke} strokeWidth={3.5} strokeLinecap="round" />
            <line x1={bx} y1={-24} x2={bx} y2={-8} stroke={stroke} strokeWidth={2} />
            <polygon points={`${bx},-5 ${bx - 4.5},-13 ${bx + 4.5},-13`} fill={stroke} />
          </>
        )
      })() : (() => {
        // 紧凑态：等效"一上一下"——电阻符号 + 45° 滑片箭头
        return (
          <>
            <rect x={-20} y={-9} width={40} height={18} fill="none" stroke={stroke} strokeWidth={2.5} rx={2} />
            <line x1={-26} y1={20} x2={12} y2={-18} stroke={stroke} strokeWidth={2} />
            <polygon points="17,-21 6,-17 13,-9" fill={stroke} />
          </>
        )
      })())}
    </>
  )
  const label =
    c.kind === 'battery' ? `${c.emf}V · r=${c.r}Ω`
    : c.kind === 'resistor' ? `${c.r}Ω`
    : c.kind === 'bulb' ? `${c.ratedP}W`
    : c.kind === 'rheostat' ? (c.expanded ? `P ${Math.round(c.pos * 100)}% · ${c.Rmax}Ω` : `${(c.pos * c.Rmax).toFixed(1)}Ω`)
    : c.closed ? '闭合' : '断开'
  const readout =
    solved && solved.current > 1e-6
      ? `I=${solved.current.toFixed(3)}A · P=${solved.power.toFixed(2)}W`
      : solved ? '无电流' : ''
  return (
    <g transform={`translate(${c.x} ${c.y}) rotate(${c.rot})`}>
      <g className="pop-in symbol" onPointerDown={onPointerDown} onContextMenu={onContextMenu} style={{ cursor: 'grab' }}>
        <rect x={-d} y={-26} width={d * 2} height={52} fill="transparent" />
        {c.rot === 0 && body}
        {c.rot === 90 && <g transform="rotate(90)">{body}</g>}
      </g>
      <text x={0} y={c.kind === 'bulb' ? 34 : 30} fill={T.label} fontSize={11} textAnchor="middle">{label}</text>
      {readout && (
        <text x={0} y={c.kind === 'bulb' ? 48 : 44} fill={selected ? T.accentSoft : T.readout} fontSize={11} textAnchor="middle">
          {readout}
        </text>
      )}
    </g>
  )
}

export default function App() {
  const s = useEditor()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const toCanvas = useCursorPos(svgRef)
  const [dragging, setDragging] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const [hoverTerm, setHoverTerm] = useState<string | null>(null)
  const [grabbedEnd, setGrabbedEnd] = useState<{ otherTerm: string } | null>(null)
  // 预览线端点用局部 state：只在连线中更新，平时鼠标划过不触发重渲染
  const [mouse, setMouse] = useState({ x: 0, y: 0 })

  const result = useMemo(() => solve({ comps: s.comps, wires: s.wires }), [s.comps, s.wires])

  // 持久化：电路一变就存
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ comps: s.comps, wires: s.wires }))
    } catch { /* 存储满就不管 */ }
  }, [s.comps, s.wires])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') s.cancelWire()
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.selectedWire) s.removeWire(s.selectedWire)
        else if (s.selectedId) s.remove(s.selectedId)
      }
      if (!s.selectedId) return
      if (e.key === 'r' || e.key === 'R') s.rotate(s.selectedId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [s])

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    const { x, y } = toCanvas(e)
    if (s.tool !== 'select') {
      s.place(s.tool, x, y)
      return
    }
    if (s.pendingFrom) {
      s.cancelWire()
      return
    }
    s.select(null)
    s.selectWire(null)
  }

  // 右键：连线中=取消；已选中的导线/元件=删除；空=取消选中
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (s.pendingFrom) {
      s.cancelWire()
      return
    }
    if (s.selectedWire) {
      s.removeWire(s.selectedWire)
      return
    }
    if (s.selectedId) {
      s.remove(s.selectedId)
      return
    }
    s.select(null)
    s.selectWire(null)
  }

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    const { x, y } = toCanvas(e)
    if (dragging) {
      s.moveComp(dragging.id, x - dragging.dx, y - dragging.dy)
      return
    }
    if (s.pendingFrom) {
      setMouse({ x, y }) // 只有连线预览需要逐帧位置
      let best: string | null = null
      let bestD = 18
      for (const c of s.comps) {
        for (const t of ['a', 'b'] as const) {
          const p = terminalPos(c, t)
          const d = Math.hypot(p.x - x, p.y - y)
          if (d < bestD) { bestD = d; best = `${c.id}:${t}` }
        }
      }
      setHoverTerm(best) // 只会指向现存元件的端子
    } else if (hoverTerm && !s.comps.some((c) => c.id === hoverTerm.split(':')[0])) {
      setHoverTerm(null) // 悬停的端子所属元件已被删除 → 清除
    }
  }

  const onTerminalClick = (e: React.PointerEvent, term: string) => {
    e.stopPropagation()
    if (!s.pendingFrom) s.startWire(term)
    else s.completeWire(term)
  }

  const onCompBodyPointerDown = (e: React.PointerEvent, c: Comp) => {
    e.stopPropagation()
    if (s.pendingFrom || s.tool !== 'select') return
    const { x, y } = toCanvas(e)
    // 捕获指针：拖拽中鼠标甩出画布/快速移动也不丢事件
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging({ id: c.id, dx: x - c.x, dy: y - c.y })
    s.select(c.id)
  }

  const release = () => {
    setDragging(null)
    // 抓取导线端点后松手：落在端子上=改接，落在空白=该导线已被删除（保持待连状态）
    if (grabbedEnd) {
      if (hoverTerm) s.completeWire(hoverTerm)
      setGrabbedEnd(null)
    }
  }

  const palette: { kind: CompKind; label: string }[] = [
    { kind: 'battery', label: '电源' },
    { kind: 'resistor', label: '定值电阻' },
    { kind: 'rheostat', label: '滑动变阻器' },
    { kind: 'bulb', label: '小灯泡' },
    { kind: 'switch', label: '开关' },
  ]

  const selected = s.comps.find((c) => c.id === s.selectedId) ?? null
  const selResult = s.selectedId ? result.byComp[s.selectedId] : undefined
  // 收起保护：展开态滑动变阻器的 c/d 上是否还挂着导线
  const collapseBlocked = !!selected && selected.kind === 'rheostat' && selected.expanded &&
    s.wires.some((w) => [w.a, w.b].includes(`${selected.id}:c`) || [w.a, w.b].includes(`${selected.id}:d`))

  return (
    <div className="app">
      <aside className="palette">
        <h1>电路实验台</h1>
        <p className="hint">点击元件后在画布点击放置</p>
        {palette.map((p) => (
          <button
            key={p.kind}
            className={s.tool === p.kind ? 'active' : ''}
            onClick={() => s.setTool(s.tool === p.kind ? 'select' : p.kind)}
          >
            {p.label}
          </button>
        ))}
        <div className="divider" />
        <button onClick={s.loadDemo}>演示电路</button>
        <p className="tips">
          选中后：R 旋转 · Del 删除<br />
          点端子开始连线，点另一端完成<br />
          Esc 取消连线 · 双击开关通断
        </p>
      </aside>

      <main className="stage">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ cursor: dragging ? 'grabbing' : undefined }}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={release}
          onPointerCancel={release}
          onContextMenu={onContextMenu}
          onDoubleClick={() => {
            if (s.selectedId && s.comps.find((c) => c.id === s.selectedId)?.kind === 'switch')
              s.toggleSwitch(s.selectedId)
          }}
        >
          <defs>
            <pattern id="grid" width={25} height={25} patternUnits="userSpaceOnUse">
              <circle cx={1} cy={1} r={1} fill="var(--grid-dot)" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#grid)" />

          {s.wires.map((w) => {
            const [ca, ta] = [w.a.split(':')[0], w.a.split(':')[1] as 'a' | 'b']
            const [cb, tb] = [w.b.split(':')[0], w.b.split(':')[1] as 'a' | 'b']
            const A = s.comps.find((c) => c.id === ca)
            const B = s.comps.find((c) => c.id === cb)
            if (!A || !B) return null
            const p1 = terminalPos(A, ta)
            const p2 = terminalPos(B, tb)
            const wr = result.branches.find((b) => b.refId === w.id)
            const live = wr && wr.current > 0.001
            return (
              <g key={w.id}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={live ? T.wire.liveUnder : T.wire.idle} strokeWidth={T.wire.width} strokeLinecap="round" style={{ transition: 'stroke 0.3s' }} />
                {live && (
                  <line
                    x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                    stroke={T.wire.live} strokeWidth={T.wire.width} strokeLinecap="round" strokeDasharray="7 11"
                    className="current-flow"
                  />
                )}
                {/* 命中区：悬停显抓点，右键直接删除 */}
                <line
                  x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  stroke="transparent"
                  strokeWidth={16}
                  style={{ cursor: 'pointer' }}
                  onPointerEnter={() => s.selectWire(w.id)}
                  onPointerLeave={() => { if (s.selectedWire === w.id && !grabbedEnd) s.selectWire(null) }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    s.removeWire(w.id)
                  }}
                />
                {/* 悬停：两端改接抓点 */}
                {s.selectedWire === w.id && (() => {
                  return (
                    <g>
                      {([p1, p2] as const).map((p, i) => (
                        <circle
                          key={i}
                          cx={p.x} cy={p.y} r={7} fill={T.terminal.hot} stroke={T.terminal.rim} strokeWidth={2}
                          style={{ cursor: 'grab' }}
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            const other = i === 0 ? w.b : w.a
                            s.removeWire(w.id)
                            s.startWire(other)
                            setGrabbedEnd({ otherTerm: other })
                          }}
                        />
                      ))}
                    </g>
                  )
                })()}
              </g>
            )
          })}

          {s.pendingFrom && (() => {
            const [ca, ta] = [s.pendingFrom.split(':')[0], s.pendingFrom.split(':')[1] as 'a' | 'b']
            const A = s.comps.find((c) => c.id === ca)
            if (!A) return null
            const p1 = terminalPos(A, ta)
            let p2 = mouse
            if (hoverTerm) {
              const B = s.comps.find((c) => c.id === hoverTerm.split(':')[0])
              if (B) p2 = terminalPos(B, hoverTerm.split(':')[1] as 'a' | 'b')
            }
            return (
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={T.preview} strokeWidth={2} strokeDasharray="6 6" />
            )
          })()}

          {s.comps.map((c) => (
            <g key={c.id}>
              <CompSymbol
                c={c}
                selected={s.selectedId === c.id}
                solved={result.byComp[c.id]}
                onPointerDown={(e) => onCompBodyPointerDown(e, c)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (s.selectedId === c.id) s.remove(c.id)
                  else s.select(c.id)
                }}
              />
              {terminalsOf(c).map((t) => {
                const p = terminalPos(c, t)
                const term = `${c.id}:${t}`
                return (
                  <circle
                    key={t}
                    className="terminal"
                    cx={p.x} cy={p.y}
                    r={hoverTerm === term || s.pendingFrom === term ? 7 : 5}
                    fill={hoverTerm === term || s.pendingFrom === term ? T.terminal.hot : T.terminal.idle}
                    stroke={T.terminal.rim} strokeWidth={2}
                    style={{ cursor: 'crosshair' }}
                    onPointerDown={(e) => onTerminalClick(e, term)}
                  />
                )
              })}
            </g>
          ))}
        </svg>
      </main>

      <aside className="inspector">
        <h2>{selected ? KIND_NAME[selected.kind] : '未选中'}</h2>
        {selected && (
          <div className="params">
            {selected.kind === 'battery' && (
              <>
                <label>电动势 {selected.emf}V
                  <input type="range" min={1} max={24} step={0.5} value={selected.emf}
                    onChange={(e) => s.updateParam(selected.id, 'emf', +e.target.value)} />
                </label>
                <label>内阻 {selected.r}Ω
                  <input type="range" min={0.1} max={10} step={0.1} value={selected.r}
                    onChange={(e) => s.updateParam(selected.id, 'r', +e.target.value)} />
                </label>
              </>
            )}
            {selected.kind === 'resistor' && (
              <label>阻值 {selected.r}Ω
                <input type="number" min={0.5} max={1000} step={0.5} value={selected.r}
                  onChange={(e) => s.updateParam(selected.id, 'r', Math.max(0.5, +e.target.value || 0.5))} />
              </label>
            )}
            {selected.kind === 'bulb' && (
              <>
                <label>阻值 {selected.r}Ω
                  <input type="range" min={1} max={50} step={1} value={selected.r}
                    onChange={(e) => s.updateParam(selected.id, 'r', +e.target.value)} />
                </label>
                <label>额定功率 {selected.ratedP}W
                  <input type="range" min={0.5} max={10} step={0.1} value={selected.ratedP}
                    onChange={(e) => s.updateParam(selected.id, 'ratedP', +e.target.value)} />
                </label>
              </>
            )}
            {selected.kind === 'rheostat' && (
              <>
                <label>最大阻值 {selected.Rmax}Ω
                  <input type="range" min={1} max={50} step={1} value={selected.Rmax}
                    onChange={(e) => s.updateParam(selected.id, 'Rmax', +e.target.value)} />
                </label>
                <label>滑片位置 {Math.round(selected.pos * 100)}%（接入 {(selected.pos * selected.Rmax).toFixed(1)}Ω）
                  <input type="range" min={0} max={100} step={1} value={Math.round(selected.pos * 100)}
                    onChange={(e) => s.updateParam(selected.id, 'pos', +e.target.value / 100)} />
                </label>
                <button className="wide"
                  disabled={selected.expanded && collapseBlocked}
                  onClick={() => s.setExpanded(selected.id, !selected.expanded)}>
                  {selected.expanded ? '收起为两接线柱' : '展开为四接线柱'}
                </button>
                {selected.expanded && (
                  <p className="warn" style={{ margin: 0 }}>
                    {collapseBlocked
                      ? '⚠ 金属杆端子 c/d 上还接着导线，先删除才能收起'
                      : '四接线柱：a/b=下方电阻丝两端，c/d=上方金属杆。一上一下=变阻，两下=全阻值，两上=导线'}
                  </p>
                )}
              </>
            )}
            {selected.kind === 'switch' && (
              <button className="wide" onClick={() => s.toggleSwitch(selected.id)}>
                {selected.closed ? '断开开关' : '闭合开关'}
              </button>
            )}
            {selResult && (
              <div className="readout">
                <div>电压 {Math.abs(selResult.dv).toFixed(3)} V</div>
                <div>电流 {selResult.current.toFixed(3)} A</div>
                <div>功率 {selResult.power.toFixed(3)} W</div>
              </div>
            )}
            <button className="wide danger" onClick={() => s.remove(selected.id)}>删除元件</button>
          </div>
        )}
        {result.openCircuit && <p className="warn">⚠ 电路存在断路</p>}
      </aside>
    </div>
  )
}
