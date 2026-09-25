import { describe, expect, it } from 'vitest'
import { solve } from './mna'
import type { Circuit, Comp, Wire } from './types'

// 与原型 mna-test.cjs 同款电路：电源(6V, r=0.1) - 开关(闭合) - 灯泡(10Ω) - 电阻(10Ω) 串联
function seriesCircuit(): Circuit {
  const comps: Comp[] = [
    { id: 'c1', kind: 'battery', x: 0, y: 0, rot: 0, emf: 6, r: 0.1 },
    { id: 'c2', kind: 'switch', x: 0, y: 0, rot: 0, closed: true },
    { id: 'c3', kind: 'bulb', x: 0, y: 0, rot: 0, r: 10, ratedP: 3.6 },
    { id: 'c4', kind: 'resistor', x: 0, y: 0, rot: 0, r: 10 },
  ]
  const wires: Wire[] = [
    { id: 'w1', a: 'c1:b', b: 'c2:a' },
    { id: 'w2', a: 'c2:b', b: 'c3:a' },
    { id: 'w3', a: 'c3:b', b: 'c4:a' },
    { id: 'w4', a: 'c4:b', b: 'c1:a' },
  ]
  return { comps, wires }
}

describe('MNA 求解器', () => {
  it('串联电路电流 = 6 / (0.1+0.01+10+10+导线×4)', () => {
    const r = solve(seriesCircuit())
    const i = r.byComp['c3'].current
    expect(i).toBeCloseTo(6 / 20.118, 3)
  })

  it('灯泡功率 = I²R', () => {
    const r = solve(seriesCircuit())
    const b = r.byComp['c3']
    const i = b.current
    expect(b.power).toBeCloseTo(i * i * 10, 3)
  })

  it('两电阻等分电压', () => {
    const r = solve(seriesCircuit())
    expect(Math.abs(r.byComp['c3'].dv)).toBeCloseTo(Math.abs(r.byComp['c4'].dv), 3)
  })

  it('开关断开 → 全路无电流', () => {
    const c = seriesCircuit()
    ;(c.comps[1] as { closed: boolean }).closed = false
    const r = solve(c)
    expect(r.openCircuit).toBe(true)
    expect(r.byComp['c3'].current).toBeCloseTo(0, 6)
  })

  it('电流方向守恒：干路电流处处相等', () => {
    const r = solve(seriesCircuit())
    const i1 = r.byComp['c1'].current
    expect(r.byComp['c2'].current).toBeCloseTo(i1, 3)
    expect(r.byComp['c4'].current).toBeCloseTo(i1, 3)
  })

  it('并联电路分流：两等值电阻各分一半', () => {
    const comps: Comp[] = [
      { id: 'c1', kind: 'battery', x: 0, y: 0, rot: 0, emf: 6, r: 0.1 },
      { id: 'r1', kind: 'resistor', x: 0, y: 0, rot: 0, r: 10 },
      { id: 'r2', kind: 'resistor', x: 0, y: 0, rot: 0, r: 10 },
    ]
    const wires: Wire[] = [
      { id: 'w1', a: 'c1:a', b: 'r1:a' },
      { id: 'w2', a: 'r1:a', b: 'r2:a' },
      { id: 'w3', a: 'r1:b', b: 'r2:b' },
      { id: 'w4', a: 'r2:b', b: 'c1:b' },
    ]
    const r = solve({ comps, wires })
    expect(r.byComp['r1'].current).toBeCloseTo(r.byComp['r2'].current, 3)
    expect(r.byComp['r1'].current * 2).toBeCloseTo(r.byComp['c1'].current, 2)
  })

  // 展开态滑动变阻器：Rmax=10, pos=0.5 → 滑片左侧段 5Ω，右侧段 5Ω
  function rheoExpanded(wireSpec: { from: string; to: string }[]): Circuit {
    const comps: Comp[] = [
      { id: 'b1', kind: 'battery', x: 0, y: 0, rot: 0, emf: 6, r: 0.5 },
      { id: 'r1', kind: 'rheostat', x: 0, y: 0, rot: 0, Rmax: 10, pos: 0.5, expanded: true },
    ]
    const wires: Wire[] = wireSpec.map((w, i) => ({ id: `w${i}`, a: w.from, b: w.to }))
    return { comps, wires }
  }

  it('展开态·一上一下：杆(c)与电阻丝一端(b) → R = (1-pos)×Rmax', () => {
    const r = solve(rheoExpanded([
      { from: 'b1:a', to: 'r1:c' },
      { from: 'r1:b', to: 'b1:b' },
    ]))
    // 6 / (0.5 内阻 + 5 段电阻 + ~0.012 杆/触点) ≈ 1.09A
    expect(r.byComp['r1'].current).toBeCloseTo(6 / 5.512, 2)
  })

  it('展开态·两下：电阻丝两端全接入 → 全阻值 10Ω', () => {
    const r = solve(rheoExpanded([
      { from: 'b1:a', to: 'r1:a' },
      { from: 'r1:b', to: 'b1:b' },
    ]))
    expect(r.byComp['r1'].current).toBeCloseTo(6 / 10.512, 2)
  })

  it('展开态·两上：只接金属杆两端 → 近似导线，电流远大于接入电阻丝时', () => {
    const r = solve(rheoExpanded([
      { from: 'b1:a', to: 'r1:c' },
      { from: 'r1:d', to: 'b1:b' },
    ]))
    // 回路只剩内阻 0.5 + 杆 ~0.004 → I ≈ 11.9A
    expect(r.byComp['r1'].current).toBeGreaterThan(10)
  })

  it('展开态·滑片位置改变阻值：pos=0.2 时一上一下电阻 = 2Ω 段', () => {
    const c = rheoExpanded([
      { from: 'b1:a', to: 'r1:c' },
      { from: 'r1:a', to: 'b1:b' },
    ])
    ;(c.comps[1] as { pos: number }).pos = 0.2
    const r = solve(c)
    expect(r.byComp['r1'].current).toBeCloseTo(6 / 2.512, 2)
  })

  it('紧凑态·一上一下：p（滑片上端）+ b → R = (1-pos) × Rmax', () => {
    const comps: Comp[] = [
      { id: 'b1', kind: 'battery', x: 0, y: 0, rot: 0, emf: 6, r: 0.5 },
      { id: 'r1', kind: 'rheostat', x: 0, y: 0, rot: 0, Rmax: 20, pos: 0.5, expanded: false },
    ]
    const wires: Wire[] = [
      { id: 'w1', a: 'b1:a', b: 'r1:p' },
      { id: 'w2', a: 'r1:b', b: 'b1:b' },
    ]
    const r = solve({ comps, wires })
    expect(r.byComp['r1'].current).toBeCloseTo(6 / 10.502, 2)
  })

  it('紧凑态·两下：a + b → 全阻值 20Ω', () => {
    const comps: Comp[] = [
      { id: 'b1', kind: 'battery', x: 0, y: 0, rot: 0, emf: 6, r: 0.5 },
      { id: 'r1', kind: 'rheostat', x: 0, y: 0, rot: 0, Rmax: 20, pos: 0.5, expanded: false },
    ]
    const wires: Wire[] = [
      { id: 'w1', a: 'b1:a', b: 'r1:a' },
      { id: 'w2', a: 'r1:b', b: 'b1:b' },
    ]
    const r = solve({ comps, wires })
    expect(r.byComp['r1'].current).toBeCloseTo(6 / 20.502, 2)
  })

  it('电池内阻调到 0 → 理想电源（钳位 1mΩ），6V+6Ω 回路电流 ≈1A', () => {
    const comps: Comp[] = [
      { id: 'b1', kind: 'battery', x: 0, y: 0, rot: 0, emf: 6, r: 0, expanded: false },
      { id: 'r1', kind: 'resistor', x: 0, y: 0, rot: 0, r: 6 },
    ]
    const wires: Wire[] = [
      { id: 'w1', a: 'b1:a', b: 'r1:a' },
      { id: 'w2', a: 'r1:b', b: 'b1:b' },
    ]
    const r = solve({ comps, wires })
    expect(r.byComp['r1'].current).toBeCloseTo(1, 2)
  })

  it('电池展开态：E 与 r 独立串联，6V r=1 + 外阻 10 → I = 6/11', () => {
    const comps: Comp[] = [
      { id: 'b1', kind: 'battery', x: 0, y: 0, rot: 0, emf: 6, r: 1, expanded: true },
      { id: 'r1', kind: 'resistor', x: 0, y: 0, rot: 0, r: 10 },
    ]
    const wires: Wire[] = [
      { id: 'w1', a: 'b1:a', b: 'r1:a' },
      { id: 'w2', a: 'r1:b', b: 'b1:b' },
    ]
    const r = solve({ comps, wires })
    expect(r.byComp['r1'].current).toBeCloseTo(6 / 11.001, 2)
  })

  it('理想电压表并联在 10Ω 电阻两端 → 读数 = 路端电压 5.714V，几乎不分流', () => {
    const comps: Comp[] = [
      { id: 'b1', kind: 'battery', x: 0, y: 0, rot: 0, emf: 6, r: 0.5, expanded: false },
      { id: 'r1', kind: 'resistor', x: 0, y: 0, rot: 0, r: 10 },
      { id: 'v1', kind: 'voltmeter', x: 0, y: 0, rot: 0, r: 3000, ideal: true, range: 15 },
    ]
    const wires: Wire[] = [
      { id: 'w1', a: 'b1:a', b: 'r1:a' },
      { id: 'w2', a: 'r1:b', b: 'b1:b' },
      { id: 'w3', a: 'r1:a', b: 'v1:a' },
      { id: 'w4', a: 'v1:b', b: 'r1:b' },
    ]
    const r = solve({ comps, wires })
    expect(r.byComp['v1'].dv).toBeCloseTo(6 * 10 / 10.502, 2)
    expect(r.byComp['v1'].current).toBeLessThan(0.001)
  })

  it('实际电压表（内阻 3kΩ→量程内）并联会轻微拉低读数', () => {
    const comps: Comp[] = [
      { id: 'b1', kind: 'battery', x: 0, y: 0, rot: 0, emf: 6, r: 0.5, expanded: false },
      { id: 'r1', kind: 'resistor', x: 0, y: 0, rot: 0, r: 10 },
      { id: 'v1', kind: 'voltmeter', x: 0, y: 0, rot: 0, r: 3000, ideal: false, range: 15 },
    ]
    const wires: Wire[] = [
      { id: 'w1', a: 'b1:a', b: 'r1:a' },
      { id: 'w2', a: 'r1:b', b: 'b1:b' },
      { id: 'w3', a: 'r1:a', b: 'v1:a' },
      { id: 'w4', a: 'v1:b', b: 'r1:b' },
    ]
    const r = solve({ comps, wires })
    // 10∥3000 = 9.967Ω → 路端电压略低于理想值
    const u = 6 * (10 * 3000 / 3010) / (0.5 + 10 * 3000 / 3010)
    expect(r.byComp['v1'].dv).toBeCloseTo(u, 2)
    expect(Math.abs(r.byComp['v1'].dv)).toBeLessThan(6 * 10 / 10.502 + 0.01)
  })

  it('理想电流表串联在回路中 → 读数 = 回路电流，压降近零', () => {
    const comps: Comp[] = [
      { id: 'b1', kind: 'battery', x: 0, y: 0, rot: 0, emf: 6, r: 0.5, expanded: false },
      { id: 'a1', kind: 'ammeter', x: 0, y: 0, rot: 0, r: 0.1, ideal: true, range: 3 },
      { id: 'r1', kind: 'resistor', x: 0, y: 0, rot: 0, r: 10 },
    ]
    const wires: Wire[] = [
      { id: 'w1', a: 'b1:a', b: 'a1:a' },
      { id: 'w2', a: 'a1:b', b: 'r1:a' },
      { id: 'w3', a: 'r1:b', b: 'b1:b' },
    ]
    const r = solve({ comps, wires })
    expect(r.byComp['a1'].current).toBeCloseTo(6 / 10.502, 2)
  })
})
