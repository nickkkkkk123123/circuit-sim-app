// 视觉常量：全部走 CSS 变量（index.css :root 定义暗色，[data-theme='light'] 覆盖亮色）
// 主题切换只换变量，HTML 与 SVG 一起联动；这里不再放硬编码色值
export const THEME = {
  canvas: { w: 1600, h: 900, grid: 25 },
  ink: 'var(--ink)',
  inkSelected: 'var(--ink-selected)',
  accent: 'var(--accent)',
  accentSoft: 'var(--accent-soft)',
  wire: {
    idle: 'var(--wire-idle)',
    live: 'var(--wire-live)',
    liveUnder: 'var(--wire-live-under)',
    width: 3.5,
  },
  terminal: {
    idle: 'var(--terminal-idle)',
    hot: 'var(--terminal-hot)',
    rim: 'var(--terminal-rim)',
  },
  preview: 'var(--preview)',
  label: 'var(--muted)',
  readout: 'var(--readout)',
  warn: 'var(--warn)',
  bulb: {
    // 暖光在黑/白底上都成立，保留 rgba
    halo: (a: number) => `rgba(255,180,60,${a * 0.3})`,
    body: (a: number) => `rgba(255,200,90,${a})`,
    rim: '#ffcf6a',
    filament: '#fff2cf',
  },
}
