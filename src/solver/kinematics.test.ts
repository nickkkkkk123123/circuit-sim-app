import { describe, expect, it } from 'vitest'
import { apexHeight, apexTime, flightTime, positionAt, range, velocityComponents } from './kinematics'

const P = (v0: number, angleDeg: number, h0 = 0, g = 9.8) => ({ v0, angleDeg, h0, g })

describe('运动学（抛体，解析解）', () => {
  it('速度分解：45° 时 vx=vy', () => {
    const { vx, vy0 } = velocityComponents(P(10, 45))
    expect(vx).toBeCloseTo(vy0)
    expect(vx).toBeCloseTo(10 / Math.SQRT2)
  })

  it('平抛：v0=0 竖直下落 h0=20 → 飞行 2s（g=10），射程 0', () => {
    const p = P(0, 0, 20, 10)
    expect(flightTime(p)).toBeCloseTo(2)
    expect(range(p)).toBeCloseTo(0)
    expect(apexHeight(p)).toBeCloseTo(20)
    const s = positionAt(p, 1)
    expect(s.y).toBeCloseTo(15) // 20 − ½·10·1
    expect(s.vy).toBeCloseTo(-10)
  })

  it('斜抛 45° v0=10 g=10：射程 10m，最高 2.5m，飞行 √2 s', () => {
    const p = P(10, 45, 0, 10)
    expect(flightTime(p)).toBeCloseTo(Math.SQRT2)
    expect(range(p)).toBeCloseTo(10)
    expect(apexHeight(p)).toBeCloseTo(2.5)
    expect(apexTime(p)).toBeCloseTo(Math.SQRT2 / 2)
  })

  it('最高点处 vy=0；落地时刻 y=0', () => {
    const p = P(20, 60, 5, 9.8)
    const s = positionAt(p, apexTime(p))
    expect(s.vy).toBeCloseTo(0)
    expect(s.y).toBeCloseTo(apexHeight(p))
    const land = positionAt(p, flightTime(p))
    expect(land.y).toBeCloseTo(0)
    expect(land.x).toBeCloseTo(range(p))
  })

  it('互补角射程相同（30° 与 60°）', () => {
    expect(range(P(20, 30, 0, 9.8))).toBeCloseTo(range(P(20, 60, 0, 9.8)))
  })

  it('月球重力（1.62）射程约为地球（9.8）的 6 倍', () => {
    const earth = range(P(10, 45, 0, 9.8))
    const moon = range(P(10, 45, 0, 1.62))
    expect(moon / earth).toBeGreaterThan(5.5)
    expect(moon / earth).toBeLessThan(6.5)
  })

  it('平抛（vy0<0 不会发生，但 h0=0 且角度 0 时防呆 flightTime=0）', () => {
    expect(flightTime(P(10, 0, 0))).toBeCloseTo(0)
  })
})
