// 电路元件与连线的数据模型（与渲染彻底解耦）
export type CompKind = 'battery' | 'resistor' | 'bulb' | 'switch' | 'rheostat' | 'voltmeter' | 'ammeter' | 'galvanometer' | 'ohmmeter' | 'multimeter' | 'spdt' | 'led' | 'capacitor' | 'acsource' | 'relay' | 'gate'

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
  posts?: MeterPosts // 两根表笔各接哪个接线柱（缺省 = 黑笔−、红笔小量程，兼容旧存档）
}

export interface Ammeter extends BaseComp {
  kind: 'ammeter'
  r: number // 内阻 Ω（实际模式）= Rg ∥ 分流电阻
  ideal: boolean // 理想模式：内阻 1mΩ
  range: number // 量程 A：0.6 或 3（学生表双档）；customRange 开启时可任意
  customRange?: boolean // 自定义量程模式
  expanded?: boolean // 展开内部结构：表头 G 并联分流电阻（仅实际模式）
  posts?: MeterPosts // 同电压表
}

export type MeterPost = 'neg' | 'low' | 'high'
export interface MeterPosts { black: MeterPost; red: MeterPost }

/**
 * 学生表接线判定：
 * · 黑笔接 − 且红笔接量程柱 → 正常，返回 { range, reversed: false }
 * · 红黑接反（红笔在 −、黑笔在量程柱）→ 电流反向流过表头，返回 { range, reversed: true }（指针反偏）
 * · 其他（两笔挤在量程柱 / 悬空）→ 表笔没接好，返回 null（支路断开、无读数）
 * 缺省 posts = 旧存档兼容，视为已接好
 */
export function meterRangeOf(c: Voltmeter | Ammeter): { range: number; reversed: boolean } | null {
  if (!c.posts) return { range: c.range, reversed: false }
  const { black, red } = c.posts
  const low = c.kind === 'voltmeter' ? 3 : 0.6
  const high = c.kind === 'voltmeter' ? 15 : 3
  if (black === 'neg' && red === 'low') return { range: low, reversed: false }
  if (black === 'neg' && red === 'high') return { range: high, reversed: false }
  if (black === 'low' && red === 'neg') return { range: low, reversed: true }
  if (black === 'high' && red === 'neg') return { range: high, reversed: true }
  return null
}

export interface Galvanometer extends BaseComp {
  kind: 'galvanometer'
  // 灵敏电流计：内阻 Rg（100Ω）、量程 ±Ig（1mA）固定；电流方向决定指针偏转方向
}

export interface Ohmmeter extends BaseComp {
  kind: 'ohmmeter'
  // 欧姆表：读数 = 零源辅助解中两端间等效电阻；主解中呈高阻开路
}

export interface Multimeter extends BaseComp {
  kind: 'multimeter'
  // 档位 = 旋钮刻度键（照 MF47 实物）：DCV/DCA/OHM 为数显款三键（配 range）；经典款直接存刻度键
  // V2.5/V10/V50/V250、mA500/mA50/mA5、OHM(=R×1k) 参与仿真；OFF/ACV/ACA/BUZZ/CAP/hFE/V1000/OHM100/OHM10/OHM1/mA0.25 为真机占位档（开路无读数）
  mode: 'OFF' | 'DCV' | 'ACV' | 'DCA' | 'ACA' | 'BUZZ' | 'OHM' | 'CAP' | 'hFE' | 'V2.5' | 'V10' | 'V50' | 'V250' | 'V1000' | 'OHM1k' | 'OHM100' | 'OHM10' | 'OHM1' | 'mA500' | 'mA50' | 'mA5' | 'mA0.25'
  style?: 'digital' | 'classic' // 数显款（缺省，LCD+侧栏旋钮）/ 经典款（指针表盘+档位旋钮）
  range?: number // 数显款 DCV/DCA 的量程（V 或 A）；经典款档位直接存 mode，不用此字段
  r?: number // 经典款实际内阻基准（V 档 3000Ω@2.5V 随量程缩放 / A 档 0.06Ω·A/range）
  ideal?: boolean // 经典款理想表（内阻 ∞/0）
  pa?: string // 黑表笔吸附的端子 id（"compId:t"；空串=未吸附）
  pb?: string // 红表笔吸附的端子 id
}

// 万用表量程表（MF47 实物数值）
export const V_RANGES = [2.5, 10, 50, 250]
export const A_RANGES = [0.5, 0.05, 0.005]

/** 万用表当前档位的测量类型（V/A/Ω；占位档返回 null） */
export function multiKindOf(m: Multimeter['mode']): 'V' | 'A' | 'Ω' | null {
  if (m === 'OHM') return 'Ω'
  if (m === 'DCV' || m.startsWith('V')) return 'V'
  if (m === 'DCA' || m.startsWith('mA')) return 'A'
  return null
}

/** 万用表当前档位的仿真量程（V 或 A；占位档/OFF 返回 null） */
export function multiRangeOf(m: Multimeter['mode'], stored?: number): number | null {
  switch (m) {
    case 'DCV': return V_RANGES.includes(stored ?? 2.5) ? (stored as number) : 2.5
    case 'V2.5': return 2.5
    case 'V10': return 10
    case 'V50': return 50
    case 'V250': return 250
    case 'DCA': return A_RANGES.includes(stored ?? 0.5) ? (stored as number) : 0.5
    case 'mA500': return 0.5
    case 'mA50': return 0.05
    case 'mA5': return 0.005
    default: return null
  }
}

export interface Spdt extends BaseComp {
  kind: 'spdt'
  pos: 1 | 2 | 0 // 单刀双掷（ON-OFF-ON）：1=接通触点1，2=接通触点2，0=中间位断开
}

export interface Diode extends BaseComp {
  kind: 'led'
  led?: boolean // 发光型（LED）：导通时发光；缺省=普通二极管（纯符号）
}

export interface Capacitor extends BaseComp {
  kind: 'capacitor'
  c: number // 电容 F（普通模式；默认 1000µF=0.001）
  plate?: boolean // 平行板模式：C = εS/d 随极板间距 d、正对面积实时变化（高中决定式实验）
  d?: number // 平行板间距 mm（2~30，默认 10）
  o1?: number // 板1纵向偏移（-12~12，决定正对面积）
  o2?: number // 板2纵向偏移
}

/** 电容有效电容（F）：普通模式取 c；平行板模式 C = 1000µF × 正对面积比 × (10mm/d) */
export function capC(c: Capacitor): number {
  if (!c.plate) return c.c
  const overlap = Math.max(0, 1 - Math.abs((c.o1 ?? 0) - (c.o2 ?? 0)) / 24)
  return 1e-3 * overlap * (10 / Math.max(c.d ?? 10, 2))
}

export interface ACSource extends BaseComp {
  kind: 'acsource'
  e: number // 峰值电压 V（e(t) = E·sin(2πft)）
  f: number // 频率 Hz（默认 2Hz，肉眼可见闪烁；可调到 50Hz）
  r: number // 内阻 Ω（0=理想，求解器钳位 1mΩ）
}

// 继电器：线圈 a-b（电流超阈值→吸合），触点 COM(c)-NO(p) 常开 / COM(c)-NC(d) 常闭
export interface Relay extends BaseComp {
  kind: 'relay'
}

// 逻辑门：VCC(c)/GND(d) 必须接电源，输入 a(/b)，输出 p。C=εS/d 同款教学宏——门内部=开关+电源
export interface Gate extends BaseComp {
  kind: 'gate'
  type: 'AND' | 'OR' | 'NOT'
}

// 继电器/逻辑门参数常量
export const RELAY_ITH = 0.01 // 吸合阈值电流 A（10mA）
export const RELAY_COIL_R = 100 // 线圈电阻 Ω
export const GATE_VTH = 1.5 // 输入高电平阈值 V
export const GATE_R_ON = 10 // 输出驱动导通电阻 Ω
export const GATE_R_PULL = 10000 // 输出下拉电阻 Ω

// LED 参数：正向压降、导通电阻、截止电阻、亮度基准电流
export const LED_VF = 2
export const LED_R_ON = 0.01
export const LED_R_OFF = 1e9
export const LED_I_FULL = 0.02

// 灵敏电流计表头（G）：内阻固定 100Ω，量程 ±1mA（双向偏转），也是电表改装的核心部件
export const METER_G_R = 100
export const METER_G_IG = 0.001

export type Comp = Battery | Resistor | Bulb | Switch | Rheostat | Voltmeter | Ammeter | Galvanometer | Ohmmeter | Multimeter | Spdt | Diode | Capacitor | ACSource | Relay | Gate

export type TerminalId = 'a' | 'b' | 'c' | 'd' | 'p'

/** 元件当前对外暴露的接线柱（滑动变阻器：紧凑态 a/b/p 三端子，展开态 a/b/c/d 四端子，其余两端子） */
export function terminalsOf(c: Comp): TerminalId[] {
  if (c.kind === 'rheostat') return c.expanded ? ['a', 'b', 'c', 'd', 'p'] : ['a', 'b', 'p']
  if (c.kind === 'spdt') return ['a', 'b', 'p']
  if (c.kind === 'relay') return ['a', 'b', 'c', 'd', 'p'] // a/b=线圈，c=COM，d=常闭NC，p=常开NO
  if (c.kind === 'gate') return ['a', 'b', 'c', 'd', 'p'] // a(/b)=输入，c=VCC，d=GND，p=输出
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
  multimeter: 46,
  capacitor: 26,
  acsource: 30,
  relay: 40,
  gate: 30,
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
  if (c.kind === 'relay') {
    // 线圈 a/b 左右，触点一排在下：d(NC) c(COM) p(NO)
    const local: Partial<Record<TerminalId, [number, number]>> = {
      a: [-40, -14], b: [40, -14], c: [0, 30], d: [-22, 30], p: [22, 30],
    }
    const [lx, ly] = local[t] ?? local.a!
    if (c.rot === 90) return { x: c.x - ly, y: c.y + lx }
    return { x: c.x + lx, y: c.y + ly }
  }
  if (c.kind === 'gate') {
    // 输入 a/b 在左，输出 p 在右，VCC 上、GND 下
    const local: Partial<Record<TerminalId, [number, number]>> = {
      a: [-32, -16], b: [-32, 16], p: [36, 0], c: [0, -32], d: [0, 32],
    }
    const [lx, ly] = local[t] ?? local.a!
    if (c.rot === 90) return { x: c.x - ly, y: c.y + lx }
    return { x: c.x + lx, y: c.y + ly }
  }
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
    case 'multimeter':
      return { id, kind, x, y, rot: 0, mode: 'DCV', style: 'digital', range: 2.5 }
    case 'spdt':
      return { id, kind, x, y, rot: 0, pos: 1 }
    case 'led':
      return { id, kind, x, y, rot: 0 }
    case 'capacitor':
      return { id, kind, x, y, rot: 0, c: 0.001 }
    case 'acsource':
      return { id, kind, x, y, rot: 0, e: 6, f: 2, r: 0.5 }
    case 'relay':
      return { id, kind, x, y, rot: 0 }
    case 'gate':
      return { id, kind, x, y, rot: 0, type: 'AND' }
  }
}
