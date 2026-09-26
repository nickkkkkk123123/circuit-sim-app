// 运动学模块（测试版）：抛体运动纯物理层，与渲染/电路模块完全解耦
// 赛后扩展路线的架构验证：第二个物理模块 = 新增纯 TS 模型 + 独立 UI，MNA 求解器零改动
// 运动为解析解（匀加速直线运动的正交分解），无数值积分误差

export interface ProjParams {
  v0: number // 初速率 m/s
  angleDeg: number // 发射角（度，0=水平，向上为正）
  h0: number // 初始高度 m
  g: number // 重力加速度 m/s²（地球 9.8 / 月球 1.62 / 自定义）
}

export interface ProjState {
  t: number
  x: number
  y: number
  vx: number
  vy: number // 带符号（上升为正，下落为负）
}

/** 分解初速度 */
export function velocityComponents({ v0, angleDeg }: ProjParams): { vx: number; vy0: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { vx: v0 * Math.cos(rad), vy0: v0 * Math.sin(rad) }
}

/** 时刻 t 的位置与速度（t 超过落地时间时仍按公式外推，调用方自己截断） */
export function positionAt(p: ProjParams, t: number): ProjState {
  const { vx, vy0 } = velocityComponents(p)
  return {
    t,
    x: vx * t,
    y: p.h0 + vy0 * t - 0.5 * p.g * t * t,
    vx,
    vy: vy0 - p.g * t,
  }
}

/** 飞行时间：h0 + vy0·t − ½g·t² = 0 的正根（vy0<0 且 h0=0 时为 0，防呆） */
export function flightTime(p: ProjParams): number {
  const { vy0 } = velocityComponents(p)
  const disc = vy0 * vy0 + 2 * p.g * p.h0
  if (disc <= 0) return 0
  return (vy0 + Math.sqrt(disc)) / p.g
}

/** 射程 = 水平速度 × 飞行时间 */
export function range(p: ProjParams): number {
  return velocityComponents(p).vx * flightTime(p)
}

/** 最高点（离地）：vy=0 处；平抛（vy0≤0）时即 h0 */
export function apexHeight(p: ProjParams): number {
  const { vy0 } = velocityComponents(p)
  if (vy0 <= 0) return p.h0
  return p.h0 + (vy0 * vy0) / (2 * p.g)
}

/** 最高点出现的时刻（可能小于 0 = 全程下降，调用方钳位） */
export function apexTime(p: ProjParams): number {
  return velocityComponents(p).vy0 / p.g
}
