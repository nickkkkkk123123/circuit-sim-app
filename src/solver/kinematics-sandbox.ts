// 运动学沙盒 v0.5（测试版二）：自由摆放刚体小球 + 重力 + 弹性碰撞的极简物理引擎
// 与电路模块零耦合；积分 = 半隐式欧拉（重力场景稳定），碰撞 = 冲量法 + 位置修正
// 范围红线：只做球-球/球-墙。斜面/绳/弹簧属 v0.6（约束求解），勿在本文件预埋

export interface Ball {
  id: number
  x: number
  y: number // y 向下为正（屏幕习惯）
  vx: number
  vy: number
  r: number // 半径 m
  m: number // 质量 kg（与 r² 成比例的默认值，可覆盖）
}

export interface SandboxParams {
  g: number // 重力加速度 m/s²（向下为正）
  e: number // 恢复系数 0~1（1=完全弹性，0=完全非弹性）
  W: number // 场地宽 m
  H: number // 场地高 m
}

export function makeBall(id: number, x: number, y: number, r: number, vx = 0, vy = 0): Ball {
  return { id, x, y, r, vx, vy, m: r * r * 10 } // 默认质量 ∝ r²（面密度均匀）
}

/** 单步积分（半隐式欧拉：先更新速度再更新位置，重力下能量漂移小于显式欧拉） */
export function integrate(balls: Ball[], p: SandboxParams, dt: number): void {
  for (const b of balls) {
    b.vy += p.g * dt
    b.x += b.vx * dt
    b.y += b.vy * dt
  }
}

/** 球-墙碰撞（四壁反弹，恢复系数 e；位置钳位防穿墙） */
export function wallCollisions(balls: Ball[], p: SandboxParams): void {
  for (const b of balls) {
    if (b.x - b.r < 0) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * p.e }
    if (b.x + b.r > p.W) { b.x = p.W - b.r; if (b.vx > 0) b.vx = -b.vx * p.e }
    if (b.y - b.r < 0) { b.y = b.r; if (b.vy < 0) b.vy = -b.vy * p.e }
    if (b.y + b.r > p.H) { b.y = p.H - b.r; if (b.vy > 0) b.vy = -b.vy * p.e }
  }
}

/** 球-球碰撞：冲量法（沿法线的弹性碰撞通解，含恢复系数）+ 按质量比例的位置修正 */
export function ballCollisions(balls: Ball[], p: SandboxParams): void {
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j]
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.hypot(dx, dy)
      const min = a.r + b.r
      if (dist >= min || dist === 0) continue
      const nx = dx / dist, ny = dy / dist // 法线 a→b
      // 位置修正：按质量反比把重叠推开（防下沉）
      const overlap = min - dist
      const totalM = a.m + b.m
      a.x -= nx * overlap * (b.m / totalM)
      a.y -= ny * overlap * (b.m / totalM)
      b.x += nx * overlap * (a.m / totalM)
      b.y += ny * overlap * (a.m / totalM)
      // 冲量：只在相互接近时施加
      const rvx = b.vx - a.vx, rvy = b.vy - a.vy
      const vn = rvx * nx + rvy * ny
      if (vn >= 0) continue // 正在分离
      const jImp = (-(1 + p.e) * vn) / (1 / a.m + 1 / b.m)
      a.vx -= (jImp / a.m) * nx
      a.vy -= (jImp / a.m) * ny
      b.vx += (jImp / b.m) * nx
      b.vy += (jImp / b.m) * ny
    }
  }
}

/** 引擎单步：细分 subSteps 次防高速穿透 */
export function stepSandbox(balls: Ball[], statics: StaticShape[], p: SandboxParams, dt: number, subSteps = 4): void {
  const h = dt / subSteps
  for (let i = 0; i < subSteps; i++) {
    integrate(balls, p, h)
    ballCollisions(balls, p)
    staticCollisions(balls, statics, p.e)
    wallCollisions(balls, p)
  }
}

/** 动能总和（J）——用于验证弹性碰撞能量守恒，也供 UI 显示 */
export function kineticEnergy(balls: Ball[]): number {
  return balls.reduce((s, b) => s + 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy), 0)
}

// ── 静态几何体（不动的碰撞体）：斜面=线段，四分之一圆弧=折线采样 ──
// 线段碰撞是双侧的（球从哪边撞都弹），圆弧用 16 段折线逼近，精度对演示足够

export interface StaticSeg {
  id: number
  kind: 'seg'
  cx: number
  cy: number // 中心点 m
  len: number // 长度 m
  angleDeg: number // 朝向（0=水平，正=顺时针，屏幕 y 向下）
}

export interface StaticArc {
  id: number
  kind: 'arc'
  cx: number
  cy: number // 圆心 m
  r: number // 半径 m
  angleDeg: number // 起始角
}

export type StaticShape = StaticSeg | StaticArc

/** 线段端点坐标 */
export function segEndpoints(s: StaticSeg): { ax: number; ay: number; bx: number; by: number } {
  const rad = (s.angleDeg * Math.PI) / 180
  const dx = (Math.cos(rad) * s.len) / 2
  const dy = (Math.sin(rad) * s.len) / 2
  return { ax: s.cx - dx, ay: s.cy - dy, bx: s.cx + dx, by: s.cy + dy }
}

/** 圆弧折线采样（16 段，跨 90°） */
export function arcPoints(s: StaticArc, n = 16): { x: number; y: number }[] {
  const a0 = (s.angleDeg * Math.PI) / 180
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((Math.PI / 2) * i) / n
    pts.push({ x: s.cx + s.r * Math.cos(a), y: s.cy + s.r * Math.sin(a) })
  }
  return pts
}

/** 圆 vs 线段：最近点法。碰撞时沿法线推出并按恢复系数反射速度（双侧） */
export function circleVsSegment(b: Ball, ax: number, ay: number, bx: number, by: number, e: number): void {
  const abx = bx - ax, aby = by - ay
  const len2 = abx * abx + aby * aby
  let t = len2 > 0 ? ((b.x - ax) * abx + (b.y - ay) * aby) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * abx, cy = ay + t * aby
  const dx = b.x - cx, dy = b.y - cy
  const d = Math.hypot(dx, dy)
  if (d >= b.r || d === 0) return
  const nx = dx / d, ny = dy / d
  b.x += nx * (b.r - d)
  b.y += ny * (b.r - d)
  const vn = b.vx * nx + b.vy * ny
  if (vn < 0) {
    b.vx -= (1 + e) * vn * nx
    b.vy -= (1 + e) * vn * ny
  }
}

/** 静态体碰撞入口：按类型生成线段并逐条检测 */
export function staticCollisions(balls: Ball[], statics: StaticShape[], e: number): void {
  for (const s of statics) {
    if (s.kind === 'seg') {
      const ep = segEndpoints(s)
      for (const b of balls) circleVsSegment(b, ep.ax, ep.ay, ep.bx, ep.by, e)
    } else {
      const pts = arcPoints(s)
      for (let i = 0; i < pts.length - 1; i++) {
        for (const b of balls) circleVsSegment(b, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, e)
      }
    }
  }
}
