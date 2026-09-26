import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, editorState, STORAGE_KEY } from './store'
import { solve, type SolveResult } from './solver/mna'
import { stepTransient, type TransientState } from './solver/transient'
import { terminalPos, terminalsOf, TERMINAL_OFFSET, METER_G_R, METER_G_IG, LED_I_FULL, meterRangeOf, multiKindOf, multiRangeOf, V_RANGES, A_RANGES, capC, type Comp, type CompKind, type MeterPosts, type Gate } from './solver/types'
import { EXPERIMENTS } from './experiments'
import { KinematicsLab } from './kinematics-ui'
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

// 万用表旋钮档位环（照真机排布）：数显=VC890D 九功能区，经典=MF47 十五档刻度环
// 本台只仿真电压/电流/电阻档；ACV/ACA/BUZZ/CAP/hFE/V1000/×100/×10/×1/mA0.25 为真机档位占位（选中提示未模拟）
const DIGI_KNOB = [
  { key: 'OFF', label: 'OFF' }, { key: 'DCV', label: 'DCV' }, { key: 'ACV', label: 'ACV' },
  { key: 'DCA', label: 'DCA' }, { key: 'ACA', label: 'ACA' }, { key: 'BUZZ', label: '蜂鸣' },
  { key: 'OHM', label: 'Ω' }, { key: 'CAP', label: 'CAP' }, { key: 'hFE', label: 'hFE' },
]
const CLASSIC_KNOB = [
  { key: 'OFF', label: 'OFF' }, { key: 'V2.5', label: '2.5' }, { key: 'V10', label: '10' },
  { key: 'V50', label: '50' }, { key: 'V250', label: '250' }, { key: 'V1000', label: '1000' },
  { key: 'OHM1k', label: '×1k' }, { key: 'OHM100', label: '×100' }, { key: 'OHM10', label: '×10' }, { key: 'OHM1', label: '×1' },
  { key: 'mA500', label: '500' }, { key: 'mA50', label: '50' }, { key: 'mA5', label: '5' }, { key: 'mA0.25', label: '0.25' },
]
const MULTI_SUPPORTED = (m: string) => MULTI_KIND(m) !== null
const MULTI_KIND = (m: string) => multiKindOf(m as never)

const KIND_NAME: Record<CompKind, string> = {
  battery: '电源',
  resistor: '定值电阻',
  rheostat: '滑动变阻器',
  voltmeter: '电压表',
  ammeter: '电流表',
  galvanometer: '灵敏电流计',
  ohmmeter: '欧姆表',
  multimeter: '万用表',
  capacitor: '电容',
  acsource: '交流电源',
  relay: '继电器',
  gate: '逻辑门',
  spdt: '单刀双掷开关',
  led: '二极管',
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
function CompSymbol({ c, selected, solved, ohmReading, rheoLabel, probeDv, relayOn, gateOut, multiRms, onPointerDown, onContextMenu, onSliderPointerDown, onSwitchPointerDown, onDialOpen, onPlatePointerDown }: {
  c: Comp
  selected: boolean
  solved?: { current: number; power: number; dv: number }
  onPointerDown: (e: React.PointerEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onSliderPointerDown?: (e: React.PointerEvent, c: Comp) => void
  onSwitchPointerDown?: (e: React.PointerEvent, c: Comp) => void
  onDialOpen?: (c: Comp) => void
  onPlatePointerDown?: (e: React.PointerEvent, c: Comp, which: 1 | 2) => void
  ohmReading?: number
  rheoLabel?: string
  probeDv?: number | null // 表笔吸附时的电压读数（红笔端 − 黑笔端）
  relayOn?: boolean // 继电器吸合状态
  gateOut?: boolean // 逻辑门输出状态
  multiRms?: number | null // 万用表交流档的真有效值（瞬态引擎 EMA 的 √；null=引擎未运行）
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
  const isMulti = c.kind === 'multimeter'
  // 数字读数（数显/经典共用画布文字）：V 带符号 / A 带符号（经典按内阻换算）/ Ω 走零源辅助解，超量程显示 OL
  // 交流档（ACV/ACA）：显示瞬态引擎累计的真有效值 RMS，引擎未运行时显示 ---
  const multiLcd = isMulti ? (() => {
    const kind = multiKindOf(c.mode)
    if (!kind) return '' // OFF / 未模拟档：LCD 熄灭
    const range = multiRangeOf(c.mode, c.range)
    if (kind === 'ACV' || kind === 'ACA') {
      if (multiRms == null) return '---'
      const lim = kind === 'ACV' ? 20 : 10
      if (multiRms > lim) return 'OL'
      // 真数字表的末位跳动：RMS 值加 ±0.4% 抖动（引擎每帧重渲染，末位自然翻动）
      const jitter = 1 + (Math.random() - 0.5) * 0.008
      return (multiRms * jitter).toFixed(kind === 'ACV' ? 2 : 3)
    }
    if (kind === 'V') {
      const v = probeDv !== null && probeDv !== undefined ? probeDv : (solved?.dv ?? 0)
      return Math.abs(v) > (c.style === 'classic' ? (range ?? 2.5) : 20) ? 'OL' : v.toFixed(2)
    }
    if (kind === 'A') {
      const rEff = c.ideal ? 1e-3 : Math.max(0.06 / Math.max(range ?? 0.5, 1e-4), 1e-3)
      const i = c.style === 'classic' ? (solved?.dv ?? 0) / rEff : (solved?.dv ?? 0) / 0.01
      return Math.abs(i) > (c.style === 'classic' ? (range ?? 0.5) : 10) ? 'OL' : i.toFixed(3)
    }
    return fmtOhm(ohmReading ?? Infinity) // Ω
  })() : ''
  const isLed = c.kind === 'led'
  const isCap = c.kind === 'capacitor'
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
      {isMulti && (c.style === 'classic' ? (() => {
        // 经典款（MF47 式）：矩形机身 + 上部表盘窗（指针随读数偏转）+ 下部档位旋钮 + 调零螺丝
        const mode = c.mode
        const kind = multiKindOf(mode)
        const range = multiRangeOf(mode, c.range) ?? 0
        const isO = kind === 'Ω'
        const rEff = kind === 'V'
          ? (c.ideal ? 1e7 : Math.max((c.r ?? 3000) * range / 2.5, 1))
          : (c.ideal ? 1e-3 : Math.max(0.06 / Math.max(range, 1e-4), 1e-3))
        const sVal = !kind || isO ? 0 : kind === 'V' ? (probeDv != null ? probeDv : (solved?.dv ?? 0)) : (solved?.dv ?? 0) / rEff
        const val = isO ? (ohmReading ?? Infinity) : Math.abs(sVal)
        const frac = Math.max(-0.14, Math.min(1.12, isO ? 10 / (10 + val) : range ? sVal / range : 0))
        const nAng = ((-50 + 100 * frac) * Math.PI) / 180
        const knobIdx = Math.max(0, CLASSIC_KNOB.findIndex((p) => p.key === mode))
        const kAng = ((-135 + 270 * knobIdx / (CLASSIC_KNOB.length - 1)) * Math.PI) / 180
        return (
          <>
            <text
              x={0} y={-40} textAnchor="middle" fontSize={13} fontWeight={600}
              fill={T.readout}
              style={{ cursor: 'pointer' }}
              onPointerDown={(e) => { e.stopPropagation(); onDialOpen?.(c) }}
            >
              {mode === 'OHM' ? fmtOhm(ohmReading ?? Infinity) : multiLcd}{mode === 'OHM' || mode === 'OFF' || !MULTI_SUPPORTED(mode) ? '' : mode}
              <title>点击查看表盘</title>
            </text>
            <rect x={-46} y={-32} width={92} height={64} rx={5} fill="#f5f2e9" stroke={stroke} strokeWidth={2.5} />
            {/* 表盘窗 */}
            <rect x={-40} y={-27} width={80} height={34} rx={2} fill="#fdfdfd" stroke="#c9d2e0" strokeWidth={1} />
            <path d="M -33 -11 Q 0 -21 33 -11" fill="none" stroke="#2a3140" strokeWidth={0.9} />
            <path d="M -33 -5 Q 0 -15 33 -5" fill="none" stroke="#2a3140" strokeWidth={0.7} opacity={0.7} />
            <path d="M -33 -1 Q 0 -11 33 -1" fill="none" stroke="#c0392b" strokeWidth={0.7} opacity={0.6} />
            {/* 指针（表盘窗内随读数偏转） */}
            <line x1={0} y1={2} x2={Math.sin(nAng) * 26} y2={2 - Math.cos(nAng) * 26} stroke="#c0392b" strokeWidth={1.8} strokeLinecap="round" />
            <circle cx={0} cy={2} r={2} fill="#c0392b" />
            {/* 机械调零螺丝（装饰） */}
            <line x1={-3} y1={4.5} x2={3} y2={4.5} stroke="#55617e" strokeWidth={1.2} />
            <text x={28} y={-9} fontSize={7} fontWeight={700} fill="#55617e">A-V-Ω</text>
            {/* 档位旋钮（黑色，白指针指向当前档位） */}
            <circle cx={0} cy={17} r={11} fill="#2f3540" stroke="#1e232e" strokeWidth={2} />
            <line x1={0} y1={17} x2={Math.sin(kAng) * 8.5} y2={17 - Math.cos(kAng) * 8.5} stroke="#f2f4f8" strokeWidth={2.5} strokeLinecap="round" />
            {/* 表笔插孔 +/− */}
            <circle cx={-32} cy={22} r={3.2} fill="none" stroke="#55617e" strokeWidth={1.4} />
            <circle cx={32} cy={22} r={3.2} fill="none" stroke="#55617e" strokeWidth={1.4} />
            <text x={-42} y={24} fontSize={8} fill="#55617e">−</text>
            <text x={37} y={24} fontSize={8} fill="#55617e">+</text>
          </>
        )
      })() : (() => {
        // 数显款（VC890D 式）：横身机身 = 左 LCD 大屏 + 右功能旋钮 + 下缘 COM/VΩ/10A 插孔
        const mode = c.mode
        const kAng = ((-135 + 270 * Math.max(0, DIGI_KNOB.findIndex((p) => p.key === mode)) / 8) * Math.PI) / 180
        return (
          <>
            <text
              x={0} y={-40} textAnchor="middle" fontSize={13} fontWeight={600}
              fill={T.readout}
              style={{ cursor: 'pointer' }}
              onPointerDown={(e) => { e.stopPropagation(); onDialOpen?.(c) }}
            >
              {multiLcd}{mode === 'OHM' || mode === 'OFF' || !MULTI_SUPPORTED(mode) ? '' : mode}
              <title>点击打开万用表面板（拖动旋钮换档）</title>
            </text>
            <rect x={-46} y={-32} width={92} height={64} rx={7} fill="#f7f8fa" stroke={stroke} strokeWidth={2.5} />
            {/* LCD 大屏 */}
            <rect x={-40} y={-26} width={52} height={24} rx={2} fill="#d8e4d0" stroke="#55617e" strokeWidth={1} />
            <text x={-14} y={-9} textAnchor="middle" fontSize={12} fontWeight={700} fill="#2a3140" fontFamily="monospace">{multiLcd}</text>
            <text x={6} y={-9} textAnchor="middle" fontSize={9} fontWeight={700} fill="#55617e">{mode === 'OHM' ? 'Ω' : MULTI_SUPPORTED(mode) ? mode : ''}</text>
            {/* 功能旋钮（指针指向当前档位，装饰——换挡走面板/侧栏） */}
            <circle cx={26} cy={-8} r={13} fill="#e8ebf2" stroke={stroke} strokeWidth={1.8} />
            <line x1={26} y1={-8} x2={26 + Math.sin(kAng) * 10} y2={-8 - Math.cos(kAng) * 10} stroke="#c0392b" strokeWidth={2.2} strokeLinecap="round" />
            {/* 下缘插孔 COM / VΩ / 10A */}
            <circle cx={-30} cy={22} r={2.8} fill="none" stroke="#55617e" strokeWidth={1.3} />
            <circle cx={0} cy={22} r={2.8} fill="none" stroke="#55617e" strokeWidth={1.3} />
            <circle cx={30} cy={22} r={2.8} fill="none" stroke="#55617e" strokeWidth={1.3} />
            <text x={-37} y={29} fontSize={6} fill="#55617e">COM</text>
            <text x={-4} y={29} fontSize={6} fill="#55617e">VΩ</text>
            <text x={24} y={29} fontSize={6} fill="#55617e">10A</text>
          </>
        )
      })())}
      {isCap && (c.plate ? (() => {
        const u = solved?.dv ?? 0
        const cap = capC(c)
        const d = c.d ?? 10
        const half = d * 0.6
        const o1 = (c.o1 ?? 0) * 1.2
        const o2 = (c.o2 ?? 0) * 1.2
        const ovTop = Math.max(o1, o2) - 14
        const ovH = Math.max(0, 28 - Math.abs(o1 - o2))
        return (
          <>
            <text x={0} y={-44} textAnchor="middle" fontSize={11.5} fontWeight={600} fill={Math.abs(u) > 0.01 ? T.readout : T.label}>
              {u.toFixed(2)}V · Q={(cap * u * 1e6).toFixed(0)}µC · C={(cap * 1e6).toFixed(0)}µF
            </text>
            {/* 引线：端子 → 极板 */}
            <line x1={-26} y1={0} x2={-half - 5} y2={0} stroke={stroke} strokeWidth={2} />
            <line x1={-half - 5} y1={0} x2={-half - 5} y2={o1} stroke={stroke} strokeWidth={2} />
            <line x1={-half - 5} y1={o1} x2={-half} y2={o1} stroke={stroke} strokeWidth={2} />
            <line x1={26} y1={0} x2={half + 5} y2={0} stroke={stroke} strokeWidth={2} />
            <line x1={half + 5} y1={0} x2={half + 5} y2={o2} stroke={stroke} strokeWidth={2} />
            <line x1={half + 5} y1={o2} x2={half} y2={o2} stroke={stroke} strokeWidth={2} />
            {/* 正对区域（半透明中性色，不随主题强调色变） */}
            {ovH > 0 && <rect x={-half + 2} y={ovTop} width={half * 2 - 4} height={ovH} fill="rgba(148, 186, 224, 0.28)" stroke="rgba(148, 186, 224, 0.5)" strokeWidth={0.5} />}
            {/* 极板（可拖） */}
            <line x1={-half} y1={o1 - 14} x2={-half} y2={o1 + 14} stroke={stroke} strokeWidth={4.5} strokeLinecap="round" />
            <line x1={half} y1={o2 - 14} x2={half} y2={o2 + 14} stroke={stroke} strokeWidth={4.5} strokeLinecap="round" />
            {/* 拖拽热区 */}
            <rect x={-half - 7} y={o1 - 17} width={14} height={34} fill="transparent" style={{ cursor: 'move' }}
              onPointerDown={(e) => { e.stopPropagation(); onPlatePointerDown?.(e, c, 1) }} />
            <rect x={half - 7} y={o2 - 17} width={14} height={34} fill="transparent" style={{ cursor: 'move' }}
              onPointerDown={(e) => { e.stopPropagation(); onPlatePointerDown?.(e, c, 2) }} />
          </>
        )
      })() : (() => (
        // 普通电容：两平行板符号
        <>
          <text x={0} y={-28} textAnchor="middle" fontSize={11.5} fontWeight={600} fill={Math.abs(solved?.dv ?? 0) > 0.01 ? T.readout : T.label}>
            {(solved?.dv ?? 0).toFixed(2)}V · Q={(capC(c) * (solved?.dv ?? 0) * 1e6).toFixed(0)}µC
          </text>
          <line x1={-24} y1={0} x2={-9} y2={0} stroke={stroke} strokeWidth={2} />
          <line x1={-9} y1={-9} x2={-9} y2={9} stroke={stroke} strokeWidth={3.5} />
          <line x1={9} y1={-9} x2={9} y2={9} stroke={stroke} strokeWidth={3.5} />
          <line x1={9} y1={0} x2={24} y2={0} stroke={stroke} strokeWidth={2} />
        </>
      ))())}
      {c.kind === 'acsource' && (() => (
        // 交流电源：圆圈+正弦波符号，上方瞬时电压
        <>
          <text x={0} y={-28} textAnchor="middle" fontSize={12} fontWeight={600} fill={T.readout}>
            {(solved?.dv ?? 0).toFixed(1)}V
          </text>
          <line x1={-24} y1={0} x2={-13} y2={0} stroke={stroke} strokeWidth={2} />
          <circle r={13} fill="none" stroke={stroke} strokeWidth={2.5} />
          <path d="M -7 1 Q -3.5 -8 0 1 T 7 1" fill="none" stroke={stroke} strokeWidth={1.8} />
          <line x1={13} y1={0} x2={24} y2={0} stroke={stroke} strokeWidth={2} />
        </>
      ))()}
      {c.kind === 'relay' && (() => {
        // 继电器：上线圈 a-b，下触点 COM(c)↔NC(d)/NO(p)，杠杆随吸合状态指向
        const coilI = solved?.current ?? 0
        return (
          <>
            <text x={0} y={-46} textAnchor="middle" fontSize={12} fontWeight={600} fill={relayOn ? T.readout : T.label}>
              {relayOn ? '吸合' : '释放'} · {(coilI * 1000).toFixed(0)}mA
            </text>
            <line x1={-40} y1={-14} x2={-26} y2={-14} stroke={stroke} strokeWidth={2} />
            <rect x={-26} y={-22} width={52} height={16} fill="none" stroke={stroke} strokeWidth={2} rx={2} />
            <text x={0} y={-10} textAnchor="middle" fontSize={10} fill={T.label}>线圈</text>
            <line x1={26} y1={-14} x2={40} y2={-14} stroke={stroke} strokeWidth={2} />
            {/* 触点：c=COM 底中，d=NC 左，p=NO 右 */}
            <line x1={-22} y1={30} x2={-9} y2={30} stroke={stroke} strokeWidth={2} />
            <line x1={9} y1={30} x2={22} y2={30} stroke={stroke} strokeWidth={2} />
            <line x1={0} y1={30} x2={0} y2={21} stroke={stroke} strokeWidth={2} />
            <line x1={0} y1={21} x2={relayOn ? 13 : -13} y2={relayOn ? 17 : 25} stroke={relayOn ? T.readout : stroke} strokeWidth={2.5} strokeLinecap="round" />
            <text x={-24} y={41} fontSize={8} fill={T.label}>NC</text>
            <text x={-6} y={41} fontSize={8} fill={T.label}>COM</text>
            <text x={16} y={41} fontSize={8} fill={T.label}>NO</text>
          </>
        )
      })()}
      {c.kind === 'gate' && (() => {
        const bubble = c.type === 'NOT' || c.type === 'NAND' || c.type === 'NOR'
        const body = c.type === 'AND' || c.type === 'NAND' ? GATE_BODY.AND : c.type === 'NOT' ? GATE_BODY.NOT : GATE_BODY.OR
        return (
          <>
            <text x={0} y={-42} textAnchor="middle" fontSize={12} fontWeight={600} fill={gateOut ? T.readout : T.label}>
              {gateOut ? '输出高' : '输出低'}
            </text>
            <line x1={-32} y1={-16} x2={-20} y2={-16} stroke={stroke} strokeWidth={2} />
            <line x1={-32} y1={16} x2={-20} y2={16} stroke={stroke} strokeWidth={2} />
            <path d={body} fill="none" stroke={stroke} strokeWidth={2.5} />
            {c.type === 'XOR' && <path d="M -27 -24 C -20 -14 -20 14 -27 24" fill="none" stroke={stroke} strokeWidth={2} />}
            {bubble && <circle cx={19} cy={0} r={4} fill="none" stroke={stroke} strokeWidth={2.5} />}
            <line x1={bubble ? 23 : 24} y1={0} x2={36} y2={0} stroke={stroke} strokeWidth={2} />
            <text x={4} y={-27} fontSize={8} fill={T.label}>VCC</text>
            <text x={2} y={41} fontSize={8} fill={T.label}>GND</text>
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
        // 二极管：三角形+阴极bar（经典符号）；发光型（LED）导通时红色光晕 + 发光箭头
        const glow = Math.min(1, ledFrac * 1.2)
        const showGlow = !!c.led && ledLit
        return (
          <>
            {showGlow && <circle r={24} fill={`rgba(255,70,70,${0.15 + glow * 0.3})`} />}
            <polygon points="-10,-10 8,0 -10,10" fill={showGlow ? '#ff5b5b' : 'none'} stroke={stroke} strokeWidth={2} />
            <line x1={8} y1={-10} x2={8} y2={10} stroke={stroke} strokeWidth={2.5} />
            <line x1={-24} y1={0} x2={-10} y2={0} stroke={stroke} strokeWidth={2} />
            <line x1={8} y1={0} x2={24} y2={0} stroke={stroke} strokeWidth={2} />
            {c.led && (
              <>
                <line x1={-4} y1={-14} x2={4} y2={-22} stroke={ledLit ? '#ff8a8a' : T.label} strokeWidth={1.5} strokeLinecap="round" />
                <polygon points={`${6},${-24} ${-1},${-21} ${2},${-15}`} fill={ledLit ? '#ff8a8a' : T.label} opacity={ledLit ? 1 : 0.5} />
                <line x1={4} y1={-8} x2={12} y2={-16} stroke={ledLit ? '#ff8a8a' : T.label} strokeWidth={1.5} strokeLinecap="round" />
                <polygon points={`${14},${-18} ${7},${-15} ${10},${-9}`} fill={ledLit ? '#ff8a8a' : T.label} opacity={ledLit ? 1 : 0.5} />
                <text x={-14} y={-12} fontSize={9} fill={T.label}>+</text>
                <text x={12} y={-12} fontSize={9} fill={T.label}>−</text>
              </>
            )}
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
    : c.kind === 'capacitor' ? `${(c.c * 1e6).toFixed(0)}µF`
    : c.kind === 'acsource' ? `${c.e}V · ${c.f}Hz`
    : c.kind === 'relay' ? (relayOn ? '吸合' : '释放')
    : c.kind === 'gate' ? `${c.type} · ${gateOut ? '输出高' : '输出低'}`
    : c.kind === 'resistor' ? `${c.r}Ω`
    : c.kind === 'bulb' ? `${c.ratedP}W`
    : isMeter ? (meterRangeOf(c) === null ? '⚠ 表笔未接好' : `${c.ideal ? '理想' : '实际①'} · 量程 ${c.range}${isVoltmeter ? 'V' : 'A'}`)
    : isLed ? (ledLit ? `导通 · ${((solved?.current ?? 0) * 1000).toFixed(0)}mA` : '截止')
    : isOhm ? '断电测电阻'
    : isMulti ? (c.mode === 'OFF' ? 'OFF · 已关机'
        : !MULTI_SUPPORTED(c.mode) ? `${c.mode} · 本台未模拟`
        : multiLcd === 'OL' ? '⚠ 超量程，换档位更大的测量对象'
        : c.style === 'classic'
        ? (() => {
            const k = multiKindOf(c.mode)
            const rg = multiRangeOf(c.mode, c.range)
            return `经典款 · ${k === 'Ω' ? 'Ω 档' : k === 'V' ? `DCV ${rg}V` : k === 'A' ? `DCmA ${(rg ?? 0) * 1000}mA` : c.mode}`
          })()
        : `数显款 · ${c.mode} 档`)
    : isGalvo ? `${(Math.abs(galvoI) * 1000).toFixed(1)}mA${galvoPegged ? ' ⚠超量程' : ''}`
    : c.kind === 'spdt' ? (c.pos === 0 ? '断开（中位）' : `公共端接 触点${c.pos}`)
    : c.kind === 'rheostat' ? (c.expanded
        ? `P ${Math.round(c.pos * 100)}% · Rmax ${c.Rmax}Ω`
        : rheoLabel ?? `P ${Math.round(c.pos * 100)}% · Rmax ${c.Rmax}Ω`)
    : c.closed ? '闭合' : '断开'
  const readout =
    !isMeter && !isGalvo && !isOhm && !isMulti && !isLed && solved && solved.current > 1e-6
      ? `I=${solved.current.toFixed(3)}A · P=${solved.power.toFixed(2)}W`
      : solved && !isMeter && !isGalvo && !isOhm && !isMulti && !isLed ? '无电流' : ''
  return (
    <g transform={`translate(${c.x} ${c.y}) rotate(${c.rot})`}>
      <g className="pop-in symbol" onPointerDown={onPointerDown} onContextMenu={onContextMenu} style={{ cursor: 'grab' }}>
        {/* 命中热区：开关额外放大（可双击通断），电池展开态随虚线框加宽 */}
        <rect
          x={c.kind === 'battery' && c.expanded ? -48 : c.kind === 'multimeter' ? -46 : -hitHalf}
          y={c.kind === 'multimeter' ? -32 : -28}
          width={c.kind === 'battery' && c.expanded ? 96 : c.kind === 'multimeter' ? 92 : hitHalf * 2}
          height={c.kind === 'multimeter' ? 64 : 56}
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
      {/* 标签反向旋转：元件竖置时读数仍保持水平可读 */}
      <g transform={c.rot === 90 ? 'rotate(-90)' : undefined}>
        <text x={0} y={c.kind === 'bulb' ? 34 : c.kind === 'multimeter' ? 46 : 30} fill={T.label} fontSize={11} textAnchor="middle">{label}</text>
        {readout && (
          <text x={0} y={c.kind === 'bulb' ? 48 : c.kind === 'multimeter' ? 60 : 44} fill={selected ? T.accentSoft : T.readout} fontSize={11} textAnchor="middle">
            {readout}
          </text>
        )}
      </g>
    </g>
  )
}

/** 界面小图标：内联 SVG 代替文字符号——emoji 走系统彩色字体回退，字形大小/基线各机不同会撑破按钮 */
function UiIcon({ name }: { name: 'sun' | 'moon' | 'collapse' | 'expand' | 'home' }) {
  const st = { stroke: 'currentColor', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden>
      {name === 'sun' && (<>
        <circle cx={12} cy={12} r={4.5} {...st} />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" {...st} />
      </>)}
      {name === 'moon' && <path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a7 7 0 0 0 9.7 9.7z" {...st} />}
      {name === 'collapse' && <path d="M5 4v16M20 12H8M12 7l-5 5 5 5" {...st} />}
      {name === 'expand' && <path d="M19 4v16M4 12h12M12 7l5 5-5 5" {...st} />}
      {name === 'home' && <path d="M4 11 12 4l8 7M6.5 9.5V20h11V9.5M10 20v-5h4v5" {...st} />}
    </svg>
  )
}

/** 表针：欠阻尼弹簧动画——换量程/电流突变时过冲回摆再收敛，像真实电表的机械指针 */
function Needle({ target, CX, CY, R }: { target: number; CX: number; CY: number; R: number }) {
  const clamp = (x: number) => Math.max(-0.14, Math.min(1.12, x))
  const st = useRef({ x: clamp(target), v: 0, t: clamp(target) })
  st.current.t = clamp(target)
  const [, tickRender] = useState(0)
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.032)
      last = now
      const s = st.current
      s.v += (140 * (s.t - s.x) - 9 * s.v) * dt // 欠阻尼弹簧：过冲 ~28% 后回摆收敛
      s.x += s.v * dt
      if (s.x > 1.12) { s.x = 1.12; if (s.v > 0) s.v = 0 } // 打满挡针
      if (s.x < -0.14) { s.x = -0.14; if (s.v < 0) s.v = 0 }
      tickRender((n) => n + 1)
      if (Math.abs(s.t - s.x) > 0.0005 || Math.abs(s.v) > 0.003) raf = requestAnimationFrame(step)
      else raf = 0
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])
  const deg = ((-50 + 100 * st.current.x) * Math.PI) / 180
  return (
    <>
      <line x1={CX} y1={CY} x2={CX + Math.sin(deg) * (R - 6)} y2={CY - Math.cos(deg) * (R - 6)} stroke="#c0392b" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={CX} cy={CY} r={5} fill="#c0392b" />
    </>
  )
}

/** 档位旋钮（棘轮款）：拖动指针换档，档位间有定位"咔哒"感；也可点刻度字直接跳档 */
function ModeKnob({ positions, value, onChange, dark }: { positions: { key: string; label: string }[]; value: string; onChange: (key: string) => void; dark?: boolean }) {
  const ref = useRef<SVGSVGElement | null>(null)
  const dragging = useRef(false)
  const idx = Math.max(0, positions.findIndex((p) => p.key === value))
  const step = positions.length > 1 ? 270 / (positions.length - 1) : 270
  const angOf = (i: number) => -135 + step * i
  const angleFrom = (cx: number, cy: number) => {
    const el = ref.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    // 指针相对旋钮圆心的角度：0°=正上，顺时针为正，钳位到 ±135° 刻度环
    const a = (Math.atan2(cx - (r.left + r.width / 2), (r.top + r.height / 2) - cy) * 180) / Math.PI
    return Math.max(-135, Math.min(135, a))
  }
  const nearest = (a: number) => Math.max(0, Math.min(positions.length - 1, Math.round((a + 135) / step)))
  return (
    <svg
      ref={ref} width={130} height={104} viewBox="0 0 130 104"
      style={{ cursor: 'pointer', display: 'block', margin: '0 auto', userSelect: 'none', touchAction: 'none' }}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        dragging.current = true
        const a = angleFrom(e.clientX, e.clientY)
        if (a !== null) { const i = nearest(a); if (positions[i].key !== value) onChange(positions[i].key) }
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return
        const a = angleFrom(e.clientX, e.clientY)
        if (a === null) return
        const i = nearest(a)
        if (positions[i].key !== value) onChange(positions[i].key) // 跨过档位分界线 = 咔哒进档
      }}
      onPointerUp={() => { dragging.current = false }}
      onPointerCancel={() => { dragging.current = false }}
    >
      <title>拖动旋钮换档（棘轮定位），点刻度字直接跳档</title>
      {positions.map((p, i) => {
        const a = (angOf(i) * Math.PI) / 180
        return (
          <g key={p.key}>
            <line x1={65 + Math.sin(a) * 31} y1={52 - Math.cos(a) * 31} x2={65 + Math.sin(a) * 36} y2={52 - Math.cos(a) * 36} stroke="#8b93a7" strokeWidth={1.5} />
            <text x={65 + Math.sin(a) * 45} y={52 - Math.cos(a) * 45 + 3} textAnchor="middle" fontSize={positions.length > 6 ? 8.5 : 10}
              fontWeight={p.key === value ? 700 : 400}
              fill={p.key === value ? '#2a3140' : '#b9c2d4'}
              style={{ cursor: 'pointer' }}
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); if (p.key !== value) onChange(p.key) }}
            >{p.label}</text>
          </g>
        )
      })}
      {/* 旋钮本体：随拖动棘轮式跳位（松手/跨档时带短促回弹动画） */}
      <g style={{ transform: `rotate(${angOf(idx)}deg)`, transformOrigin: '65px 52px', transition: dragging.current ? 'none' : 'transform 0.09s ease-out' }}>
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * 30 * Math.PI) / 180
          return <line key={i} x1={65 + Math.sin(a) * 19} y1={52 - Math.cos(a) * 19} x2={65 + Math.sin(a) * 23.5} y2={52 - Math.cos(a) * 23.5} stroke={dark ? '#4a5164' : '#aab2c4'} strokeWidth={2} />
        })}
        <circle cx={65} cy={52} r={22} fill={dark ? '#2f3540' : '#e8ebf2'} stroke={dark ? '#1e232e' : '#c9d2e0'} strokeWidth={2} />
        <line x1={65} y1={52} x2={65} y2={35} stroke={dark ? '#f2f4f8' : '#c0392b'} strokeWidth={3.5} strokeLinecap="round" />
        <circle cx={65} cy={52} r={3.5} fill={dark ? '#f2f4f8' : '#c0392b'} />
      </g>
    </svg>
  )
}

/** 元件库缩略图：按元件类型画迷你符号（跟随主题变量） */
// 标准 ANSI 门形（D 形与门/弧形或门/三角+圆圈非门），画布与选型弹窗共用；端子坐标不变
const GATE_BODY: Record<'AND' | 'OR' | 'NOT', string> = {
  AND: 'M -20 -24 H 0 A 24 24 0 0 1 0 24 H -20 Z',
  OR: 'M -20 -24 C -8 -22 10 -16 24 0 C 10 16 -8 22 -20 24 C -13 14 -13 -14 -20 -24 Z',
  NOT: 'M -20 -24 L 14 0 L -20 24 Z',
}

function MiniSymbol({ kind }: { kind: CompKind }) {
  const st = { stroke: 'var(--ink)', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const }
  const dot = { fill: 'var(--ink)' }
  return (
    <svg className="mini-svg" width={46} height={30} viewBox="-32 -24 64 48" aria-hidden>
      {kind === 'battery' && (<>
        <line x1={-2} y1={-12} x2={-2} y2={12} {...st} strokeWidth={3} />
        <line x1={6} y1={-6} x2={6} y2={6} {...st} strokeWidth={5} />
        <line x1={-24} y1={0} x2={-2} y2={0} {...st} />
        <line x1={6} y1={0} x2={24} y2={0} {...st} />
      </>)}
      {kind === 'resistor' && (<>
        <rect x={-14} y={-8} width={28} height={16} rx={2} {...st} />
        <line x1={-24} y1={0} x2={-14} y2={0} {...st} />
        <line x1={14} y1={0} x2={24} y2={0} {...st} />
      </>)}
      {kind === 'rheostat' && (<>
        <rect x={-14} y={2} width={28} height={12} rx={2} {...st} />
        <line x1={-24} y1={8} x2={-14} y2={8} {...st} />
        <line x1={14} y1={8} x2={24} y2={8} {...st} />
        <line x1={0} y1={-12} x2={0} y2={2} {...st} />
        <polygon points="0,4 -4,-3 4,-3" {...dot} />
      </>)}
      {(kind === 'voltmeter' || kind === 'ammeter' || kind === 'ohmmeter' || kind === 'galvanometer') && (<>
        <circle r={13} {...st} />
        <text x={0} y={5} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--ink)">
          {kind === 'voltmeter' ? 'V' : kind === 'ammeter' ? 'A' : kind === 'ohmmeter' ? 'Ω' : 'G'}
        </text>
      </>)}
      {kind === 'acsource' && (<>
        <circle r={11} {...st} />
        <path d="M -6 0 Q -3 -7 0 0 T 6 0" transform="translate(0,0)" {...st} strokeWidth={1.8} />
      </>)}
      {kind === 'relay' && (<>
        <rect x={-11} y={-10} width={22} height={9} rx={1} {...st} strokeWidth={1.5} />
        <line x1={-7} y1={9} x2={7} y2={2} {...st} strokeWidth={1.5} />
      </>)}
      {kind === 'gate' && (<>
        <line x1={-24} y1={-7} x2={-11} y2={-7} {...st} strokeWidth={1.5} />
        <line x1={-24} y1={7} x2={-11} y2={7} {...st} strokeWidth={1.5} />
        <path d="M -11 -11 H 0 A 11 11 0 0 1 0 11 H -11 Z" {...st} strokeWidth={1.5} />
        <line x1={11} y1={0} x2={24} y2={0} {...st} strokeWidth={1.5} />
      </>)}
      {kind === 'multimeter' && (<>
        <rect x={-15} y={-12} width={30} height={24} rx={3} {...st} />
        <line x1={-11} y1={-7} x2={11} y2={-7} {...st} strokeWidth={1.2} />
        <circle cx={0} cy={4} r={4.5} {...st} strokeWidth={1.2} />
      </>)}
      {kind === 'capacitor' && (<>
        <line x1={-8} y1={-8} x2={8} y2={-8} {...st} strokeWidth={3} />
        <line x1={-8} y1={8} x2={8} y2={8} {...st} strokeWidth={3} />
        <line x1={-20} y1={0} x2={-8} y2={0} {...st} />
        <line x1={8} y1={0} x2={20} y2={0} {...st} />
      </>)}
      {kind === 'spdt' && (<>
        <circle cx={-10} cy={-10} r={2.5} {...dot} />
        <circle cx={10} cy={-10} r={2.5} {...dot} />
        <circle cx={0} cy={12} r={2.5} {...dot} />
        <line x1={0} y1={12} x2={0} y2={4} {...st} />
        <line x1={0} y1={4} x2={-9} y2={-8} {...st} />
      </>)}
      {kind === 'led' && (<>
        <polygon points="-10,-8 6,0 -10,8" {...st} />
        <line x1={6} y1={-8} x2={6} y2={8} {...st} strokeWidth={2.5} />
        <line x1={-22} y1={0} x2={-10} y2={0} {...st} />
        <line x1={6} y1={0} x2={22} y2={0} {...st} />
      </>)}
      {kind === 'bulb' && (<>
        <circle r={11} {...st} />
        <line x1={-7} y1={-7} x2={7} y2={7} {...st} />
        <line x1={7} y1={-7} x2={-7} y2={7} {...st} />
      </>)}
      {kind === 'switch' && (<>
        <circle cx={-10} cy={4} r={2.5} {...dot} />
        <circle cx={10} cy={4} r={2.5} {...dot} />
        <line x1={-10} y1={4} x2={10} y2={4} {...st} />
      </>)}
    </svg>
  )
}

export default function App() {
  const s = useEditor()
  const canUndo = s.histCount > 0
  const undoCount = s.histCount
  // 实验详情窗：选择实验后弹出，可拖动
  const [expInfo, setExpInfo] = useState<{ name: string; detail: string } | null>(null)
  const [expPos, setExpPos] = useState<{ x: number; y: number } | null>(null)
  const expDragRef = useRef<{ ox: number; oy: number } | null>(null)
  // 表盘浮窗：非模态（开着可继续实验）、可拖动；V/A 表带三接线柱拖环选量程
  const [dialPos, setDialPos] = useState<{ x: number; y: number } | null>(null)
  const dialDragRef = useRef<{ ox: number; oy: number } | null>(null)
  const [lugDrag, setLugDrag] = useState<{ lead: 'black' | 'red'; x: number; y: number } | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const gRef = useRef<SVGGElement | null>(null)
  const toCanvas = useCursorPos(svgRef, gRef)
  const [dragging, setDragging] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const [sliderDrag, setSliderDrag] = useState<{ id: string } | null>(null)
  // 平行板极板拖拽：横拖改间距 d，纵拖改正对面积（各自独立热区）
  const [capDrag, setCapDrag] = useState<{ id: string; which: 1 | 2; sx: number; sy: number; d0: number; o0: number } | null>(null)
  const onPlatePointerDown = (e: React.PointerEvent, c: Comp, which: 1 | 2) => {
    if (s.pendingFrom || s.tool !== 'select') return
    e.currentTarget.setPointerCapture(e.pointerId)
    s.beginHistory()
    const cap = c as { d?: number; o1?: number; o2?: number }
    setCapDrag({ id: c.id, which, sx: e.clientX, sy: e.clientY, d0: cap.d ?? 10, o0: (which === 1 ? cap.o1 : cap.o2) ?? 0 })
    s.select(c.id)
  }
  // 万用表表笔拖拽：尖端跟随指针，松手吸附 40 单位内最近端子；空白处松手 = 表笔脱离
  const [probeDrag, setProbeDrag] = useState<{ id: string; lead: 'A' | 'B'; x: number; y: number } | null>(null)
  const probeTipWorld = (c: Comp, lead: 'A' | 'B'): { x: number; y: number } => {
    const term = lead === 'A' ? (c as { pa?: string }).pa : (c as { pb?: string }).pb
    if (term) {
      const target = s.comps.find((k) => k.id === term.split(':')[0])
      if (target) return terminalPos(target, term.split(':')[1] as 'a' | 'b')
    }
    return { x: c.x + (lead === 'A' ? -52 : 52), y: c.y + 26 }
  }
  const onProbePointerDown = (e: React.PointerEvent, c: Comp, lead: 'A' | 'B') => {
    if (s.pendingFrom || s.tool !== 'select') return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const tip = probeTipWorld(c, lead)
    setProbeDrag({ id: c.id, lead, x: tip.x, y: tip.y })
    s.select(c.id)
  }
  useEffect(() => {
    if (!probeDrag) return
    const toWorld = (ev: PointerEvent) => {
      const el = gRef.current ?? svgRef.current
      const ctm = el?.getScreenCTM()
      if (!ctm) return null
      return new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse())
    }
    const move = (ev: PointerEvent) => {
      const p = toWorld(ev)
      if (p) setProbeDrag((d) => (d ? { ...d, x: p.x, y: p.y } : d))
    }
    const up = (ev: PointerEvent) => {
      const st = editorState()
      const p = toWorld(ev)
      if (p) {
        let best: { term: string; d: number } | null = null
        for (const k of st.comps) {
          for (const t of terminalsOf(k)) {
            const tp = terminalPos(k, t)
            const dd = Math.hypot(tp.x - p.x, tp.y - p.y)
            if (dd < 40 && (!best || dd < best.d)) best = { term: `${k.id}:${t}`, d: dd }
          }
        }
        const key = probeDrag.lead === 'A' ? 'pa' : 'pb'
        st.updateParam(probeDrag.id, key, best ? best.term : '')
      }
      setProbeDrag(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [probeDrag])

  // 触屏双指捏合缩放：window 捕获阶段追踪指针（先于 React 处理器，元件/导线上的手指也算数），
  // 两指落进画布即进入捏合——中点世界坐标锚定，指间距驱动 scale，挂起其他拖拽手势
  useEffect(() => {
    const inStage = (ev: PointerEvent) => !!(ev.target as Element | null)?.closest?.('.stage')
    const down = (ev: PointerEvent) => {
      pointersRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, inStage: inStage(ev) })
      const actives = [...pointersRef.current.values()].filter((p) => p.inStage)
      if (actives.length === 2) {
        setPan(null)
        setDragging(null)
        setCapDrag(null)
        clearLP()
        const d = Math.hypot(actives[0].x - actives[1].x, actives[0].y - actives[1].y)
        const c = { x: (actives[0].x + actives[1].x) / 2, y: (actives[0].y + actives[1].y) / 2 }
        const c1 = toCanvas({ clientX: c.x, clientY: c.y } as React.PointerEvent)
        pinchRef.current = { d, cx: c1.x, cy: c1.y }
      }
    }
    const move = (ev: PointerEvent) => {
      const rec = pointersRef.current.get(ev.pointerId)
      if (rec) { rec.x = ev.clientX; rec.y = ev.clientY }
      const actives = [...pointersRef.current.values()].filter((p) => p.inStage)
      if (actives.length === 2 && pinchRef.current) {
        const d = Math.hypot(actives[0].x - actives[1].x, actives[0].y - actives[1].y)
        const c = { x: (actives[0].x + actives[1].x) / 2, y: (actives[0].y + actives[1].y) / 2 }
        const c1 = toCanvas({ clientX: c.x, clientY: c.y } as React.PointerEvent)
        const f = Math.min(4, Math.max(0.2, d / (pinchRef.current.d || 1)))
        // 锚点数学：中点的 viewBox 坐标 = 世界坐标×scale + t（c1 是世界坐标，要先换算回 viewBox）
        const st = viewRef.current
        const mvbX = c1.x * st.scale + st.tx
        const mvbY = c1.y * st.scale + st.ty
        const scale = Math.min(3, Math.max(0.4, st.scale * f))
        const c0 = { x: pinchRef.current.cx, y: pinchRef.current.cy }
        applyView({ scale, tx: mvbX - c0.x * scale, ty: mvbY - c0.y * scale })
        pinchRef.current = { d, cx: c1.x, cy: c1.y }
      }
    }
    const up = (ev: PointerEvent) => {
      pointersRef.current.delete(ev.pointerId)
      if (pointersRef.current.size < 2) pinchRef.current = null
    }
    // capture=true：先于 React 的 stopPropagation，任何元件上的手指都不会漏记
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [switchPress, setSwitchPress] = useState<{ id: string; x0: number; y0: number; dx: number; dy: number; moved: boolean } | null>(null)
  const [hoverTerm, setHoverTerm] = useState<string | null>(null)
  const [grabbedEnd, setGrabbedEnd] = useState<{ otherTerm: string } | null>(null)
  const lastTermAction = useRef<{ term: string; ts: number } | null>(null)
  const [dialFor, setDialFor] = useState<string | null>(null) // 表盘读数练习弹窗（元件 id）
  // 主题与侧栏
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('circuit-theme') as 'dark' | 'light') || 'dark')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('circuit-theme', theme)
  }, [theme])
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  const [sbCollapsed, setSbCollapsed] = useState(false)
  const [sbWidth, setSbWidth] = useState(200)
  const [sbResizing, setSbResizing] = useState(false)
  // 手机/触屏适配：coarse 指针 + 窄屏 → 底部抽屉布局 + 触控手势
  const [mobile, setMobile] = useState(() => window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 820)
  const isTouch = mobile || window.matchMedia('(pointer: coarse)').matches
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [entryView, setEntryView] = useState<'menu' | 'app' | 'kin'>('menu') // 主界面菜单 → 电学台/运动学
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const onResize = () => {
      const m = mq.matches && window.innerWidth < 820
      setMobile(m)
      if (m) applyView({ scale: 1.2, tx: 0, ty: 0 })
    }
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const gripDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const sx = e.clientX
    const w0 = sbWidth
    const move = (ev: PointerEvent) => {
      setSbResizing(true)
      setSbWidth(Math.min(360, Math.max(170, w0 + ev.clientX - sx)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setTimeout(() => setSbResizing(false), 0)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  // 画布视图：滚轮缩放（以光标为中心）+ 空白处拖动平移，按 0 复位
  const [view, setViewState] = useState({ scale: 1, tx: 0, ty: 0 })
  const viewRef = useRef(view)
  const [viewAnim, setViewAnim] = useState(false)
  const applyView = (v: { scale: number; tx: number; ty: number }, anim = false) => {
    viewRef.current = v
    setViewState(v)
    setViewAnim(anim)
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

  // 状态种子：上次解出的门/继电器状态喂回下次求解（反馈电路=锁存器才有记忆；电路拓扑变了会被迭代自动纠正）
  const stateHintsRef = useRef<{ gateOut: Record<string, boolean>; relayOn: Record<string, boolean> }>({ gateOut: {}, relayOn: {} })
  const staticResult = useMemo(() => {
    const r = solve({ comps: s.comps, wires: s.wires }, stateHintsRef.current)
    stateHintsRef.current = { gateOut: r.gateOut ?? {}, relayOn: r.relayOn ?? {} }
    return r
  }, [s.comps, s.wires])

  // 瞬态引擎：画布上有电容或交流源时启动时间步进（rAF 驱动；状态存 ref，不进撤销栈）
  const hasDyn = s.comps.some((c) => c.kind === 'capacitor' || c.kind === 'acsource')
  const capQRef = useRef<Record<string, number>>({})
  const tRef = useRef(0)
  const acAccRef = useRef<Record<string, number>>({}) // 万用表交流档的瞬时平方 EMA（读数=√值）
  const curveRef = useRef<Record<string, number[]>>({})
  const [tResult, setTResult] = useState<SolveResult | null>(null)
  const [speed, setSpeed] = useState(0.05) // 仿真流速（真实秒×倍率），0=暂停
  useEffect(() => {
    if (!hasDyn) { setTResult(null); acAccRef.current = {}; return }
    let raf = 0
    let last = performance.now()
    const DT = 0.0002 // 单步 0.2ms
    const loop = (now: number) => {
      const dtReal = Math.min((now - last) / 1000, 0.05)
      last = now
      let remaining = dtReal * speed
      let st: TransientState = { qcap: capQRef.current, t: tRef.current, acAcc: acAccRef.current }
      let res: SolveResult | null = null
      let guard = 0
      while (remaining > 1e-6 && guard++ < 250) {
        const dt = Math.min(DT, remaining)
        const out = stepTransient({ comps: s.comps, wires: s.wires }, st, dt)
        st = out.state
        res = out.result
        remaining -= dt
      }
      capQRef.current = st.qcap
      tRef.current = st.t
      acAccRef.current = st.acAcc
      // U-t 曲线采样（每电容保留 400 点），并清理已删元件
      for (const k of Object.keys(curveRef.current)) {
        if (!s.comps.some((c) => c.id === k)) delete curveRef.current[k]
      }
      for (const c of s.comps) {
        if (c.kind !== 'capacitor') continue
        const arr = curveRef.current[c.id] ?? (curveRef.current[c.id] = [])
        arr.push((st.qcap[c.id] ?? 0) / capC(c))
        if (arr.length > 400) arr.shift()
      }
      if (res) setTResult(res)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [hasDyn, s.comps, s.wires, speed])
  const acRmsOf = (id: string): number | null =>
    tResult && acAccRef.current[id] != null ? Math.sqrt(acAccRef.current[id]) : null
  const result = tResult ?? staticResult

  // 持久化：电路一变就存
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ comps: s.comps, wires: s.wires }))
    } catch { /* 存储满就不管 */ }
  }, [s.comps, s.wires])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') s.cancelWire()
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        s.undo()
        return
      }
      if (e.key === '0') applyView({ scale: 1, tx: 0, ty: 0 }, true)
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

  // 表笔拖拽：跟随指针，靠近接线柱吸附；松手落到柱上才算接好
  useEffect(() => {
    if (!lugDrag) return
    const move = (e: PointerEvent) => setLugDrag({ ...lugDrag, x: e.clientX, y: e.clientY })
    const up = (e: PointerEvent) => {
      // 吸附判定：56px 内最近的接线柱，且不能已被另一根表笔占用
      let best: { post: string; d: number } | null = null
      for (const pin of document.querySelectorAll('.dial-float [data-post]')) {
        const r = pin.getBoundingClientRect()
        const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2))
        if (d < 56 && (!best || d < best.d)) best = { post: pin.getAttribute('data-post')!, d }
      }
      if (best && dialFor) {
        const st = editorState()
        const cur = st.comps.find((k) => k.id === dialFor)
        if (cur && (cur.kind === 'voltmeter' || cur.kind === 'ammeter')) {
          const ps: MeterPosts = cur.posts ?? { black: 'neg', red: cur.range === (cur.kind === 'voltmeter' ? 15 : 3) ? 'high' : 'low' }
          st.updateParam(dialFor, 'posts', { ...ps, [lugDrag.lead]: best.post })
          // 红笔决定量程（黑笔只在 − 时才有效）
          if (lugDrag.lead === 'red') st.updateParam(dialFor, 'range', best.post === 'high' ? (cur.kind === 'voltmeter' ? 15 : 3) : (cur.kind === 'voltmeter' ? 3 : 0.6))
        }
      }
      setLugDrag(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [lugDrag, dialFor])

  const [pan, setPan] = useState<{ sx: number; sy: number; tx0: number; ty0: number; active: boolean } | null>(null)

  // 触屏：双指捏合缩放（两指都在空白处按下触发）；单指仍为平移
  const pointersRef = useRef(new Map<number, { x: number; y: number; inStage?: boolean }>())
  const pinchRef = useRef<{ d: number; cx: number; cy: number } | null>(null)
  // 长按删除（仅触屏）：按住 500ms 删除元件/导线
  const lpRef = useRef<number | null>(null)
  const lpCleanupRef = useRef<(() => void) | null>(null)
  const clearLP = () => {
    if (lpRef.current) { clearTimeout(lpRef.current); lpRef.current = null }
    lpCleanupRef.current?.()
    lpCleanupRef.current = null
  }
  const startLP = (fn: () => void, e: React.PointerEvent) => {
    if (!isTouch) return
    clearLP()
    const sx = e.clientX, sy = e.clientY
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) clearLP()
    }
    const timer = window.setTimeout(() => {
      clearLP()
      navigator.vibrate?.(30)
      fn()
    }, 500)
    lpRef.current = timer
    const cleanup = () => {
      if (lpRef.current === timer) { clearTimeout(timer); lpRef.current = null }
      window.removeEventListener('pointermove', move)
      lpCleanupRef.current = null
    }
    lpCleanupRef.current = cleanup
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', cleanup, { once: true })
    window.addEventListener('pointercancel', cleanup, { once: true })
  }

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
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* 忽略 */ }
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
    if (capDrag) {
      // 平行板：横向拖 = 改变极板间距 d（mm），纵向拖 = 改变该板偏移（正对面积）
      const c = s.comps.find((k) => k.id === capDrag.id)
      if (c?.kind === 'capacitor' && c.plate) {
        const ctmSvg = svgRef.current?.getScreenCTM()
        const k = ctmSvg?.a ?? 1
        const dx = (e.clientX - capDrag.sx) / k
        const dy = (e.clientY - capDrag.sy) / k
        const d = Math.min(30, Math.max(2, capDrag.d0 + (capDrag.which === 2 ? dx : -dx) * 0.8))
        s.updateParam(c.id, 'd', Math.round(d * 10) / 10)
        const o = Math.max(-12, Math.min(12, capDrag.o0 + dy / 1.2))
        s.updateParam(c.id, capDrag.which === 1 ? 'o1' : 'o2', Math.round(o * 10) / 10)
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
    s.beginHistory() // 拖拽快照：整个手势算一步撤销
    startLP(() => s.remove(c.id), e) // 触屏长按删除
    setDragging({ id: c.id, dx: x - c.x, dy: y - c.y })
    s.select(c.id)
  }

  // 滑片拖拽：捕获指针 + 选中该元件，后续 move 在 onCanvasPointerMove 里映射 pos
  const onSliderPointerDown = (e: React.PointerEvent, c: Comp) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    s.beginHistory() // 滑片连续调整也只算一步
    setSliderDrag({ id: c.id })
    s.select(c.id)
  }

  // 开关：按下记原点，松手位移 <6px = 翻转通断，拖远 = 移动元件（与拖拽同款手感）
  const onSwitchPointerDown = (e: React.PointerEvent, c: Comp) => {
    if (s.pendingFrom || s.tool !== 'select') return
    const { x, y } = toCanvas(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    s.beginHistory()
    setSwitchPress({ id: c.id, x0: x, y0: y, dx: x - c.x, dy: y - c.y, moved: false })
    s.select(c.id)
  }

  const release = (e?: React.PointerEvent) => {
    setDragging(null)
    setSliderDrag(null)
    setCapDrag(null)
    // 触屏：抬起指针退出捏合
    if (e) pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
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

  const zoomBy = (factor: number) => {
    const k = Math.min(3, Math.max(0.4, viewRef.current.scale * factor)) / viewRef.current.scale
    const cx = W / 2, cy = H / 2
    applyView({
      scale: viewRef.current.scale * k,
      tx: cx - (cx - viewRef.current.tx) * k,
      ty: cy - (cy - viewRef.current.ty) * k,
    }, true)
  }

  const palette: { kind: CompKind; label: string }[] = [
    { kind: 'battery', label: '电源' },
    { kind: 'resistor', label: '定值电阻' },
    { kind: 'rheostat', label: '滑动变阻器' },
    { kind: 'voltmeter', label: '电压表' },
    { kind: 'ammeter', label: '电流表' },
    { kind: 'galvanometer', label: '灵敏电流计' },
    { kind: 'ohmmeter', label: '欧姆表' },
    { kind: 'multimeter', label: '万用表' },
    { kind: 'spdt', label: '单刀双掷' },
    { kind: 'led', label: '二极管' },
    { kind: 'capacitor', label: '电容' },
    { kind: 'acsource', label: '交流电源' },
    { kind: 'relay', label: '继电器' },
    { kind: 'gate', label: '逻辑门' },
    { kind: 'bulb', label: '小灯泡' },
    { kind: 'switch', label: '开关' },
  ]

  const selected = s.comps.find((c) => c.id === s.selectedId) ?? null
  const selResult = s.selectedId ? result.byComp[s.selectedId] : undefined

  // 万用表表笔：尖端世界坐标（吸附端子/拖动中/默认休息位）与表笔电压读数
  const multiProbeTips = (c: Comp) => {
    if (c.kind !== 'multimeter') return undefined
    const tip = (lead: 'A' | 'B'): { x: number; y: number } => {
      if (probeDrag && probeDrag.id === c.id && probeDrag.lead === lead) return { x: probeDrag.x, y: probeDrag.y }
      const term = lead === 'A' ? c.pa : c.pb
      if (term) {
        const target = s.comps.find((k) => k.id === term.split(':')[0])
        if (target) {
          const p = terminalPos(target, term.split(':')[1] as 'a' | 'b')
          // 双表笔叠在同一端子时左右错开，红笔不压黑笔
          if (c.pa && c.pa === c.pb) return { x: p.x + (lead === 'A' ? -6 : 6), y: p.y - 6 }
          return p
        }
      }
      return { x: c.x + (lead === 'A' ? -52 : 52), y: c.y + 26 }
    }
    return { a: tip('A'), b: tip('B') }
  }
  const multiProbeDv = (c: Comp): number | null => {
    if (c.kind !== 'multimeter' || !c.pa || !c.pb) return null
    if (![c.pa, c.pb].every((t) => s.comps.some((k) => k.id === t.split(':')[0]))) return null
    return (result.nodes?.[c.pa] ?? 0) - (result.nodes?.[c.pb] ?? 0)
  }

  // 主界面菜单：电学台 / 运动学实验室 两个入口（此处所有 hooks 已执行完，提前返回安全）
  if (entryView !== 'app') {
    if (entryView === 'kin') return <KinematicsLab onHome={() => setEntryView('menu')} />
  }
  if (entryView === 'menu') {
    return (
      <div className="menu">
        <div className="menu-bg" aria-hidden />
        <div className="menu-body">
          <p className="menu-badge">虚拟物理实验台 · MNA SOLVER</p>
          <h1 className="menu-title">电学实验室</h1>
          <p className="menu-sub">从欧姆定律到数字电路——把电流看见，把计算点亮</p>
          <div className="menu-cards">
            <button className="menu-card" onClick={() => setEntryView('app')}>
              <span className="menu-icon">
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#7b86e0" strokeWidth={2} strokeLinejoin="round">
                  <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13L13 2Z" />
                </svg>
              </span>
              <span className="menu-card-txt">
                <strong>开 始<small>电路实验台</small></strong>
                <span>16 类元件 · 7 组实验预设 · 万用表 · 数字电路</span>
              </span>
              <span className="menu-arrow">→</span>
            </button>
            <button className="menu-card" onClick={() => setEntryView('kin')}>
              <span className="menu-icon" style={{ background: 'rgba(224,138,151,.15)' }}>
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#e08a97" strokeWidth={2} strokeLinecap="round">
                  <path d="M3 20Q12 2 21 20" />
                  <circle cx={21} cy={20} r={1.6} fill="#e08a97" stroke="none" />
                </svg>
              </span>
              <span className="menu-card-txt">
                <strong>运动学实验室 <em className="menu-beta">β</em></strong>
                <span>抛体运动 · 自由沙盒 · 冲量碰撞引擎</span>
              </span>
              <span className="menu-arrow">→</span>
            </button>
          </div>
          <p className="menu-foot">72 项自动化测试 · 离线可运行 · 支持手机触屏</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {!mobile && !sbCollapsed && <div className="grip" onPointerDown={gripDown} />}
      {!mobile && sbCollapsed && (
        <div className="sb-reopen">
          <button className="icon-btn" onClick={() => setSbCollapsed(false)} title="展开侧栏"><UiIcon name="expand" /></button>
          <button className="icon-btn" onClick={toggleTheme} title="切换主题">{theme === 'dark' ? <UiIcon name="sun" /> : <UiIcon name="moon" />}</button>
        </div>
      )}
      <aside
        className={`palette${mobile ? ' mobile' : ''}${mobile && !drawerOpen ? ' hidden' : ''}${sbResizing ? ' resizing' : ''}`}
        style={mobile ? undefined : { width: sbCollapsed ? 0 : sbWidth, borderWidth: sbCollapsed ? 0 : undefined, padding: sbCollapsed ? 0 : undefined }}
      >
        <div className="pal-head">
          <h1>电路实验台</h1>
        </div>
        <div className="pal-head-tools">
          <button className="icon-btn" onClick={() => setHelpOpen(true)} title="操作说明" style={{ fontWeight: 700 }}>?</button>
          <button className="icon-btn" onClick={toggleTheme} title="切换黑/白主题">{theme === 'dark' ? <UiIcon name="sun" /> : <UiIcon name="moon" />}</button>
          <button className="icon-btn" onClick={() => setEntryView('menu')} title="返回主页"><UiIcon name="home" /></button>
          <span style={{ flex: 1 }} />
          <button className="icon-btn" onClick={() => setSbCollapsed(true)} title="收起侧栏"><UiIcon name="collapse" /></button>
        </div>
        <p className="hint">点击元件后在画布点击放置</p>
        {palette.map((p) => (
          <button
            key={p.kind}
            className={p.kind === 'gate' ? (s.gatePickerOpen ? 'active' : '') : s.tool === p.kind ? 'active' : ''}
            onClick={() => {
              if (p.kind === 'gate') {
                // 逻辑门：不直接进放置态，先弹选型窗（选完不关，可连续换类型连放）
                s.setGatePickerOpen(!s.gatePickerOpen)
                return
              }
              s.setTool(s.tool === p.kind ? 'select' : p.kind)
            }}
          >
            <MiniSymbol kind={p.kind} />
            {p.label}
          </button>
        ))}
        <div className="divider" />
        <button onClick={() => s.setDemoOpen(true)}><span className="dot" style={{ background: '#5e6ad2' }} />演示电路</button>
        <button onClick={() => setEntryView('kin')}><span className="dot" style={{ background: '#4aa3a2' }} />运动学实验室 β</button>
        <div className="pal-row">
          <button onClick={() => { if (confirm('清空画布上的全部元件和导线？')) s.clearAll() }}>
            <span className="dot" style={{ background: '#e08a97' }} />清空画布
          </button>
          <button onClick={() => s.undo()} disabled={!canUndo}>
            <span className="dot" style={{ background: '#9aa3b8' }} />撤销 {canUndo ? `(${undoCount})` : ''}
          </button>
        </div>
        {hasDyn && (
          <label className="speed-ctl">
            仿真流速 ×{speed.toFixed(2)}（0 = 暂停）
            <input type="range" min={0} max={1} step={0.01} value={speed} onChange={(e) => setSpeed(+e.target.value)} />
          </label>
        )}
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
          <g
            ref={gRef}
            style={{
              transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
              transformBox: 'view-box',
              transformOrigin: '0 0',
              transition: viewAnim ? 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
            }}
          >
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
                    style={{ animationDirection: (wr.dv ?? 0) >= 0 ? 'normal' : 'reverse' }}
                  />
                )}
                {/* 电流方向箭头：沿导线从高电位流向低电位，持续运动——微弱电流下也能看出电流存在 */}
                {wr && wr.current > 2e-5 && (() => {
                  const rev = (wr.dv ?? 0) < 0
                  const A = rev ? p2 : p1
                  const B = rev ? p1 : p2
                  const len = Math.hypot(B.x - A.x, B.y - A.y) || 1
                  const n = Math.min(5, Math.max(1, Math.round(len / 70)))
                  const dur = Math.max(0.9, len / 90)
                  return Array.from({ length: n }).map((_, i) => (
                    <polygon key={'ar' + i} points="-4,-4.5 6,0 -4,4.5" fill={T.wire.live} opacity={0.9}>
                      <animateMotion
                        dur={`${dur.toFixed(2)}s`}
                        begin={`${(-(i / n) * dur).toFixed(2)}s`}
                        repeatCount="indefinite"
                        rotate="auto"
                        path={`M ${A.x} ${A.y} L ${B.x} ${B.y}`}
                      />
                    </polygon>
                  ))
                })()}
                {/* 命中区：悬停显抓点，右键/触屏长按删除 */}
                <line
                  x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  stroke="transparent"
                  strokeWidth={16}
                  style={{ cursor: 'pointer' }}
                  onPointerEnter={() => s.selectWire(w.id)}
                  onPointerLeave={() => { if (s.selectedWire === w.id && !grabbedEnd) s.selectWire(null) }}
                  onPointerDown={(e) => { e.stopPropagation(); startLP(() => s.removeWire(w.id), e) }}
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
                onDialOpen={(c) => { setDialFor(c.id); setDialPos(null) }}
                onPlatePointerDown={onPlatePointerDown}
                probeDv={multiProbeDv(c)}
                relayOn={result.relayOn?.[c.id]}
                gateOut={result.gateOut?.[c.id]}
                multiRms={c.kind === 'multimeter' ? acRmsOf(c.id) : undefined}
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
          {/* 万用表表笔层：全局最后绘制，永远在元件符号之上（防被后放置的元件盖住） */}
          {s.comps.filter((c) => c.kind === 'multimeter').flatMap((mc) => {
            const tips = multiProbeTips(mc)
            if (!tips) return []
            return (['A', 'B'] as const).map((lead) => {
              const dragging = probeDrag?.id === mc.id && probeDrag.lead === lead
              const tip = dragging && probeDrag ? { x: probeDrag.x, y: probeDrag.y } : (lead === 'A' ? tips.a : tips.b)
              const ax = mc.x + (lead === 'A' ? -48 : 48)
              const ay = mc.y + 10
              const col = lead === 'A' ? '#3a3f4c' : '#d84a4a'
              const mx = (ax + tip.x) / 2
              const my = Math.max(ay, tip.y) + 26
              return (
                <g key={mc.id + 'probe' + lead}>
                  <path d={`M ${ax} ${ay} Q ${mx} ${my} ${tip.x} ${tip.y}`} fill="none" stroke={col} strokeWidth={2} strokeLinecap="round" />
                  <circle cx={tip.x} cy={tip.y} r={4.5} fill={col} stroke="#f2f4f8" strokeWidth={1.2} />
                  {!dragging && (
                    <circle cx={tip.x} cy={tip.y} r={10} fill="transparent" style={{ cursor: 'grab' }}
                      onPointerDown={(e) => { e.stopPropagation(); onProbePointerDown(e, mc, lead) }} />
                  )}
                </g>
              )
            })
          })}
          </g>
        </svg>
        <div className="zoom-ctl">
          <button onClick={() => zoomBy(1.25)} title="放大">＋</button>
          <button onClick={() => zoomBy(1 / 1.25)} title="缩小">－</button>
          <button onClick={() => applyView({ scale: 1, tx: 0, ty: 0 }, true)} title="复位视图">⌂</button>
        </div>
      </main>

      <aside className={`inspector${mobile ? ' mobile-sheet' : ''}${mobile && !selected ? ' hidden' : ''}`}>
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
                      onClick={() => {
                        const next = selected.range === low ? high : low
                        s.updateParam(selected.id, 'range', next)
                        s.updateParam(selected.id, 'posts', { black: 'neg', red: next === high ? 'high' : 'low' })
                      }}>
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
            {selected.kind === 'relay' && (() => {
              const coilI = selResult?.current ?? 0
              const on = !!result.relayOn?.[selected.id]
              return (
                <p className="warn" style={{ margin: 0 }}>
                  线圈电流 { (coilI * 1000).toFixed(1)}mA（阈值 10mA）· 当前{on ? '吸合：COM 接 NO' : '释放：COM 接 NC'}。
                  线圈接 a/b，触点接 c(COM)/d(NC)/p(NO)。给线圈通足够大的电流，看触点切换点亮另一条回路的灯。
                </p>
              )
            })()}
            {selected.kind === 'gate' && (() => {
              const btn = (t: Gate['type'], text: string) => (
                <button className="wide" disabled={selected.type === t}
                  onClick={() => s.updateParam(selected.id, 'type', t)}>
                  {text}{selected.type === t ? '（当前）' : ''}
                </button>
              )
              return (
                <>
                  {btn('AND', '与门 AND（输入全高才输出高）')}
                  {btn('NAND', '与非门 NAND（万能门，可搭所有逻辑）')}
                  {btn('OR', '或门 OR（任一输入高就输出高）')}
                  {btn('NOR', '或非门 NOR（万能门另一门派）')}
                  {btn('XOR', '异或门 XOR（不同才输出高，加法器核心）')}
                  {btn('NOT', '非门 NOT（输入高则输出低）')}
                  <p className="warn" style={{ margin: 0 }}>
                    ⚠ VCC(c) 和 GND(d) 必须接电源，门才能工作。输入 ≥1.5V 为高电平。
                    NOT 门只使用输入 a。输出 p 可接灯泡/继电器/下一个门的输入。
                  </p>
                </>
              )
            })()}
            {selected.kind === 'acsource' && (() => {
              const inst = selResult?.dv ?? 0
              return (
                <>
                  <label>峰值电压 {selected.e}V
                    <input type="range" min={1} max={24} step={0.5} value={selected.e}
                      onChange={(e) => s.updateParam(selected.id, 'e', +e.target.value)} />
                  </label>
                  <label>频率 {selected.f}Hz
                    <input type="range" min={0.5} max={50} step={0.5} value={selected.f}
                      onChange={(e) => s.updateParam(selected.id, 'f', +e.target.value)} />
                  </label>
                  <label>内阻 {selected.r === 0 ? '0（理想）' : `${selected.r}Ω`}
                    <input type="range" min={0} max={10} step={0.1} value={selected.r}
                      onChange={(e) => s.updateParam(selected.id, 'r', +e.target.value)} />
                  </label>
                  <p className="warn" style={{ margin: 0 }}>
                    正弦源 e(t) = {selected.e}·sin(2π·{selected.f}·t) V，当前瞬时 {inst.toFixed(2)}V。
                    直流电表读到的是瞬时值（会摆动）；配合电容可看充放电跟随，低频率下灯泡闪烁肉眼可见。
                  </p>
                </>
              )
            })()}
            {selected.kind === 'capacitor' && (() => {
              const u = selResult?.dv ?? 0
              const cap = capC(selected)
              const q = cap * u * 1e6
              const e = 0.5 * cap * u * u * 1000
              const overlap = selected.plate ? Math.max(0, 1 - Math.abs((selected.o1 ?? 0) - (selected.o2 ?? 0)) / 24) : 1
              const hist = curveRef.current[selected.id] ?? []
              const max = Math.max(0.5, ...hist.map(Math.abs))
              const pts = hist.map((v, i) => `${((i / Math.max(1, hist.length - 1)) * 220).toFixed(1)},${(20 - (v / max) * 17).toFixed(1)}`).join(' ')
              return (
                <>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={!!selected.plate}
                      onChange={(ev) => s.updateParam(selected.id, 'plate', ev.target.checked)} />
                    平行板模式（极板可拖动）
                  </label>
                  {selected.plate ? (
                    <p className="warn" style={{ margin: 0 }}>
                      d = {selected.d ?? 10}mm · 正对面积 {(overlap * 100).toFixed(0)}% · C = {(cap * 1e6).toFixed(0)}µF
                      <br />横拖极板改间距 d，纵拖改正对面积 S。
                      <br />【决定式实验】先连电源充电，再断开电源（Q 不变）：拖远极板 → C 变小 → U=Q/C 升高；上下错开极板 → S 变小 → U 同样升高。
                    </p>
                  ) : (
                    <label>电容 {(selected.c * 1e6).toFixed(0)}µF
                      <input type="range" min={10} max={4700} step={10} value={Math.round(selected.c * 1e6)}
                        onChange={(ev) => s.updateParam(selected.id, 'c', +ev.target.value / 1e6)} />
                    </label>
                  )}
                  <svg width={220} height={40} style={{ borderRadius: 4, background: 'var(--panel-line)' }}>
                    <line x1={0} y1={20} x2={220} y2={20} stroke="var(--faint)" strokeWidth={0.5} strokeDasharray="3 3" />
                    {hist.length > 1 && <polyline points={pts} fill="none" stroke="var(--accent-soft)" strokeWidth={1.5} />}
                  </svg>
                  <button className="wide" onClick={() => {
                    capQRef.current[selected.id] = 0
                    curveRef.current[selected.id] = []
                  }}>
                    电容清零（Q=0，重新演示充电）
                  </button>
                  <p className="warn" style={{ margin: 0 }}>
                    U = {u.toFixed(2)}V · Q = {q.toFixed(0)}µC · E = ½CU² = {e.toFixed(2)}mJ
                    {selResult && Math.abs(selResult.current) > 1e-6 ? ' · 充/放电中' : ' · 稳态（无电流）'}。
                    曲线为电容电压 U-t 记录（右端最新）；拖慢侧栏"仿真流速"可看清充电过程。
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
            {selected.kind === 'multimeter' && (() => {
              const classic = selected.style === 'classic'
              const live = s.comps.some((k) => k.kind === 'battery' && k.emf > 0)
              const mode = selected.mode
              const legacyKey = classic
                ? (mode === 'DCV' ? `V${V_RANGES.includes(selected.range ?? 2.5) ? (selected.range as number) : 2.5}`
                  : mode === 'DCA' ? `mA${(A_RANGES.includes(selected.range ?? 0.5) ? (selected.range as number) : 0.5) * 1000}`
                  : mode)
                : mode
              const knobKey = CLASSIC_KNOB.some((p) => p.key === legacyKey) || DIGI_KNOB.some((p) => p.key === legacyKey) ? legacyKey : 'OFF'
              const onKnob = (key: string) => s.updateParam(selected.id, 'mode', key as typeof mode)
              return (
                <>
                  <button className="wide" onClick={() => s.updateParam(selected.id, 'style', classic ? 'digital' : 'classic')}>
                    {classic ? '切换为数显款（LCD 读数）' : '切换为经典款（指针表盘）'}
                  </button>
                  <ModeKnob dark={classic} positions={classic ? CLASSIC_KNOB : DIGI_KNOB} value={knobKey} onChange={onKnob} />
                  <p className="warn" style={{ margin: 0 }}>
                    {mode === 'OFF'
                      ? '已关机：拖动旋钮到 DCV/DCA/Ω 任一测量档开始测量（真实万用表用完要关档省电）。'
                      : !MULTI_SUPPORTED(mode)
                      ? '⚠ 该档位为真机档位（交流/蜂鸣/电容/hFE），本实验台暂未模拟。'
                      : mode === 'DCV'
                      ? '两表笔跨接（并联）在被测元件两端；显示负值 = 表笔接反，不影响读数。'
                      : mode === 'DCA'
                      ? '两种接法：两根表笔搭在回路断口两端（电流经表笔流过表内分流电阻），或用接线端子串进回路。读数带符号，接反显示负值。'
                      : '断电测电阻：读数 = 两端间等效电阻（电源置零）。' + (live ? '⚠ 电路带电——测单个元件请断开一端。' : '可跨接在元件两端直接测量。')}
                    {classic ? '点击画布示数查看表盘，表盘下方也有档位旋钮。' : '点击画布上的读数可打开万用表面板。'}
                    旋钮支持直接拖动（棘轮定位）。
                  </p>
                </>
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
                <>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={!!selected.led}
                      onChange={(e) => s.updateParam(selected.id, 'led', e.target.checked)} />
                    发光型（LED，导通时发光）
                  </label>
                  <p className="warn" style={{ margin: 0 }}>
                    二极管：单向导电（电流 + → −，即 a → b）。
                    {i > 0.002 ? `正向导通中，I = ${(i * 1000).toFixed(0)}mA` : dv < -0.5 ? '⚠ 反向截止（接反了，不导通）' : '正向电压不足 2V，未导通'}
                  </p>
                </>
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
            <div className="pal-row">
              <button className="wide" onClick={() => s.rotate(selected.id)}>旋转</button>
              <button className="wide danger" onClick={() => s.remove(selected.id)}>删除</button>
            </div>
          </div>
        )}
        {result.openCircuit && <p className="warn">⚠ 电路存在断路</p>}
      </aside>
      {mobile && (
        <>
          <button className="fab" onClick={() => { setDrawerOpen((v) => !v); s.select(null) }}>
            {drawerOpen ? '收起元件库 ▾' : '元件库 ▴'}
          </button>
          <button className="fab help" onClick={() => setHelpOpen(true)}>? 说明</button>
        </>
      )}

      {dialFor && (() => {
        // 表盘读数练习弹窗：复刻学生实验电表——双排刻度（上=大量程，下=小量程）、30 小格
        // 灵敏电流计为特例：中心零位 ±1mA 双向刻度；欧姆表为特例：非线性反向刻度（0 在右，∞ 在左）
        // 万用表为特例：数字表，LCD 读数 + 三档换挡按钮
        const c = s.comps.find((k) => k.id === dialFor)
        if (c && c.kind === 'multimeter') {
          const mode = c.mode
          const classic = c.style === 'classic'
          const live = s.comps.some((k) => k.kind === 'battery' && k.emf > 0)
          const solvedM = result.byComp[c.id]
          const R = 100, CX = 140, CY = 148
          const dir = (f: number, r: number) => {
            const deg = (-50 + 100 * f) * Math.PI / 180
            return { x: CX + Math.sin(deg) * r, y: CY - Math.cos(deg) * r }
          }
          if (classic) {
            // 经典指针款 = MF47 面板复刻：多弧刻度表盘窗（Ω 反向弧 + 0~250 主刻度 + 红色 ACV 装饰行）
            // + 镜面弧 + A-V-Ω 铭牌 + 底部黑色大旋钮（白指针、档位环同真机十五档）
            const kind = multiKindOf(mode)
            const isV = kind === 'V'
            const isA = kind === 'A'
            const isO = kind === 'Ω'
            const supported = kind !== null
            const range = multiRangeOf(mode, c.range) ?? 0
            const rEff = isV
              ? (c.ideal ? 1e7 : Math.max((c.r ?? 3000) * range / 2.5, 1))
              : (c.ideal ? 1e-3 : Math.max(0.06 / Math.max(range, 1e-4), 1e-3))
            const sVal = !supported || isO ? 0 : isV ? (multiProbeDv(c) ?? (solvedM?.dv ?? 0)) : (solvedM?.dv ?? 0) / rEff
            const val = isO ? (result.ohm?.[c.id] ?? Infinity) : Math.abs(sVal)
            const over = supported && !isO && Math.abs(sVal) > range + 1e-9
            const needleTarget = !supported ? 0 : isO ? 10 / (10 + val) : range ? sVal / range : 0
            const ohmTicks = [0, 2, 5, 10, 20, 50, 200, 1e9].map((r) => ({ r, f: 10 / (10 + r), label: r >= 1e9 ? '∞' : String(r) }))
            const numFs = [0, 0.2, 0.4, 0.6, 0.8, 1]
            const hiNums = [0, 50, 100, 150, 200, 250]
            const acvNums = ['10', '50', '250', '1000']
            const loNums = [0, 10, 20, 30, 40, 50]
            const ticks: { f: number; o: { x: number; y: number }; i: { x: number; y: number }; major: boolean; lbl?: string }[] = []
            if (isO) {
              for (const t of ohmTicks) ticks.push({ f: t.f, o: dir(t.f, R), i: dir(t.f, R - 13), major: true, lbl: t.label })
            } else {
              for (let i = 0; i <= 30; i++) {
                const f = i / 30
                const major = i % 5 === 0
                ticks.push({ f, o: dir(f, R), i: dir(f, R - (major ? 13 : i % 5 === 0 ? 9 : 5)), major, lbl: undefined })
              }
            }
            // 档位键 → 旋钮位置（旧存档 DCV/DCA+range 归一到最近 MF47 档）
            const legacyKey = mode === 'DCV' ? `V${V_RANGES.includes(c.range ?? 2.5) ? (c.range as number) : 2.5}` : mode === 'DCA' ? `mA${(A_RANGES.includes(c.range ?? 0.5) ? (c.range as number) : 0.5) * 1000}` : mode
            const knobKey = CLASSIC_KNOB.some((p) => p.key === legacyKey) ? legacyKey : 'OFF'
            const onKnob = (key: string) => s.updateParam(c.id, 'mode', key as typeof mode)
            return (
              <div className="dial-float" style={dialPos ? { left: dialPos.x, top: dialPos.y, right: 'auto' } : undefined}>
                <div
                  className="dial-head"
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return
                    const el = e.currentTarget.parentElement as HTMLElement
                    const r = el.getBoundingClientRect()
                    dialDragRef.current = { ox: e.clientX - r.left, oy: e.clientY - r.top }
                    e.currentTarget.setPointerCapture(e.pointerId)
                  }}
                  onPointerMove={(e) => {
                    if (!dialDragRef.current) return
                    setDialPos({
                      x: Math.max(0, Math.min(e.clientX - dialDragRef.current.ox, window.innerWidth - 220)),
                      y: Math.max(0, Math.min(e.clientY - dialDragRef.current.oy, window.innerHeight - 60)),
                    })
                  }}
                  onPointerUp={() => { dialDragRef.current = null }}
                >
                  <h3>万用表（经典款）· {mode === 'OFF' ? 'OFF（关机）' : isO ? 'Ω 档（断电测电阻）' : isV ? `直流电压 ${range}V` : isA ? `直流电流 ${range * 1000}mA` : `${mode}（未模拟）`}</h3>
                  <button className="icon-btn" title="关闭" onClick={() => setDialFor(null)}>×</button>
                </div>
                <div className="dial-body">
                  <svg width={300} height={196} viewBox="0 0 290 196">
                    <rect x={4} y={2} width={282} height={192} rx={10} fill="#f5f2e9" stroke="#b9ab8d" />
                    {/* 镜面弧（防视差） */}
                    <path d={`M ${dir(0.02, R + 4).x} ${dir(0.02, R + 4).y} Q ${dir(0.5, R + 22).x} ${dir(0.5, R + 22).y - 6} ${dir(0.98, R + 4).x} ${dir(0.98, R + 4).y}`} fill="none" stroke="#cfe0ea" strokeWidth={5} opacity={0.6} />
                    {ticks.map((t, i) => (
                      <g key={i}>
                        <line x1={t.o.x} y1={t.o.y} x2={t.i.x} y2={t.i.y} stroke="#2a3140" strokeWidth={t.major ? 2 : 1} />
                        {t.lbl !== undefined && (
                          <text x={dir(t.f, R - 24).x} y={dir(t.f, R - 24).y + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#2a3140">{t.lbl}</text>
                        )}
                      </g>
                    ))}
                    {!isO && numFs.map((f, i) => (
                      <g key={'n' + i}>
                        <text x={dir(f, R - 26).x} y={dir(f, R - 26).y} textAnchor="middle" fontSize={11} fontWeight={700} fill="#2a3140">{hiNums[i]}</text>
                        <text x={dir(f, R - 44).x} y={dir(f, R - 44).y} textAnchor="middle" fontSize={9} fontWeight={400} fill="#c0392b">{acvNums[i] ?? ''}</text>
                        <text x={dir(f, R - 60).x} y={dir(f, R - 60).y} textAnchor="middle" fontSize={9} fontWeight={400} fill="#8b93a7">{loNums[i]}</text>
                      </g>
                    ))}
                    <Needle target={needleTarget} CX={CX} CY={CY} R={R} />
                    <text x={CX} y={CY - 30} textAnchor="middle" fontSize={13} fontWeight={700} fill="#2a3140">A-V-Ω</text>
                    <text x={CX} y={CY - 15} textAnchor="middle" fontSize={9} fill="#b9ab8d">MF-47 型 · 中国制造</text>
                  </svg>
                  <div className="dial-rows">
                    {mode === 'OFF' ? (
                      <span>已关机：拖动旋钮到任一测量档开始测量。</span>
                    ) : !supported ? (
                      <span>⚠ {mode} 档为真机档位，本实验台暂未模拟（交流/扩展量程）——旋到 DCV/DCA/Ω 测量。</span>
                    ) : isO ? (
                      <>
                        <span>读数：{fmtOhm(val)}</span>
                        <span>Ω 刻度非线性反向：0Ω 在右端，∞ 在左端（R×1k）</span>
                      </>
                    ) : isV ? (
                      <>
                        <span>按 0~250 刻度读：{(sVal / range * 250).toFixed(0)}（满偏 = 量程 {range}V）</span>
                        <span>实测电压：{sVal.toFixed(2)}V · 指针偏转满刻度的 {(Math.abs(sVal / range) * 100).toFixed(0)}%</span>
                      </>
                    ) : (
                      <>
                        <span>读数：{(sVal * 1000).toFixed(1)}mA（满偏 = 量程 {range * 1000}mA）</span>
                        <span>按 0~250 刻度折算：{(sVal / range * 250).toFixed(0)} · 指针偏转满刻度的 {(Math.abs(sVal / range) * 100).toFixed(0)}%</span>
                      </>
                    )}
                  </div>
                  <ModeKnob dark positions={CLASSIC_KNOB} value={knobKey} onChange={onKnob} />
                  <p className="dial-hint">
                    {mode === 'OFF'
                      ? '已关机：拖动旋钮到任一测量档开始测量。'
                      : !supported
                      ? '该档位未模拟，指针无读数。'
                      : isO
                      ? '断电测电阻：读数 = 两端间等效电阻（电源置零）。' + (live ? '⚠ 电路带电——测单个元件请断开一端。' : '') + (val >= 1e7 ? ' 当前两端断路（∞）。' : '')
                      : over
                      ? '⚠ 超量程：指针打满，真实电表可能被烧坏——旋到更大量程档'
                      : '拖动黑色旋钮换档（棘轮定位），也可点刻度字直接跳档。显示负值 = 表笔接反（指针反偏）。'}
                  </p>
                  <div className="dial-val" style={over ? { color: 'var(--danger)' } : undefined}>
                    {mode === 'OFF' || !supported ? '--' : isO ? fmtOhm(val) : (over ? '⚠ 超量程' : isV ? `${sVal.toFixed(2)}V` : `${(sVal * 1000).toFixed(1)}mA`)}
                  </div>
                  <button className="wide" onClick={() => setDialFor(null)}>关闭</button>
                </div>
              </div>
            )
          }
          // 数显款：LCD 读数 + 真机档位环旋钮（OFF/DCV/ACV/DCA/ACA/蜂鸣/Ω/CAP/hFE）
          const probedV = multiProbeDv(c)
          const rms = acRmsOf(c.id)
          const v = mode === 'DCV' ? (probedV ?? (solvedM?.dv ?? 0)) : mode === 'ACV' ? (rms ?? NaN) : mode === 'DCA' ? (solvedM?.dv ?? 0) / 0.01 : mode === 'ACA' ? (rms ?? NaN) : (result.ohm?.[c.id] ?? Infinity)
          const ol = (mode === 'DCV' && Math.abs(v) > 20) || (mode === 'DCA' && Math.abs(v) > 10) || ((mode === 'ACV' || mode === 'ACA') && rms != null && rms > (mode === 'ACV' ? 20 : 10))
          // AC 档末位抖动（真数字表 RMS 读数的低位翻动）；OL/--- 判断用干净值
          const dispV = rms != null && (mode === 'ACV' || mode === 'ACA') ? rms * (1 + (Math.random() - 0.5) * 0.008) : v
          const disp = mode === 'DCV' ? (ol ? 'OL' : v.toFixed(2)) : mode === 'DCA' ? (ol ? 'OL' : v.toFixed(3))
            : mode === 'ACV' ? (rms == null ? '---' : ol ? 'OL' : dispV.toFixed(2)) : mode === 'ACA' ? (rms == null ? '---' : ol ? 'OL' : dispV.toFixed(3))
            : mode === 'OHM' ? fmtOhm(v) : ''
          const onKnob = (key: string) => s.updateParam(c.id, 'mode', key as typeof mode)
          const unitTxt = mode === 'OHM' ? '' : mode === 'OFF' ? '' : MULTI_SUPPORTED(mode) ? mode : ''
          return (
            <div className="dial-float" style={dialPos ? { left: dialPos.x, top: dialPos.y, right: 'auto' } : undefined}>
              <div
                className="dial-head"
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return
                  const el = e.currentTarget.parentElement as HTMLElement
                  const r = el.getBoundingClientRect()
                  dialDragRef.current = { ox: e.clientX - r.left, oy: e.clientY - r.top }
                  e.currentTarget.setPointerCapture(e.pointerId)
                }}
                onPointerMove={(e) => {
                  if (!dialDragRef.current) return
                  setDialPos({
                    x: Math.max(0, Math.min(e.clientX - dialDragRef.current.ox, window.innerWidth - 220)),
                    y: Math.max(0, Math.min(e.clientY - dialDragRef.current.oy, window.innerHeight - 60)),
                  })
                }}
                onPointerUp={() => { dialDragRef.current = null }}
              >
                <h3>万用表（数显款）· 真机档位环</h3>
                <button className="icon-btn" title="关闭" onClick={() => setDialFor(null)}>×</button>
              </div>
              <div className="dial-body">
                <div className="dial-val" style={{ fontSize: 30, fontFamily: 'monospace', minHeight: 36 }}>
                  {disp}{unitTxt}
                </div>
                <ModeKnob positions={DIGI_KNOB} value={mode} onChange={onKnob} />
                <p className="dial-hint">
                  {mode === 'OFF'
                    ? '已关机：拖动旋钮到 DCV/DCA/Ω 开始测量。'
                    : mode === 'DCV'
                    ? '两根表笔（黑COM/红）拖到元件两端自动吸附端子即可测压，无需接线；显示负值 = 表笔接反。超 20V 显示 OL。'
                    : mode === 'DCA'
                    ? '两种接法：两根表笔搭在回路断口两端（电流经表笔流过表内 0.01Ω 分流电阻），或用接线端子 a/b 串进回路。读数带符号；超 10A 显示 OL。'
                    : mode === 'OHM'
                    ? '两根表笔跨接在被测元件两端（自动吸附），读数 = 等效电阻（所有电源置零）。'
                      + (live ? '⚠ 电路带电——测单个元件请断开一端。' : '')
                      + (v >= 1e7 ? ' 当前两端断路（∞）。' : '')
                    : mode === 'ACV' || mode === 'ACA'
                    ? '交流有效值（RMS）档：接法同 DCV/DCA。读数 = 瞬时值平方平均的平方根，即"发热等效"的直流值——交流 6V 峰值读 4.24。需瞬态引擎运行（画布上有交流源或电容即自动运行），静止电路显示 ---。'
                    : '⚠ 该档位为真机档位（蜂鸣/电容/hFE），本实验台暂未模拟——旋到 DCV/DCA/Ω/ACV/ACA 测量。'}
                  拖动旋钮换档（棘轮定位），点刻度字直接跳档；表笔尖端可拖动、靠近端子自动吸附；开着面板也能继续连线。
                </p>
                <button className="wide" onClick={() => setDialFor(null)}>关闭</button>
              </div>
            </div>
          )
        }
        if (!c || (c.kind !== 'voltmeter' && c.kind !== 'ammeter' && c.kind !== 'galvanometer' && c.kind !== 'ohmmeter') || (c.kind !== 'galvanometer' && c.kind !== 'ohmmeter' && c.customRange)) return null
        const isV = c.kind === 'voltmeter'
        const isG = c.kind === 'galvanometer'
        const isO = c.kind === 'ohmmeter'
        const unit = isG ? 'mA' : isO ? 'Ω' : isV ? 'V' : 'A'
        const solvedM = result.byComp[c.id]
        const signedG = isG ? (solvedM?.dv ?? 0) / METER_G_R * 1000 : 0 // 带符号 mA
        const mInfo = isG || isO ? null : meterRangeOf(c)
        const reversed = mInfo?.reversed ?? false
        const unconnected = mInfo === null && !isG && !isO
        // 带符号显示值：电压 = dv；电流 = dv/支路内阻（红黑接反时整体取反 → 指针反偏）
        const branchR = (!isV && !isG && !isO) ? (c.ideal ? 1e-3 : Math.max(c.r * (c.posts && mInfo ? 0.6 / mInfo.range : 1), 1e-3)) : 1
        const sVal = isG || isO ? Math.abs(signedG) : (reversed ? -1 : 1) * (isV ? (solvedM?.dv ?? 0) : (solvedM?.dv ?? 0) / branchR)
        const val = Math.abs(sVal) || (isO ? (result.ohm?.[c.id] ?? Infinity) : 0)
        const over = isG ? Math.abs(signedG) > METER_G_IG : !isO && Math.abs(sVal) > c.range + 1e-9
        const hiActive = !isG && !isO && c.range === (isV ? 15 : 3) // 当前量程对应哪排刻度数字
        const R = 100, CX = 140, CY = 148
        const dir = (f: number, r: number) => {
          const deg = (-50 + 100 * f) * Math.PI / 180
          return { x: CX + Math.sin(deg) * r, y: CY - Math.cos(deg) * r }
        }
        const needleTarget = isG
          ? (signedG / METER_G_IG + 1) / 2
          : isO
          ? 10 / (10 + val) // 非线性：f = R中值/(R中值+R)，0Ω 在右、∞ 在左
          : unconnected ? 0 : sVal / c.range // 可为负（反偏）、可超 1（打满）——物理动画里钳位
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
            // 大量程数字由下方 numFs 统一绘制（这里再画一遍会和它叠成"数字虚影"）
            ticks.push({ f, o: dir(f, R), i: dir(f, R - (major ? 13 : mid ? 9 : 5)), major, lbl: undefined })
          }
        }
        return (
          <div className="dial-float" style={dialPos ? { left: dialPos.x, top: dialPos.y, right: 'auto' } : undefined}>
            <div
              className="dial-head"
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('button')) return // 点 × 时别抢事件（capture 会吞 click）
                const el = e.currentTarget.parentElement as HTMLElement
                const r = el.getBoundingClientRect()
                dialDragRef.current = { ox: e.clientX - r.left, oy: e.clientY - r.top }
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                if (!dialDragRef.current) return
                setDialPos({
                  x: Math.max(0, Math.min(e.clientX - dialDragRef.current.ox, window.innerWidth - 220)),
                  y: Math.max(0, Math.min(e.clientY - dialDragRef.current.oy, window.innerHeight - 60)),
                })
              }}
              onPointerUp={() => { dialDragRef.current = null }}
            >
              <h3>{isO ? '欧姆表 · 中值 10Ω（断电测电阻）' : isG ? '灵敏电流计 · 量程 −1~+1mA（中心零位）' : `${isV ? '电压表' : '电流表'} · 量程 0~${c.range}${unit}`}</h3>
              <button className="icon-btn" title="关闭" onClick={() => setDialFor(null)}>×</button>
            </div>
            <div className="dial-body">
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
                    {/* 当前量程对应的那排数字加深，另一排变浅——解决"数字重复"的观感 */}
                    <text x={dir(f, R - 26).x} y={dir(f, R - 26).y} textAnchor="middle" fontSize={12} fontWeight={700} fill={hiActive ? '#2a3140' : '#b9c2d4'}>{hiNums[i]}</text>
                    {!isG && <text x={dir(f, R - 46).x} y={dir(f, R - 46).y} textAnchor="middle" fontSize={10} fontWeight={hiActive ? 400 : 700} fill={hiActive ? '#b9c2d4' : '#2a3140'}>{loNums[i]}</text>}
                  </g>
                ))}
                <Needle target={needleTarget} CX={CX} CY={CY} R={R} />
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
                      <span>按 0~15V 刻度读：{(sVal * 15 / c.range).toFixed(1)}V（每小格 0.5V）</span>
                      <span>按 0~3V 刻度读：{(sVal * 3 / c.range).toFixed(2)}V（每小格 0.1V）</span>
                    </>
                  ) : (
                    <>
                      <span>按 0~3A 刻度读：{(sVal * 3 / c.range).toFixed(2)}A（每小格 0.1A）</span>
                      <span>按 0~0.6A 刻度读：{(sVal * 0.6 / c.range).toFixed(3)}A（每小格 0.02A）</span>
                    </>
                  )}
                </div>
              )}
              {(() => {
                // 学生表三接线柱 + 两根表笔：黑笔默认在 −、红笔在量程柱；都可拖动，靠近吸附。
                // 有效接法 = 黑笔在 − 且红笔在量程柱；否则表笔没接好 → 支路断开（画布标签会提示）
                if (isG || isO) return null
                const low = isV ? 3 : 0.6
                const high = isV ? 15 : 3
                const ps: MeterPosts = c.posts ?? { black: 'neg', red: c.range === high ? 'high' : 'low' }
                const postList: [string, string][] = [['neg', '− 公共'], ['low', `${low}${unit}`], ['high', `${high}${unit}`]]
                return (
                  <div className="dial-posts">
                    {postList.map(([p, lbl]) => (
                      <div key={p} className={'post' + (ps.black === p || ps.red === p ? ' active' : '')} data-post={p}>
                        <span className={'post-pin' + (p === 'neg' ? ' black' : '')} />
                        <label>{lbl}</label>
                        {(['black', 'red'] as const).map((lead) => (
                          ps[lead] === p && !(lugDrag && lugDrag.lead === lead) && (
                            <span key={lead} className={'lug ' + lead} title="按住拖动表笔，靠近接线柱松手吸附"
                              style={ps.black === p && ps.red === p ? { transform: `translateX(${lead === 'black' ? '-105%' : '-5%'})` } : undefined}
                              onPointerDown={(e) => { e.preventDefault(); setLugDrag({ lead, x: e.clientX, y: e.clientY }) }} />
                          )
                        ))}
                      </div>
                    ))}
                  </div>
                )
              })()}
              <p className="dial-hint">
                {isG || isO ? '' : unconnected
                  ? '⚠ 表笔没接好：黑笔接 − 公共端，红笔接任一量程柱'
                  : reversed
                  ? '⚠ 红黑接反：电流反向流过表头，指针反偏、读数为负——对调两根表笔即可恢复'
                  : over
                  ? '⚠ 超量程：指针打满，真实电表可能被烧坏——换大量程或减小电流/电压'
                  : '两根表笔都能拖动：靠近接线柱松手吸附；黑笔接 −，红笔接量程柱。开着窗口也能继续实验'}
              </p>
              <div className="dial-val" style={reversed || unconnected ? { color: 'var(--danger)' } : undefined}>
                {unconnected ? '--' : (isO ? fmtOhm(val) : (isG ? signedG : sVal).toFixed(2))}{unit}
              </div>
              <button className="wide" onClick={() => setDialFor(null)}>关闭</button>
            </div>
            {lugDrag && (() => {
              // 拖动中画一条表笔线：从表盘底部锚点到指针位置，像真的拖着线
              const svgEl = document.querySelector('.dial-float svg')
              if (!svgEl) return null
              const r = svgEl.getBoundingClientRect()
              const ax = r.left + r.width * (lugDrag.lead === 'black' ? 0.38 : 0.62)
              const ay = r.bottom + 4
              return (
                <svg className="dial-cables">
                  <path
                    d={`M ${ax} ${ay} Q ${(ax + lugDrag.x) / 2} ${(ay + lugDrag.y) / 2 + 40} ${lugDrag.x} ${lugDrag.y}`}
                    stroke={lugDrag.lead === 'red' ? '#d84a4a' : '#3a3f4c'} strokeWidth={2.5} fill="none" strokeLinecap="round"
                  />
                </svg>
              )
            })()}
            {lugDrag && <span className={'lug floating ' + lugDrag.lead} style={{ left: lugDrag.x, top: lugDrag.y }} />}
          </div>
        )
      })()}
      {helpOpen && (
        <div className="dial-overlay" onClick={() => setHelpOpen(false)}>
          <div className="exp-picker" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <div className="exp-picker-head">
              <h2>操作说明</h2>
              <button className="icon-btn" onClick={() => setHelpOpen(false)} title="关闭">×</button>
            </div>
            <section>
              <h3>电脑端</h3>
              <div className="exp-card" style={{ cursor: 'default' }}>
                <span>点左侧元件 → 画布点击放置 ｜ 按住端子拖到另一端松手即连线（或点两个端子）</span>
                <span>右键删除元件/导线 ｜ R 旋转 · Del 删除 · Ctrl+Z 撤销</span>
                <span>滚轮缩放 · 拖空白平移 · 按 0 复位视图 ｜ 单击开关通断 · 拖变阻器箭头调阻值</span>
                <span>点电表示数可开表盘练习读数 ｜ 选中元件可在右侧改参数、展开内部结构</span>
              </div>
            </section>
            <section>
              <h3>手机 / 触屏</h3>
              <div className="exp-card" style={{ cursor: 'default' }}>
                <span>「元件库」按钮呼出/收起元件列表 ｜ 拖端子连线，方法与电脑相同</span>
                <span>长按元件或导线 = 删除（会震动）｜ 双指捏合缩放 · 单指拖空白平移</span>
                <span>选中元件 → 底部卡片改参数、旋转、删除 ｜ 点电表示数开表盘</span>
              </div>
            </section>
            <section>
              <h3>万用表</h3>
              <div className="exp-card" style={{ cursor: 'default' }}>
                <span>DCV 档：两根表笔（黑/红）拖到元件两端自动吸附，直接测电压，无需接线</span>
                <span>Ω 档：表笔跨接元件测电阻（测单个元件请先断开一端）</span>
                <span>DCA 档测电流：断开回路一处，把两根表笔搭在断口两端（电流经表笔流过）</span>
                <span>旋钮拖动换档 ｜ 读数负值 = 表笔接反 ｜ OL = 超量程</span>
              </div>
            </section>
            <section>
              <h3>试试这些</h3>
              <div className="exp-card" style={{ cursor: 'default' }}>
                <span>交流电源 + 灯泡：调低频率看灯泡随正弦闪烁</span>
                <span>电容：充电后「清零」再看重新充电的电流变化；平行板模式拖动极板看 U=Q/C 变化</span>
                <span>惠斯通电桥（演示电路 → 必修三）：灵敏电流计指零的平衡实验</span>
              </div>
            </section>
          </div>
        </div>
      )}
      {/* 逻辑门选型窗：选完不关闭，可连续换类型放置 */}
      {s.gatePickerOpen && (
        <div className="dial-overlay" onClick={() => s.setGatePickerOpen(false)}>
          <div className="exp-picker" onClick={(e) => e.stopPropagation()}>
            <div className="exp-picker-head">
              <h2>选择逻辑门类型</h2>
              <button className="icon-btn" onClick={() => s.setGatePickerOpen(false)} title="关闭">×</button>
            </div>
            <section>
              <h3>组合逻辑门</h3>
              <div className="exp-cards">
                {(['AND', 'NAND', 'OR', 'NOR', 'XOR', 'NOT'] as const).map((t) => {
                  const name = { AND: '与门 AND', NAND: '与非门 NAND', OR: '或门 OR', NOR: '或非门 NOR', XOR: '异或门 XOR', NOT: '非门 NOT' }[t]
                  const desc = {
                    AND: '输入全高才输出高（Y = A·B）',
                    NAND: '先与后取反——万能门，可搭出所有逻辑（Y = ¬(A·B)）',
                    OR: '任一输入高就输出高（Y = A+B）',
                    NOR: '先或后取反——另一门派万能门（Y = ¬(A+B)）',
                    XOR: '输入不同才输出高——加法器的核心（Y = A⊕B）',
                    NOT: '输入高则输出低（Y = Ā，只用输入 a）',
                  }[t]
                  const bubble = t === 'NOT' || t === 'NAND' || t === 'NOR'
                  const body = t === 'AND' || t === 'NAND' ? GATE_BODY.AND : t === 'NOT' ? GATE_BODY.NOT : GATE_BODY.OR
                  return (
                    <button
                      key={t}
                      className={`exp-card${s.gateType === t ? ' gate-pick-active' : ''}`}
                      onClick={() => s.setGateType(t)}
                    >
                      <strong>{name}</strong>
                      <span>{desc}</span>
                      <svg width={64} height={48} viewBox="-32 -24 64 48" aria-hidden style={{ marginTop: 6 }}>
                        {t !== 'NOT' && (<>
                          <line x1={-32} y1={-16} x2={-20} y2={-16} className="gate-mini-line" />
                          <line x1={-32} y1={16} x2={-20} y2={16} className="gate-mini-line" />
                        </>)}
                        {t === 'NOT' && <line x1={-32} y1={0} x2={-20} y2={0} className="gate-mini-line" />}
                        {t === 'XOR' && <path d="M -27 -24 C -20 -14 -20 14 -27 24" className="gate-mini-line" />}
                        <path d={body} className="gate-mini-line" />
                        {bubble && <circle cx={19} cy={0} r={4} className="gate-mini-line" />}
                        <line x1={bubble ? 23 : 24} y1={0} x2={32} y2={0} className="gate-mini-line" />
                      </svg>
                    </button>
                  )
                })}
              </div>
              <p className="warn" style={{ marginTop: 10 }}>
                选中后在画布点击放置；此窗保持打开，可换类型连续放置。
                ⚠ VCC(c) 和 GND(d) 必须接电源，门才能工作；输入 ≥1.5V 为高电平。
              </p>
            </section>
          </div>
        </div>
      )}

      {s.demoOpen && (
        <div className="dial-overlay" onClick={() => s.setDemoOpen(false)}>
          <div className="exp-picker" onClick={(e) => e.stopPropagation()}>
            <div className="exp-picker-head">
              <h2>选择实验电路</h2>
              <button className="icon-btn" onClick={() => s.setDemoOpen(false)} title="关闭">×</button>
            </div>
            {['基础', '必修三 · 电学实验', '拓展', '数字电路'].map((group) => {
              const items = EXPERIMENTS.filter((e) => e.group === group)
              if (!items.length) return null
              return (
                <section key={group}>
                  <h3>{group}</h3>
                  <div className="exp-cards">
                    {items.map((e) => (
                      <button key={e.id} className="exp-card" onClick={() => { s.loadExperiment(e.id); setExpInfo({ name: e.name, detail: e.detail }); setExpPos(null) }}>
                        <strong>{e.name}</strong>
                        <span>{e.desc}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      )}

      {/* 实验详情窗：载入实验后出现，标题栏可拖动，浮在右侧栏旁边 */}
      {expInfo && (
        <div
          className="exp-panel"
          style={expPos ? { left: expPos.x, top: expPos.y, right: 'auto' } : undefined}
        >
          <div
            className="exp-panel-head"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button')) return // 点 × 时别启动拖拽（capture 会吞 click）
              const el = e.currentTarget.parentElement as HTMLElement
              const r = el.getBoundingClientRect()
              expDragRef.current = { ox: e.clientX - r.left, oy: e.clientY - r.top }
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (!expDragRef.current) return
              const x = e.clientX - expDragRef.current.ox
              const y = e.clientY - expDragRef.current.oy
              setExpPos({ x: Math.max(0, Math.min(x, window.innerWidth - 200)), y: Math.max(0, Math.min(y, window.innerHeight - 60)) })
            }}
            onPointerUp={() => { expDragRef.current = null }}
          >
            <strong>{expInfo.name}</strong>
            <button className="icon-btn" title="关闭" onClick={() => setExpInfo(null)}>×</button>
          </div>
          <div className="exp-panel-body">
            {expInfo.detail.split('\n').map((line, i) => <p key={i}>{line}</p>)}
          </div>
        </div>
      )}
    </div>
  )
}
