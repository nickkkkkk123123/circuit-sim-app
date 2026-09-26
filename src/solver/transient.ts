// 瞬态引擎：时间步进 + 电容伴随模型，复用静态 MNA（solve 不动）
// 电容后向欧拉伴随模型 = 电压源 v_prev 串联 R=dt/C——恰好映射为求解器里的"电池支路"，
// 所以每步把电容临时变换成电池再 solve，零改动复用全部求解逻辑（含 LED 状态迭代）。
import type { Circuit } from './types'
import { solve, type SolveResult } from './mna'

export interface TransientState {
  vcap: Record<string, number> // 电容 id → 上一步两端电压（状态量）
}

export const emptyTransient = (): TransientState => ({ vcap: {} })

/** 单步瞬态求解：dt 为本步时长（秒）；返回新状态与该步的解 */
export function stepTransient(circuit: Circuit, state: TransientState, dt: number): { result: SolveResult; state: TransientState } {
  const comps = circuit.comps.map((c) => {
    if (c.kind !== 'capacitor') return c
    const vPrev = state.vcap[c.id] ?? 0
    return { id: c.id, kind: 'battery' as const, x: c.x, y: c.y, rot: c.rot, emf: vPrev, r: Math.max(dt / c.c, 1e-6), expanded: false }
  })
  const result = solve({ comps, wires: circuit.wires })
  const vcap: Record<string, number> = { ...state.vcap }
  for (const c of circuit.comps) {
    if (c.kind !== 'capacitor') continue
    // 伴随"电池"支路两端的新电压 = 本步结束后的电容电压
    vcap[c.id] = result.byComp[c.id]?.dv ?? vcap[c.id] ?? 0
  }
  // 清理已删元件的电压记忆
  for (const k of Object.keys(vcap)) {
    if (!circuit.comps.some((c) => c.id === k && c.kind === 'capacitor')) delete vcap[k]
  }
  return { result, state: { vcap } }
}
