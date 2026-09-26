import { describe, expect, it } from 'vitest'
import { ballCollisions, kineticEnergy, makeBall, stepSandbox, wallCollisions, type Ball, type SandboxParams } from './kinematics-sandbox'

const P = (over?: Partial<SandboxParams>): SandboxParams => ({ g: 9.8, e: 1, W: 40, H: 20, ...over })
const B = (id: number, x: number, y: number, vx = 0, vy = 0, r = 0.5): Ball => makeBall(id, x, y, r, vx, vy)

describe('运动学沙盒（物理引擎）', () => {
  it('等质量弹性正碰：交换速度', () => {
    const balls = [B(1, 5, 10, 3, 0), B(2, 5.9, 10, -3, 0)] // 间距 0.9 < r1+r2=1
    ballCollisions(balls, P())
    expect(balls[0].vx).toBeCloseTo(-3)
    expect(balls[1].vx).toBeCloseTo(3)
  })

  it('完全弹性正碰动能守恒', () => {
    const before = kineticEnergy([B(1, 5, 10, 4, 0, 0.5), B(2, 7, 10, -2, 0, 0.7)])
    const balls = [B(1, 5, 10, 4, 0, 0.5), B(2, 7, 10, -2, 0, 0.7)]
    ballCollisions(balls, P())
    expect(kineticEnergy(balls)).toBeCloseTo(before, 6)
  })

  it('恢复系数 e=0.5：正碰后分离速度为接近速度的一半', () => {
    const balls = [B(1, 5, 10, 2, 0), B(2, 5.9, 10, 0, 0)]
    ballCollisions(balls, P({ e: 0.5 }))
    const sep = balls[1].vx - balls[0].vx // 分离相对速度
    expect(sep).toBeCloseTo(1) // 接近 2 × e=0.5
  })

  it('右墙反弹：vx 反向 × e，位置钳位不出墙', () => {
    const balls = [B(1, 39.8, 10, 5, 0)]
    wallCollisions(balls, P({ e: 0.8 }))
    expect(balls[0].vx).toBeCloseTo(-4)
    expect(balls[0].x).toBeCloseTo(39.5)
  })

  it('自由落体 1s：vy = g，y = ½g（半隐式欧拉足够近似）', () => {
    const balls = [B(1, 5, 1, 0, 0)]
    stepSandbox(balls, P({ g: 10 }), 1, 100)
    expect(balls[0].vy).toBeCloseTo(10, 1)
    expect(balls[0].y).toBeCloseTo(1 + 5, 0) // 1 + ½·10·1²
  })

  it('两球静置重叠：位置修正后不再重叠', () => {
    const balls = [B(1, 10, 10, 0, 0, 1), B(2, 10.5, 10, 0, 0, 1)]
    ballCollisions(balls, P())
    expect(Math.hypot(balls[1].x - balls[0].x, balls[1].y - balls[0].y)).toBeGreaterThanOrEqual(2 - 1e-9)
  })

  it('分离中的两球（vn≥0）不施加冲量', () => {
    const balls = [B(1, 5, 10, -1, 0), B(2, 7, 10, 1, 0)]
    ballCollisions(balls, P()) // 重叠但正在分离：只做位置修正，不改速度
    expect(balls[0].vx).toBeCloseTo(-1)
    expect(balls[1].vx).toBeCloseTo(1)
  })

  it('斜抛打墙：e=1 时 vx 反号，机械能（动能+势能）近似守恒', () => {
    const balls = [B(1, 2, 5, 10, -3, 0.5)]
    const p = P({ e: 1, W: 12 })
    const H = p.H, r = balls[0].r, m = balls[0].m
    const energy = (b: Ball) => kineticEnergy([b]) + m * p.g * (H - r - b.y) // 势能以地面为基准
    const E0 = energy(balls[0])
    stepSandbox(balls, p, 2, 240)
    expect(balls[0].vx).toBeLessThan(0)
    expect(energy(balls[0])).toBeGreaterThan(E0 * 0.9) // e=1 离散损耗 <10%
    expect(energy(balls[0])).toBeLessThan(E0 * 1.1)
  })
})
