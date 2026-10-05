# 田野考古发掘数字化管理系统

面向考古发掘现场探方管理、地层记录、遗迹测绘、遗物登记、浮选采样与测年送检全流程的田野考古数字化管理平台。

这是一个**纯前端**管理平台：Vue 3 + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

## 目录结构

```text
.
├── frontend/                 Vue 3 + Vite + TypeScript 前端（唯一运行单元）
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出
│   ├── src/data/             模块元数据 / 示例数据 / localStorage 持久化
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── .gitignore
└── docker-compose.yml
```

## 启动

```bash
cd frontend
npm install
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。

生产构建：

```bash
cd frontend
npm run build
```

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 探方管理 | `trench` | 探方 | 探方编号、所属发掘区、探方尺寸 |
| 地层记录 | `stratum` | 地层 | 地层编号、所属探方、层位序号 |
| 遗迹单位 | `feature` | 遗迹 | 遗迹编号、所属探方、遗迹类型 |
| 出土遗物 | `artifact` | 出土遗物 | 器物编号、出土探方、出土层位 |
| 浮选采样 | `flotation` | 浮选样本 | 样本编号、采样单位、采样层位 |
| 测年送检 | `dating` | 测年送检单 | 送检编号、样品类型、采样单位 |
| 影像记录 | `photography` | 影像档案 | 影像编号、拍摄对象、拍摄类型 |
| 实测绘图 | `drawing` | 实测图纸 | 图纸编号、绘图对象、绘图类型 |
| 发掘日记 | `diary` | 发掘日记 | 日记编号、日期、当日气候 |
| 考古调查 | `survey` | 调查记录 | 调查编号、调查区域、调查方法 |
| 人骨鉴定 | `human_bone` | 人骨标本 | 标本编号、出土单位、鉴定部位 |
| 动物骨骼 | `animal_bone` | 动物骨骼标本 | 标本编号、出土单位、种属判定 |
| 陶器整理 | `pottery` | 陶器标本 | 标本编号、出土单位、器形类别 |
| 现场保护 | `conservation` | 保护处理记录 | 处理编号、保护对象、病害类型 |
| 三维坐标 | `coordinate` | 测点记录 | 测点编号、所属单位、坐标系 |
| 库房管理 | `storage` | 库房架位 | 架位编号、库房名称、存放器物类别 |
| 耗材管理 | `material` | 发掘耗材 | 耗材编号、耗材名称、规格型号 |
| 工地接待 | `visit` | 来访记录 | 来访编号、来访单位、来访人数 |

## 发掘交接台账（原「运营概览」）

首页是按日期推进的发掘交接台账，数据走独立的交接持久化层
（`src/data/handover-*.ts`、`src/api/handover-service.ts`）：

- **顶部**：日期时间轴切换不同班次的交接单；单内时间轴展示当班未决事项。
- **中部**：按地层、遗迹、遗物、浮选、测年五个业务模块展开当日记录，显示在册、当日新增、
  未决、异常与发掘区归属。
- **底部**：填写交接意见和交班/接班负责人后确认交接。确认时强制把**遗物复核清单**和
  **浮选送检清单**写入「出土遗物」「浮选采样」页面顶部的待办区（`src/components/TodoPanel.vue`）。
- **并发确认**：交接单带乐观锁版本号，两位负责人同时确认同一版本时只有第一个确认落库，
  后到者收到冲突提示（确认前强制重读磁盘，可在两个浏览器标签页复现）。
- **统计口径**：口径版本（`src/data/caliber.ts`）随单冻结——v2 加严规则（残缺遗物未复核、
  浮选超 3 天未送检、异常测年单）只重判新建交接单，历史交接单永远显示交接当日的 v1 口径。
- **发掘区补录**：记录本身不带发掘区，先按单位中的探方编码（如 `T0101`）从探方台账反推；
  推不出的旧记录归入「未划分发掘区（待补录）」，可在台账页补录。补录写独立覆盖表，
  不回改原始记录、不影响已确认的历史单，只重算当班草稿。

业务规则有一套 Node 端到端校验（并发冲突、口径冻结、补录隔离、清单下发）：

```bash
cd frontend
npm run verify:handover
```

## 约定

- 每个模块的页面在 `frontend/src/views/<模块>/index.vue`，页面只负责渲染，读写统一走
  `frontend/src/api/local-service.ts`（交接相关走 `handover-service.ts`）。
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据在
  `frontend/src/data/seed.ts`。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断。
- 想回到初始数据：清掉浏览器里 `field-archaeology-digital:entries` 等
  `field-archaeology-digital:*` 项，或调用 `resetModule(模块)`。
