// 实验预设电路包：与 UI 解耦的纯数据，store.loadExperiment 载入时统一重编 id
import type { Circuit, Comp, Wire } from './solver/types'

export interface Experiment {
  id: string
  group: '基础' | '必修三 · 电学实验' | '拓展' | '数字电路'
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

  // ── 数字电路：从欧姆定律到计算机 ──
  // 输入约定：开关闭合=高电平(1)，断开=门内部 10MΩ 下拉读作 0
  // 输出约定：LED 串 150Ω 限流电阻接回负极，门输出高 → 灯亮
  {
    id: 'half-adder',
    group: '数字电路',
    name: '半加器（一位二进制加法）',
    desc: '两个开关输入 0/1，异或门出"和"、与门出"进位"——这就是计算器心脏的最小样本',
    detail: '【这个实验在干嘛】\n用两个逻辑门搭出一位二进制加法器（半加器）：输入两个二进制位 A 和 B，输出"和"与"进位"。你手机里的处理器每秒做几十亿次加法，最小的零件就是眼前这个电路。\n【电路结构】\n开关 A、B 分别接异或门和与门的输入：异或门输出"和"（相同为 0、不同为 1），与门输出"进位"（只有 1+1 才进位）。每根输出串一个 150Ω 限流电阻保护 LED。\n【真值表自己验】\n0+0=0（两灯全灭）｜1+0=1（和=1）｜0+1=1（和=1）｜1+1=10（和=0、进位=1）\n【一步一步做】\n① 只闭合 A：和灯亮、进位灯灭 → 1+0=1\n② 再闭合 B：和灯灭、进位灯亮 → 1+1=10（二进制的"二"）\n③ 试着解释：为什么"和"用的是异或门而不是或门？（提示：1 和 1 相遇时，或门会说 1+1=1，数学就崩了）\n【和高中物理的关系】\n门只认识"高电平/低电平"，而高电平是真实的 6V 电压、由欧姆定律支配的电流撑起来的。数字世界底层全是模拟电路。',
    build: () => ({
      comps: [
        { id: 'bat', kind: 'battery', x: 160, y: 430, rot: 90, emf: 6, r: 0.5, expanded: false },
        { id: 'swA', kind: 'switch', x: 140, y: 140, rot: 90, closed: false },
        { id: 'swB', kind: 'switch', x: 240, y: 140, rot: 90, closed: false },
        { id: 'gx', kind: 'gate', x: 400, y: 130, rot: 0, type: 'XOR' },
        { id: 'ga', kind: 'gate', x: 400, y: 260, rot: 0, type: 'AND' },
        { id: 'rs', kind: 'resistor', x: 520, y: 130, rot: 0, r: 150 },
        { id: 'rc', kind: 'resistor', x: 520, y: 260, rot: 0, r: 150 },
        { id: 'ls', kind: 'led', x: 620, y: 130, rot: 0, led: true },
        { id: 'lc', kind: 'led', x: 620, y: 260, rot: 0, led: true },
      ],
      wires: [
        // 电源轨
        W('w01', 'bat:a', 'swA:a'), W('w02', 'bat:a', 'swB:a'),
        W('w03', 'bat:a', 'gx:c'), W('w04', 'bat:a', 'ga:c'),
        W('w05', 'bat:b', 'gx:d'), W('w06', 'bat:b', 'ga:d'),
        W('w07', 'bat:b', 'ls:b'), W('w08', 'bat:b', 'lc:b'),
        // 输入：两开关并联进两个门的对应输入
        W('w09', 'swA:b', 'gx:a'), W('w10', 'swA:b', 'ga:a'),
        W('w11', 'swB:b', 'gx:b'), W('w12', 'swB:b', 'ga:b'),
        // 输出：门 → 限流电阻 → LED
        W('w13', 'gx:p', 'rs:a'), W('w14', 'rs:b', 'ls:a'),
        W('w15', 'ga:p', 'rc:a'), W('w16', 'rc:b', 'lc:a'),
      ],
    }),
  },
  {
    id: 'full-adder',
    group: '数字电路',
    name: '全加器（带进位输入）',
    desc: '5 个门：A+B+低位进位=和与新高进位。多个全加器手拉手就能算任意位数',
    detail: '【这个实验在干嘛】\n半加器不会接收低位传来的进位，只能算一位。全加器多一个"进位输入 Cin"，三个一位数相加：A+B+Cin，输出"和"与新进位。它才是真正能拼起来算多位数的积木。\n【电路结构】\n两个异或门负责"和"：先算 A⊕B，再 ⊕Cin。两个与门 + 一个或门负责"新进位"：A·B 与 (A⊕B)·Cin 只要有一个是 1 就进位。共 5 个门。\n【自己验一道题】\n1+1+0：闭合 A、B（Cin 断开）。和=0、进位=1——和半加器一样。再闭合 Cin 变成 1+1+1：和=1、进位=1（三在二进制里是 11）。\n【为什么要手拉手】\n把一个半加器和 N-1 个全加器串起来，低位进位接高位 Cin，就是 N 位加法器——你电脑里 CPU 的整数加法器就是这个原理的极速版本。第一个预设里的半加器，其实就是全加器把 Cin 接地的特例。\n【思考】\n5 个门要 5 组电源（VCC 和 GND），为什么每个门都要独立接电源？（提示：门输出的能量来自自己的电源，不是输入——输入只是"告诉"它怎么连接电源）',
    build: () => ({
      comps: [
        { id: 'bat', kind: 'battery', x: 100, y: 500, rot: 90, emf: 6, r: 0.5, expanded: false },
        { id: 'swA', kind: 'switch', x: 130, y: 120, rot: 90, closed: false },
        { id: 'swB', kind: 'switch', x: 130, y: 210, rot: 90, closed: false },
        { id: 'swC', kind: 'switch', x: 130, y: 300, rot: 90, closed: false },
        { id: 'x1', kind: 'gate', x: 320, y: 130, rot: 0, type: 'XOR' },
        { id: 'x2', kind: 'gate', x: 500, y: 170, rot: 0, type: 'XOR' },
        { id: 'a1', kind: 'gate', x: 320, y: 300, rot: 0, type: 'AND' },
        { id: 'a2', kind: 'gate', x: 500, y: 330, rot: 0, type: 'AND' },
        { id: 'o1', kind: 'gate', x: 670, y: 330, rot: 0, type: 'OR' },
        { id: 'rss', kind: 'resistor', x: 620, y: 130, rot: 0, r: 150 },
        { id: 'rsc', kind: 'resistor', x: 800, y: 330, rot: 0, r: 150 },
        { id: 'ls', kind: 'led', x: 720, y: 130, rot: 0, led: true },
        { id: 'lc', kind: 'led', x: 900, y: 330, rot: 0, led: true },
      ],
      wires: [
        // 电源轨：正极接 3 开关 + 5 门 VCC；负极接 5 门 GND + 2 LED 回线
        W('w01', 'bat:a', 'swA:a'), W('w02', 'bat:a', 'swB:a'), W('w03', 'bat:a', 'swC:a'),
        W('w04', 'bat:a', 'x1:c'), W('w05', 'bat:a', 'x2:c'), W('w06', 'bat:a', 'a1:c'), W('w07', 'bat:a', 'a2:c'), W('w08', 'bat:a', 'o1:c'),
        W('w09', 'bat:b', 'x1:d'), W('w10', 'bat:b', 'x2:d'), W('w11', 'bat:b', 'a1:d'), W('w12', 'bat:b', 'a2:d'), W('w13', 'bat:b', 'o1:d'),
        W('w14', 'bat:b', 'ls:b'), W('w15', 'bat:b', 'lc:b'),
        // 信号
        W('w16', 'swA:b', 'x1:a'), W('w17', 'swA:b', 'a1:a'),
        W('w18', 'swB:b', 'x1:b'), W('w19', 'swB:b', 'a1:b'),
        W('w20', 'x1:p', 'x2:a'), W('w21', 'x1:p', 'a2:a'),
        W('w22', 'swC:b', 'x2:b'), W('w23', 'swC:b', 'a2:b'),
        W('w24', 'a1:p', 'o1:a'), W('w25', 'a2:p', 'o1:b'),
        // 输出
        W('w26', 'x2:p', 'rss:a'), W('w27', 'rss:b', 'ls:a'),
        W('w28', 'o1:p', 'rsc:a'), W('w29', 'rsc:b', 'lc:a'),
      ],
    }),
  },
  {
    id: 'add2bit',
    group: '数字电路',
    name: '两位加法器（迷你计算器）',
    desc: '1 个半加器 + 1 个全加器串联：算 1+1 到 3+3，三个 LED 直接读出二进制答案（最大 110=6）',
    detail: '【这个实验在干嘛】\n把半加器和全加器串成两位二进制加法器：输入 A=A1A0、B=B1B0（各 0~3），输出三位二进制和 S2S1S0（0~6）。这就是一台能算加法的"迷你计算机"——所有计算器、CPU 的算术单元，往下拆到最底层就是这么长的。\n【电路结构】\n低位（第 0 位）用半加器：A0⊕B0=和 S0，A0·B0=进位 C0。高位（第 1 位）用全加器：A1、B1 与低位进位 C0 三者相加，出 S1 和最终进位 S2。\n【一步一步做】\n① 只闭合 A0、B0（1+1=2）：S1 亮、S0 灭——本位 1+1=0，进位 1 由 S1 读出，二进制 010\n② 再闭合 A1、B1（3+3=6）：S2、S1 亮、S0 灭，二进制 110——最大的和，进位顶到了最高位\n③ 自己出题：闭合 A1、B0（2+1）三个灯怎么亮？（答案：10+01=11，S1、S0 亮，S2 灭）\n【你应该意识到的事】\n这个电路没有"计算"这个动作——电流每一瞬间都按欧姆定律在流动，所谓"算术"只是逻辑门把电压高低重新编排了一遍。计算机不神秘，神秘的是把它堆了 100 亿个。\n【数电黑话对照】\n半加器=Half Adder；全加器=Full Adder；这种低位进位传高位的方式叫"行波进位"，是加法器最朴素的实现。',
    build: () => ({
      comps: [
        { id: 'bat', kind: 'battery', x: 80, y: 560, rot: 90, emf: 6, r: 0.5, expanded: false },
        { id: 'swA0', kind: 'switch', x: 120, y: 100, rot: 90, closed: false },
        { id: 'swB0', kind: 'switch', x: 120, y: 190, rot: 90, closed: false },
        { id: 'swA1', kind: 'switch', x: 120, y: 300, rot: 90, closed: false },
        { id: 'swB1', kind: 'switch', x: 120, y: 390, rot: 90, closed: false },
        // 第 0 位：半加器
        { id: 'x0', kind: 'gate', x: 300, y: 110, rot: 0, type: 'XOR' },
        { id: 'a0', kind: 'gate', x: 300, y: 210, rot: 0, type: 'AND' },
        // 第 1 位：全加器
        { id: 'x1', kind: 'gate', x: 300, y: 320, rot: 0, type: 'XOR' },
        { id: 'a1', kind: 'gate', x: 300, y: 430, rot: 0, type: 'AND' },
        { id: 'x2', kind: 'gate', x: 480, y: 370, rot: 0, type: 'XOR' },
        { id: 'a2', kind: 'gate', x: 480, y: 480, rot: 0, type: 'AND' },
        { id: 'o1', kind: 'gate', x: 640, y: 480, rot: 0, type: 'OR' },
        // 输出：S0（低位和）、S1（高位和）、S2（最终进位）
        { id: 'rs0', kind: 'resistor', x: 700, y: 110, rot: 0, r: 150 },
        { id: 'rs1', kind: 'resistor', x: 700, y: 370, rot: 0, r: 150 },
        { id: 'rs2', kind: 'resistor', x: 820, y: 480, rot: 0, r: 150 },
        { id: 'l0', kind: 'led', x: 800, y: 110, rot: 0, led: true },
        { id: 'l1', kind: 'led', x: 800, y: 370, rot: 0, led: true },
        { id: 'l2', kind: 'led', x: 920, y: 480, rot: 0, led: true },
      ],
      wires: [
        // 电源轨
        W('w01', 'bat:a', 'swA0:a'), W('w02', 'bat:a', 'swB0:a'), W('w03', 'bat:a', 'swA1:a'), W('w04', 'bat:a', 'swB1:a'),
        W('w05', 'bat:a', 'x0:c'), W('w06', 'bat:a', 'a0:c'), W('w07', 'bat:a', 'x1:c'), W('w08', 'bat:a', 'a1:c'), W('w09', 'bat:a', 'x2:c'), W('w10', 'bat:a', 'a2:c'), W('w11', 'bat:a', 'o1:c'),
        W('w12', 'bat:b', 'x0:d'), W('w13', 'bat:b', 'a0:d'), W('w14', 'bat:b', 'x1:d'), W('w15', 'bat:b', 'a1:d'), W('w16', 'bat:b', 'x2:d'), W('w17', 'bat:b', 'a2:d'), W('w18', 'bat:b', 'o1:d'),
        W('w19', 'bat:b', 'l0:b'), W('w20', 'bat:b', 'l1:b'), W('w21', 'bat:b', 'l2:b'),
        // 第 0 位输入
        W('w22', 'swA0:b', 'x0:a'), W('w23', 'swA0:b', 'a0:a'),
        W('w24', 'swB0:b', 'x0:b'), W('w25', 'swB0:b', 'a0:b'),
        // 第 1 位输入
        W('w26', 'swA1:b', 'x1:a'), W('w27', 'swA1:b', 'a1:a'),
        W('w28', 'swB1:b', 'x1:b'), W('w29', 'swB1:b', 'a1:b'),
        // 进位链：C0 = a0 输出 → 全加器 Cin
        W('w30', 'a0:p', 'x2:b'), W('w31', 'a0:p', 'a2:b'),
        // 全加器内部
        W('w32', 'x1:p', 'x2:a'), W('w33', 'x1:p', 'a2:a'),
        W('w34', 'a1:p', 'o1:a'), W('w35', 'a2:p', 'o1:b'),
        // 输出
        W('w36', 'x0:p', 'rs0:a'), W('w37', 'rs0:b', 'l0:a'),
        W('w38', 'x2:p', 'rs1:a'), W('w39', 'rs1:b', 'l1:a'),
        W('w40', 'o1:p', 'rs2:a'), W('w41', 'rs2:b', 'l2:a'),
      ],
    }),
  },
  {
    id: 'sr-latch',
    group: '数字电路',
    name: 'SR 锁存器（电路有了记忆）',
    desc: '两个或非门交叉反馈：按一下 S 灯亮，松手灯还亮着——它记住了一位信息，这是存储器的祖先',
    detail: '【这个实验在干嘛】\n前面的加法器都是"输入一变输出立刻变"的健忘电路。这个电路不一样：按一下 S（置位），Q 灯亮；松开 S，Q 还亮着——它把"1"记住了。再按一下 R（复位），Q 灭，也记住。这就是锁存器：一位存储单元，内存条的每个格子，往下拆都是它的亿万子孙。\n【电路结构】\n两个或非门交叉反馈：左边门的输出接右边门的输入，右边门的输出又绕回左边门的输入。正是这个"绕回来"制造了记忆：只要两个输出互相撑着，电路就自己锁在当前状态。\n【一步一步做】\n① 闭合 S 再断开：Q 灯亮着不走——记住了\n② 闭合 R 再断开：Q 灯灭，也记住了\n③ S、R 同时闭合：两个灯全灭（输出互相矛盾，都是 0）——这叫"禁止状态"，真实电路里要避免\n【为什么叫 bistable（双稳态）】\n它有两个稳定的姿势：Q=1 或 Q=0，不按开关就永远待在原地。 Feedback（反馈）是关键——这是你第一次在电路里见到"过去影响现在"。\n【冷知识】\n这个电路 1918 年就发明了（爱克尔斯-乔丹触发器），比第一台计算机早 20 多年。',
    build: () => {
      const comps: Comp[] = [
        { id: 'bat', kind: 'battery', x: 100, y: 400, rot: 90, emf: 6, r: 0.5, expanded: false },
        { id: 'swS', kind: 'switch', x: 150, y: 120, rot: 90, closed: false },
        { id: 'swR', kind: 'switch', x: 350, y: 120, rot: 90, closed: false },
        { id: 'gq', kind: 'gate', x: 350, y: 230, rot: 0, type: 'NOR' }, // Q = NOR(R, Q̄)
        { id: 'gqb', kind: 'gate', x: 150, y: 230, rot: 0, type: 'NOR' }, // Q̄ = NOR(S, Q)
        { id: 'rsq', kind: 'resistor', x: 490, y: 280, rot: 0, r: 150 },
        { id: 'rsqb', kind: 'resistor', x: 30, y: 280, rot: 0, r: 150 },
        { id: 'lq', kind: 'led', x: 580, y: 280, rot: 0, led: true },
        { id: 'lqb', kind: 'led', x: -60, y: 280, rot: 0, led: true },
      ]
      const wires: Wire[] = [
        W('w01', 'bat:a', 'swS:a'), W('w02', 'bat:a', 'swR:a'),
        W('w03', 'bat:a', 'gq:c'), W('w04', 'bat:a', 'gqb:c'),
        W('w05', 'bat:b', 'gq:d'), W('w06', 'bat:b', 'gqb:d'),
        W('w07', 'bat:b', 'lq:b'), W('w08', 'bat:b', 'lqb:b'),
        W('w09', 'swS:b', 'gqb:a'),
        W('w10', 'swR:b', 'gq:a'),
        W('w11', 'gq:p', 'gqb:b'), // Q 反馈进 Q̄ 门
        W('w12', 'gqb:p', 'gq:b'), // Q̄ 反馈进 Q 门
        W('w13', 'gq:p', 'rsq:a'), W('w14', 'rsq:b', 'lq:a'),
        W('w15', 'gqb:p', 'rsqb:a'), W('w16', 'rsqb:b', 'lqb:a'),
      ]
      return { comps, wires }
    },
  },
  {
    id: 'add4',
    group: '数字电路',
    name: '四位加法器（0~15 + 0~15）',
    desc: '4 个全加器行波进位：拨 8 个开关输入两个二进制数，5 个 LED 直接读出 0~30 的答案',
    detail: '【这个实验在干嘛】\n把 4 个全加器串成行波进位加法器：低位算完把进位甩给高位。输入 A3A2A1A0 和 B3B2B1B0（各 0~15），输出 5 位二进制和（0~30）。\n【怎么读答案】\nLED 从右到左是 S0、S1、S2、S3（权 1、2、4、8），最上面是进位 C（权 16）。比如 9+14=23=10111：C 亮、S3 灭、S2 亮、S1 亮、S0 亮（16+0+4+2+1）。\n【一步一步做】\n① 先试简单的：A=1（闭合 swA0），B=0 → S0 亮\n② 再试进位穿越：A=1、B=15（swB0~swB3 全闭合）→ 1+15=16=10000：只有 C 亮，S 全灭——进位一路波及到顶\n③ 自己出题验算几个\n【为什么叫"行波"】\n低位的进位要等高位"接住"才能继续算，进位像水波一样从低位涌向高位。这种结构最简单但最慢——CPU 里为了提速发明了"超前进位"，那是另一个故事。\n【规模感】\n这才 4 位。你手机 CPU 一次加 64 位数——同样的结构放大 16 倍，再乘上每秒 30 多亿次。',
    build: () => {
      const comps: Comp[] = [{ id: 'bat', kind: 'battery', x: 40, y: 560, rot: 90, emf: 6, r: 0.5, expanded: false }]
      const wires: Wire[] = []
      let wn = 0
      const w = (a: string, b: string) => wires.push(W(`w${++wn}`, a, b))
      const gate = (id: string, type: 'AND' | 'OR' | 'NAND' | 'NOR' | 'XOR', x: number, y: number) =>
        comps.push({ id, kind: 'gate', x, y, rot: 0, type })
      // 4 个全加器逐位搭建：每个全加器 5 个门（x1/x2 异或、a1/a2 与、o1 或）
      for (let i = 0; i < 4; i++) {
        const y = 120 + 260 * i
        const p = (s: string) => `${s}${i}`
        comps.push({ id: p('swa'), kind: 'switch', x: 130, y, rot: 90, closed: false })
        comps.push({ id: p('swb'), kind: 'switch', x: 200, y, rot: 90, closed: false })
        gate(p('x1'), 'XOR', 350, y)
        gate(p('x2'), 'XOR', 510, y + 45)
        gate(p('a1'), 'AND', 350, y + 120)
        gate(p('a2'), 'AND', 510, y + 160)
        gate(p('o1'), 'OR', 660, y + 160)
        // 电源轨
        w('bat:a', p('swa') + ':a'); w('bat:a', p('swb') + ':a')
        for (const g of [p('x1'), p('x2'), p('a1'), p('a2'), p('o1')]) { w('bat:a', `${g}:c`); w('bat:b', `${g}:d`) }
        // 输入
        w(p('swa') + ':b', p('x1') + ':a'); w(p('swa') + ':b', p('a1') + ':a')
        w(p('swb') + ':b', p('x1') + ':b'); w(p('swb') + ':b', p('a1') + ':b')
        w(p('x1') + ':p', p('x2') + ':a'); w(p('x1') + ':p', p('a2') + ':a')
        // 进位输入：第 0 位接地（加 0），其余接低位进位（p('o1')=o1{i}）
        const cin = i === 0 ? 'bat:b' : `o1${i - 1}:p`
        w(cin, p('x2') + ':b'); w(cin, p('a2') + ':b')
        w(p('a1') + ':p', p('o1') + ':a'); w(p('a2') + ':p', p('o1') + ':b')
        // 和输出
        comps.push({ id: `rs${i}`, kind: 'resistor', x: 790, y, rot: 0, r: 150 })
        comps.push({ id: `s${i}`, kind: 'led', x: 880, y, rot: 0, led: true })
        w(p('x2') + ':p', `rs${i}:a`); w(`rs${i}:b`, `s${i}:a`); w(`s${i}:b`, 'bat:b')
      }
      // 最终进位 C4
      comps.push({ id: 'rsc', kind: 'resistor', x: 790, y: 1050, rot: 0, r: 150 })
      comps.push({ id: 'c4', kind: 'led', x: 880, y: 1050, rot: 0, led: true })
      w('o13:p', 'rsc:a'); w('rsc:b', 'c4:a'); w('c4:b', 'bat:b')
      return { comps, wires }
    },
  },
  {
    id: 'calc2',
    group: '数字电路',
    name: '迷你计算器（加法 + 数码管显示）',
    desc: '拨开关输入两个 0~3 的数，加法器求和、译码器翻译，七段数码管直接显示十进制答案——计算器的核心三件套',
    detail: '【这个实验在干嘛】\n这是本项目数字电路的终点站：二进制输入 → 加法器运算 → 译码器翻译 → 七段数码管用十进制显示。真计算器的三大件——输入、运算、显示——全齐了，每一件都是前面预设里的真电路，没有一个假零件。\n【电路结构】\n两位加法器算出 3 位二进制和（0~6），再送进 20 个门组成的译码器：每个译码门盯着"哪几个数字该点亮这条横杠"，把二进制翻成人话。数码管的 7 条发光段就是 7 个 LED。\n【一步一步做】\n① swA0、swB0 闭合（1+1=2）：数码管显示 2\n② 全部闭合（3+3=6）：显示 6——最大容量\n③ 只闭合 swA1、swB0（2+1=3）：显示 3\n④ 挑战：显示 5 该拨哪几个开关？（答案：3+2，即 swA0、swA1、swB1）\n【和真计算器的距离】\n差三样：键盘（按键扫描也是数字电路）、更多位数（同样的加法器堆 8 位 16 位）、乘除法（乘法=移位加，除法=移位减）。结构上没有新东西，只是规模。\n【给评委的一句话】\n从欧姆定律到眼前的数码管，每一毫安电流都由基尔霍夫定律支配——数字世界是模拟世界叠出来的高层建筑。',
    build: () => {
      const comps: Comp[] = [{ id: 'bat', kind: 'battery', x: 60, y: 620, rot: 90, emf: 6, r: 0.5, expanded: false }]
      const wires: Wire[] = []
      let wn = 0
      const w = (a: string, b: string) => wires.push(W(`w${++wn}`, a, b))
      const gate = (id: string, type: 'AND' | 'OR' | 'NAND' | 'NOR' | 'XOR' | 'NOT', x: number, y: number) =>
        comps.push({ id, kind: 'gate', x, y, rot: 0, type })
      const led = (id: string, x: number, y: number, rot: 0 | 90) => comps.push({ id, kind: 'led', x, y, rot, led: true })
      // ── 加法器（两位，第 0 位 Cin 接地）──
      for (let i = 0; i < 2; i++) {
        const y = 120 + 240 * i
        const p = (s: string) => `${s}${i}`
        comps.push({ id: p('swa'), kind: 'switch', x: 130, y, rot: 90, closed: false })
        comps.push({ id: p('swb'), kind: 'switch', x: 200, y, rot: 90, closed: false })
        gate(p('x1'), 'XOR', 350, y)
        gate(p('x2'), 'XOR', 510, y + 40)
        gate(p('a1'), 'AND', 350, y + 110)
        gate(p('a2'), 'AND', 510, y + 150)
        gate(p('o1'), 'OR', 650, y + 150)
        w('bat:a', p('swa') + ':a'); w('bat:a', p('swb') + ':a')
        for (const g of [p('x1'), p('x2'), p('a1'), p('a2'), p('o1')]) { w('bat:a', `${g}:c`); w('bat:b', `${g}:d`) }
        w(p('swa') + ':b', p('x1') + ':a'); w(p('swa') + ':b', p('a1') + ':a')
        w(p('swb') + ':b', p('x1') + ':b'); w(p('swb') + ':b', p('a1') + ':b')
        w(p('x1') + ':p', p('x2') + ':a'); w(p('x1') + ':p', p('a2') + ':a')
        const cin = i === 0 ? 'bat:b' : 'o10:p'
        w(cin, p('x2') + ':b'); w(cin, p('a2') + ':b')
        w(p('a1') + ':p', p('o1') + ':a'); w(p('a2') + ':p', p('o1') + ':b')
      }
      // 和输出：s0=第 0 位和（p('x2') i=0）、s1=第 1 位和、s2=第 1 位进位（值域 0~6）
      const s0 = 'x20:p', s1 = 'x21:p', s2 = 'o11:p'
      // ── 译码器：3 位二进制 → 七段（0~6，7 不可能出现）──
      // 非门三连
      gate('n0', 'NOT', 780, 40); gate('n1', 'NOT', 780, 120); gate('n2', 'NOT', 780, 200)
      w(s0, 'n0:a'); w(s1, 'n1:a'); w(s2, 'n2:a')
      for (const g of ['n0', 'n1', 'n2']) { w('bat:a', `${g}:c`); w('bat:b', `${g}:d`) }
      const p0 = 'n0:p', p1 = 'n1:p', p2 = 'n2:p'
      // 段 a = s1 | s2·s0 | n0·n1·n2（0 也要点亮 a）
      gate('ga1', 'AND', 780, 280); gate('ga2', 'AND', 780, 360); gate('ga3', 'AND', 780, 440)
      gate('ga4', 'OR', 900, 280); gate('ga5', 'OR', 930, 200)
      w(s2, 'ga1:a'); w(s0, 'ga1:b')
      w(p0, 'ga2:a'); w(p1, 'ga2:b')
      w('ga2:p', 'ga3:a'); w(p2, 'ga3:b')
      w(s1, 'ga4:a'); w('ga1:p', 'ga4:b')
      w('ga4:p', 'ga5:a'); w('ga3:p', 'ga5:b')
      // 段 b：只在 5（101）和 6（110）灭 → b = NOR( s2·s1·n0, s2·s0·n1 )
      gate('gb1', 'AND', 780, 520); gate('gb2', 'AND', 780, 600)
      gate('gb3', 'AND', 780, 680); gate('gb4', 'AND', 780, 760); gate('gb', 'NOR', 780, 840)
      w(s2, 'gb1:a'); w(s1, 'gb1:b')
      w('gb1:p', 'gb2:a'); w(p0, 'gb2:b')
      w(s2, 'gb3:a'); w(s0, 'gb3:b')
      w('gb3:p', 'gb4:a'); w(p1, 'gb4:b')
      w('gb2:p', 'gb:a'); w('gb4:p', 'gb:b')
      // 段 c：只在 2（010）灭 → c = NAND(s1, n0·n2)
      gate('gc2', 'AND', 780, 760); gate('gc', 'NAND', 780, 840)
      w(p0, 'gc2:a'); w(p2, 'gc2:b')
      w(s1, 'gc:a'); w('gc2:p', 'gc:b')
      // 段 d：灭在 1（001）和 4（100）→ d = n0·n2 | s1·s0 | s2·(s1|s0)
      gate('gd1', 'AND', 900, 40); gate('gd2', 'AND', 900, 120); gate('gd3', 'OR', 900, 200)
      gate('gd6', 'AND', 900, 280); gate('gd4', 'OR', 900, 360); gate('gd5', 'OR', 900, 440)
      w(p0, 'gd1:a'); w(p2, 'gd1:b')
      w(s1, 'gd2:a'); w(s0, 'gd2:b')
      w(s1, 'gd3:a'); w(s0, 'gd3:b')
      w(s2, 'gd6:a'); w('gd3:p', 'gd6:b')
      w('gd1:p', 'gd4:a'); w('gd2:p', 'gd4:b')
      w('gd4:p', 'gd5:a'); w('gd6:p', 'gd5:b')
      // 段 e = n0·(n2 | s1)
      gate('ge1', 'OR', 900, 520); gate('ge2', 'AND', 900, 600)
      w(p2, 'ge1:a'); w(s1, 'ge1:b')
      w(p0, 'ge2:a'); w('ge1:p', 'ge2:b')
      // 段 f：灭在 1/2/3 → f = n1·(n0|s2) | s2·s1
      gate('gf1', 'OR', 1000, 40); gate('gf2', 'AND', 1000, 120)
      gate('gf3', 'AND', 1000, 200); gate('gf', 'OR', 1000, 280)
      w(p0, 'gf1:a'); w(s2, 'gf1:b')
      w(p1, 'gf2:a'); w('gf1:p', 'gf2:b')
      w(s2, 'gf3:a'); w(s1, 'gf3:b')
      w('gf2:p', 'gf:a'); w('gf3:p', 'gf:b')
      // 段 g = s1 | s2
      gate('gg', 'OR', 1000, 200); w(s1, 'gg:a'); w(s2, 'gg:b')
      // 所有译码门接电源
      for (const g of ['ga1', 'ga2', 'ga3', 'ga4', 'ga5', 'gb1', 'gb2', 'gb3', 'gb4', 'gb', 'gc2', 'gc', 'gd1', 'gd2', 'gd3', 'gd6', 'gd4', 'gd5', 'ge1', 'ge2', 'gf1', 'gf2', 'gf3', 'gf', 'gg']) {
        w('bat:a', `${g}:c`); w('bat:b', `${g}:d`)
      }
      // ── 七段数码管（7 个 LED 布成日字形，串 150Ω 限流）──
      const seg = (id: string, out: string, x: number, y: number, rot: 0 | 90) => {
        comps.push({ id: `r${id}`, kind: 'resistor', x: x - 70, y, rot: 0, r: 150 })
        led(id, x, y, rot)
        w(out, `r${id}:a`); w(`r${id}:b`, `${id}:a`); w(`${id}:b`, 'bat:b')
      }
      seg('segA', 'ga5:p', 1130, 110, 0)
      seg('segB', 'gb:p', 1200, 170, 90)
      seg('segC', 'gc:p', 1200, 310, 90)
      seg('segD', 'gd5:p', 1130, 370, 0)
      seg('segE', 'ge2:p', 1060, 310, 90)
      seg('segF', 'gf:p', 1060, 170, 90)
      seg('segG', 'gg:p', 1130, 240, 0)
      return { comps, wires }
    },
  },
]
