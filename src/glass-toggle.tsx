// 玻璃材质试验开关：html[data-glass] 属性驱动 CSS（半透明+背景模糊+高光描边+舞台光效）
// 状态存 localStorage('cs-glass')，落地页/电学台/运动学台三处共享同一开关
import { useEffect, useState } from 'react'

export function GlassToggle() {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem('cs-glass') === '1' } catch { return false }
  })
  useEffect(() => {
    document.documentElement.dataset.glass = on ? '1' : ''
    try { localStorage.setItem('cs-glass', on ? '1' : '') } catch { /* 隐私模式忽略 */ }
  }, [on])
  return (
    <button
      className={`glass-btn${on ? ' glass-on' : ''}`}
      title={on ? '玻璃材质：开（试验功能）' : '玻璃材质：关（试验功能）'}
      onClick={() => setOn((v) => !v)}
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3c3.5 4.2 6 7.4 6 10a6 6 0 1 1-12 0c0-2.6 2.5-5.8 6-10z" />
        <path d="M9.5 13.5a2.5 2.5 0 0 0 2.5 2.5" opacity={0.6} />
      </svg>
    </button>
  )
}
