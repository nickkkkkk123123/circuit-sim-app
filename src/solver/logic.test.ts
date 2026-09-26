import { describe, expect, it } from 'vitest'
import { solve } from './mna'
import type { Circuit, Comp, Wire } from './types'

function build(comps: Comp[], wires: Wire[]): Circuit {
  return { comps, wires }
}

describe('继电器', () => {
  // 线圈回路：6V—200Ω—线圈(100Ω) → 20mA > 10mA 阈值 → 吸合
  it('线圈电流超阈值 → 吸合，COM-NO 导通', () => {
    const comps: Comp[] = [
      { id: 'b1', kind: 'battery', x: 0, y: 0, rot: 0, emf: 6, r: 0.1 },
      { id: 'r1', kind: 'resistor', x: 0, y: 0, rot: 0, r: 200 },
      { id: 'rl1', kind: 'relay', x: 0, y: 0, rot: 0 },
      { id: 'b2', kind: 'battery', x: 0, y: 0, rot: 0, emf: 3, r: 0.1 },
      { id: 'l1', kind: 'bulb', x: 0, y: 0, rot: 0, r: 10, ratedP: 3.6 },
    ]
    const wires: Wire[] = [
      { id: 'w1', a: 'b1:a', b: 'r1:a' },
      { id: 'w2', a: 'r1:b', b: 'rl1:a' },
      { id: 'w3', a: 'rl1:b', b: 'b1:b' },
      // 触点回路：b2 → 灯 → COM(c) → NO(p) → b2
      { id: 'w4', a: 'b2:a', b: 'l1:a' },
      { id: 'w5', a: 'l1:b', b: 'rl1:c' },
      { id: 'w6', a: 'rl1:p', b: 'b2:b' },
    ]
    const r = solve(build(comps, wires))
    expect(r.relayOn?.['rl1']).toBe(true)
    // 灯亮：3 / (10 + 0.1 + 0.01) ≈ 0.294A
    expect(r.byComp['l1'].current).toBeCloseTo(3 / 10.11, 1)
  })

  it('线圈未上电 → 释放，COM-NC 导通', () => {
    const comps: Comp[] = [
      { id: 'rl1', kind: 'relay', x: 0, y: 0, rot: 0 },
      { id: 'b2', kind: 'battery', x: 0, y: 0, rot: 0, emf: 3, r: 0.1 },
      { id: 'l1', kind: 'bulb', x: 0, y: 0, rot: 0, r: 10, ratedP: 3.6 },
    ]
    const wires: Wire[] = [
      { id: 'w4', a: 'b2:a', b: 'l1:a' },
      { id: 'w5', a: 'l1:b', b: 'rl1:c' },
      { id: 'w6', a: 'rl1:d', b: 'b2:b' }, // 走常闭触点
    ]
    const r = solve(build(comps, wires))
    expect(r.relayOn?.['rl1']).toBe(false)
    expect(r.byComp['l1'].current).toBeCloseTo(3 / 10.11, 1)
  })

  it('线圈电流低于阈值 → 保持释放', () => {
    const comps: Comp[] = [
      { id: 'b1', kind: 'battery', x: 0, y: 0, rot: 0, emf: 6, r: 0.1 },
      { id: 'r1', kind: 'resistor', x: 0, y: 0, rot: 0, r: 2000 }, // 6/2100 ≈ 2.9mA < 10mA
      { id: 'rl1', kind: 'relay', x: 0, y: 0, rot: 0 },
    ]
    const wires: Wire[] = [
      { id: 'w1', a: 'b1:a', b: 'r1:a' },
      { id: 'w2', a: 'r1:b', b: 'rl1:a' },
      { id: 'w3', a: 'rl1:b', b: 'b1:b' },
    ]
    const r = solve(build(comps, wires))
    expect(r.relayOn?.['rl1']).toBe(false)
  })
})

describe('逻辑门', () => {
  // 电源：6V 接 VCC/GND；输入按真值表接高(6V)或低(GND)
  function gateCircuit(type: 'AND' | 'OR' | 'NOT', in1High: boolean, in2High: boolean): Circuit {
    const comps: Comp[] = [
      { id: 'b1', kind: 'battery', x: 0, y: 0, rot: 0, emf: 6, r: 0.1 },
      { id: 'g1', kind: 'gate', x: 0, y: 0, rot: 0, type },
    ]
    const wires: Wire[] = [
      { id: 'w1', a: 'b1:a', b: 'g1:c' }, // VCC
      { id: 'w2', a: 'b1:b', b: 'g1:d' }, // GND
      { id: 'w3', a: in1High ? 'b1:a' : 'b1:b', b: 'g1:a' },
    ]
    if (type !== 'NOT') wires.push({ id: 'w4', a: in2High ? 'b1:a' : 'b1:b', b: 'g1:b' })
    return build(comps, wires)
  }
  const outV = (r: ReturnType<typeof solve>) =>
    (r.nodes?.['g1:p'] ?? 0) - (r.nodes?.['g1:d'] ?? 0)

  it('AND：11→高电平，10→低电平', () => {
    expect(outV(solve(gateCircuit('AND', true, true)))).toBeGreaterThan(5)
    expect(outV(solve(gateCircuit('AND', true, false)))).toBeLessThan(0.5)
  })

  it('OR：10→高电平，00→低电平', () => {
    expect(outV(solve(gateCircuit('OR', true, false)))).toBeGreaterThan(5)
    expect(outV(solve(gateCircuit('OR', false, false)))).toBeLessThan(0.5)
  })

  it('NOT：0→高电平，1→低电平', () => {
    expect(outV(solve(gateCircuit('NOT', false, false)))).toBeGreaterThan(5)
    expect(outV(solve(gateCircuit('NOT', true, false)))).toBeLessThan(0.5)
  })
})
