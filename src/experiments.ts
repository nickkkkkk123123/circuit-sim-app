// 实验预设电路包：与 UI 解耦的纯数据，store.loadExperiment 载入时统一重编 id
import type { Circuit, Wire } from './solver/types'

export interface Experiment {
  id: string
  group: '基础' | '必修三 · 电学实验' | '拓展'
  name: string
  desc: string // 一句话教学点，展示在选择卡片上
  build: () => Circuit // id 只需包内唯一，载入时统一重编
}

const W = (id: string, a: string, b: string): Wire => ({ id, a, b })

export const EXPERIMENTS: Experiment[] = [
  {
    id: 'basic',
    group: '基础',
    name: '基础回路',
    desc: '电源、开关、灯泡与电阻的串联回路，认识电流路径',
    build: () => ({
      comps: [
        { id: 'sw', kind: 'switch', x: 350, y: 200, rot: 0, closed: true },
        { id: 'bulb', kind: 'bulb', x: 650, y: 200, rot: 0, r: 10, ratedP: 3.6 },
        { id: 'bat', kind: 'battery', x: 350, y: 500, rot: 0, emf: 6, r: 0.5, expanded: false },
        { id: 'res', kind: 'resistor', x: 644, y: 500, rot: 0, r: 15 },
      ],
      wires: [
        W('w1', 'sw:a', 'bat:a'),
        W('w2', 'sw:b', 'bulb:a'),
        W('w3', 'bulb:b', 'res:b'),
        W('w4', 'res:a', 'bat:b'),
      ],
    }),
  },
  {
    id: 'divider-iv',
    group: '必修三 · 电学实验',
    name: '描绘伏安特性曲线（分压式）',
    desc: '滑动变阻器分压接法：电压从 0 起调，拖动滑片记录多组 (U, I) 描出小灯泡的 I-U 曲线（弯的！）',
    build: () => ({
      comps: [
        { id: 'bat', kind: 'battery', x: 300, y: 480, rot: 90, emf: 3, r: 0.5, expanded: false },
        { id: 'sw', kind: 'switch', x: 300, y: 300, rot: 90, closed: true },
        { id: 'rheo', kind: 'rheostat', x: 420, y: 200, rot: 0, Rmax: 20, pos: 0, expanded: false },
        { id: 'am', kind: 'ammeter', x: 570, y: 260, rot: 0, ideal: false, r: 0.125, range: 0.6, customRange: false },
        { id: 'bulb', kind: 'bulb', x: 720, y: 260, rot: 0, r: 10, ratedP: 1.8 },
        { id: 'vm', kind: 'voltmeter', x: 720, y: 380, rot: 0, ideal: false, r: 3000, range: 3, customRange: false },
      ],
      wires: [
        W('w1', 'bat:a', 'sw:b'),
        W('w2', 'sw:a', 'rheo:a'), // 电源 + → 变阻器整段电阻丝
        W('w3', 'rheo:b', 'bat:b'), // 电阻丝另一端回负极（分压骨架）
        W('w4', 'rheo:p', 'am:a'), // 滑片输出 → 电流表 → 灯泡 → 回 a 端
        W('w5', 'am:b', 'bulb:a'),
        W('w6', 'bulb:b', 'rheo:a'),
        W('w7', 'vm:a', 'bulb:a'), // 电压表并在灯泡两端
        W('w8', 'vm:b', 'bulb:b'),
      ],
    }),
  },
  {
    id: 'emf-r',
    group: '必修三 · 电学实验',
    name: '测定电池电动势和内阻',
    desc: '电压表测路端电压、电流表读干路电流，调滑片取多组 (U, I)：U-I 图纵轴截距 = E，斜率 = r',
    build: () => ({
      comps: [
        { id: 'bat', kind: 'battery', x: 300, y: 480, rot: 90, emf: 3, r: 1, expanded: false },
        { id: 'sw', kind: 'switch', x: 300, y: 300, rot: 90, closed: true },
        { id: 'am', kind: 'ammeter', x: 470, y: 200, rot: 0, ideal: false, r: 0.125, range: 0.6, customRange: false },
        { id: 'rheo', kind: 'rheostat', x: 680, y: 200, rot: 0, Rmax: 50, pos: 0.5, expanded: false },
        { id: 'vm', kind: 'voltmeter', x: 470, y: 380, rot: 0, ideal: false, r: 3000, range: 3, customRange: false },
      ],
      wires: [
        W('w1', 'bat:a', 'sw:b'),
        W('w2', 'sw:a', 'am:a'),
        W('w3', 'am:b', 'rheo:a'),
        W('w4', 'rheo:p', 'bat:b'), // a–p 串入（限流接法），滑片调阻
        W('w5', 'vm:a', 'bat:a'), // 电压表并在电池两端 = 路端电压
        W('w6', 'vm:b', 'bat:b'),
      ],
    }),
  },
  {
    id: 'va-inner-outer',
    group: '必修三 · 电学实验',
    name: '伏安法测电阻（内接 / 外接）',
    desc: '电表用实际模式！单击单刀双掷切换：触点1 = 电流表内接（V 测 R+A），触点2 = 外接（V 测 R）。对比两种接法的读数差异',
    build: () => ({
      comps: [
        { id: 'bat', kind: 'battery', x: 300, y: 480, rot: 90, emf: 3, r: 0.5, expanded: false },
        { id: 'sw', kind: 'switch', x: 300, y: 300, rot: 90, closed: true },
        { id: 'am', kind: 'ammeter', x: 460, y: 200, rot: 0, ideal: false, r: 0.125, range: 0.6, customRange: false },
        { id: 'res', kind: 'resistor', x: 700, y: 200, rot: 0, r: 50 },
        { id: 'spdt', kind: 'spdt', x: 460, y: 330, rot: 0, pos: 1 },
        { id: 'vm', kind: 'voltmeter', x: 700, y: 380, rot: 0, ideal: false, r: 3000, range: 3, customRange: false },
      ],
      wires: [
        W('w1', 'bat:a', 'sw:b'),
        W('w2', 'sw:a', 'am:a'),
        W('w3', 'am:b', 'res:a'),
        W('w4', 'res:b', 'bat:b'),
        W('w5', 'vm:a', 'spdt:a'), // 电压表热端 → 单刀双掷公共端
        W('w6', 'spdt:b', 'sw:a'), // 触点1 接电流表之前 → V 测 (A+R)：内接
        W('w7', 'spdt:p', 'am:b'), // 触点2 接电流表之后 → V 只测 R：外接
        W('w8', 'vm:b', 'bat:b'),
      ],
    }),
  },
  {
    id: 'half-deflection',
    group: '必修三 · 电学实验',
    name: '半偏法测电流表内阻',
    desc: '先调大滑片让 G 满偏（1mA），再把"电阻箱"（点击电阻改阻值）调到与 G 内阻相等：G 半偏时 R箱 = Rg',
    build: () => ({
      comps: [
        { id: 'bat', kind: 'battery', x: 300, y: 480, rot: 90, emf: 6, r: 0.5, expanded: false },
        { id: 'sw', kind: 'switch', x: 300, y: 300, rot: 90, closed: true },
        { id: 'rheo', kind: 'rheostat', x: 500, y: 200, rot: 0, Rmax: 10000, pos: 0.59, expanded: false },
        { id: 'g', kind: 'galvanometer', x: 720, y: 200, rot: 0 },
        { id: 'box', kind: 'resistor', x: 720, y: 340, rot: 0, r: 100 }, // 电阻箱：与 G 并联
      ],
      wires: [
        W('w1', 'bat:a', 'sw:b'),
        W('w2', 'sw:a', 'rheo:a'),
        W('w3', 'rheo:p', 'g:a'), // a–p 串入做粗调
        W('w4', 'g:b', 'bat:b'),
        W('w5', 'box:a', 'g:a'), // 电阻箱并在 G 两端
        W('w6', 'box:b', 'g:b'),
      ],
    }),
  },
  {
    id: 'diode',
    group: '必修三 · 电学实验',
    name: '二极管单向导电',
    desc: 'LED 正向导通发光（压降约 2V）；用欧姆表两表笔正反测它，读数完全不同——这就是"单向"',
    build: () => ({
      comps: [
        { id: 'bat', kind: 'battery', x: 300, y: 480, rot: 90, emf: 6, r: 0.5, expanded: false },
        { id: 'sw', kind: 'switch', x: 300, y: 300, rot: 90, closed: true },
        { id: 'am', kind: 'ammeter', x: 480, y: 200, rot: 0, ideal: true, r: 0.1, range: 0.6, customRange: false },
        { id: 'res', kind: 'resistor', x: 620, y: 200, rot: 0, r: 470 },
        { id: 'led', kind: 'led', x: 780, y: 200, rot: 0, led: true },
        { id: 'vm', kind: 'voltmeter', x: 780, y: 340, rot: 0, ideal: true, r: 0.1, range: 3, customRange: false },
      ],
      wires: [
        W('w1', 'bat:a', 'sw:b'),
        W('w2', 'sw:a', 'am:a'),
        W('w3', 'am:b', 'res:a'),
        W('w4', 'res:b', 'led:a'), // 正向：a(阳极) → b(阴极)
        W('w5', 'led:b', 'bat:b'),
        W('w6', 'vm:a', 'led:a'), // 电压表看正向压降 ≈ 2V
        W('w7', 'vm:b', 'led:b'),
      ],
    }),
  },
  {
    id: 'wheatstone',
    group: '拓展',
    name: '惠斯通电桥',
    desc: '调节 R4 使灵敏电流计指零（桥路无电流）：R1/R2 = R3/R4。已故意调偏，看 G 往哪边偏、调成多少归零',
    // 拓扑：电池占 TR–BL 对角，G 占 TL–BR 对角，四电阻构成 TL→TR→BR→BL 回路
    build: () => ({
      comps: [
        { id: 'bat', kind: 'battery', x: 860, y: 310, rot: 90, emf: 6, r: 0.5, expanded: false },
        { id: 'r1', kind: 'resistor', x: 420, y: 140, rot: 0, r: 100 },
        { id: 'r2', kind: 'resistor', x: 700, y: 310, rot: 90, r: 200 },
        { id: 'r3', kind: 'resistor', x: 150, y: 310, rot: 90, r: 150 },
        { id: 'r4', kind: 'resistor', x: 420, y: 470, rot: 0, r: 290 },
        { id: 'g', kind: 'galvanometer', x: 420, y: 310, rot: 90 },
      ],
      wires: [
        W('w1', 'r1:a', 'r3:a'), // TL 角（G 的上端也接这里）
        W('w2', 'r1:b', 'r2:a'), // TR 角（电池正极）
        W('w3', 'r2:b', 'r4:b'), // BR 角（G 的下端也接这里）
        W('w4', 'r3:b', 'r4:a'), // BL 角（电池负极）
        W('w5', 'bat:a', 'r2:a'),
        W('w6', 'bat:b', 'r4:a'),
        W('w7', 'g:a', 'r1:a'),
        W('w8', 'g:b', 'r4:b'),
      ],
    }),
  },
]
