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
})
