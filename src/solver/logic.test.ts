import { describe, expect, it } from 'vitest'
import { solve } from './mna'
import type { Circuit, Comp, Gate, Wire } from './types'
import { EXPERIMENTS } from '../experiments'

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
  function gateCircuit(type: Gate['type'], in1High: boolean, in2High: boolean): Circuit {
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

  it('NAND：11→低，10→高（AND 取反）', () => {
    expect(outV(solve(gateCircuit('NAND', true, true)))).toBeLessThan(0.5)
    expect(outV(solve(gateCircuit('NAND', true, false)))).toBeGreaterThan(5)
    expect(outV(solve(gateCircuit('NAND', false, false)))).toBeGreaterThan(5)
  })

  it('NOR：11/10→低，00→高（OR 取反）', () => {
    expect(outV(solve(gateCircuit('NOR', true, true)))).toBeLessThan(0.5)
    expect(outV(solve(gateCircuit('NOR', true, false)))).toBeLessThan(0.5)
    expect(outV(solve(gateCircuit('NOR', false, false)))).toBeGreaterThan(5)
  })

  it('XOR：10/01→高，11/00→低', () => {
    expect(outV(solve(gateCircuit('XOR', true, false)))).toBeGreaterThan(5)
    expect(outV(solve(gateCircuit('XOR', false, true)))).toBeGreaterThan(5)
    expect(outV(solve(gateCircuit('XOR', true, true)))).toBeLessThan(0.5)
    expect(outV(solve(gateCircuit('XOR', false, false)))).toBeLessThan(0.5)
  })
})

describe('数字电路预设（加法器全家）', () => {
  // 载入预设并把指定开关置为闭合（=1），其余保持断开（=0，门内 10MΩ 下拉读低）
  function presetOf(id: string, closed: string[]): Circuit {
    const exp = EXPERIMENTS.find((e) => e.id === id)!
    const c = exp.build()
    return {
      comps: c.comps.map((k) => (k.kind === 'switch' && closed.includes(k.id) ? { ...k, closed: true } : k)),
      wires: c.wires,
    }
  }
  const lit = (r: ReturnType<typeof solve>, id: string) => (r.byComp[id]?.current ?? 0) > 0.01

  it('半加器：1+0=1（仅和灯亮），1+1=10（仅进位灯亮）', () => {
    const r10 = solve(presetOf('half-adder', ['swA']))
    expect(lit(r10, 'ls')).toBe(true)
    expect(lit(r10, 'lc')).toBe(false)
    const r11 = solve(presetOf('half-adder', ['swA', 'swB']))
    expect(lit(r11, 'ls')).toBe(false)
    expect(lit(r11, 'lc')).toBe(true)
  })

  it('全加器：1+1+1=11（和与进位都亮），0+0+1=1', () => {
    const r111 = solve(presetOf('full-adder', ['swA', 'swB', 'swC']))
    expect(lit(r111, 'ls')).toBe(true)
    expect(lit(r111, 'lc')).toBe(true)
    const r001 = solve(presetOf('full-adder', ['swC']))
    expect(lit(r001, 'ls')).toBe(true)
    expect(lit(r001, 'lc')).toBe(false)
  })

  it('两位加法器：1+1=010（S1 亮），3+3=110（S2/S1 亮），2+1=011', () => {
    const r2 = solve(presetOf('add2bit', ['swA0', 'swB0']))
    expect(lit(r2, 'l1')).toBe(true)
    expect(lit(r2, 'l0')).toBe(false)
    expect(lit(r2, 'l2')).toBe(false)
    const r6 = solve(presetOf('add2bit', ['swA0', 'swB0', 'swA1', 'swB1']))
    expect(lit(r6, 'l2')).toBe(true)
    expect(lit(r6, 'l1')).toBe(true)
    expect(lit(r6, 'l0')).toBe(false)
    const r3 = solve(presetOf('add2bit', ['swA1', 'swB0']))
    expect(lit(r3, 'l1')).toBe(true)
    expect(lit(r3, 'l0')).toBe(true)
    expect(lit(r3, 'l2')).toBe(false)
  })
})
