// 运动学沙盒状态仓库：完全照搬电学台 store.ts 的构建思路
// zustand + 撤销快照（内存 hist）+ localStorage 持久化（仅 balls/statics）
import { create } from 'zustand'
import { makeBall, makeBlock, type Ball, type Block, type StaticShape } from './solver/kinematics-sandbox'

export type KinTool = 'select' | 'ball' | 'block' | 'force' | 'seg' | 'arc'
export type KinSel = { type: 'ball' | 'block' | 'static'; id: number } | null

const STORAGE_KEY = 'kin-sandbox-v2'

interface Saved {
  balls: Ball[]
  statics: StaticShape[]
  blocks?: Block[]
}
function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('kin-sandbox-v1')
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
for (const b of saved?.blocks ?? []) if (typeof b.id === 'number' && b.id >= uid) uid = b.id + 1
for (const s2 of saved?.statics ?? []) if (typeof s2.id === 'number' && s2.id >= uid) uid = s2.id + 1
const nextId = () => uid++

interface HistoryEntry {
  balls: Ball[]
  statics: StaticShape[]
  blocks: Block[]
}
const UNDO_MAX = 50

interface KinStore {
  balls: Ball[]
  blocks: Block[]
  statics: StaticShape[]
  tool: KinTool
  sel: KinSel
  g: number
  gOn: boolean
  ground: boolean
  trails: boolean
  running: boolean
  fw: number // 场地宽 m（可调，墙/回收/坐标轴/阴影全部随动）
  fh: number // 场地高 m（地面线位置）
  unlimited: boolean // 场地无限制：无墙无回收，球飞多远都保留
  histCount: number
  setTool: (t: KinTool) => void
  setSel: (s: KinSel) => void
  addBall: (wx: number, wy: number, vx: number, vy: number) => void
  addBlock: (wx: number, wy: number, vx: number, vy: number) => void
  addStatic: (s: Omit<Extract<StaticShape, { kind: 'seg' }>, 'id'> | Omit<Extract<StaticShape, { kind: 'arc' }>, 'id'>) => void
  moveBall: (id: number, dx: number, dy: number) => void
  moveBlock: (id: number, dx: number, dy: number) => void
  moveStatic: (id: number, dx: number, dy: number) => void
  updateBall: (id: number, patch: Partial<Ball>) => void
  updateBlock: (id: number, patch: Partial<Block>) => void
  updateStatic: (id: number, patch: Partial<StaticShape>) => void
  removeSel: () => void
  clear: () => void
  undo: () => void
  setG: (v: number) => void
  setGOn: (v: boolean) => void
  setGround: (v: boolean) => void
  setTrails: (v: boolean) => void
  setRunning: (v: boolean) => void
  setFw: (v: number) => void
  setFh: (v: number) => void
  setUnlimited: (v: boolean) => void
}

export const useKin = create<KinStore>((set, get) => {
  const hist: HistoryEntry[] = []
  const pushUndo = () => {
    const s = get()
    hist.push({
      balls: s.balls.map((x) => ({ ...x })),
      statics: s.statics.map((x) => ({ ...x })),
      blocks: s.blocks.map((x) => ({ ...x })),
    })
    if (hist.length > UNDO_MAX) hist.shift()
    set({ histCount: hist.length })
  }
  const persist = (balls: Ball[], statics: StaticShape[], blocks: Block[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ balls, statics, blocks }))
    } catch {
      // 存储满就不管
    }
  }
  const commit = (balls: Ball[], statics: StaticShape[], blocks?: Block[]) => {
    const bl = blocks ?? get().blocks
    set({ balls, statics, blocks: bl })
    persist(balls, statics, bl)
  }
  return {
    balls: saved?.balls ?? [],
    blocks: saved?.blocks ?? [],
    statics: saved?.statics ?? [],
    tool: 'select',
    sel: null,
    g: 9.8,
    gOn: true,
    ground: true,
    trails: true,
    running: false,
    fw: 100,
    fh: 40,
    unlimited: false,
    histCount: 0,

    setTool: (tool) => set({ tool, sel: null }),
    setSel: (sel) => set({ sel }),

    addBall: (wx, wy, vx, vy) => {
      if (get().balls.length >= 30) return
      pushUndo()
      const b = makeBall(nextId(), wx, wy, 0.7, vx, vy)
      const { balls, statics } = get()
      commit([...balls, b], statics)
      // 放置完成自动切回选择工具（一次性工具语义：放置≠连续铺球模式）
      set({ sel: { type: 'ball', id: b.id }, tool: 'select' })
    },
    addBlock: (wx, wy, vx, vy) => {
      if (get().blocks.length >= 12) return
      pushUndo()
      const k = makeBlock(nextId(), wx, wy, 1.5, 0.5, vx, vy)
      const { balls, statics } = get()
      commit(balls, statics, [...get().blocks, k])
      set({ sel: { type: 'block', id: k.id }, tool: 'select' })
    },
    addStatic: (s) => {
      pushUndo()
      const full = { ...s, id: nextId() } as StaticShape
      const { balls, statics } = get()
      commit(balls, [...statics, full])
      set({ sel: { type: 'static', id: full.id }, tool: 'select' })
    },
    moveBall: (id, dx, dy) => {
      // 拖拽移动不打快照（beginHistory 语义，整个手势一步）
      const { balls } = get()
      commit(balls.map((b) => (b.id === id ? { ...b, x: b.x + dx, y: b.y + dy } : b)), get().statics)
    },
    moveBlock: (id, dx, dy) => {
      const { blocks } = get()
      commit(get().balls, get().statics, blocks.map((k) => (k.id === id ? { ...k, x: k.x + dx, y: k.y + dy } : k)))
    },
    moveStatic: (id, dx, dy) => {
      const { statics } = get()
      commit(get().balls, statics.map((q) => (q.id === id ? { ...q, cx: q.cx + dx, cy: q.cy + dy } : q)))
    },
    updateBall: (id, patch) => {
      const { balls, statics } = get()
      commit(balls.map((b) => (b.id === id ? { ...b, ...patch } : b)), statics)
    },
    updateBlock: (id, patch) => {
      const { balls, statics } = get()
      commit(balls, statics, get().blocks.map((k) => (k.id === id ? { ...k, ...patch } : k)))
    },
    updateStatic: (id, patch) => {
      const { balls, statics } = get()
      commit(balls, statics.map((s) => (s.id === id ? ({ ...s, ...patch } as StaticShape) : s)))
    },
    removeSel: () => {
      const sel = get().sel
      if (!sel) return
      pushUndo()
      const { balls, statics, blocks } = get()
      if (sel.type === 'ball') commit(balls.filter((b) => b.id !== sel.id), statics)
      else if (sel.type === 'block') commit(balls, statics, blocks.filter((k) => k.id !== sel.id))
      else commit(balls, statics.filter((s) => s.id !== sel.id))
      set({ sel: null })
    },
    clear: () => {
      if (!get().balls.length && !get().statics.length && !get().blocks.length) return
      pushUndo()
      commit([], [], [])
      set({ sel: null })
    },
    undo: () => {
      const prev = hist.pop()
      if (!prev) return
      commit(prev.balls, prev.statics, prev.blocks)
      set({ sel: null, histCount: hist.length })
    },

    setG: (g) => set({ g }),
    setGOn: (gOn) => set({ gOn }),
    setGround: (ground) => set({ ground }),
    setTrails: (trails) => set({ trails }),
    setRunning: (running) => set({ running }),
    setFw: (fw) => set({ fw }),
    setFh: (fh) => set({ fh }),
    setUnlimited: (unlimited) => set({ unlimited }),
  }
})

/** 事件处理器内读取最新状态（避免渲染闭包读到旧值） */
export const kinState = () => useKin.getState()
