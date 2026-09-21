# 工程习惯 / 环境坑 / 数据所有权 / 验证方式

## 怎么验证（重要）

- 只有三样：`npx vite` + `curl` 取转换后模块确认编译通过、`npx eslint`、人工静态核对代码。**不要擅自做浏览器自动化验证**（老板原话：只要保证编译通过和冒烟，做必要的正确性检查，不要额外的视觉校验）。`vue-tsc` 是坏的（`runTsc` MODULE_NOT_FOUND），没有类型检查兜底 —— 但这**不是**自己补浏览器测试的理由。
- **不要用 Playwright 装浏览器**：从没装成功过，曾反复重试三次以上（明确的错误示范）。真要验证交互，**先问老板**，别在后台悄悄起长耗时下载。
- 没能真机验证的交互，交付说明里**逐条列出需要老板手点哪条链路**。
- **交互异常（尤其拖拽）第一步先用 Chrome 无痕模式复现**排除扩展/缓存干扰 —— 实测过"普通模式一拖就卡死、无痕完全正常"，为此把好用的方案推翻重做了三次。

## 数据所有权（严重，已踩两次）

**铁律：每个元素必须自持嵌套数据，绝不与别的元素或模块级常量共用引用。** 素材清单 `materials.ts` 的 `defaults` 是**模块级常量、全清单一份实例**（表格 `cells`/`colWidths`/`rowHeights`，线条 `start`/`end`/`stroke`）。

- `createElement` **必须**深拷贝：`cloneElementPayload` = `structuredClone(toRaw(v))`，失败退浅拷贝并警告。曾用 `{...partial}` 浅展开 → 拖两个表格出来"两份外壳、一份内脏"（A 表删行 B 表跟着少）。
- **更狠的连带后果**：`before1.cells === defaults.cells` → 改 A 表会**直接污染模块级模板**，之后拖出来的新表也带坏数据，刷新才好。
- `copyElement`/`pasteElement` 已用 `structuredClone(toRaw(...))`；`addElement` 是裸 `push`，契约是"入参必须自持数据"，新建一律走 `createElement`。
- 判断方法：凡是模块级常量/默认值对象进入 `elements` 都要过深拷贝。**不要用"看起来一样"解释串改 —— 现象是"两份数据是同一个对象"。**

## 环境坑

- 本地 curl 必须 `--noproxy '*'`（否则被系统代理拦成 502 / 000）；dev server 用 `run_in_background` 起、**用完立刻 TaskStop**；Windows 原生 curl **不要 `-o /tmp/xxx`**（不认 Git Bash 路径，静默写 0 字节，`size_download=0` 是假象）。
- **同一文件不要并行发多个 Edit**：实测竞态 —— 后一次写入会覆盖前一次的改动，前一个改动凭空消失（真丢过一次，只能重发）。
- **Git Bash 里 `git branch` 建带斜杠的名字会静默失败**：`git branch backup/data-parsing <sha>` 返回 0、无任何输出，但 `refs/heads` 里**根本没有这个分支**，要到 `git log backup/data-parsing` 才报 `ambiguous argument`。用无斜杠名（`backup-data-parsing`）即可。**凡建分支/标签，建完立刻 `git for-each-ref refs/heads` 核对**，别信退出码。

## 样式与分层

- **画布根必须带 `isolate`（`isolation: isolate`）—— 层级防火墙**。没有它，画布内 `z-index` 不是局部坐标，会跑出去和全局浮层比大小：实测 `MarginGuides` 的 `z-9999` / `GuideLines` 的 `z-10000` **盖住了 dialog**（数据集编辑器一开就被边距线压住），也压着 teleport 到 body 的右键菜单。有了它两边解耦。
  - **画布内层级自有区间**：`0` PaperGrid → `0+` ElementLayer（`element.zIndex`）→ `30` 边距线 → `40` 吸附参考线。**40 是上界**：将来元素若支持"上移/下移一层"，其 `zIndex` 上限必须 < 30，否则边距线会被元素盖住。
  - 全局浮层（dialog / 下拉 / 右键菜单）统一用 shadcn 的 `z-50`，在**另一个**层叠上下文里比较，与画布内的数字无关。**不要再往画布内堆大数字来"压过 dialog"**。
- **Tailwind v4 按需生成，类名写错 / 组件没被扫描到都是静默失效**。改完 class 要 `curl .../src/styles/index.css` grep 新类是否真生成（只 curl `.vue` 只能证明编译通过）。颜色一律用主题 token，别硬编码 hex。
- `designPanel/components/` 从下到上：`PaperGrid` → `ElementLayer` → `MarginGuides`（屏幕恒定 1px，整层 `pointer-events:none`）→ `GuideLines`（容器 none + 单条 auto）。视图/编辑开关放底部 `statusLine`，文档属性放右侧设置面板。实时刷动的数字读数必须**定宽 + tabular-nums**。

## TypeScript 陷阱

`Omit` 作用在联合类型上会先塌陷成公共字段再剔除，`content`/`fontSize` 这类专属字段被静默吃掉 → 用 distributive 写法 `T extends unknown ? Omit<T,K> : never`，写完要**人工核对**赋值处还认不认得专属字段。
