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

## 本地访问 curl 的坑

- 访问 localhost 必须加 `--noproxy '*'`，否则被系统 HTTP 代理拦截，返回 502 或连接失败（http_code=000）。
- 起 dev server 用 `run_in_background`，但**用完立刻 TaskStop**，别攒着让用户来清。

## 目录 / 组件约定

- `designPanel/components/` 里：背景纹理由下到上是 `PaperGrid`（纸纹，随缩放缩放）→ `ElementLayer` → `MarginGuides`（屏幕恒定 1px，整层 `pointer-events:none`）→ `GuideLines`（可交互，容器 `none` + 单条 `auto`）。
- 视图/编辑方式的开关放底部 `statusLine`；文档属性放右侧设置面板。
- 所有实时刷动的数字读数（坐标、角度、尺寸）必须**定宽 + tabular-nums**，否则会把同行元素推着跳。
