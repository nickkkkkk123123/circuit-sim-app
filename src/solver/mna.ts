// MNA 改进节点法求解器（纯 TS，与 UI 零耦合）
// 电源采用诺顿等效（电导 + 注入电流），避免电压源行，全电路纯电导矩阵
import type { Circuit, Comp } from './types'
import { terminalsOf, METER_G_R } from './types'

export interface BranchResult {
  refId: string // 所属元件 id，导线为 wire id（元件内部辅助支路带 : 后缀，不入 byComp）
  kind: 'wire' | 'battery' | 'resistor' | 'bulb' | 'switch-open' | 'switch' | 'rheostat' | 'voltmeter' | 'ammeter' | 'galvanometer' | 'ohmmeter'
  dv: number // 元件两端电压差（na - nb）
  current: number // 流过电流（绝对值）
  power: number // 电功率（绝对值）
}

export interface SolveResult {
  branches: BranchResult[]
  byComp: Record<string, BranchResult> // 元件 id → 结果（导线不在内）
  openCircuit: boolean // 是否存在断路（开关断开）——灯泡等无电流
  ohm?: Record<string, number> // 欧姆表读数：两端间等效电阻（零源辅助求解），Ω
}

// 内部分支：携带拓扑与参数
interface Branch {
  refId: string
  kind: BranchResult['kind']
  na: string
  nb: string
  r: number
  emf?: number
}

// 端子即节点（导线不合并节点——导线本身是 0.002Ω 支路，这样每根导线有真实电流可显示）
// 滑动变阻器：紧凑态额外端子 :p（滑片上方）+ 内部节点 :__p；展开态另有 :c/:d（金属杆两端）与 :__t（杆）
function buildNodes(circuit: Circuit) {
  const nodeIds: string[] = []
  for (const c of circuit.comps) {
    nodeIds.push(...terminalsOf(c).map((t) => `${c.id}:${t}`))
    if (c.kind === 'rheostat') nodeIds.push(`${c.id}:__p`)
    if (c.kind === 'rheostat' && c.expanded) nodeIds.push(`${c.id}:__t`)
    if (c.kind === 'battery' && c.expanded) nodeIds.push(`${c.id}:__e`) // 展开态：E 与 r 的串联点
    if (c.kind === 'voltmeter' && c.expanded && !c.ideal) nodeIds.push(`${c.id}:__m`) // 展开态：G 与分压电阻的串联点
  }
  return { nodeIds: [...new Set(nodeIds)] }
}

// 高斯消元（列主元）——主解与欧姆表零源辅助解共用
function solveGauss(G: number[][], I: number[]): number[] {
  const N = G.length
  const A = G.map((row, i) => [...row, I[i]])
  for (let col = 0; col < N; col++) {
    let piv = col
    for (let r = col + 1; r < N; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r
    ;[A[col], A[piv]] = [A[piv], A[col]]
    if (Math.abs(A[col][col]) < 1e-12) continue
    for (let r = 0; r < N; r++) {
      if (r === col) continue
      const f = A[r][col] / A[col][col]
      for (let k = col; k <= N; k++) A[r][k] -= f * A[col][k]
    }
  }
  const V = new Array(N).fill(0)
  for (let i = 0; i < N; i++) {
    const diag = A[i][i]
    if (Math.abs(diag) > 1e-12) V[i] = A[i][N] / diag
  }
  return V
}

export function solve(circuit: Circuit): SolveResult {
  const { comps, wires } = circuit
  const { nodeIds } = buildNodes(circuit)
  // 端子 id 即节点 id（导线已是真实支路，不再需要并查集）
  const find = (k: string) => k
  const idx = new Map(nodeIds.map((k, i) => [k, i]))
  // 防御：忽略端子指向已删元件的悬空导线
  const validWires = wires.filter((w) => idx.has(w.a) && idx.has(w.b))
  const N = nodeIds.length
  const G: number[][] = Array.from({ length: N }, () => new Array(N).fill(0))
  const I: number[] = new Array(N).fill(0)
  const gAdd = (na: string, nb: string, g: number) => {
    const a = idx.get(na)!
    const b = idx.get(nb)!
    G[a][a] += g
    G[b][b] += g
    G[a][b] -= g
    G[b][a] -= g
  }
  // 地面电导，防奇异
  for (const k of nodeIds) G[idx.get(k)!][idx.get(k)!] += 1e-9

  const branches: Branch[] = []
  const results: BranchResult[] = []
  const addRes = (refId: string, kind: Branch['kind'], na: string, nb: string, r: number) => {
    branches.push({ refId, kind, na, nb, r })
  }

  for (const w of validWires) addRes(w.id, 'wire', find(w.a), find(w.b), 0.002)
  for (const c of comps) addCompBranch(c)

  function addCompBranch(c: Comp) {
    const na = find(`${c.id}:a`)
    const nb = find(`${c.id}:b`)
    switch (c.kind) {
      case 'battery':
        if (c.expanded) {
          // 展开态：理想电动势支路 + 独立内阻支路串联（a —E— __e —r— b）
          const ne = find(`${c.id}:__e`)
          branches.push({ refId: c.id, kind: 'battery', na, nb: ne, r: 0.001, emf: c.emf })
          addRes(`${c.id}:ir`, 'resistor', ne, nb, Math.max(c.r, 1e-3))
        } else {
          // 紧凑态：E 与内阻合一；r=0 视作理想电源（钳位 1mΩ 防奇异）
          branches.push({ refId: c.id, kind: 'battery', na, nb, r: Math.max(c.r, 1e-3), emf: c.emf })
        }
        break
      case 'resistor':
        addRes(c.id, 'resistor', na, nb, c.r)
        break
      case 'bulb':
        addRes(c.id, 'bulb', na, nb, c.r)
        break
      case 'switch':
        addRes(c.id, c.closed ? 'switch' : 'switch-open', na, nb, c.closed ? 0.01 : 1e9)
        break
      case 'rheostat': {
        // 内部拓扑：滑片节点__p 分出两段电阻丝（pos 段接 a，余段接 b）
        const np = find(`${c.id}:__p`)
        if (c.expanded) {
          // 展开态：金属杆两端(c/d)→杆节点__t→滑片触点__p
          const nc = find(`${c.id}:c`)
          const nd = find(`${c.id}:d`)
          const nt = find(`${c.id}:__t`)
          addRes(`${c.id}:rodC`, 'wire', nc, nt, 0.002)
          addRes(`${c.id}:rodD`, 'wire', nd, nt, 0.002)
          addRes(`${c.id}:tap`, 'wire', nt, np, 0.01)
        } else {
          // 紧凑态：滑片上方端子 p → 滑片节点（"一上一下"的"上"）
          const npt = find(`${c.id}:p`)
          addRes(`${c.id}:ptap`, 'wire', npt, np, 0.002)
        }
        addRes(`${c.id}:segA`, 'rheostat', np, na, Math.max(c.pos * c.Rmax, 0.01))
        addRes(`${c.id}:segB`, 'rheostat', np, nb, Math.max((1 - c.pos) * c.Rmax, 0.01))
        break
      }
      case 'voltmeter': {
        // 并联式电压表：高内阻支路，读数 = 两端电压
        if (c.expanded && !c.ideal) {
          // 展开态：表头 G（Rg）串联分压电阻（Rv − Rg），总内阻与紧凑态严格相等
          const nm = find(`${c.id}:__m`)
          branches.push({ refId: `${c.id}:g`, kind: 'voltmeter', na, nb: nm, r: METER_G_R })
          addRes(`${c.id}:rp`, 'resistor', nm, nb, Math.max(c.r - METER_G_R, 0.001))
          break
        }
        const rv = c.ideal ? 1e7 : Math.max(c.r, 1)
        addRes(c.id, 'voltmeter', na, nb, rv)
        break
      }
      case 'ammeter': {
        // 串联式电流表：低内阻支路，读数 = 支路电流
        if (c.expanded && !c.ideal) {
          // 展开态：表头 G（Rg）与分流电阻 Rs 并联，Rs 由 Rg∥Rs = r 反推
          const rg = METER_G_R
          const rs = Math.max((rg * Math.min(c.r, rg - 0.01)) / (rg - Math.min(c.r, rg - 0.01)), 1e-3)
          addRes(`${c.id}:g`, 'ammeter', na, nb, rg)
          addRes(`${c.id}:rs`, 'resistor', na, nb, rs)
          break
        }
        const ra = c.ideal ? 1e-3 : Math.max(c.r, 1e-3)
        addRes(c.id, 'ammeter', na, nb, ra)
        break
      }
      case 'galvanometer':
        // 灵敏电流计：表头本体（Rg=100Ω）。dv 保留符号 → 电流方向决定指针左/右偏
        addRes(c.id, 'galvanometer', na, nb, METER_G_R)
        break
      case 'ohmmeter':
        // 欧姆表在主解中=高阻开路（不干扰电路）；读数走零源辅助求解
        addRes(c.id, 'ohmmeter', na, nb, 1e9)
        break
      case 'spdt': {
        // 单刀双掷：公共端 a 与触点 b/p 之间一通一断
        const nb1 = find(`${c.id}:b`)
        const np2 = find(`${c.id}:p`)
        addRes(`${c.id}:t1`, c.pos === 1 ? 'switch' : 'switch-open', na, nb1, c.pos === 1 ? 0.01 : 1e9)
        addRes(`${c.id}:t2`, c.pos === 2 ? 'switch' : 'switch-open', na, np2, c.pos === 2 ? 0.01 : 1e9)
        break
      }
    }
  }

  for (const b of branches) {
    const g = 1 / b.r
    gAdd(b.na, b.nb, g)
    if (b.kind === 'battery') {
      const e = (b as { emf: number }).emf
      I[idx.get(b.na)!] += e * g
      I[idx.get(b.nb)!] -= e * g
    }
  }

  // 高斯消元改走公共函数（欧姆表辅助解也要用）
  const V = solveGauss(G, I)

  const byComp: Record<string, BranchResult> = {}
  for (const b of branches) {
    const dv = V[idx.get(b.na)!] - V[idx.get(b.nb)!]
    // 电源支路含电动势：I = (emf − dv)/r；纯电阻支路：I = dv/r
    const current = b.kind === 'battery' ? Math.abs((b.emf! - dv) / b.r) : Math.abs(dv / b.r)
    const power = Math.abs(current * dv)
    results.push({ refId: b.refId, kind: b.kind, dv, current, power })
    // 内部辅助支路（refId 带 :）与导线不入 byComp
    if (b.kind !== 'wire' && !b.refId.includes(':')) byComp[b.refId] = results[results.length - 1]
  }

  // 滑动变阻器（紧凑/展开皆多支路）：电流取主导支路最大值，功率为各段之和
  for (const c of comps) {
    if (c.kind !== 'rheostat') continue
    const parts = results.filter((r) => r.kind === 'rheostat' && r.refId.startsWith(c.id + ':'))
    const rodCurrent = Math.max(
      0,
      ...results
        .filter((r) => r.kind === 'wire' && r.refId.startsWith(c.id + ':'))
        .map((r) => r.current),
    )
    const power = parts.reduce((s, p) => s + p.power, 0)
    const current = Math.max(rodCurrent, ...parts.map((p) => p.current))
    const dv = current > 1e-9 ? power / current : 0
    byComp[c.id] = { refId: c.id, kind: 'rheostat', dv, current, power }
  }

  // 展开态电表：读数 = 表头视角（电压=两端电压；电流=流过表头+分流的总电流）
  for (const c of comps) {
    if ((c.kind !== 'voltmeter' && c.kind !== 'ammeter') || !c.expanded || c.ideal) continue
    const va = V[idx.get(`${c.id}:a`)!]
    const vb = V[idx.get(`${c.id}:b`)!]
    const parts = results.filter((r) => r.refId.startsWith(c.id + ':'))
    const current = c.kind === 'voltmeter'
      ? (parts[0]?.current ?? 0) // 串联结构：表头电流即总电流
      : parts.reduce((s, p) => s + p.current, 0) // 并联结构：表头 + 分流之和
    const power = parts.reduce((s, p) => s + p.power, 0)
    byComp[c.id] = { refId: c.id, kind: c.kind, dv: va - vb, current, power }
  }

  // 单刀双掷：byComp = 当前接通的那条支路
  for (const c of comps) {
    if (c.kind !== 'spdt') continue
    const parts = results.filter((r) => r.refId.startsWith(c.id + ':'))
    const act = parts.find((p) => p.current > 1e-6) ?? parts[0]
    if (act) byComp[c.id] = { refId: c.id, kind: act.kind, dv: act.dv, current: act.current, power: act.power }
  }

  const openCircuit = comps.some((c) => c.kind === 'switch' && !c.closed)

  // 欧姆表零源辅助求解：电池电动势置零（退化为内阻）、欧姆表本体开路，
  // 向表笔注入 1A 测试电流 → 两端电压差 = 看进去的等效电阻（戴维南电阻）
  const ohms = comps.filter((c) => c.kind === 'ohmmeter')
  let ohm: Record<string, number> | undefined
  if (ohms.length) {
    ohm = {}
    for (const o of ohms) {
      const Ia = new Array(N).fill(0)
      Ia[idx.get(`${o.id}:a`)!] += 1
      Ia[idx.get(`${o.id}:b`)!] -= 1
      const Vt = solveGauss(G, Ia)
      ohm[o.id] = Math.abs(Vt[idx.get(`${o.id}:a`)!] - Vt[idx.get(`${o.id}:b`)!])
    }
  }
  return { branches: results, byComp, openCircuit, ohm }
}
