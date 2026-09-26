import { create } from 'zustand'
import type { Circuit, Comp, CompKind, Wire, MeterPosts, Gate } from './solver/types'
import { defaultComp } from './solver/types'
import { EXPERIMENTS } from './experiments'

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
  updateParam: (id: string, key: string, value: number | boolean | string | MeterPosts) => void
  select: (id: string | null) => void
  selectWire: (id: string | null) => void
  removeWire: (id: string) => void
  startWire: (term: string) => void
  completeWire: (term: string) => void
  cancelWire: () => void
  loadDemo: () => void
  demoOpen: boolean
  setDemoOpen: (open: boolean) => void
  gateType: Gate['type'] // 逻辑门放置弹窗里选中的待放类型
  gatePickerOpen: boolean
  setGateType: (t: Gate['type']) => void
  setGatePickerOpen: (open: boolean) => void
  loadExperiment: (id: string) => void
  clearAll: () => void
  undo: () => void
  beginHistory: () => void // 拖拽等连续操作前打快照，整个手势算一步
  histCount: number // 可撤销步数（仅用于 UI 显示）
}

// 撤销快照（内存态）：history 只在内存，不写入 localStorage（App 持久化仅存 comps/wires）
interface HistoryEntry { comps: Comp[]; wires: Wire[] }
const UNDO_MAX = 50

export const useEditor = create<EditorState>((set, get) => {
  const hist: HistoryEntry[] = []
  const pushUndo = () => {
    const c = get()
    hist.push({ comps: c.comps.map((x) => ({ ...x })), wires: c.wires.map((x) => ({ ...x })) })
    if (hist.length > UNDO_MAX) hist.shift()
    set({ histCount: hist.length })
  }
  return {

  comps: saved?.comps ?? [],
  wires: saved?.wires ?? [],
  tool: 'select',
  selectedId: null,
  selectedWire: null,
  pendingFrom: null,
  demoOpen: false,
  gateType: 'AND',
  gatePickerOpen: false,
  histCount: 0,

  setTool: (tool) => set({ tool, pendingFrom: null, selectedId: null }),

  place: (kind, x, y) => {
    pushUndo()
    const c = defaultComp(kind, nextId(kind), Math.round(x / 10) * 10, Math.round(y / 10) * 10)
    if (kind === 'gate') (c as Gate).type = get().gateType
    set((s) => ({ comps: [...s.comps, c], selectedId: c.id, tool: 'select' }))
  },

  // 拖拽起点/连续手势前调用：只打一次快照
  beginHistory: () => pushUndo(),

  undo: () => {
    const prev = hist.pop()
    if (!prev) return
    set({ comps: prev.comps, wires: prev.wires, selectedId: null, selectedWire: null, pendingFrom: null, histCount: hist.length })
  },

  clearAll: () => {
    if (!get().comps.length && !get().wires.length) return
    pushUndo()
    set({ comps: [], wires: [], selectedId: null, selectedWire: null, pendingFrom: null })
  },

  moveComp: (id, x, y) =>
    set((s) => ({
      comps: s.comps.map((c) =>
        c.id === id ? { ...c, x: Math.round(x / 5) * 5, y: Math.round(y / 5) * 5 } : c,
      ),
    })),

  rotate: (id) => {
    pushUndo()
    set((s) => ({
      comps: s.comps.map((c) => (c.id === id ? { ...c, rot: (c.rot === 0 ? 90 : 0) as 0 | 90 } : c)),
    }))
  },

  remove: (id) => {
    pushUndo()
    set((s) => ({
      comps: s.comps.filter((c) => c.id !== id),
      wires: s.wires.filter((w) => w.a.split(':')[0] !== id && w.b.split(':')[0] !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }))
  },

  toggleSwitch: (id) => {
    pushUndo()
    set((s) => ({
      comps: s.comps.map((c) => (c.id === id && c.kind === 'switch' ? { ...c, closed: !c.closed } : c)),
    }))
  },

  setExpanded: (id, expanded) => {
    // 切换时端子迁移（电气等价）：收起 c/d→p（杆直通滑片），展开 p→c；迁重自动去重
    pushUndo()
    const remap = (t: string) =>
      expanded
        ? (t === `${id}:p` ? `${id}:c` : t)
        : (t === `${id}:c` || t === `${id}:d` ? `${id}:p` : t)
    let wires = get().wires.map((w) => ({ ...w, a: remap(w.a), b: remap(w.b) }))
    const seen = new Set<string>()
    wires = wires.filter((w) => {
      const k = [w.a, w.b].sort().join('|')
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    set((s) => ({
      comps: s.comps.map((c) =>
        c.id === id && c.kind === 'rheostat' ? ({ ...c, expanded } as Comp) : c,
      ),
      wires,
    }))
    return true
  },

  updateParam: (id, key, value) => {
    pushUndo()
    set((s) => ({
      comps: s.comps.map((c) => (c.id === id ? ({ ...c, [key]: value } as Comp) : c)),
    }))
  },

  select: (selectedId) => set({ selectedId, selectedWire: null }),

  selectWire: (selectedWire) => set({ selectedWire }), // 复用作"悬停高亮"标记，不动元件选中

  removeWire: (id) => {
    pushUndo()
    set((s) => ({
      wires: s.wires.filter((w) => w.id !== id),
      selectedWire: s.selectedWire === id ? null : s.selectedWire,
    }))
  },

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
    if (!exists) pushUndo()
    set({
      wires: exists ? wires : [...wires, w],
      pendingFrom: null,
    })
  },

  cancelWire: () => set({ pendingFrom: null }),

  loadDemo: () => get().loadExperiment('basic'),

  setDemoOpen: (demoOpen) => set({ demoOpen }),

  // 选型即进入放置态；弹窗不关，可连续换类型连放多个门
  setGateType: (gateType) => set({ gateType, tool: 'gate', pendingFrom: null, selectedId: null }),
  setGatePickerOpen: (gatePickerOpen) => set({ gatePickerOpen }),

  // 载入实验预设：包内 id 只保证唯一，这里统一重编全局 id，避免与画布现有元件撞车
  loadExperiment: (id) => {
    const exp = EXPERIMENTS.find((e) => e.id === id)
    if (!exp) return
    pushUndo()
    const c0 = exp.build()
    const idMap = new Map<string, string>()
    const comps = c0.comps.map((c) => {
      const nid = nextId(c.kind)
      idMap.set(c.id, nid)
      return { ...c, id: nid }
    })
    const remapTerm = (t: string) => {
      const [cid, term] = t.split(':')
      return `${idMap.get(cid)!}:${term}`
    }
    const wires = c0.wires.map((w) => ({ id: nextId('w'), a: remapTerm(w.a), b: remapTerm(w.b) }))
    set({ comps, wires, tool: 'select', selectedId: null, pendingFrom: null, demoOpen: false })
  },
  }
})

// 事件处理器内读取最新状态的入口（避免渲染闭包读到过期的 pendingFrom 等瞬态）
export const editorState = () => useEditor.getState()
