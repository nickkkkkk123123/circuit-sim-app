// 实验预设电路包：与 UI 解耦的纯数据，store.loadExperiment 载入时统一重编 id
import type { Circuit, Wire } from './solver/types'

export interface Experiment {
  id: string
  group: '基础' | '必修三 · 电学实验' | '拓展'
  name: string
  desc: string // 一句话教学点，展示在选择卡片上
  detail: string // 详细原理/步骤（换行符分隔），选中后在详情窗口展示
  build: () => Circuit // id 只需包内唯一，载入时统一重编
}

const W = (id: string, a: string, b: string): Wire => ({ id, a, b })

export const EXPERIMENTS: Experiment[] = [
  {
    id: 'basic',
    group: '基础',
    name: '基础回路',
    desc: '电源、开关、灯泡与电阻的串联回路，认识电流路径',
    detail: '【这个实验在干嘛】\n认识最简单的电路：电源、开关、灯泡、电阻首尾相连围成一圈，电流只有这一条路可走，所以流过每个元件的电流都一样大（0.235A）。\n【电路是怎么连的】\n从电池正极（长竖线那端）出发 → 经过开关 → 流过灯泡 → 流过电阻 → 回到电池负极。中间任何一个地方断开，整条路都没电流。\n【动手试试】\n① 单击开关：断开后灯泡立刻熄灭，所有读数归零\n② 点击电阻，把 15Ω 改成 5Ω：总电阻变小、电流变大，灯泡变亮\n③ 反过来改成 30Ω：电流变小，灯泡变暗\n【为什么要串一个电阻】\n灯泡和电阻各自"分"到一部分电压：U=I×R。电阻越大分到的电压越多。这就是最简单的分压——后面的分压式接法会用到这个思想。',
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
    detail: '【这个实验在干嘛】\n画出小灯泡的"伏安特性曲线"——也就是灯泡两端的电压 U 变化时，流过它的电流 I 怎么跟着变。这是教材必修三的必做实验。\n【为什么接法长这样（分压式）】\n注意滑动变阻器：电阻丝下面两个接线柱 a、b 分别接到了电源两端，而滑片 p 单独引出一根线去灯泡。这样滑片就像在电阻丝上"滑动取电"，输出电压可以从 0V 连续调到电源电压。如果像普通限流接法那样只接一根，电压是没法从 0 开始调的——考试常考这个区别。\n【一步一步做】\n① 现在滑片在最右端，灯泡电压正好是 0.00V（这就是"闭合开关前先调零"的原因：防止一开开关灯泡就直接承受全电压）\n② 闭合开关\n③ 把滑片往左拖一小段，看电压表和电流表的读数，把这对数记下来（比如 0.5V、0.09A）\n④ 再往左拖一点，再记一组，总共记 6~8 组，一直拖到最左端\n⑤ 在坐标纸上以 U 为横轴、I 为纵轴把点描出来，用平滑曲线连起来\n【你应该看到】\n曲线不是直线，而是一条越来越"平"的弯线：电压越高灯丝越热、电阻越大，所以电流涨得越来越慢。如果是一条直线，说明画的不是小灯泡而是定值电阻。\n【注意】\n电压表和电流表都调成了实际模式（有内阻），读数会和理想情况差一点点，这是正常的。',
    build: () => ({
      comps: [
        // 竖直变阻器做分压器（经典画法），电源+开关在右柱，负载链在右上
        { id: 'rheo', kind: 'rheostat', x: 420, y: 200, rot: 0, Rmax: 20, pos: 1, expanded: false },
        { id: 'sw', kind: 'switch', x: 452, y: 350, rot: 90, closed: true },
        { id: 'bat', kind: 'battery', x: 452, y: 500, rot: 90, emf: 3, r: 0.5, expanded: false },
        { id: 'am', kind: 'ammeter', x: 584, y: 168, rot: 0, ideal: false, r: 0.125, range: 0.6, customRange: false },
        { id: 'bulb', kind: 'bulb', x: 700, y: 168, rot: 0, r: 10, ratedP: 1.8 },
        { id: 'vm', kind: 'voltmeter', x: 700, y: 320, rot: 0, ideal: false, r: 3000, range: 3, customRange: false },
      ],
      wires: [
        W('w1', 'rheo:b', 'sw:a'), // 变阻器下端 → 开关 → 电池正极（右柱直线）
        W('w2', 'sw:b', 'bat:a'),
        W('w3', 'bat:b', 'rheo:a'), // 电池负极回变阻器上端（分压骨架）
        W('w4', 'rheo:p', 'am:a'), // 滑片输出 → 电流表 → 灯泡 → 回下端：pos=1 时负载电压恰为 0
        W('w5', 'am:b', 'bulb:a'),
        W('w6', 'bulb:b', 'rheo:b'),
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
    detail: '【这个实验在干嘛】\n测一节电池的两个"隐藏参数"：电动势 E（电池不接任何东西时的电压）和内阻 r（电池内部自己也有电阻）。这两个没法直接用表测，只能靠算。\n【原理：E = U + Ir】\n电压表接在电池两端，测到的叫"路端电压 U"——注意它不等于 E！只要电路里有电流 I 流过，电池内部就要"吃掉"一块电压（Ir），所以 U = E − Ir。电流越大，U 掉得越多。\n【怎么得到 E 和 r】\n一个方程两个未知数解不开，所以要很多组：\n① 闭合开关\n② 把滑片拖到一个位置，记下电压表读数 U 和电流表读数 I（这算一组）\n③ 换 5~6 个不同的滑片位置，记下 5~6 组 (U, I)\n④ 以 I 为横轴、U 为纵轴描点画线——这条线是斜向下的直线\n⑤ 直线和纵轴的交点（I=0 时）就是 E；斜率的绝对值就是 r\n【你应该看到】\nE 约 3V，r 约 1Ω。拖滑片时能亲眼看到：电流变大，路端电压变小——这就是"电池被拉塌"的感觉。\n【误差从哪来】\n电压表本身也走电流（分流），使得电流表读数比流过电池的真实电流小一点，所以测出的 E 和 r 都偏小。滑片阻值别调太小（电流别太大），一是防"电池极化"读数漂移，二是误差更小。',
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
    detail: '【这个实验在干嘛】\n用电压表+电流表测一个电阻的阻值（R=U/I），但你会发现：两种接法测出来的数居然不一样！这个实验就是让你搞清楚为什么、该选哪种。\n【什么叫内接/外接】\n电流表和电压表要同时量这个电阻，但两个表不可能接在同一点上，总有一个表更靠近电阻：\n· 电流表内接 = 电流表被电压表的接线圈在里面——电压表实际量的是 电阻+电流表 两家一起的电压\n· 电流表外接 = 电流表在圈外面——电压表只量电阻，但电流表读的电流有一部分其实流去了电压表\n单击单刀双掷开关就能在两种接法之间来回切，不用重新接线。\n【前提：电表要不理想】\n这个预设里两个表都开了实际模式：电流表 0.125Ω 内阻，电压表 3000Ω 内阻。如果用理想电表，两种接法读数完全一样，实验就没意义了。\n【你应该看到】\n· 内接时 R测 = R + R_A，比真值偏大（电流表分走了一部分电压）\n· 外接时 R测偏小（电压表分走了一部分电流，电流表读数偏大）\n【怎么选】\n口诀：大内小外——电阻比电流表内阻大得多用内接，比电压表内阻小得多用外接。动手验证：把 R 改成 1Ω 和 10000Ω 各测一遍，看哪种接法误差更离谱。',
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
    detail: '【这个实验在干嘛】\n测灵敏电流计 G 的内阻 Rg（这台 G 内阻是 100Ω，先用它当标准答案，验证方法靠不靠谱）。\n【核心思路】\n让 G 满偏（指针打到 1.0mA）之后，在 G 两端并一个可调电阻箱。如果总电流几乎不变，电阻箱分走多少电流，G 就少多少——G 掉到正好一半（0.50mA）时，说明电阻箱和 G 分流相等，阻值也就相等。\n【一步一步做】\n① 闭合开关。滑片现在在 59%，G 应该接近满偏 1.0mA（差一点就微调滑片补到 1.0mA）\n② 点击和 G 并联的电阻，把阻值改成很大的数（比如 100000）——G 读数几乎不变，还是满偏\n③ 逐步把电阻箱调小：5000、1000、500……G 的指针慢慢往下掉\n④ 调到 G 读数正好 0.50mA（半偏）\n⑤ 看电阻箱读数：非常接近 100——这就是 G 的内阻\n【为什么要求滑片阻值远大于 G】\n方法成立的前提是干路电流不变。5900Ω 远大于 100Ω 时，并联部分变化对总电流影响很小。故意把滑片调小（比如 500Ω）再做一遍，会发现测出的 Rg 明显偏大——这就是半偏法的系统误差。',
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
    detail: '【这个实验在干嘛】\n认识二极管——一种只允许电流单方向通过的元件。它不是欧姆元件，不服从 U=IR。\n【先认识电路】\n电源 6V，串了一个 470Ω 的限流电阻，再串 LED（发光二极管）。LED 正向导通后两端电压基本固定在 2V 左右（这叫正向压降），多余的电压都降在电阻上。\n【动手试试】\n① 闭合开关：LED 亮，电流表读数约 (6−2)/470 ≈ 8.5mA\n② 点 LED 上的电压表读数：约 2.00V——把电流调大调小，这个压降几乎不变，和电阻完全不同\n③ 把电流调到超过 20mA 试试（把电阻改小）：LED 会烧\n④ 用欧姆表测它：两支表笔正着接、反着接，读数完全不同——正向小、反向几乎开路，这就是单向导电\n【普通二极管在哪】\n元件库里的「二极管」默认是普通二极管（不发光，符号不带箭头），在面板里勾选发光型就变成 LED。两者电学特性一样，只是一个会亮。\n【考试怎么考】\n多用电表黑箱题：箱里可能是电阻、二极管或电容，靠表笔正反接的读数差异判断元件类型。',
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
    detail: '【这个实验在干嘛】\n惠斯通电桥是精密测电阻的经典方法：不靠电压表电流表读数，靠一个灵敏电流计「指零」就能算出未知电阻。\n【电路结构】\n四个电阻围成一圈：R1（上）R2（右）R4（下）R3（左），电池接在一组对角上，灵敏电流计 G 接在另一组对角上。G 就像架在两条平行支路中间的一座桥。\n【什么叫指零】\n当 R1/R2 = R3/R4 时，桥的两端电位相等，G 里没有电流、指针指零。反过来，只要 G 指零，这个比例式就成立——三个电阻已知，第四个就算出来了。\n【一步一步做】\n① 现在 R4=290，是故意调偏的：闭合开关，看 G 往哪边偏（0.18mA 左右）\n② 点击 R4，把阻值改成 300，看 G 是否回到 0\n③ 再故意改成 310：指针应该反向偏转——偏向哪边告诉你 R4 是大了还是小了\n④ 验证比例：R1/R2 = 100/200 = 0.5，R3/R4 = 150/300 = 0.5 ✓\n【为什么它精确】\n普通伏安法要两个表都读准才行；电桥法只需要 G 够灵敏（能察觉微小电流），完全不需要读数准确。这种「指零法」思想在物理实验里到处都是（天平也是指零法）。',
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
