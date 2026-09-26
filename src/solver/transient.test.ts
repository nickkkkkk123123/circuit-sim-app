import { describe, expect, it } from 'vitest'
import { stepTransient, emptyTransient, type TransientState } from './transient'
import { solve, type SolveResult } from './mna'
import { capC, type Circuit, type Comp, type Wire } from './types'

// RC 充电电路：电源(6V, r=0.1) - 开关(闭合) - 电阻(10Ω) - 电容(1000µF)
function rcCircuit(v0?: number): { circuit: Circuit; st: TransientState } {
  const comps: Comp[] = [
    { id: 'b1', kind: 'battery', x: 0, y: 0, rot: 0, emf: 6, r: 0.1 },
    { id: 'sw', kind: 'switch', x: 0, y: 0, rot: 0, closed: true },
    { id: 'r1', kind: 'resistor', x: 0, y: 0, rot: 0, r: 10 },
    { id: 'c1', kind: 'capacitor', x: 0, y: 0, rot: 0, c: 0.001 },
  ]
  const wires: Wire[] = [
    { id: 'w1', a: 'b1:a', b: 'sw:a' },
    { id: 'w2', a: 'sw:b', b: 'r1:a' },
    { id: 'w3', a: 'r1:b', b: 'c1:a' },
    { id: 'w4', a: 'c1:b', b: 'b1:b' },
  ]
  const st = emptyTransient()
  if (v0 !== undefined) st.qcap['c1'] = v0 * 0.001 // Q = C·U
  return { circuit: { comps, wires }, st }
}

function run(circuit: Circuit, st: TransientState, t: number, dt = 0.0005) {
  let s = st
  let last: SolveResult | null = null
  const steps = Math.round(t / dt)
  for (let i = 0; i < steps; i++) {
    const out = stepTransient(circuit, s, dt)
    s = out.state
    last = out.result
  }
  return { state: s, result: last, v: (id: string) => (s.qcap[id] ?? 0) / capC(circuit.comps.find((c) => c.id === id) as never) }
}

describe('瞬态引擎（电容伴随模型，状态=电荷Q）', () => {
  it('RC 充电：t=5τ 后电容电压接近电源电动势', () => {
    const { circuit, st } = rcCircuit()
    const { state, v } = run(circuit, st, 0.05)
    // τ = (0.1+10+导线)×1000µF ≈ 0.0101s，t=0.05s ≈ 5τ
    const expected = 6 * (1 - Math.exp(-0.05 / 0.010108))
    expect(v('c1')).toBeCloseTo(expected, 1)
    expect(v('c1')).toBeGreaterThan(5.8)
    expect(state.qcap['c1']).toBeGreaterThan(0)
  })

  it('RC 放电（无源电路）：v(t) = v0·e^(-t/τ)', () => {
    const comps: Comp[] = [
      { id: 'r1', kind: 'resistor', x: 0, y: 0, rot: 0, r: 10 },
      { id: 'c1', kind: 'capacitor', x: 0, y: 0, rot: 0, c: 0.001 },
    ]
    const wires: Wire[] = [
      { id: 'w1', a: 'r1:a', b: 'c1:a' },
      { id: 'w2', a: 'c1:b', b: 'r1:b' },
    ]
    const st = emptyTransient()
    st.qcap['c1'] = 5 * 0.001 // 5V × 1000µF
    const { v } = run({ comps, wires }, st, 0.01) // τ = 10×0.001 = 0.01s
    expect(v('c1')).toBeCloseTo(5 * Math.exp(-1), 1)
  })

  it('电容电流随充电衰减（稳态时电容支路无电流）', () => {
    const { circuit, st } = rcCircuit()
    const { result } = run(circuit, st, 0.1)
    expect(result!.byComp['c1'].current).toBeLessThan(1e-4)
  })

  it('DCA 表笔导通：电流经两表笔流过表内分流电阻（回路经表笔闭合）', () => {
    const comps: Comp[] = [
      { id: 'b1', kind: 'battery', x: 0, y: 0, rot: 0, emf: 6, r: 0.1 },
      { id: 'r1', kind: 'resistor', x: 0, y: 0, rot: 0, r: 10 },
      { id: 'm1', kind: 'multimeter', x: 0, y: 0, rot: 0, mode: 'DCA', pa: 'r1:b', pb: 'b1:b' },
    ]
    const wires: Wire[] = [{ id: 'w1', a: 'b1:a', b: 'r1:a' }]
    const r = solve({ comps, wires })
    // 回路：b1 → r1 → 红表笔(r1:b) → 表内 0.01Ω → 黑表笔(b1:b) → b1
    expect(r.byComp['m1'].current).toBeCloseTo(6 / 10.11, 1)
    expect(r.byComp['r1'].current).toBeCloseTo(r.byComp['m1'].current, 3)
  })

  it('AC 电源：电阻负载瞬时电流跟随正弦（1Hz、t=0.25s 时达峰值）', () => {
    const comps: Comp[] = [
      { id: 'ac1', kind: 'acsource', x: 0, y: 0, rot: 0, e: 6, f: 1, r: 0.5 },
      { id: 'r1', kind: 'resistor', x: 0, y: 0, rot: 0, r: 10 },
    ]
    const wires: Wire[] = [
      { id: 'w1', a: 'ac1:a', b: 'r1:a' },
      { id: 'w2', a: 'r1:b', b: 'ac1:b' },
    ]
    const st0 = emptyTransient()
    let st = st0
    let last: SolveResult | null = null
    // 步进到 t=0.25s（1Hz 的四分之一周期，正弦达峰值 6V）
    for (let i = 0; i < 250; i++) {
      const out = stepTransient({ comps, wires }, st, 0.001)
      st = out.state
      last = out.result
    }
    expect(st.t).toBeCloseTo(0.25, 3)
    // i = E·sin(π/2) / (10+0.5) ≈ 0.571A
    expect(last!.byComp['r1'].current).toBeCloseTo(6 / 10.5, 1)
    // 再走 1/4 周期到峰值后回落：t=0.5s 时 sin(π)=0 → 无电流
    for (let i = 0; i < 250; i++) {
      const out = stepTransient({ comps, wires }, st, 0.001)
      st = out.state
      last = out.result
    }
    expect(last!.byComp['r1'].current).toBeLessThan(0.01)
  })

  it('平行板决定式：Q 不变时 d 拉大一倍 → U = Q/C 翻倍', () => {
    const comps: Comp[] = [{ id: 'c1', kind: 'capacitor', x: 0, y: 0, rot: 0, c: 0.001, plate: true, d: 10, o1: 0, o2: 0 }]
    const st = emptyTransient()
    st.qcap['c1'] = 1e-3 // 1000µF × 1V
    // 孤立电容（不接任何电路）：Q 守恒
    let s = st
    s = stepTransient({ comps, wires: [] }, s, 0.0002).state
    // 拉远极板 d: 10 → 20 → C 减半，U 应升到 2V
    const pulled = comps.map((c) => ({ ...c, d: 20 }))
    s = stepTransient({ comps: pulled, wires: [] }, s, 0.0002).state
    const u = s.qcap['c1'] / capC(pulled[0] as never)
    expect(u).toBeCloseTo(2, 1)
  })

  it('万用表交流档：ACA 串联读 RMS 电流，ACV 表笔读 RMS 电压（≈ 0.707 × 峰值）', () => {
    // 交流源 6V 峰值 50Hz + 10Ω 电阻；ACA 表串联在回路里，ACV 表笔吸附在源两端
    const comps: Comp[] = [
      { id: 'ac', kind: 'acsource', x: 0, y: 0, rot: 0, e: 6, f: 50, r: 0.5 },
      { id: 'r1', kind: 'resistor', x: 0, y: 0, rot: 0, r: 10 },
      { id: 'mmA', kind: 'multimeter', x: 0, y: 0, rot: 0, mode: 'ACA', style: 'digital', pa: '', pb: '' },
      { id: 'mmV', kind: 'multimeter', x: 0, y: 0, rot: 0, mode: 'ACV', style: 'digital', pa: 'ac:a', pb: 'ac:b' },
    ]
    const wires: Wire[] = [
      { id: 'w1', a: 'ac:a', b: 'r1:a' },
      { id: 'w2', a: 'r1:b', b: 'mmA:a' },
      { id: 'w3', a: 'mmA:b', b: 'ac:b' },
    ]
    let st = emptyTransient()
    const dt = 0.0002
    for (let i = 0; i < 1500; i++) st = stepTransient({ comps, wires }, st, dt).state // 0.3s ≫ τ=30ms，EMA 已收敛
    // 峰值电流 = 6 / (10 + 0.01 + 0.5) ≈ 0.5694 → RMS ≈ 0.4026
    expect(Math.sqrt(st.acAcc['mmA'])).toBeCloseTo(6 / 10.51 / Math.SQRT2, 2)
    // 源两端电压 = 峰值减内阻压降 → RMS ≈ 0.707 × 6 × 10.01/10.51 ≈ 4.03
    expect(Math.sqrt(st.acAcc['mmV'])).toBeCloseTo(6 * Math.SQRT1_2 * (10.01 / 10.51), 1)
  })
})
