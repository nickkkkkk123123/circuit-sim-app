// 电路元件与连线的数据模型（与渲染彻底解耦）
export type CompKind = 'battery' | 'resistor' | 'bulb' | 'switch' | 'rheostat' | 'voltmeter' | 'ammeter'

export interface BaseComp {
  id: string
  kind: CompKind
  x: number // 中心点画布坐标
  y: number
  rot: 0 | 90 // 0=水平(a左b右) 90=垂直(a上b下)
}

export interface Battery extends BaseComp {
  kind: 'battery'
  emf: number // 电动势 V
  r: number // 内阻 Ω（0=理想电源，求解器钳位 1mΩ）
  expanded?: boolean // 展开内部结构：E 与 r 串联的虚线框图示（旧数据缺省=紧凑态）
}
export interface Resistor extends BaseComp {
  kind: 'resistor'
  r: number // Ω
}
export interface Bulb extends BaseComp {
  kind: 'bulb'
  r: number // Ω（冷阻近似）
  ratedP: number // 额定功率 W（亮度基准）
}
export interface Switch extends BaseComp {
  kind: 'switch'
  closed: boolean
}
export interface Rheostat extends BaseComp {
  kind: 'rheostat'
  Rmax: number // 最大阻值 Ω（电阻丝全长）
  pos: number // 滑片位置 0..1（0=靠 a 端）
  expanded: boolean // 展开四接线柱：a/b=电阻丝两端（下），c/d=金属杆两端（上）
}

export interface Voltmeter extends BaseComp {
  kind: 'voltmeter'
  r: number // 内阻 Ω（实际模式）= Rg + 分压电阻
  ideal: boolean // 理想模式：内阻 10MΩ，对电路无影响
  range: number // 量程 V（表盘满偏）
  expanded?: boolean // 展开内部结构：表头 G 串联分压电阻（仅实际模式）
}

export interface Ammeter extends BaseComp {
  kind: 'ammeter'
  r: number // 内阻 Ω（实际模式）= Rg ∥ 分流电阻
  ideal: boolean // 理想模式：内阻 1mΩ
  range: number // 量程 A（表盘满偏）
  expanded?: boolean // 展开内部结构：表头 G 并联分流电阻（仅实际模式）
}

// 灵敏电流计表头（G）：内阻固定 100Ω，改装电阻由总内阻反推
export const METER_G_R = 100

export type Comp = Battery | Resistor | Bulb | Switch | Rheostat | Voltmeter | Ammeter

export type TerminalId = 'a' | 'b' | 'c' | 'd' | 'p'

/** 元件当前对外暴露的接线柱（滑动变阻器：紧凑态 a/b/p 三端子，展开态 a/b/c/d 四端子，其余两端子） */
export function terminalsOf(c: Comp): TerminalId[] {
  if (c.kind !== 'rheostat') return ['a', 'b']
  return c.expanded ? ['a', 'b', 'c', 'd'] : ['a', 'b', 'p']
}

export interface Wire {
  id: string
  a: string // 端子 id: `${compId}:a|b`
  b: string
}

export interface Circuit {
  comps: Comp[]
  wires: Wire[]
}

// 每个元件的端子在自身坐标系下的偏移（半长）
export const TERMINAL_OFFSET: Record<CompKind, number> = {
  battery: 30,
  resistor: 30,
  bulb: 24,
  switch: 26,
  rheostat: 32,
  voltmeter: 24,
  ammeter: 24,
}

// 展开态滑动变阻器：金属杆距中心的高度
const RHEO_ROD_Y = 24
const RHEO_HALF_W = 32

export function terminalPos(c: Comp, t: TerminalId): { x: number; y: number } {
  if (c.kind === 'rheostat') {
    if (c.expanded) {
      const local: Partial<Record<TerminalId, [number, number]>> = {
        a: [-RHEO_HALF_W, 0],
        b: [RHEO_HALF_W, 0],
        c: [-RHEO_HALF_W, -RHEO_ROD_Y],
        d: [RHEO_HALF_W, -RHEO_ROD_Y],
      }
      // 防御：悬空端子（如切换模式瞬间的 :p 导线）落到 a 位，绝不让渲染层崩
      const [lx, ly] = local[t] ?? local.a!
      // 90° 旋转与两端子元件同约定：a→上方，b→下方
      if (c.rot === 90) return { x: c.x - ly, y: c.y + lx }
      return { x: c.x + lx, y: c.y + ly }
    }
    // 紧凑态：p 端子骑在滑片箭头顶端，位置随 pos 动态变化
    if (t === 'p') {
      const bx = -20 + 40 * c.pos
      if (c.rot === 90) return { x: c.x + 32, y: c.y + bx }
      return { x: c.x + bx, y: c.y - 32 }
    }
  }
  const d = TERMINAL_OFFSET[c.kind]
  // 展开态电表：端子随虚线框外移
  const dm = (c.kind === 'voltmeter' || c.kind === 'ammeter') && c.expanded && !c.ideal ? 48 : d
  const sign = t === 'a' || t === 'c' ? -1 : 1
  if (c.rot === 90) return { x: c.x, y: c.y + sign * dm }
  return { x: c.x + sign * dm, y: c.y }
}

export function defaultComp(kind: CompKind, id: string, x: number, y: number): Comp {
  switch (kind) {
    case 'battery':
      return { id, kind, x, y, rot: 0, emf: 6, r: 0.5, expanded: false }
    case 'resistor':
      return { id, kind, x, y, rot: 0, r: 10 }
    case 'bulb':
      return { id, kind, x, y, rot: 0, r: 10, ratedP: 3.6 }
    case 'switch':
      return { id, kind, x, y, rot: 0, closed: true }
    case 'rheostat':
      return { id, kind, x, y, rot: 0, Rmax: 20, pos: 0.5, expanded: false }
    case 'voltmeter':
      return { id, kind, x, y, rot: 0, r: 3000, ideal: true, range: 15 }
    case 'ammeter':
      return { id, kind, x, y, rot: 0, r: 0.1, ideal: true, range: 3 }
  }
}
