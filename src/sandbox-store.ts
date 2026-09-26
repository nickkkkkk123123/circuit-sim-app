// 运动学沙盒状态仓库：完全照搬电学台 store.ts 的构建思路
// zustand + 撤销快照（内存 hist）+ localStorage 持久化（仅 balls/statics）
import { create } from 'zustand'
import { makeBall, type Ball, type StaticShape } from './solver/kinematics-sandbox'

export type KinTool = 'select' | 'ball' | 'seg' | 'arc'
export type KinSel = { type: 'ball' | 'static'; id: number } | null

const STORAGE_KEY = 'kin-sandbox-v1'

interface Saved {
  balls: Ball[]
  statics: StaticShape[]
}
function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Saved
    if (Array.isArray(d.balls) && Array.isArray(d.statics)) return d
  } catch {
    // 损坏数据当不存在
  }
  return null
}
const saved = loadSaved()
let uid = 1
for (const b of saved?.balls ?? []) if (typeof b.id === 'number' && b.id >= uid) uid = b.id + 1
for (const s2 of saved?.statics ?? []) if (typeof s2.id === 'number' && s2.id >= uid) uid = s2.id + 1
const nextId = () => uid++

interface HistoryEntry {
  balls: Ball[]
  statics: StaticShape[]
}
const UNDO_MAX = 50

interface KinStore {
  balls: Ball[]
  statics: StaticShape[]
  tool: KinTool
  sel: KinSel
  g: number
  gOn: boolean
  ground: boolean
  trails: boolean
  running: boolean
  histCount: number
  setTool: (t: KinTool) => void
  setSel: (s: KinSel) => void
  addBall: (wx: number, wy: number, vx: number, vy: number) => void
  addStatic: (s: Omit<Extract<StaticShape, { kind: 'seg' }>, 'id'> | Omit<Extract<StaticShape, { kind: 'arc' }>, 'id'>) => void
  moveBall: (id: number, dx: number, dy: number) => void
  updateBall: (id: number, patch: Partial<Ball>) => void
  updateStatic: (id: number, patch: Partial<StaticShape>) => void
  removeSel: () => void
  clear: () => void
  undo: () => void
  setG: (v: number) => void
  setGOn: (v: boolean) => void
  setGround: (v: boolean) => void
  setTrails: (v: boolean) => void
  setRunning: (v: boolean) => void
}

export const useKin = create<KinStore>((set, get) => {
  const hist: HistoryEntry[] = []
  const pushUndo = () => {
    const s = get()
    hist.push({ balls: s.balls.map((x) => ({ ...x })), statics: s.statics.map((x) => ({ ...x })) })
    if (hist.length > UNDO_MAX) hist.shift()
    set({ histCount: hist.length })
  }
  const persist = (balls: Ball[], statics: StaticShape[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ balls, statics }))
    } catch {
      // 存储满就不管
    }
  }
  const commit = (balls: Ball[], statics: StaticShape[]) => {
    set({ balls, statics })
    persist(balls, statics)
  }
  return {
    balls: saved?.balls ?? [],
    statics: saved?.statics ?? [],
    tool: 'ball',
    sel: null,
    g: 9.8,
    gOn: true,
    ground: true,
    trails: true,
    running: false,
    histCount: 0,

    setTool: (tool) => set({ tool, sel: null }),
    setSel: (sel) => set({ sel }),

    addBall: (wx, wy, vx, vy) => {
      if (get().balls.length >= 30) return
      pushUndo()
      const b = makeBall(nextId(), wx, wy, 0.7, vx, vy)
      const { balls, statics } = get()
      commit([...balls, b], statics)
      set({ sel: { type: 'ball', id: b.id } })
    },
    addStatic: (s) => {
      pushUndo()
      const full = { ...s, id: nextId() } as StaticShape
      const { balls, statics } = get()
      commit(balls, [...statics, full])
      set({ sel: { type: 'static', id: full.id } })
    },
    moveBall: (id, dx, dy) => {
      // 拖拽移动不打快照（beginHistory 语义，整个手势一步）
      const { balls } = get()
      commit(balls.map((b) => (b.id === id ? { ...b, x: b.x + dx, y: b.y + dy } : b)), get().statics)
    },
    updateBall: (id, patch) => {
      const { balls, statics } = get()
      commit(balls.map((b) => (b.id === id ? { ...b, ...patch } : b)), statics)
    },
    updateStatic: (id, patch) => {
      const { balls, statics } = get()
      commit(balls, statics.map((s) => (s.id === id ? ({ ...s, ...patch } as StaticShape) : s)))
    },
    removeSel: () => {
      const sel = get().sel
      if (!sel) return
      pushUndo()
      const { balls, statics } = get()
      if (sel.type === 'ball') commit(balls.filter((b) => b.id !== sel.id), statics)
      else commit(balls, statics.filter((s) => s.id !== sel.id))
      set({ sel: null })
    },
    clear: () => {
      if (!get().balls.length && !get().statics.length) return
      pushUndo()
      commit([], [])
      set({ sel: null })
    },
    undo: () => {
      const prev = hist.pop()
      if (!prev) return
      commit(prev.balls, prev.statics)
      set({ sel: null, histCount: hist.length })
    },

    setG: (g) => set({ g }),
    setGOn: (gOn) => set({ gOn }),
    setGround: (ground) => set({ ground }),
    setTrails: (trails) => set({ trails }),
    setRunning: (running) => set({ running }),
  }
})

/** 事件处理器内读取最新状态（避免渲染闭包读到旧值） */
export const kinState = () => useKin.getState()
