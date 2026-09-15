# vue-print 项目长期约定

## 验证方式（重要）

- **默认手段只有三样**：`npx vite` 起服务 + `curl` 取转换后的模块确认无编译错误、`npx eslint`、以及人工静态核对代码。**不要擅自做浏览器自动化验证。**
  - 用户在 Web 项目的明确要求：「写完代码后只要保证编译通过和冒烟，进行必要的代码正确性检查，不要做额外的视觉校验」。
  - 背景：本项目 `vue-tsc` 是坏的（`@volar/typescript/lib/quickstart/runTsc` MODULE_NOT_FOUND），没有类型检查兜底。不要因为这个缺口就自己去补浏览器测试。
- **不要用 Playwright 装浏览器**。`playwright` / `playwright-core` 本来就在项目 devDependencies 里，但二进制从未安装成功：
  - pnpm 隔离的 node_modules 曾导致 `require("playwright-core")` 失败；后来 require 通了，`npx playwright install chromium` 又要下一百多 MB，跑了 20 分钟没下完，最后被用户发现叫停。
  - **曾经反复重试三次以上，这是明确的错误示范**：第一次失败就该改策略，而不是重试。
- 真的需要验证交互行为时：**先告诉用户**，让他决定要不要装浏览器。不得在后台悄悄起长耗时下载。
- 交互功能如果没能真机验证，要在交付说明里**明确列出哪些链路需要用户手动点一遍**，不要含糊带过。
- **交互类异常（尤其是拖拽）第一步先用 Chrome 无痕模式复现排除环境干扰**：本项目实测出现过"普通模式一拖就卡死、无痕模式完全正常"的情况，根因是浏览器扩展注入脚本 / 缓存，与代码无关。先排除环境，再怀疑代码 —— 否则会在错误的方向上反复返工（血泪：为此把好用的方案推翻重做了三次）。

## 本地访问 curl 的坑

- 访问 localhost 必须加 `--noproxy '*'`，否则被系统 HTTP 代理拦截，返回 502 或连接失败（http_code=000）。
- 起 dev server 用 `run_in_background`，但**用完立刻 TaskStop**，别攒着让用户来清。

## 拖拽实现约定

- **素材台 → 画布的拖拽用 HTML5 Drag and Drop**（`draggable` / `dragstart` / `dataTransfer`）。这是老板明确指定的方案。
  - 曾自作主张改成指针事件（`useDrag`），被老板清空并判定"偏离意图"。**老板指定了技术方案就在该方案内解决坑，不要擅自换方案。**
- **DnD 在 Vue 里的三条硬规矩**（违反会"一拖就卡死"）：
  1. `dragstart` 里**只写 dataTransfer，绝不碰响应式状态**。浏览器此时正在为源元素生成 drag image，Vue 同时改源元素样式（高亮 class / opacity）会与之打架。拖拽反馈交给浏览器自带的半透明快照。
  2. 源卡片**不要用 transform / opacity 过渡**，hover 只改颜色。图标与文字加 `pointer-events: none`，保证 dragstart 稳定由卡片自身发起。
  3. `dragover` 必须 `preventDefault()`（否则不派发 drop），且**里面不写任何状态** —— 它每帧高频触发。`dragleave` 用 `e.relatedTarget` 判真离开（子元素间穿梭会反复冒泡；relatedTarget 为 null 表示拖出窗口，也要关）。
- `dataTransfer` 只传**素材 id**（最小载荷），drop 端回查清单拿类型与默认值；自定义 MIME + `text/plain` 双写，非素材 id 的拖入直接忽略。
- 落点判定走 `getBoundingClientRect()`（已含滚动与缩放），除以 `mmToPx(1) * scale` 得 mm，**不要再手工叠加 scroll 偏移**。元素以落点为中心放置。

## TypeScript 陷阱（vue-tsc 坏了，没人兜底）

- `Omit` 作用在**联合类型**上会先塌陷成公共字段再剔除，导致 `content` / `fontSize` 这类类型专属字段被静默吃掉。需要逐成员剔除时用 distributive 写法：`type DistributiveOmit<T, K> = T extends unknown ? Omit<T, K> : never`。
- 由于没有类型检查，写这类类型体操后要**人工核对**赋值处是否还认得专属字段。

## 目录 / 组件约定

- `designPanel/components/` 里：背景纹理由下到上是 `PaperGrid`（纸纹，随缩放缩放）→ `ElementLayer` → `MarginGuides`（屏幕恒定 1px，整层 `pointer-events:none`）→ `GuideLines`（可交互，容器 `none` + 单条 `auto`）。
- 视图/编辑方式的开关放底部 `statusLine`；文档属性放右侧设置面板。
- 所有实时刷动的数字读数（坐标、角度、尺寸）必须**定宽 + tabular-nums**，否则会把同行元素推着跳。
