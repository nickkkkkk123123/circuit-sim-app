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
  e: number // 恢复系数 0~1（该球材料属性；球-球取两者平均）
  fx?: number // 恒定外力 x 分量 N（试验功能：施力物体上不消失的力，F=ma）
  fy?: number // 恒定外力 y 分量 N（屏幕 y 向下为正）
}

export interface SandboxParams {
  g: number // 重力加速度 m/s²（向下为正）
  W: number // 场地宽 m
  H: number // 场地高 m
  ground: boolean // 地面开关：false = 底边不碰撞（球掉出由调用方回收）
  unlimited?: boolean // 场地无限制：四壁全无、不回收，球飞多远都保留
}

export function makeBall(id: number, x: number, y: number, r: number, vx = 0, vy = 0, e = 0): Ball {
  // 默认质量 ∝ r²（面密度均匀）；默认弹性 0（泥球：落地即停，教学默认更"物理直觉"）
  return { id, x, y, r, vx, vy, m: r * r * 10, e, fx: 0, fy: 0 }
}

/** 单步积分（半隐式欧拉：先更新速度再更新位置，重力下能量漂移小于显式欧拉）。
 * 恒力 fx/fy 以 N 计，a = F/m 叠加在重力上 */
export function integrate(balls: Ball[], p: SandboxParams, dt: number): void {
  for (const b of balls) {
    b.vx += ((b.fx ?? 0) / b.m) * dt
    b.vy += (p.g + (b.fy ?? 0) / b.m) * dt
    b.x += b.vx * dt
    b.y += b.vy * dt
  }
}

/** 球-墙碰撞（四壁反弹，用球自己的恢复系数；位置钳位防穿墙）。
 * 只在地面开启时生效（封闭场地）；地面关闭 = 开放空间，四周全无隐形的墙，球飞出由调用方回收 */
export function wallCollisions(balls: Ball[], p: SandboxParams): void {
  if (!p.ground || p.unlimited) return
  for (const b of balls) {
    if (b.x - b.r < 0) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * b.e }
    if (b.x + b.r > p.W) { b.x = p.W - b.r; if (b.vx > 0) b.vx = -b.vx * b.e }
    if (b.y - b.r < 0) { b.y = b.r; if (b.vy < 0) b.vy = -b.vy * b.e }
    if (b.y + b.r > p.H) { b.y = p.H - b.r; if (b.vy > 0) b.vy = -b.vy * b.e }
  }
}

/** 球-球碰撞：冲量法（沿法线的弹性碰撞通解，恢复系数取两球平均）+ 按质量比例的位置修正 */
export function ballCollisions(balls: Ball[]): void {
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
      // 冲量：只在相互接近时施加；恢复系数取两球材料的平均
      const rvx = b.vx - a.vx, rvy = b.vy - a.vy
      const vn = rvx * nx + rvy * ny
      if (vn >= 0) continue // 正在分离
      const ePair = (a.e + b.e) / 2
      const jImp = (-(1 + ePair) * vn) / (1 / a.m + 1 / b.m)
      a.vx -= (jImp / a.m) * nx
      a.vy -= (jImp / a.m) * ny
      b.vx += (jImp / b.m) * nx
      b.vy += (jImp / b.m) * ny
    }
  }
}

/** 引擎单步：细分 subSteps 次防高速穿透。blocks/zones 可选（v0.6 滑块；zones=力场，为电场/磁场预留，UI 暂未接入） */
export function stepSandbox(
  balls: Ball[],
  statics: StaticShape[],
  p: SandboxParams,
  dt: number,
  subSteps = 4,
  blocks: Block[] = [],
  zones: ForceZone[] = [],
): void {
  const h = dt / subSteps
  for (let i = 0; i < subSteps; i++) {
    applyForceZones(balls, blocks, zones, h)
    integrate(balls, p, h)
    integrateBlocks(blocks, p, h)
    ballCollisions(balls)
    staticCollisions(balls, statics)
    blockPhysics(blocks, balls, p)
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

/** 静态体碰撞入口：按类型生成线段并逐条检测（恢复系数用球自己的材料属性） */
export function staticCollisions(balls: Ball[], statics: StaticShape[]): void {
  for (const s of statics) {
    if (s.kind === 'seg') {
      const ep = segEndpoints(s)
      for (const b of balls) circleVsSegment(b, ep.ax, ep.ay, ep.bx, ep.by, b.e)
    } else {
      const pts = arcPoints(s)
      for (let i = 0; i < pts.length - 1; i++) {
        for (const b of balls) circleVsSegment(b, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, b.e)
      }
    }
  }
}

// ── 小滑块（v0.6 试验功能）：轴对齐矩形刚体，无旋转（滑块本来就不该转） ──
// 恒力 F=ma + 地面滑动演示的主力道具；与墙/球/滑块互撞，与斜面暂不互撞（同红线预埋）

export interface Block {
  id: number
  x: number
  y: number // 中心 m
  hw: number // 半宽 m
  hh: number // 半高 m
  vx: number
  vy: number
  m: number // 质量 kg
  e: number // 恢复系数（滑块默认 0：放地上不弹跳，纯滑动）
  fx?: number // 恒定外力 x 分量 N
  fy?: number // 恒定外力 y 分量 N（向下为正）
}

export function makeBlock(id: number, x: number, y: number, hw = 1.5, hh = 0.5, vx = 0, vy = 0): Block {
  return { id, x, y, hw, hh, vx, vy, m: hw * hh * 8, e: 0, fx: 0, fy: 0 }
}

export function integrateBlocks(blocks: Block[], p: SandboxParams, dt: number): void {
  for (const k of blocks) {
    k.vx += ((k.fx ?? 0) / k.m) * dt
    k.vy += (p.g + (k.fy ?? 0) / k.m) * dt
    k.x += k.vx * dt
    k.y += k.vy * dt
  }
}

/** 滑块-墙：四壁钳位 + 按滑块自己的恢复系数反弹 */
function blockWalls(blocks: Block[], p: SandboxParams): void {
  if (!p.ground || p.unlimited) return
  for (const k of blocks) {
    if (k.x - k.hw < 0) { k.x = k.hw; if (k.vx < 0) k.vx = -k.vx * k.e }
    if (k.x + k.hw > p.W) { k.x = p.W - k.hw; if (k.vx > 0) k.vx = -k.vx * k.e }
    if (k.y - k.hh < 0) { k.y = k.hh; if (k.vy < 0) k.vy = -k.vy * k.e }
    if (k.y + k.hh > p.H) { k.y = p.H - k.hh; if (k.vy > 0) k.vy = -k.vy * k.e }
  }
}

/** 滑块-滑块：AABB 重叠按最小穿透轴分离，冲量沿该轴（质量反比位置修正） */
function blockVsBlock(blocks: Block[]): void {
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j]
      const dx = b.x - a.x, dy = b.y - a.y
      const ox = a.hw + b.hw - Math.abs(dx)
      const oy = a.hh + b.hh - Math.abs(dy)
      if (ox <= 0 || oy <= 0) continue
      const totalM = a.m + b.m
      let nx = 0, ny = 0, sep = 0
      if (ox < oy) { nx = Math.sign(dx) || 1; sep = ox } else { ny = Math.sign(dy) || 1; sep = oy }
      a.x -= nx * sep * (b.m / totalM)
      a.y -= ny * sep * (b.m / totalM)
      b.x += nx * sep * (a.m / totalM)
      b.y += ny * sep * (a.m / totalM)
      const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
      if (rvn >= 0) continue
      const ePair = (a.e + b.e) / 2
      const jImp = (-(1 + ePair) * rvn) / (1 / a.m + 1 / b.m)
      a.vx -= (jImp / a.m) * nx
      a.vy -= (jImp / a.m) * ny
      b.vx += (jImp / b.m) * nx
      b.vy += (jImp / b.m) * ny
    }
  }
}

/** 球-滑块：圆 vs AABB（最近点法），冲量通解与球-球一致 */
function ballVsBlock(b: Ball, k: Block): void {
  const cx = Math.max(k.x - k.hw, Math.min(b.x, k.x + k.hw))
  const cy = Math.max(k.y - k.hh, Math.min(b.y, k.y + k.hh))
  const dx = b.x - cx, dy = b.y - cy
  const d = Math.hypot(dx, dy)
  if (d >= b.r) return
  if (d === 0) {
    // 球心陷入块内（极高速/大步长才发生）：沿最小穿透轴直接推出，不做冲量
    const px = k.hw + b.r - Math.abs(b.x - k.x)
    const py = k.hh + b.r - Math.abs(b.y - k.y)
    if (px < py) b.x += (Math.sign(b.x - k.x) || 1) * px
    else b.y += (Math.sign(b.y - k.y) || 1) * py
    return
  }
  const nx = dx / d, ny = dy / d
  b.x += nx * (b.r - d)
  b.y += ny * (b.r - d)
  const rvn = (b.vx - k.vx) * nx + (b.vy - k.vy) * ny
  if (rvn >= 0) return
  const ePair = (b.e + k.e) / 2
  const jImp = (-(1 + ePair) * rvn) / (1 / b.m + 1 / k.m)
  b.vx += (jImp / b.m) * nx
  b.vy += (jImp / b.m) * ny
  k.vx -= (jImp / k.m) * nx
  k.vy -= (jImp / k.m) * ny
}

/** 滑块全套碰撞：墙 → 滑块互撞 → 球撞滑块（每子步调用一次） */
export function blockPhysics(blocks: Block[], balls: Ball[], p: SandboxParams): void {
  if (!blocks.length) return
  blockWalls(blocks, p)
  blockVsBlock(blocks)
  for (const k of blocks) for (const b of balls) ballVsBlock(b, k)
}

// ── 力场（引擎预留，UI 暂未接入）：区域恒力，物体进区即受力——电场/磁场/风区的公共底座 ──

export interface ForceZone {
  id: number
  x: number
  y: number // 中心 m
  hw: number // 半宽 m
  hh: number // 半高 m
  fx: number // 区域内物体受到的恒力 x 分量 N（按物体质量折算加速度）
  fy: number
}

/** 力场施加：AABB 内的球/滑块每子步获得 Δv = (F/m)·h（与积分同阶，半隐式一致） */
export function applyForceZones(balls: Ball[], blocks: Block[], zones: ForceZone[], dt: number): void {
  if (!zones.length) return
  for (const z of zones) {
    for (const b of balls) {
      if (Math.abs(b.x - z.x) <= z.hw && Math.abs(b.y - z.y) <= z.hh) {
        b.vx += (z.fx / b.m) * dt
        b.vy += (z.fy / b.m) * dt
      }
    }
    for (const k of blocks) {
      if (Math.abs(k.x - z.x) <= z.hw + k.hw && Math.abs(k.y - z.y) <= z.hh + k.hh) {
        k.vx += (z.fx / k.m) * dt
        k.vy += (z.fy / k.m) * dt
      }
    }
  }
}
