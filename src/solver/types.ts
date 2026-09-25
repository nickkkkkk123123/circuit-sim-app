// 电路元件与连线的数据模型（与渲染彻底解耦）
export type CompKind = 'battery' | 'resistor' | 'bulb' | 'switch' | 'rheostat'

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
  r: number // 内阻 Ω
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

export type Comp = Battery | Resistor | Bulb | Switch | Rheostat

export type TerminalId = 'a' | 'b' | 'c' | 'd'

/** 元件当前对外暴露的接线柱（展开态滑动变阻器为四端子，其余两端子） */
export function terminalsOf(c: Comp): TerminalId[] {
  return c.kind === 'rheostat' && c.expanded ? ['a', 'b', 'c', 'd'] : ['a', 'b']
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
}

// 展开态滑动变阻器：金属杆距中心的高度
const RHEO_ROD_Y = 24
const RHEO_HALF_W = 32

export function terminalPos(c: Comp, t: TerminalId): { x: number; y: number } {
  if (c.kind === 'rheostat' && c.expanded) {
    const local: Record<TerminalId, [number, number]> = {
      a: [-RHEO_HALF_W, 0],
      b: [RHEO_HALF_W, 0],
      c: [-RHEO_HALF_W, -RHEO_ROD_Y],
      d: [RHEO_HALF_W, -RHEO_ROD_Y],
    }
    const [lx, ly] = local[t]
    // 90° 旋转与两端子元件同约定：a→上方，b→下方
    if (c.rot === 90) return { x: c.x - ly, y: c.y + lx }
    return { x: c.x + lx, y: c.y + ly }
  }
  const d = TERMINAL_OFFSET[c.kind]
  const sign = t === 'a' || t === 'c' ? -1 : 1
  if (c.rot === 90) return { x: c.x, y: c.y + sign * d }
  return { x: c.x + sign * d, y: c.y }
}

export function defaultComp(kind: CompKind, id: string, x: number, y: number): Comp {
  switch (kind) {
    case 'battery':
      return { id, kind, x, y, rot: 0, emf: 6, r: 0.5 }
    case 'resistor':
      return { id, kind, x, y, rot: 0, r: 10 }
    case 'bulb':
      return { id, kind, x, y, rot: 0, r: 10, ratedP: 3.6 }
    case 'switch':
      return { id, kind, x, y, rot: 0, closed: true }
    case 'rheostat':
      return { id, kind, x, y, rot: 0, Rmax: 20, pos: 0.5, expanded: false }
  }
}
