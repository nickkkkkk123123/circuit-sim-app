// 电路元件与连线的数据模型（与渲染彻底解耦）
export type CompKind = 'battery' | 'resistor' | 'bulb' | 'switch' | 'rheostat' | 'voltmeter' | 'ammeter' | 'galvanometer' | 'ohmmeter' | 'spdt' | 'led'

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
  range: number // 量程 V：3 或 15（学生表双档）；customRange 开启时可任意
  customRange?: boolean // 自定义量程模式：可任意设量程，但禁用表盘读数练习
  expanded?: boolean // 展开内部结构：表头 G 串联分压电阻（仅实际模式）
}

export interface Ammeter extends BaseComp {
  kind: 'ammeter'
  r: number // 内阻 Ω（实际模式）= Rg ∥ 分流电阻
  ideal: boolean // 理想模式：内阻 1mΩ
  range: number // 量程 A：0.6 或 3（学生表双档）；customRange 开启时可任意
  customRange?: boolean // 自定义量程模式
  expanded?: boolean // 展开内部结构：表头 G 并联分流电阻（仅实际模式）
}

export interface Galvanometer extends BaseComp {
  kind: 'galvanometer'
  // 灵敏电流计：内阻 Rg（100Ω）、量程 ±Ig（1mA）固定；电流方向决定指针偏转方向
}

export interface Ohmmeter extends BaseComp {
  kind: 'ohmmeter'
  // 欧姆表：读数 = 零源辅助解中两端间等效电阻；主解中呈高阻开路
}

export interface Spdt extends BaseComp {
  kind: 'spdt'
  pos: 1 | 2 | 0 // 单刀双掷（ON-OFF-ON）：1=接通触点1，2=接通触点2，0=中间位断开
}

export interface Diode extends BaseComp {
  kind: 'led'
  led?: boolean // 发光型（LED）：导通时发光；缺省=普通二极管（纯符号）
}

// LED 参数：正向压降、导通电阻、截止电阻、亮度基准电流
export const LED_VF = 2
export const LED_R_ON = 0.01
export const LED_R_OFF = 1e9
export const LED_I_FULL = 0.02

// 灵敏电流计表头（G）：内阻固定 100Ω，量程 ±1mA（双向偏转），也是电表改装的核心部件
export const METER_G_R = 100
export const METER_G_IG = 0.001

export type Comp = Battery | Resistor | Bulb | Switch | Rheostat | Voltmeter | Ammeter | Galvanometer | Ohmmeter | Spdt | Diode

export type TerminalId = 'a' | 'b' | 'c' | 'd' | 'p'

/** 元件当前对外暴露的接线柱（滑动变阻器：紧凑态 a/b/p 三端子，展开态 a/b/c/d 四端子，其余两端子） */
export function terminalsOf(c: Comp): TerminalId[] {
  if (c.kind === 'rheostat') return c.expanded ? ['a', 'b', 'c', 'd'] : ['a', 'b', 'p']
  if (c.kind === 'spdt') return ['a', 'b', 'p']
  return ['a', 'b']
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
  galvanometer: 24,
  ohmmeter: 24,
  spdt: 28,
  led: 24,
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
  if (c.kind === 'spdt') {
    // 单刀双掷：a=公共端（下），b=触点1（左上），p=触点2（右上）
    const local: Partial<Record<TerminalId, [number, number]>> = {
      a: [0, 28],
      b: [-28, -20],
      p: [28, -20],
    }
    const [lx, ly] = local[t] ?? local.a!
    if (c.rot === 90) return { x: c.x - ly, y: c.y + lx }
    return { x: c.x + lx, y: c.y + ly }
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
      return { id, kind, x, y, rot: 0, r: 3000, ideal: true, range: 3, customRange: false }
    case 'ammeter':
      return { id, kind, x, y, rot: 0, r: 0.1, ideal: true, range: 0.6, customRange: false }
    case 'galvanometer':
      return { id, kind, x, y, rot: 0 }
    case 'ohmmeter':
      return { id, kind, x, y, rot: 0 }
    case 'spdt':
      return { id, kind, x, y, rot: 0, pos: 1 }
    case 'led':
      return { id, kind, x, y, rot: 0 }
  }
}
