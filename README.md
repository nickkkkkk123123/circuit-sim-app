# 虚拟电路实验室

无锡市"人工智能+教育"创新应用技能大赛参赛作品（AI+教育赛道二 · AI研发创作）。

一个面向高中物理电学教学的交互式直流电路仿真实验台：自由搭建电路，实时看到电流的流动。

## 在线演示

**https://circuit-lab-d0glcloq605b1bcf5-1495720101.tcloudbaseapp.com/**

（腾讯云 CloudBase 静态托管，国内直连，无需任何网络工具）

## 功能

- 四种元件：电源（电动势/内阻可调）、定值电阻、小灯泡（亮度随实际功率）、开关（双击通断）
- 点击元件库后画布放置，端子间连线（三段式走线、18px 吸附）
- 底层为改进节点电压法（MNA）真实求解——电流以流动光效呈现，右侧面板实时读出电压/电流/功率
- 自动断路检测、右键删除、R 键旋转、Esc 取消、电路自动持久化
- Electron 独立窗口版与网页版功能一致

## 本地开发

```bash
pnpm install
pnpm dev        # 开发服务器
pnpm test       # MNA 求解器单元测试（vitest）
pnpm build      # 产物输出到 dist/
pnpm app        # Electron 独立窗口（加载 dist）
```

## 技术栈

React 19 · TypeScript · Zustand · SVG · Vite · Electron · Vitest

AI 辅助开发：智谱 GLM（方案论证/代码生成）+ ZCode（工程脚手架/测试/打包）。

## 许可

MIT
