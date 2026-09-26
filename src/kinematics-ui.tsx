// 运动学实验室（测试版）：抛体运动演示 UI。独立组件，仅依赖 solver/kinematics，与电路模块零耦合
import { useEffect, useRef, useState } from 'react'
import { apexHeight, apexTime, flightTime, positionAt, range, type ProjParams } from './solver/kinematics'

const G_PRESETS: { label: string; g: number }[] = [
  { label: '地球 9.8', g: 9.8 },
  { label: '月球 1.62', g: 1.62 },
  { label: '火星 3.71', g: 3.71 },
  { label: '木星 24.8', g: 24.8 },
]

export function KinematicsLab({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState<ProjParams>({ v0: 20, angleDeg: 45, h0: 0, g: 9.8 })
  const [speed, setSpeed] = useState(0.5) // 播放倍率
  const [running, setRunning] = useState(false)
  const tRef = useRef(0)
  const [tick, setTick] = useState(0) // 驱动重渲染（t 存 ref 防高频 setState 卡顿）
  void tick

  const T = flightTime(p)
  const R = range(p)
  const H = apexHeight(p)

  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      tRef.current += dt * speed
      if (tRef.current >= T) { tRef.current = T; setRunning(false) }
      setTick((v) => v + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [running, speed, T])

  const reset = () => { tRef.current = 0; setRunning(false); setTick((v) => v + 1) }
  const setParam = (key: keyof ProjParams, v: number) => { setP((q) => ({ ...q, [key]: v })); tRef.current = 0; setRunning(false) }

  // 场景坐标：1m = scale px，自适应射程与最高点
  const scale = 620 / Math.max(R, H / 1.2, 8)
  const toPx = (x: number, y: number) => ({ px: 70 + x * scale, py: 400 - y * scale })
  const st = positionAt(p, tRef.current)
  const ball = toPx(st.x, st.y)
  const origin = toPx(0, p.h0)
  const apexPx = toPx(range(p) === 0 ? 0 : Math.min(apexTime(p), T) * positionAt(p, 0).vx, H)
  const landPx = toPx(R, 0)

  // 轨迹采样 80 点
  const trail: string[] = []
  for (let i = 0; i <= 80; i++) {
    const s = positionAt(p, (T * i) / 80)
    const { px, py } = toPx(s.x, s.y)
    trail.push(`${px},${py}`)
  }

  const ink = 'var(--ink)'
  const muted = 'var(--muted, #889)'

  return (
    <div className="dial-overlay" onClick={onClose}>
      <div className="exp-picker" style={{ maxWidth: 860, width: '92%' }} onClick={(e) => e.stopPropagation()}>
        <div className="exp-picker-head">
          <h2>运动学实验室（测试版）· 抛体运动</h2>
          <button className="icon-btn" onClick={onClose} title="关闭">×</button>
        </div>
        <svg viewBox="0 0 800 450" style={{ width: '100%', background: 'var(--panel-raise)', borderRadius: 10, border: '1px solid var(--border)' }}>
          {/* 地面与标尺 */}
          <line x1={40} y1={400} x2={780} y2={400} stroke={ink} strokeWidth={2} />
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <g key={i}>
              <line x1={70 + i * 100} y1={396} x2={70 + i * 100} y2={404} stroke={ink} strokeWidth={1} />
              <text x={70 + i * 100} y={420} fontSize={10} textAnchor="middle" fill={muted}>
                {((i * 100 - 70) / scale > 0 ? (i * 100 - 70) / scale : 0).toFixed(0)}m
              </text>
            </g>
          ))}
          {/* 发射台 */}
          {p.h0 > 0 && <rect x={origin.px - 6} y={origin.py} width={12} height={400 - origin.py} fill="none" stroke={ink} strokeWidth={1.5} />}
          {/* 轨迹 */}
          <polyline points={trail.join(' ')} fill="none" stroke="var(--accent-soft, #5e6ad2)" strokeWidth={1.5} strokeDasharray="4 3" />
          {/* 最高点与落点标注 */}
          {T > 0 && (
            <>
              <circle cx={apexPx.px} cy={apexPx.py} r={3} fill={ink} />
              <text x={apexPx.px} y={apexPx.py - 10} fontSize={11} textAnchor="middle" fill={ink}>最高 {H.toFixed(1)}m</text>
              <circle cx={landPx.px} cy={400} r={3} fill={ink} />
              <text x={landPx.px} y={390} fontSize={11} textAnchor="middle" fill={ink}>射程 {R.toFixed(1)}m</text>
            </>
          )}
          {/* 抛体（球）+ 速度矢量 */}
          {(() => {
            const vScale = 3 // 速度矢量 1m/s = 3px
            return (
              <>
                <circle cx={ball.px} cy={ball.py} r={6} fill="var(--accent-soft, #5e6ad2)" />
                <line x1={ball.px} y1={ball.py} x2={ball.px + st.vx * vScale} y2={ball.py - st.vy * vScale} stroke="#e08a97" strokeWidth={2} />
                <circle cx={ball.px + st.vx * vScale} cy={ball.py - st.vy * vScale} r={2.5} fill="#e08a97" />
              </>
            )
          })()}
        </svg>
        <div className="exp-cards" style={{ marginTop: 10 }}>
          <div className="exp-card" style={{ cursor: 'default' }}>
            <strong>实时状态 t={st.t.toFixed(2)}s</strong>
            <span>x={st.x.toFixed(1)}m · y={st.y.toFixed(1)}m · vx={st.vx.toFixed(1)}m/s · vy={st.vy.toFixed(1)}m/s</span>
          </div>
          <div className="exp-card" style={{ cursor: 'default' }}>
            <strong>三个关键量（解析解）</strong>
            <span>飞行 T={T.toFixed(2)}s · 射程 {R.toFixed(1)}m · 最高 {H.toFixed(1)}m</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
          <label style={{ flex: 1, minWidth: 160 }}>
            初速率 {p.v0}m/s
            <input type="range" min={2} max={40} step={1} value={p.v0} onChange={(e) => setParam('v0', +e.target.value)} />
          </label>
          <label style={{ flex: 1, minWidth: 160 }}>
            发射角 {p.angleDeg}°
            <input type="range" min={0} max={90} step={5} value={p.angleDeg} onChange={(e) => setParam('angleDeg', +e.target.value)} />
          </label>
          <label style={{ flex: 1, minWidth: 160 }}>
            初始高度 {p.h0}m
            <input type="range" min={0} max={30} step={1} value={p.h0} onChange={(e) => setParam('h0', +e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 8 }}>
          <label style={{ flex: 1, minWidth: 160 }}>
            重力 {p.g}m/s²
            <input type="range" min={1} max={25} step={0.01} value={p.g} onChange={(e) => setParam('g', +e.target.value)} />
          </label>
          {G_PRESETS.map((q) => (
            <button key={q.label} className={p.g === q.g ? 'active' : ''} onClick={() => setParam('g', q.g)}>{q.label}</button>
          ))}
        </div>
        <div className="pal-row" style={{ marginTop: 12 }}>
          <button onClick={() => { tRef.current = 0; setRunning(true) }}>▶ 发射</button>
          <button onClick={() => setRunning((v) => !v)}>{running ? '⏸ 暂停' : '⏵ 继续'}</button>
          <button onClick={reset}>↺ 复位</button>
          <button onClick={() => setSpeed((v) => (v >= 1 ? 0.1 : v + 0.25))}>倍率 ×{speed}</button>
        </div>
        <p className="warn" style={{ marginTop: 10 }}>
          水平方向匀速（vx 不变）、竖直方向匀加速（vy 每秒减 g）——两方向独立又同时进行，这就是抛体运动的全部。
          粉色箭头 = 速度矢量（长度随速率变化，方向沿轨迹切线）。试试互补角 30°/60° 射程一样，月球上射程约地球 6 倍。
        </p>
        <button className="wide" onClick={onClose}>关闭</button>
      </div>
    </div>
  )
}
