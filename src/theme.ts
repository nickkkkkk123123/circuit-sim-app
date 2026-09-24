// 视觉常量集中地：SVG 侧从这里取值；面板样式用 index.css 的 :root 变量（两边保持同步）
// 以后做主题切换/演示美化，改这一个文件（+ :root）即可，不碰逻辑
export const THEME = {
  canvas: { w: 1600, h: 900, grid: 25 },
  ink: '#dfe3ee', // 元件默认描边
  inkSelected: '#8b93ff',
  accent: '#5e6ad2',
  accentSoft: '#b9c0ff',
  wire: { idle: '#39415a', live: '#ffd76a', liveUnder: '#6b5416', width: 3.5 },
  terminal: { idle: '#4a5578', hot: '#6fd39a', rim: '#0d1017' },
  preview: '#6fd39a',
  label: '#9aa3b8',
  readout: '#6fd39a',
  warn: '#e0b36a',
  bulb: {
    halo: (a: number) => `rgba(255,180,60,${a * 0.3})`,
    body: (a: number) => `rgba(255,200,90,${a})`,
    rim: '#ffcf6a',
    filament: '#fff2cf',
  },
}
