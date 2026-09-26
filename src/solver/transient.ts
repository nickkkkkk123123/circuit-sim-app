// 瞬态引擎：时间步进 + 电容/交流源伴随模型，复用静态 MNA（solve 不动）
// 电容后向欧拉伴随模型 = 电压源 v_prev 串联 R=dt/C——恰好映射为求解器里的"电池支路"，
// 所以每步把电容/交流源临时变换成电池再 solve，零改动复用全部求解逻辑（含 LED 状态迭代）。
// 状态量 = 电荷 Q（不是电压）：平行板实验中 Q 不变而 C 变（拖动极板）时，U = Q/C 才会正确升高。
// 交流源：每步 emf = E·sin(2πf·(t+dt/2))（中点取样），引擎维护绝对仿真时间 t。
import type { Circuit } from './types'
import { capC } from './types'
import { solve, type SolveResult } from './mna'

export interface TransientState {
  qcap: Record<string, number> // 电容 id → 极板电荷 Q（C）
  t: number // 仿真时间（秒）
}

export const emptyTransient = (): TransientState => ({ qcap: {}, t: 0 })

/** 单步瞬态求解：dt 为本步时长（秒）；返回新状态与该步的解 */
export function stepTransient(circuit: Circuit, state: TransientState, dt: number): { result: SolveResult; state: TransientState } {
  const tMid = state.t + dt / 2 // 中点取样：正弦源精度更好
  const comps = circuit.comps.map((c) => {
    if (c.kind === 'capacitor') {
      const cap = capC(c)
      const vPrev = (state.qcap[c.id] ?? 0) / cap // U = Q/C
      return { id: c.id, kind: 'battery' as const, x: c.x, y: c.y, rot: c.rot, emf: vPrev, r: Math.max(dt / cap, 1e-9), expanded: false }
    }
    if (c.kind === 'acsource') {
      return { id: c.id, kind: 'battery' as const, x: c.x, y: c.y, rot: c.rot, emf: c.e * Math.sin(2 * Math.PI * c.f * tMid), r: Math.max(c.r, 1e-3), expanded: false }
    }
    return c
  })
  const result = solve({ comps, wires: circuit.wires })
  const qcap: Record<string, number> = { ...state.qcap }
  for (const c of circuit.comps) {
    if (c.kind !== 'capacitor') continue
    // 伴随"电池"支路两端的新电压 = 本步结束后的电容电压；Q = C·U
    qcap[c.id] = capC(c) * (result.byComp[c.id]?.dv ?? (state.qcap[c.id] ?? 0) / capC(c))
  }
  // 清理已删元件的电荷记忆
  for (const k of Object.keys(qcap)) {
    if (!circuit.comps.some((c) => c.id === k && c.kind === 'capacitor')) delete qcap[k]
  }
  return { result, state: { qcap, t: state.t + dt } }
}
