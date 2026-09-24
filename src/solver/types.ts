// 电路元件与连线的数据模型（与渲染彻底解耦）
export type CompKind = 'battery' | 'resistor' | 'bulb' | 'switch'

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

export type Comp = Battery | Resistor | Bulb | Switch

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
}

export function terminalPos(c: Comp, t: 'a' | 'b'): { x: number; y: number } {
  const d = TERMINAL_OFFSET[c.kind]
  const sign = t === 'a' ? -1 : 1
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
  }
}
