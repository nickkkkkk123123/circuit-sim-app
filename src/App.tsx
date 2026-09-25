import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, editorState, STORAGE_KEY } from './store'
import { solve } from './solver/mna'
import { terminalPos, terminalsOf, TERMINAL_OFFSET, METER_G_R, METER_G_IG, LED_I_FULL, type Comp, type CompKind } from './solver/types'
import { THEME as T } from './theme'

const W = 1600
const H = 900

/** 欧姆读数格式化：∞ / MΩ / kΩ / Ω */
function fmtOhm(r: number): string {
  if (r >= 1e7) return '∞'
  if (r >= 1e6) return (r / 1e6).toFixed(1) + 'MΩ'
  if (r >= 1000) return (r / 1000).toFixed(2) + 'kΩ'
  if (r >= 10) return r.toFixed(1) + 'Ω'
  return r.toFixed(2) + 'Ω'
}

const KIND_NAME: Record<CompKind, string> = {
  battery: '电源',
  resistor: '定值电阻',
  rheostat: '滑动变阻器',
  voltmeter: '电压表',
  ammeter: '电流表',
  galvanometer: '灵敏电流计',
  ohmmeter: '欧姆表',
  spdt: '单刀双掷开关',
  led: '发光二极管',
  bulb: '小灯泡',
  switch: '开关',
}

function useCursorPos(svgRef: React.RefObject<SVGSVGElement | null>, worldRef: React.RefObject<SVGGElement | null>) {
  return (e: React.PointerEvent | React.MouseEvent | WheelEvent) => {
    // 优先用世界坐标系容器（g）的 CTM——它包含缩放/平移变换；svg 自身的 CTM 只有 viewBox 映射
    const el = worldRef.current ?? svgRef.current
    const ctm = el?.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }
}

/** 元件符号渲染（IEC 风格，中心对齐） */
function CompSymbol({ c, selected, solved, ohmReading, rheoLabel, onPointerDown, onContextMenu, onSliderPointerDown, onSwitchPointerDown, onDialOpen }: {
  c: Comp
  selected: boolean
  solved?: { current: number; power: number; dv: number }
  onPointerDown: (e: React.PointerEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onSliderPointerDown?: (e: React.PointerEvent, c: Comp) => void
  onSwitchPointerDown?: (e: React.PointerEvent, c: Comp) => void
  onDialOpen?: (c: Comp) => void
  ohmReading?: number
  rheoLabel?: string
}) {
  const d = TERMINAL_OFFSET[c.kind]
  const stroke = selected ? T.inkSelected : T.ink
  const isMeter = c.kind === 'voltmeter' || c.kind === 'ammeter'
  const isVoltmeter = c.kind === 'voltmeter'
  const meterVal = isMeter ? Math.abs(isVoltmeter ? solved?.dv ?? 0 : solved?.current ?? 0) : 0
  const isGalvo = c.kind === 'galvanometer'
  const galvoI = isGalvo ? (solved?.dv ?? 0) / METER_G_R : 0 // 带符号电流（A），正 = a→b
  const galvoPegged = isGalvo && Math.abs(galvoI) > METER_G_IG
  const isOhm = c.kind === 'ohmmeter'
  const ohmR = isOhm ? (ohmReading ?? Infinity) : 0
  const isLed = c.kind === 'led'
  const ledLit = isLed && (solved?.current ?? 0) > 0.002
  const ledFrac = ledLit ? Math.min(1, (solved!.current ?? 0) / LED_I_FULL) : 0
  const hitHalf = isMeter && c.expanded && !c.ideal ? 52 : d
  const body = (
    <>
      {isMeter && c.expanded && !c.ideal && (() => {
        // 展开态：虚线框内画表头 G 与改装电阻的真实拓扑
        const frac = Math.max(0, Math.min(1, meterVal / c.range))
        const ang = (-135 + 270 * frac) * Math.PI / 180
        const gnx = Math.sin(ang) * 6
        const gny = -Math.cos(ang) * 6
        const gCx = isVoltmeter ? -26 : -24
        const gCy = isVoltmeter ? 0 : -12
        return (
          <>
            <rect x={-50} y={-26} width={100} height={52} fill="none" stroke="#55617e" strokeWidth={1.5} strokeDasharray="5 4" rx={6} />
            {/* 表头 G：小圆盘 + 迷你指针（偏转角与主表盘一致） */}
            <circle cx={gCx} cy={gCy} r={13} fill="#e9edf5" stroke={stroke} strokeWidth={2} />
            <line x1={gCx} y1={gCy} x2={gCx + gnx} y2={gCy + gny} stroke="#c0392b" strokeWidth={1.8} strokeLinecap="round" />
            <text x={gCx} y={gCy + 22} textAnchor="middle" fontSize={10} fill={T.label}>表头G</text>
            {isVoltmeter ? (
              <>
                {/* G 串联分压电阻：链条水平居中 */}
                <line x1={gCx + 13} y1={0} x2={4} y2={0} stroke={stroke} strokeWidth={2} />
                <rect x={4} y={-8} width={26} height={16} fill="none" stroke={stroke} strokeWidth={2} rx={2} />
                <line x1={30} y1={0} x2={48} y2={0} stroke={stroke} strokeWidth={2} />
                <text x={16} y={-13} textAnchor="middle" fontSize={10} fill={T.label}>分压电阻</text>
              </>
            ) : (
              <>
                {/* G 与分流电阻并联：两条支路上下对称、整体居中 */}
                <line x1={-48} y1={0} x2={-38} y2={0} stroke={stroke} strokeWidth={2} />
                <line x1={-38} y1={0} x2={-38} y2={gCy} stroke={stroke} strokeWidth={2} />
                <line x1={-38} y1={gCy} x2={gCx - 13} y2={gCy} stroke={stroke} strokeWidth={2} />
                <line x1={gCx + 13} y1={gCy} x2={38} y2={gCy} stroke={stroke} strokeWidth={2} />
                <line x1={38} y1={gCy} x2={38} y2={0} stroke={stroke} strokeWidth={2} />
                <line x1={-38} y1={0} x2={-38} y2={16} stroke={stroke} strokeWidth={2} />
                <line x1={-38} y1={16} x2={-14} y2={16} stroke={stroke} strokeWidth={2} />
                <rect x={-14} y={10} width={28} height={12} fill="none" stroke={stroke} strokeWidth={2} rx={2} />
                <line x1={14} y1={16} x2={38} y2={16} stroke={stroke} strokeWidth={2} />
                <line x1={38} y1={16} x2={38} y2={0} stroke={stroke} strokeWidth={2} />
                <text x={0} y={-18} textAnchor="middle" fontSize={10} fill={T.label}>表头G</text>
                <text x={0} y={26} textAnchor="middle" fontSize={10} fill={T.label}>分流电阻</text>
              </>
            )}
          </>
        )
      })()}
      {isOhm && (() => {
        // 欧姆表：经典 Ω 符号，读数上方显示（点击 → 非线性刻度表盘）
        return (
          <>
            <text
              x={0} y={-28} textAnchor="middle" fontSize={13} fontWeight={600}
              fill={ohmR < 1e7 ? T.readout : T.label}
              style={{ cursor: 'pointer' }}
              onPointerDown={(e) => { e.stopPropagation(); onDialOpen?.(c) }}
            >
              {fmtOhm(ohmR)}
              <title>点击查看表盘</title>
            </text>
            <circle r={20} fill="none" stroke={stroke} strokeWidth={2.5} />
            <text x={0} y={8} textAnchor="middle" fontSize={20} fontWeight={700} fill={stroke}>Ω</text>
          </>
        )
      })()}
      {c.kind === 'spdt' && (() => {
        // 单刀双掷（ON-OFF-ON）：公共端 a（下），杠杆掷向触点1/触点2/中位断开
        const lx = c.pos === 1 ? -18 : c.pos === 2 ? 18 : 0
        const ly = c.pos === 0 ? -16 : -14
        return (
          <>
            <line x1={0} y1={28} x2={0} y2={8} stroke={stroke} strokeWidth={2} />
            <line x1={0} y1={8} x2={lx} y2={ly} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={0} cy={8} r={3} fill={stroke} />
            <text x={-28} y={-28} fontSize={9} fill={T.label}>1</text>
            <text x={28} y={-28} fontSize={9} fill={T.label}>2</text>
            <rect
              x={-34} y={-26} width={68} height={62} fill="transparent"
              onPointerDown={(e) => { e.stopPropagation(); onSwitchPointerDown?.(e, c) }}
            />
          </>
        )
      })()}
      {isGalvo && (() => {
        // 灵敏电流计：中心零位，指针随电流方向左/右偏转（±50°，量程 ±1mA）
        const defl = Math.max(-1, Math.min(1, galvoI / METER_G_IG))
        const ang = (defl * 50 * Math.PI) / 180
        const nx = Math.sin(ang) * 13
        const ny = 2 - Math.cos(ang) * 13
        return (
          <>
            <text
              x={0} y={-28} textAnchor="middle" fontSize={13} fontWeight={600}
              fill={Math.abs(galvoI) > 1e-9 ? T.readout : T.label}
              style={{ cursor: 'pointer' }}
              onPointerDown={(e) => { e.stopPropagation(); onDialOpen?.(c) }}
            >
              {(galvoI * 1000).toFixed(2)}mA
              <title>点击查看表盘</title>
            </text>
            <circle r={20} fill="none" stroke={stroke} strokeWidth={2.5} />
            <line x1={0} y1={2} x2={nx} y2={2 + ny} stroke="#c0392b" strokeWidth={2} strokeLinecap="round" />
            <circle cx={0} cy={2} r={2} fill="#c0392b" />
            <text x={0} y={16} textAnchor="middle" fontSize={12} fontWeight={700} fill={stroke}>G</text>
            <text x={-13} y={-8} fontSize={9} fill={T.label}>−</text>
            <text x={13} y={-8} fontSize={9} fill={T.label}>+</text>
          </>
        )
      })()}
      {isLed && (() => {
        // 发光二极管：三角形+阴极bar（经典符号），正向导通时红色发光 + 外发光箭头
        const glow = Math.min(1, ledFrac * 1.2)
        return (
          <>
            {ledLit && <circle r={24} fill={`rgba(255,70,70,${0.15 + glow * 0.3})`} />}
            <polygon points="-10,-10 8,0 -10,10" fill={ledLit ? '#ff5b5b' : 'none'} stroke={stroke} strokeWidth={2} />
            <line x1={8} y1={-10} x2={8} y2={10} stroke={stroke} strokeWidth={2.5} />
            <line x1={-24} y1={0} x2={-10} y2={0} stroke={stroke} strokeWidth={2} />
            <line x1={8} y1={0} x2={24} y2={0} stroke={stroke} strokeWidth={2} />
            {/* 发光箭头：两道向右上的短线 */}
            <line x1={-4} y1={-14} x2={4} y2={-22} stroke={ledLit ? '#ff8a8a' : T.label} strokeWidth={1.5} strokeLinecap="round" />
            <polygon points={`${6},${-24} ${-1},${-21} ${2},${-15}`} fill={ledLit ? '#ff8a8a' : T.label} opacity={ledLit ? 1 : 0.5} />
            <line x1={4} y1={-8} x2={12} y2={-16} stroke={ledLit ? '#ff8a8a' : T.label} strokeWidth={1.5} strokeLinecap="round" />
            <polygon points={`${14},${-18} ${7},${-15} ${10},${-9}`} fill={ledLit ? '#ff8a8a' : T.label} opacity={ledLit ? 1 : 0.5} />
            <text x={-14} y={-12} fontSize={9} fill={T.label}>+</text>
            <text x={12} y={-12} fontSize={9} fill={T.label}>−</text>
          </>
        )
      })()}
      {isMeter && (!c.expanded || c.ideal) && (() => {
        // 经典电路图符号：圆 + V/A，测量值显示在符号上方（点击示数 → 表盘读数练习）
        return (
          <>
            <circle r={20} fill="none" stroke={stroke} strokeWidth={2.5} />
            <text x={0} y={8} textAnchor="middle" fontSize={20} fontWeight={700} fill={stroke}>{isVoltmeter ? 'V' : 'A'}</text>
            <text
              x={0} y={-28} textAnchor="middle" fontSize={13} fontWeight={600}
              fill={meterVal > 1e-9 ? T.readout : T.label}
              style={{ cursor: c.customRange ? 'default' : 'pointer' }}
              onPointerDown={(e) => { e.stopPropagation(); if (!c.customRange) onDialOpen?.(c) }}
            >
              {meterVal.toFixed(2)}{isVoltmeter ? 'V' : 'A'}
              {!c.customRange && <title>点击查看表盘</title>}
            </text>
          </>
        )
      })()}
      {c.kind === 'battery' && (c.expanded ? (
        // 展开态：虚线框内 E（电池符号）与 r（内阻）串联——"实际电源=理想电源+内阻"教学图示
        <>
          <rect x={-46} y={-26} width={92} height={52} fill="none" stroke="#55617e" strokeWidth={1.5} strokeDasharray="5 4" rx={6} />
          <line x1={-16} y1={-18} x2={-16} y2={18} stroke={stroke} strokeWidth={3} />
          <line x1={-6} y1={-10} x2={-6} y2={10} stroke={stroke} strokeWidth={6} />
          <line x1={-6} y1={0} x2={10} y2={0} stroke={stroke} strokeWidth={2} />
          <rect x={10} y={-7} width={18} height={14} fill="none" stroke={stroke} strokeWidth={2} rx={2} />
          <text x={1} y={-13} fill={T.label} fontSize={11}>E</text>
          <text x={17} y={-13} fill={T.label} fontSize={11}>r</text>
        </>
      ) : (
        <>
          <line x1={-6} y1={-18} x2={-6} y2={18} stroke={stroke} strokeWidth={3} />
          <line x1={6} y1={-10} x2={6} y2={10} stroke={stroke} strokeWidth={6} />
        </>
      ))}
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
        // 展开态：上=金属杆（c/d 端子），下=电阻丝（a/b 端子），滑片 P 随 pos 移动（可拖）
        const bx = -20 + 40 * c.pos
        return (
          <>
            <line x1={-20} y1={0} x2={-32} y2={0} stroke={stroke} strokeWidth={2} />
            <line x1={20} y1={0} x2={32} y2={0} stroke={stroke} strokeWidth={2} />
            <rect x={-20} y={-8} width={40} height={16} fill="none" stroke={stroke} strokeWidth={2.5} rx={2} />
            <line x1={-32} y1={-24} x2={32} y2={-24} stroke={stroke} strokeWidth={3.5} strokeLinecap="round" />
            <line x1={bx} y1={-24} x2={bx} y2={-8} stroke={stroke} strokeWidth={2} />
            <polygon points={`${bx},-5 ${bx - 4.5},-13 ${bx + 4.5},-13`} fill={stroke} />
            <text x={bx + 9} y={-14} fill={T.label} fontSize={12}>P</text>
            <rect
              x={bx - 10} y={-30} width={20} height={26} fill="transparent"
              style={{ cursor: c.rot === 90 ? 'ns-resize' : 'ew-resize' }}
              onPointerDown={(e) => { e.stopPropagation(); onSliderPointerDown?.(e, c) }}
            />
          </>
        )
      })() : (() => {
        // 紧凑态：教材符号——竖直箭头从上方压在电阻上，P 随 pos 移动（可拖）
        const bx = -20 + 40 * c.pos
        return (
          <>
            <line x1={-32} y1={0} x2={-20} y2={0} stroke={stroke} strokeWidth={2} />
            <line x1={20} y1={0} x2={32} y2={0} stroke={stroke} strokeWidth={2} />
            <rect x={-20} y={-9} width={40} height={18} fill="none" stroke={stroke} strokeWidth={2.5} rx={2} />
            <line x1={bx} y1={-32} x2={bx} y2={-13} stroke={stroke} strokeWidth={2} />
            <polygon points={`${bx},-10 ${bx - 4.5},-18 ${bx + 4.5},-18`} fill={stroke} />
            <text x={bx + 8} y={-24} fill={T.label} fontSize={12}>P</text>
            <rect
              x={bx - 10} y={-38} width={20} height={30} fill="transparent"
              style={{ cursor: c.rot === 90 ? 'ns-resize' : 'ew-resize' }}
              onPointerDown={(e) => { e.stopPropagation(); onSliderPointerDown?.(e, c) }}
            />
          </>
        )
      })())}
    </>
  )
  const label =
    c.kind === 'battery' ? `${c.emf}V · r=${c.r}Ω`
    : c.kind === 'resistor' ? `${c.r}Ω`
    : c.kind === 'bulb' ? `${c.ratedP}W`
    : isMeter ? `${c.ideal ? '理想' : '实际①'} · 量程 ${c.range}${isVoltmeter ? 'V' : 'A'}`
    : isLed ? (ledLit ? `${((solved?.current ?? 0) * 1000).toFixed(0)}mA · 发光` : '反向或未导通')
    : isOhm ? '断电测电阻'
    : isGalvo ? `${(Math.abs(galvoI) * 1000).toFixed(1)}mA${galvoPegged ? ' ⚠超量程' : ''}`
    : c.kind === 'spdt' ? (c.pos === 0 ? '断开（中位）' : `公共端接 触点${c.pos}`)
    : c.kind === 'rheostat' ? (c.expanded
        ? `P ${Math.round(c.pos * 100)}% · Rmax ${c.Rmax}Ω`
        : rheoLabel ?? `P ${Math.round(c.pos * 100)}% · Rmax ${c.Rmax}Ω`)
    : c.closed ? '闭合' : '断开'
  const readout =
    !isMeter && !isGalvo && !isOhm && !isLed && solved && solved.current > 1e-6
      ? `I=${solved.current.toFixed(3)}A · P=${solved.power.toFixed(2)}W`
      : solved && !isMeter && !isGalvo && !isOhm && !isLed ? '无电流' : ''
  return (
    <g transform={`translate(${c.x} ${c.y}) rotate(${c.rot})`}>
      <g className="pop-in symbol" onPointerDown={onPointerDown} onContextMenu={onContextMenu} style={{ cursor: 'grab' }}>
        {/* 命中热区：开关额外放大（可双击通断），电池展开态随虚线框加宽 */}
        <rect
          x={c.kind === 'battery' && c.expanded ? -48 : -hitHalf}
          y={-28}
          width={c.kind === 'battery' && c.expanded ? 96 : hitHalf * 2}
          height={56}
          fill="transparent"
        />
        {c.kind === 'switch' && (
          // 单击通断（按下/松手位移 <6px 判定）；拖远=移动元件。不用 onClick：指针捕获会重定向 click 导致失灵
          <rect
            x={-40} y={-30} width={80} height={60} fill="transparent"
            onPointerDown={(e) => { e.stopPropagation(); onSwitchPointerDown?.(e, c) }}
          />
        )}
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
  const gRef = useRef<SVGGElement | null>(null)
  const toCanvas = useCursorPos(svgRef, gRef)
  const [dragging, setDragging] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const [sliderDrag, setSliderDrag] = useState<{ id: string } | null>(null)
  const [switchPress, setSwitchPress] = useState<{ id: string; x0: number; y0: number; dx: number; dy: number; moved: boolean } | null>(null)
  const [hoverTerm, setHoverTerm] = useState<string | null>(null)
  const [grabbedEnd, setGrabbedEnd] = useState<{ otherTerm: string } | null>(null)
  const lastTermAction = useRef<{ term: string; ts: number } | null>(null)
  const [dialFor, setDialFor] = useState<string | null>(null) // 表盘读数练习弹窗（元件 id）
  // 画布视图：滚轮缩放（以光标为中心）+ 空白处拖动平移，按 0 复位
  const [view, setViewState] = useState({ scale: 1, tx: 0, ty: 0 })
  const viewRef = useRef(view)
  const applyView = (v: { scale: number; tx: number; ty: number }) => {
    viewRef.current = v
    setViewState(v)
  }
  useEffect(() => {
    const el = gRef.current ?? svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const st = viewRef.current
      const ctm = el.getScreenCTM()
      if (!ctm) return
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const scale = Math.min(3, Math.max(0.4, st.scale * factor))
      const k = scale / st.scale
      applyView({ scale, tx: p.x - (p.x - st.tx) * k, ty: p.y - (p.y - st.ty) * k })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
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
      if (e.key === '0') applyView({ scale: 1, tx: 0, ty: 0 })
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

  const [pan, setPan] = useState<{ sx: number; sy: number; tx0: number; ty0: number; active: boolean } | null>(null)

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
    // 空白处按下：进入平移待定（拖动超 6px 才算平移，原地点击=取消选中）
    // 起点必须存屏幕坐标——世界坐标随平移自身变化，用它算增量会自激振荡（画布重影）
    setPan({ sx: e.clientX, sy: e.clientY, tx0: viewRef.current.tx, ty0: viewRef.current.ty, active: false })
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
    if (pan) {
      // 平移画布：增量在屏幕像素空间计算，只除 svg 线性系数（k）——
      // 1:1 跟手的关键：dtx = D/k，与视图缩放无关（多除一次 scale 就是现在的变速 bug）
      if (pan.active || Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) > 6) {
        if (!pan.active) setPan({ ...pan, active: true })
        const ctmSvg = svgRef.current?.getScreenCTM()
        const k = ctmSvg?.a ?? 1
        const worldDx = (e.clientX - pan.sx) / k
        const worldDy = (e.clientY - pan.sy) / k
        applyView({ scale: viewRef.current.scale, tx: pan.tx0 + worldDx, ty: pan.ty0 + worldDy })
      }
      return
    }
    if (sliderDrag) {
      // 拖滑片：光标位置映射回滑片轴（横放按 x，竖放按 y）
      const c = s.comps.find((k) => k.id === sliderDrag.id)
      if (c && c.kind === 'rheostat') {
        const raw = c.rot === 90 ? (y - c.y + 20) / 40 : (x - c.x + 20) / 40
        s.updateParam(c.id, 'pos', Math.min(1, Math.max(0, raw)))
      }
      return
    }
    if (switchPress) {
      // 开关：拖远（>6px）转为移动元件
      const dist = Math.hypot(x - switchPress.x0, y - switchPress.y0)
      if (dist > 6 || switchPress.moved) {
        s.moveComp(switchPress.id, x - switchPress.dx, y - switchPress.dy)
        if (!switchPress.moved) setSwitchPress({ ...switchPress, moved: true })
      }
      return
    }
    if (dragging) {
      s.moveComp(dragging.id, x - dragging.dx, y - dragging.dy)
      return
    }
    if (s.pendingFrom) {
      setMouse({ x, y }) // 只有连线预览需要逐帧位置
      const best = snapTerm(x, y)
      setHoverTerm(best) // 只会指向现存元件的端子
    } else {
      // 未在连线中：端子高亮跟随光标实际吸附位置——连完线离开后绿色熄灭，不会长亮
      const near = snapTerm(x, y)
      if (near !== hoverTerm) setHoverTerm(near)
    }
  }

  // 事件坐标 → 最近端子（吸附半径 18px）。事件时刻现场计算，不依赖渲染闭包
  const snapTerm = (x: number, y: number): string | null => {
    let best: string | null = null
    let bestD = 18
    for (const c of editorState().comps) {
      for (const t of terminalsOf(c)) {
        const p = terminalPos(c, t)
        const dd = Math.hypot(p.x - x, p.y - y)
        if (dd < bestD) { bestD = dd; best = `${c.id}:${t}` }
      }
    }
    return best
  }

  const onTerminalClick = (e: React.PointerEvent, term: string) => {
    // 防抖：鼠标按键抖动会把一次点击注册成两次 pointerdown——
    // 在起点上表现为"开始即取消"，在终点上表现为"完成后立刻触发新连线"
    const now = Date.now()
    if (lastTermAction.current && lastTermAction.current.term === term && now - lastTermAction.current.ts < 400) return
    lastTermAction.current = { term, ts: now }
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

  // 滑片拖拽：捕获指针 + 选中该元件，后续 move 在 onCanvasPointerMove 里映射 pos
  const onSliderPointerDown = (e: React.PointerEvent, c: Comp) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setSliderDrag({ id: c.id })
    s.select(c.id)
  }

  // 开关：按下记原点，松手位移 <6px = 翻转通断，拖远 = 移动元件（与拖拽同款手感）
  const onSwitchPointerDown = (e: React.PointerEvent, c: Comp) => {
    if (s.pendingFrom || s.tool !== 'select') return
    const { x, y } = toCanvas(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    setSwitchPress({ id: c.id, x0: x, y0: y, dx: x - c.x, dy: y - c.y, moved: false })
    s.select(c.id)
  }

  const release = (e?: React.PointerEvent) => {
    setDragging(null)
    setSliderDrag(null)
    // 平移结束：未拖动=维持原"取消选中"语义
    if (pan) {
      setPan(null)
      return
    }
    // 开关/单刀双掷：没拖远 = 切换（开关翻转通断，SPDT 掷向另一触点）
    if (switchPress) {
      if (!switchPress.moved) {
        const c = editorState().comps.find((k) => k.id === switchPress.id)
        if (c?.kind === 'switch') s.toggleSwitch(c.id)
        if (c?.kind === 'spdt') s.updateParam(c.id, 'pos', c.pos === 1 ? 2 : c.pos === 2 ? 0 : 1)
      }
      setSwitchPress(null)
      return
    }
    // 连线完成一律以"事件时刻的 store 状态 + 事件坐标现场吸附"为准——
    // 渲染闭包里的 pendingFrom/hoverTerm 可能是过期的（快速连点时会撞出幽灵连线）
    const st = editorState()
    if (st.pendingFrom && e) {
      const { x, y } = toCanvas(e)
      const term = snapTerm(x, y)
      if (term && term !== st.pendingFrom) st.completeWire(term)
      return
    }
    // 抓取导线端点后松手：落在端子上=改接，落在空白=该导线已被删除（保持待连状态）
    if (grabbedEnd) {
      if (e) {
        const p = toCanvas(e)
        const term = snapTerm(p.x, p.y)
        if (term) editorState().completeWire(term)
      }
      setGrabbedEnd(null)
    }
  }

  const palette: { kind: CompKind; label: string }[] = [
    { kind: 'battery', label: '电源' },
    { kind: 'resistor', label: '定值电阻' },
    { kind: 'rheostat', label: '滑动变阻器' },
    { kind: 'voltmeter', label: '电压表' },
    { kind: 'ammeter', label: '电流表' },
    { kind: 'galvanometer', label: '灵敏电流计' },
    { kind: 'ohmmeter', label: '欧姆表' },
    { kind: 'spdt', label: '单刀双掷' },
    { kind: 'led', label: '发光二极管' },
    { kind: 'bulb', label: '小灯泡' },
    { kind: 'switch', label: '开关' },
  ]

  const selected = s.comps.find((c) => c.id === s.selectedId) ?? null
  const selResult = s.selectedId ? result.byComp[s.selectedId] : undefined

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
          按住端子拖到另一端松手即连线<br />
          （或点两个端子）· Esc 取消连线<br />
          单击开关通断 · R 旋转 · Del 删除<br />
          变阻器：拖箭头调阻值 · 选中可展开<br />
          电源：选中可展开 E+r 内部结构
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
        >
          <defs>
            <pattern id="grid" width={25} height={25} patternUnits="userSpaceOnUse">
              <circle cx={1} cy={1} r={1} fill="var(--grid-dot)" />
            </pattern>
          </defs>
          <g ref={gRef} transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
          <rect x={-W} y={-H} width={W * 3} height={H * 3} fill="url(#grid)" />

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

          {s.comps.map((c) => {
            // 紧凑态变阻器：按实际接线显示有效接入阻值（接 a=左段，接 b=右段，都接=全阻值）
            let rheoLabel: string | undefined
            if (c.kind === 'rheostat' && !c.expanded) {
              const wa = s.wires.some((w) => w.a === `${c.id}:a` || w.b === `${c.id}:a`)
              const wb = s.wires.some((w) => w.a === `${c.id}:b` || w.b === `${c.id}:b`)
              const eff = wa && wb ? c.Rmax : wa ? c.pos * c.Rmax : wb ? (1 - c.pos) * c.Rmax : null
              rheoLabel = `P ${Math.round(c.pos * 100)}%` + (eff !== null ? ` · 接入 ${eff.toFixed(2)}Ω` : ` · Rmax ${c.Rmax}Ω`)
            }
            return (
            <g key={c.id}>
              <CompSymbol
                c={c}
                selected={s.selectedId === c.id}
                solved={result.byComp[c.id]}
                rheoLabel={rheoLabel}
                onPointerDown={(e) => onCompBodyPointerDown(e, c)}
                onSliderPointerDown={onSliderPointerDown}
                onSwitchPointerDown={onSwitchPointerDown}
                onDialOpen={(c) => setDialFor(c.id)}
                ohmReading={result.ohm?.[c.id]}
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
                const active = hoverTerm === term || s.pendingFrom === term
                return (
                  <g key={t}>
                    {/* 可见端子：渲染层不做事件靶（事件走下方放大热区） */}
                    <circle
                      className="terminal"
                      cx={p.x} cy={p.y}
                      r={active ? 7 : 5}
                      fill={active ? T.terminal.hot : T.terminal.idle}
                      stroke={T.terminal.rim} strokeWidth={2}
                      style={{ pointerEvents: 'none' }}
                    />
                    {/* 放大的透明热区：r=14，肉眼不可见但好点 */}
                    <circle
                      cx={p.x} cy={p.y} r={14} fill="transparent"
                      style={{ cursor: 'crosshair' }}
                      onPointerDown={(e) => onTerminalClick(e, term)}
                    />
                  </g>
                )
              })}
            </g>
          )
          })}
          </g>
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
                <label>内阻 {selected.r === 0 ? '0（理想电源）' : `${selected.r}Ω`}
                  <input type="range" min={0} max={10} step={0.1} value={selected.r}
                    onChange={(e) => s.updateParam(selected.id, 'r', +e.target.value)} />
                </label>
                <button className="wide" onClick={() => s.updateParam(selected.id, 'expanded', !selected.expanded)}>
                  {selected.expanded ? '收起内部结构' : '展开内部结构（E + r）'}
                </button>
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
                  onClick={() => s.setExpanded(selected.id, !selected.expanded)}>
                  {selected.expanded ? '收起为三接线柱' : '展开为四接线柱'}
                </button>
                {selected.expanded && (
                  <p className="warn" style={{ margin: 0 }}>
                    四接线柱：a/b=下方电阻丝两端，c/d=上方金属杆。一上一下=变阻，两下=全阻值，两上=导线
                  </p>
                )}
                {!selected.expanded && (
                  <p className="warn" style={{ margin: 0 }}>
                    三接线柱：p=滑片上方（拖动箭头改变阻值），a/b=下方电阻丝两端。p+a 或 p+b=变阻，a+b=全阻值
                  </p>
                )}
              </>
            )}
            {(selected.kind === 'voltmeter' || selected.kind === 'ammeter') && (() => {
              const isV = selected.kind === 'voltmeter'
              const unit = isV ? 'V' : 'A'
              const low = isV ? 3 : 0.6
              const high = isV ? 15 : 3
              const rMin = isV ? 100 : 0.01
              const rMax = isV ? 100000 : 1
              const rStep = isV ? 100 : 0.01
              return (
                <>
                  <label>量程 0~{selected.range}{unit}
                    <button className="wide" disabled={selected.customRange}
                      onClick={() => s.updateParam(selected.id, 'range', selected.range === low ? high : low)}>
                      切换量程（{low}{unit} ↔ {high}{unit}）
                    </button>
                  </label>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={!!selected.customRange}
                      onChange={(e) => s.updateParam(selected.id, 'customRange', e.target.checked)} />
                    自定义量程（关闭表盘练习）
                  </label>
                  {!!selected.customRange && (
                    <label>自定义量程 0~{selected.range}{unit}
                      <input type="range" min={isV ? 1 : 0.1} max={isV ? 24 : 5} step={isV ? 0.5 : 0.1} value={selected.range}
                        onChange={(e) => s.updateParam(selected.id, 'range', +e.target.value)} />
                    </label>
                  )}
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={selected.ideal}
                      onChange={(e) => {
                        s.updateParam(selected.id, 'ideal', e.target.checked)
                        if (e.target.checked) s.updateParam(selected.id, 'expanded', false) // 理想表无内部结构可看
                      }} />
                    理想电表（内阻无穷{'大'}/零）
                  </label>
                  {!selected.ideal && (
                    <label>内阻 {selected.r}Ω（影响电路）
                      <input type="range" min={rMin} max={rMax} step={rStep} value={selected.r}
                        onChange={(e) => s.updateParam(selected.id, 'r', +e.target.value)} />
                    </label>
                  )}
                  {!selected.ideal && (
                    <button className="wide" onClick={() => s.updateParam(selected.id, 'expanded', !selected.expanded)}>
                      {selected.expanded ? '收起内部结构' : '展开内部结构（表头+改装电阻）'}
                    </button>
                  )}
                  <p className="warn" style={{ margin: 0 }}>
                    {isV ? '并联在被测元件两端' : '串联接入被测支路'}
                    {selected.ideal ? ' · 理想表不影响电路' : ' · 实际表会改变电路，注意读数偏差'}
                    {selected.customRange ? ' · 自定义量程下无表盘可读' : ' · 点示数可查看表盘'}
                  </p>
                </>
              )
            })()}
            {selected.kind === 'ohmmeter' && (() => {
              const r = result.ohm?.[selected.id] ?? Infinity
              const live = s.comps.some((k) => k.kind === 'battery' && k.emf > 0)
              return (
                <p className="warn" style={{ margin: 0 }}>
                  Ω 档：读数 = 两端间等效电阻（所有电源已置零）。
                  {live ? '⚠ 当前电路带电，读数为"看进去的等效电阻"——要测单个元件请断开一端。' : '可跨接在元件两端直接测量。'}
                  {r >= 1e7 ? ' 当前两端断路（∞）。' : ''}
                </p>
              )
            })()}
            {selected.kind === 'galvanometer' && (() => {
              const iSigned = (selResult?.dv ?? 0) / METER_G_R
              const mA = Math.abs(iSigned) * 1000
              return (
                <>
                  <p className="warn" style={{ margin: 0 }}>
                    中心零位 · 内阻 100Ω · 量程 ±1mA。
                    {mA < 0.001 ? '当前无电流'
                      : mA > 1 ? `⚠ 电流 ${mA.toFixed(1)}mA 超量程，指针打满（灵敏电流计需并联分流电阻才能测大电流）`
                      : `电流 ${mA.toFixed(2)}mA，指针${iSigned > 0 ? '右' : '左'}偏`}
                  </p>
                  <button className="wide" onClick={() => s.rotate(selected.id)}>对调接线柱（± 反向）</button>
                </>
              )
            })()}
            {selected.kind === 'led' && (() => {
              const i = selResult?.current ?? 0
              const dv = selResult?.dv ?? 0
              return (
                <p className="warn" style={{ margin: 0 }}>
                  发光二极管：单向导电（电流 + → −，即 a → b）。
                  {i > 0.002 ? `正向导通中，I = ${(i * 1000).toFixed(0)}mA` : dv < -0.5 ? '⚠ 反向截止（接反了，不发光）' : '正向电压不足 2V，未导通（需要限流电阻接入电路）'}
                </p>
              )
            })()}
            {selected.kind === 'spdt' && (() => {
              const btn = (target: 0 | 1 | 2, text: string) => (
                <button className="wide" disabled={selected.pos === target}
                  onClick={() => s.updateParam(selected.id, 'pos', target)}>
                  {text}{selected.pos === target ? '（当前）' : ''}
                </button>
              )
              return (
                <>
                  {btn(1, '掷向触点 1')}
                  {btn(0, '中间位（断开）')}
                  {btn(2, '掷向触点 2')}
                  <p className="warn" style={{ margin: 0 }}>
                    公共端 a 当前与触点 {selected.pos === 0 ? '无（断开）' : selected.pos} 接通。单击开关在 1→2→断开 间循环。
                  </p>
                </>
              )
            })()}
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

      {dialFor && (() => {
        // 表盘读数练习弹窗：复刻学生实验电表——双排刻度（上=大量程，下=小量程）、30 小格
        // 灵敏电流计为特例：中心零位 ±1mA 双向刻度；欧姆表为特例：非线性反向刻度（0 在右，∞ 在左）
        const c = s.comps.find((k) => k.id === dialFor)
        if (!c || (c.kind !== 'voltmeter' && c.kind !== 'ammeter' && c.kind !== 'galvanometer' && c.kind !== 'ohmmeter') || (c.kind !== 'galvanometer' && c.kind !== 'ohmmeter' && c.customRange)) return null
        const isV = c.kind === 'voltmeter'
        const isG = c.kind === 'galvanometer'
        const isO = c.kind === 'ohmmeter'
        const unit = isG ? 'mA' : isO ? 'Ω' : isV ? 'V' : 'A'
        const solvedM = result.byComp[c.id]
        const signedG = isG ? (solvedM?.dv ?? 0) / METER_G_R * 1000 : 0 // 带符号 mA
        const val = isG ? Math.abs(signedG) : isO ? (result.ohm?.[c.id] ?? Infinity) : Math.abs(isV ? solvedM?.dv ?? 0 : solvedM?.current ?? 0)
        const R = 100, CX = 140, CY = 148
        const dir = (f: number, r: number) => {
          const deg = (-50 + 100 * f) * Math.PI / 180
          return { x: CX + Math.sin(deg) * r, y: CY - Math.cos(deg) * r }
        }
        const frac = isG
          ? Math.max(0, Math.min(1, (signedG / METER_G_IG + 1) / 2))
          : isO
          ? Math.max(0, Math.min(1, 10 / (10 + val))) // 非线性：f = R中值/(R中值+R)，0Ω 在右、∞ 在左
          : Math.max(0, Math.min(1, val / c.range))
        const nd = dir(frac, R - 6)
        const ohmTicks = [0, 2, 5, 10, 20, 50, 200, 1e9].map((r) => ({ r, f: 10 / (10 + r), label: r >= 1e9 ? '∞' : String(r) }))
        const hiNums = isG ? [-1, -0.5, 0, 0.5, 1] : isV ? [0, 5, 10, 15] : [0, 1, 2, 3]
        const loNums = isG ? ['−1mA', '−0.5', '0', '+0.5', '+1mA'] : isV ? [0, 1, 2, 3] : [0, 0.2, 0.4, 0.6]
        const numFs = isG ? [0, 0.25, 0.5, 0.75, 1] : [0, 10 / 30, 20 / 30, 1]
        const ticks = []
        if (isO) {
          for (const t of ohmTicks) ticks.push({ f: t.f, o: dir(t.f, R), i: dir(t.f, R - 13), major: true, lbl: t.label })
        } else if (isG) {
          for (let i = 0; i <= 20; i++) {
            const f = i / 20
            const major = i % 5 === 0
            const mA = (f * 2 - 1) * 1000
            ticks.push({ f, o: dir(f, R), i: dir(f, R - (major ? 13 : Math.abs(mA % 0.5) < 1e-9 ? 9 : 5)), major, lbl: major ? ['−1', '−0.5', '0', '+0.5', '+1'][i / 5] : undefined })
          }
        } else {
          for (let i = 0; i <= 30; i++) {
            const f = i / 30
            const major = i % 10 === 0
            const mid = i % 5 === 0
            ticks.push({ f, o: dir(f, R), i: dir(f, R - (major ? 13 : mid ? 9 : 5)), major, lbl: major ? String(hiNums[i / 10]) : undefined })
          }
        }
        return (
          <div className="dial-overlay" onPointerDown={() => setDialFor(null)}>
            <div className="dial-card" onPointerDown={(e) => e.stopPropagation()}>
              <h3>{isO ? '欧姆表 · 中值 10Ω（断电测电阻）' : isG ? '灵敏电流计 · 量程 −1~+1mA（中心零位）' : `${isV ? '电压表' : '电流表'} · 量程 0~${c.range}${unit}`}</h3>
              <svg width={290} height={168} viewBox="0 0 280 168">
                <rect x={6} y={2} width={268} height={164} rx={10} fill="#f7f8fa" stroke="#c9d2e0" />
                {ticks.map((t, i) => (
                  <g key={i}>
                    <line x1={t.o.x} y1={t.o.y} x2={t.i.x} y2={t.i.y} stroke="#2a3140" strokeWidth={t.major ? 2 : 1} />
                    {t.lbl !== undefined && (
                      <text x={dir(t.f, R - 24).x} y={dir(t.f, R - 24).y + 4} textAnchor="middle" fontSize={isO ? 10 : 12} fontWeight={700} fill="#2a3140">{t.lbl}</text>
                    )}
                  </g>
                ))}
                {!isO && numFs.map((f, i) => (
                  <g key={'n' + i}>
                    <text x={dir(f, R - 22).x} y={dir(f, R - 22).y} textAnchor="middle" fontSize={12} fontWeight={700} fill="#2a3140">{hiNums[i]}</text>
                    {!isG && <text x={dir(f, R - 38).x} y={dir(f, R - 38).y} textAnchor="middle" fontSize={10} fill="#5b6472">{loNums[i]}</text>}
                  </g>
                ))}
                <line x1={CX} y1={CY} x2={nd.x} y2={nd.y} stroke="#c0392b" strokeWidth={2.5} strokeLinecap="round" />
                <circle cx={CX} cy={CY} r={5} fill="#c0392b" />
                <text x={CX} y={CY - 26} textAnchor="middle" fontSize={14} fontWeight={700} fill="#2a3140">{isO ? 'Ω' : isG ? 'G' : isV ? 'V' : 'A'}</text>
              </svg>
              {isG ? (
                <div className="dial-rows">
                  <span>指针{signedG > 0 ? '右偏（电流 + → −）' : signedG < 0 ? '左偏（电流 − → +）' : '居中（无电流）'}</span>
                  <span>偏转满偏的 {(Math.abs(signedG / METER_G_IG) * 100).toFixed(0)}%{Math.abs(signedG) > METER_G_IG ? ' · ⚠ 超量程' : ''}</span>
                </div>
              ) : isO ? (
                <div className="dial-rows">
                  <span>读数：{fmtOhm(val)}</span>
                  <span>刻度不均匀且反向：0Ω 在右端，∞ 在左端（中值 10Ω）</span>
                </div>
              ) : (
                <div className="dial-rows">
                  {isV ? (
                    <>
                      <span>按 0~15V 刻度读：{(val * 15 / c.range).toFixed(1)}V（每小格 0.5V）</span>
                      <span>按 0~3V 刻度读：{(val * 3 / c.range).toFixed(2)}V（每小格 0.1V）</span>
                    </>
                  ) : (
                    <>
                      <span>按 0~3A 刻度读：{(val * 3 / c.range).toFixed(2)}A（每小格 0.1A）</span>
                      <span>按 0~0.6A 刻度读：{(val * 0.6 / c.range).toFixed(3)}A（每小格 0.02A）</span>
                    </>
                  )}
                </div>
              )}
              <div className="dial-val">{isO ? fmtOhm(val) : val.toFixed(2)}{unit}</div>
              <button className="wide" onClick={() => setDialFor(null)}>关闭</button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
