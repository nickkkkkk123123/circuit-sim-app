import { create } from 'zustand'
import type { Circuit, Comp, CompKind, Wire } from './solver/types'
import { defaultComp } from './solver/types'

let uid = 0
const nextId = (kind: string) => `${kind}-${++uid}`

// 持久化：刷新/重开浏览器不丢电路
export const STORAGE_KEY = 'circuit-sim-v1'
function loadSaved(): Circuit | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Circuit
    if (Array.isArray(d.comps) && Array.isArray(d.wires)) return d
  } catch {
    // 损坏数据当不存在
  }
  return null
}
const saved = loadSaved()
// uid 续号：避免恢复后新元件 id 与旧 id 撞车
function bumpUidFromId(id: string) {
  const n = Number(id.split('-').pop())
  if (Number.isFinite(n) && n > uid) uid = n
}
saved?.comps.forEach((c) => bumpUidFromId(c.id))
saved?.wires.forEach((w) => bumpUidFromId(w.id))

export type Tool = 'select' | CompKind // select 或"放置中"的元件类型

interface EditorState extends Circuit {
  tool: Tool
  selectedId: string | null
  selectedWire: string | null
  pendingFrom: string | null // 连线起点端子
  setTool: (t: Tool) => void
  place: (kind: CompKind, x: number, y: number) => void
  moveComp: (id: string, x: number, y: number) => void
  rotate: (id: string) => void
  remove: (id: string) => void
  toggleSwitch: (id: string) => void
  setExpanded: (id: string, expanded: boolean) => boolean
  updateParam: (id: string, key: string, value: number | boolean) => void
  select: (id: string | null) => void
  selectWire: (id: string | null) => void
  removeWire: (id: string) => void
  startWire: (term: string) => void
  completeWire: (term: string) => void
  cancelWire: () => void
  loadDemo: () => void
}

export const useEditor = create<EditorState>((set, get) => ({
  comps: saved?.comps ?? [],
  wires: saved?.wires ?? [],
  tool: 'select',
  selectedId: null,
  selectedWire: null,
  pendingFrom: null,

  setTool: (tool) => set({ tool, pendingFrom: null, selectedId: null }),

  place: (kind, x, y) => {
    const c = defaultComp(kind, nextId(kind), Math.round(x / 10) * 10, Math.round(y / 10) * 10)
    set((s) => ({ comps: [...s.comps, c], selectedId: c.id, tool: 'select' }))
  },

  moveComp: (id, x, y) =>
    set((s) => ({
      comps: s.comps.map((c) =>
        c.id === id ? { ...c, x: Math.round(x / 5) * 5, y: Math.round(y / 5) * 5 } : c,
      ),
    })),

  rotate: (id) =>
    set((s) => ({
      comps: s.comps.map((c) => (c.id === id ? { ...c, rot: (c.rot === 0 ? 90 : 0) as 0 | 90 } : c)),
    })),

  remove: (id) =>
    set((s) => ({
      comps: s.comps.filter((c) => c.id !== id),
      wires: s.wires.filter((w) => w.a.split(':')[0] !== id && w.b.split(':')[0] !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  toggleSwitch: (id) =>
    set((s) => ({
      comps: s.comps.map((c) => (c.id === id && c.kind === 'switch' ? { ...c, closed: !c.closed } : c)),
    })),

  setExpanded: (id, expanded) => {
    // 收起时若有导线挂在金属杆端子 c/d 上，拒绝（导线会悬空）
    if (!expanded) {
      const attached = get().wires.some((w) => {
        const ends = [w.a, w.b]
        return ends.includes(`${id}:c`) || ends.includes(`${id}:d`)
      })
      if (attached) return false
    }
    set((s) => ({
      comps: s.comps.map((c) =>
        c.id === id && c.kind === 'rheostat' ? ({ ...c, expanded } as Comp) : c,
      ),
      // 展开时 compact 的滑片端子 p 消失 → 挂在 p 上的导线迁移到杆端 c（电气等价：都在杆上）
      wires: expanded
        ? get().wires.map((w) => ({
            ...w,
            a: w.a === `${id}:p` ? `${id}:c` : w.a,
            b: w.b === `${id}:p` ? `${id}:c` : w.b,
          }))
        : get().wires,
    }))
    return true
  },

  updateParam: (id, key, value) =>
    set((s) => ({
      comps: s.comps.map((c) => (c.id === id ? ({ ...c, [key]: value } as Comp) : c)),
    })),

  select: (selectedId) => set({ selectedId, selectedWire: null }),

  selectWire: (selectedWire) => set({ selectedWire }), // 复用作"悬停高亮"标记，不动元件选中

  removeWire: (id) =>
    set((s) => ({
      wires: s.wires.filter((w) => w.id !== id),
      selectedWire: s.selectedWire === id ? null : s.selectedWire,
    })),

  startWire: (term) => set({ pendingFrom: term, tool: 'select' }),

  completeWire: (term) => {
    const { pendingFrom, wires, comps } = get()
    if (!pendingFrom || pendingFrom === term) return set({ pendingFrom: null })
    // 防御：两端端子必须都属于现存元件
    const [ca] = [pendingFrom.split(':')[0]]
    const [cb] = [term.split(':')[0]]
    if (!comps.some((c) => c.id === ca) || !comps.some((c) => c.id === cb)) return set({ pendingFrom: null })
    // 防重：同两端只留一根
    const exists = wires.some(
      (w) => (w.a === pendingFrom && w.b === term) || (w.a === term && w.b === pendingFrom),
    )
    const w: Wire = exists ? wires.find((x) => x.a === pendingFrom && x.b === term)! : { id: nextId('w'), a: pendingFrom, b: term }
    set({
      wires: exists ? wires : [...wires, w],
      pendingFrom: null,
    })
  },

  cancelWire: () => set({ pendingFrom: null }),

  loadDemo: () => {
    uid = 0
    // 矩形回路布局：所有端子坐标对齐，导线全部横平竖直
    const comps: Comp[] = [
      { id: 'sw-1', kind: 'switch', x: 350, y: 200, rot: 0, closed: true },
      { id: 'bulb-1', kind: 'bulb', x: 650, y: 200, rot: 0, r: 10, ratedP: 3.6 },
      { id: 'bat-1', kind: 'battery', x: 350, y: 500, rot: 0, emf: 6, r: 0.5 },
      { id: 'res-1', kind: 'resistor', x: 644, y: 500, rot: 0, r: 15 },
    ]
    const wires: Wire[] = [
      { id: 'w-1', a: 'sw-1:a', b: 'bat-1:a' }, // 左侧竖线
      { id: 'w-2', a: 'sw-1:b', b: 'bulb-1:a' }, // 顶边横线
      { id: 'w-3', a: 'bulb-1:b', b: 'res-1:b' }, // 右侧竖线（落在电阻右端子）
      { id: 'w-4', a: 'res-1:a', b: 'bat-1:b' }, // 底边横线（电阻左端子出）
    ]
    uid = 5
    set({ comps, wires, tool: 'select', selectedId: null, pendingFrom: null })
  },
}))
