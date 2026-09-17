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

## 画布内联编辑约定

- 画布上编辑文本用 **`<textarea>` 覆盖层**（老板拍板的方案，不要换回 contenteditable）。理由：中文输入法不用自己写 composition 锁、粘贴天然纯文本、不跟 Vue 抢 DOM 所有权。
- 编辑态由 store 的 `editingId` 驱动（**放 Pinia**，不做模块级单例 —— 消费方跨三个目录）。进入 = 右键「编辑文本」或双击元素；退出 = `Esc` / 失焦 / 点画布空白 / 选别的元素 / 删除 / 锁定。`Esc` 只提交**不回滚**（本项目没有撤销栈）。
- 三条容易踩空的实现约束：
  1. textarea 的 `:value` 绑**组件内 draft ref**（恒等于 DOM 值 → Vue 必然跳过 patch），`@input` 里同步写 store。这样中文合成期间不会被外部写入打断。
  2. autosize 量高度前要先临时塌成 `auto`，量完**还原原值**而不是清空 —— 高度没变时 Vue 不会重新落样式，清空会把框永久塌成一行。
  3. 元素容器上的 `select-none` 会继承进 textarea，必须自己补 `select-text`；并给 textarea 加 `@pointerdown.stop`，否则拖选文字会变成拖元素。
- `onBlur` 里先判断"我还是当前编辑者"再退出：元素被移除时浏览器补的那次 blur 会掐掉刚开始的下一段编辑。
- **禁止在编辑态** preventDefault 画布的 pointerdown：拦了默认行为 textarea 就不失焦，编辑态关不掉。
- 不要在编辑态禁用属性面板的"内容"字段：禁用控件点不着 → 画布 textarea 不失焦 → 用户要点两次才生效。两条编辑路径靠"失焦即退出"天然互斥，不需要禁用。

## reka-ui 焦点回填

关闭 Content 类组件（ContextMenu / Popover …）时，reka 走 FocusScope 的 unmount 钩子 → `emits("closeAutoFocus")` → 按 `defaultPrevented` 决定是否把焦点还给 trigger。trigger 不可聚焦时焦点会掉到 body，顶掉自己刚聚焦的元素。正确解法是 `@close-auto-focus` + `preventDefault()`（emits 同步，一定先于回填执行），不要在 nextTick 里延迟聚焦来赌时序。

## 本地访问 curl 的坑

- 访问 localhost 必须加 `--noproxy '*'`，否则被系统 HTTP 代理拦截，返回 502 或连接失败（http_code=000）。
- 起 dev server 用 `run_in_background`，但**用完立刻 TaskStop**，别攒着让用户来清。
- 用 Windows 原生 curl 时**不要 `-o /tmp/xxx`**：它不认 Git Bash 的 `/tmp`，会静默写出 0 字节（`size_download=0` 是假象，响应头里 Content-Length 其实是正常的）。直接管道给 `grep`，或写到真实盘符路径。

## 样式类改动必须回查编译产物

- 本项目用 **Tailwind v4 + @tailwindcss/vite，按需生成**：类名写错或组件没被扫描到，都是**静默失效**，不报错。所以改完 class 要顺手 `curl --noproxy '*' http://localhost:<port>/src/styles/index.css`，grep 一下新类是否真的生成了（如 `border-destructive`、`bg-destructive\/10`）。只 curl `.vue` 模块只能证明编译通过，证明不了样式存在。
- 颜色一律用主题 token（`border-destructive`、`text-primary` 等），不要硬编码 hex；画布选框本来硬编码了 `#1a73e8`，新增态用 token 混搭即可。

## 拖拽实现约定

- **素材台 → 画布的拖拽用 HTML5 Drag and Drop**（`draggable` / `dragstart` / `dataTransfer`）。这是老板明确指定的方案。
  - 曾自作主张改成指针事件（`useDrag`），被老板清空并判定"偏离意图"。**老板指定了技术方案就在该方案内解决坑，不要擅自换方案。**
- **DnD 在 Vue 里的三条硬规矩**（违反会"一拖就卡死"）：
  1. `dragstart` 里**只写 dataTransfer，绝不碰响应式状态**。浏览器此时正在为源元素生成 drag image，Vue 同时改源元素样式（高亮 class / opacity）会与之打架。拖拽反馈交给浏览器自带的半透明快照。
  2. 源卡片**不要用 transform / opacity 过渡**，hover 只改颜色。图标与文字加 `pointer-events: none`，保证 dragstart 稳定由卡片自身发起。
  3. `dragover` 必须 `preventDefault()`（否则不派发 drop），且**里面不写任何状态** —— 它每帧高频触发。`dragleave` 用 `e.relatedTarget` 判真离开（子元素间穿梭会反复冒泡；relatedTarget 为 null 表示拖出窗口，也要关）。
- `dataTransfer` 只传**素材 id**（最小载荷），drop 端回查清单拿类型与默认值；自定义 MIME + `text/plain` 双写，非素材 id 的拖入直接忽略。
- 落点判定走 `getBoundingClientRect()`（已含滚动与缩放），除以 `mmToPx(1) * scale` 得 mm，**不要再手工叠加 scroll 偏移**。元素以落点为中心放置。

## 画布几何不变量（改拖拽 / 缩放交互前必读）

- **元素框中心就是旋转支点**（`ElementWrapper` 写死 `transformOrigin: "center"`）。凡是会**重算包围盒**的操作（拖端点、对齐、自动收缩…）都会移动框中心、进而挪走支点；而「屏幕位移 → 局部位移」的换算隐含了"支点不动" → 旋转态下必然漂移（θ=90° 实测另一端漂 9mm）。**解法：先把元素已有的 rotation 烘焙进几何坐标**（换算到纸张 mm 空间算完再写回，rotation 归 0）。线段视觉位置分毫不动（操作是连续的），框重新变回轴对齐包围盒，缩放分支的等比换算继续成立。
- **line 的不变量：框 = 线段轴对齐包围盒**，两个方向各兜 `ENDPOINT_MIN_THICKNESS = 4mm` 的最小厚度，否则水平/垂直的线框退化成 0 厚，选区看不见也点不中。
- **line 只有 2 个端点手柄 + 旋转手柄，没有缩放手柄**：端点在包围盒里必然落在角或边中点上，与缩放手柄位置**几何必然重合**，只能二选一。这是几何结论，不是偏好。
- 拖端点时保持**端点身份**：拖哪个端点，哪个仍写进 `start`/`end`（「翻转线条」等依赖首尾语义的操作才不会错位）。

## 吸附（move / resize / 端点三条手势共用一个开关）

- **两套语义，绝不合并**：`snapAxis`（移动）= 两条边都去够线、取最近的一组、**整框平移**；`snapEdge`（缩放、线条端点）= 只动**被拖的那条边**，对边锁死。缩放若套用 `snapAxis`，对边会跟着跑（拖 w 手柄结果右边也挪了）—— 这是语义差异，不是实现细节。
- **缩放吸附只在 rotation ∈ {0°, 180°} 时生效**（角度容差 1e-3°，因为旋转吸附产出的是浮点角）。非正交角上元素边与参考线不平行，对齐没有几何意义；更要命的是**旋转态缩放本身就会漂**（改宽 → 框中心移动 → `transform-origin` 正是框中心 → 对边跟着挪），在会漂的坐标系里吸附，会吸到"看着对不上"的位置。90°/270° 视觉框宽高互换、需换轴反解，明确不做。
- **线条端点不受上述旋转限制**：端点路径全程在纸张 mm 空间、元素自转已被烘焙，吸附是精确的。
- **吸附与最小尺寸（1mm）冲突时，整轴退回自由值并撤销该轴高亮**，不要硬夹成 min —— "吸住了却卡在 1mm"比不吸更让人困惑。退回后若自由值本身就 < min，再走原来的夹紧兜底。
- 三条手势共用 `useSnapFeedback.setSnapKeys` 这一条高亮通道，渲染层（`MarginGuides` / `GuideLines`）完全不用改。将来新增会吸附的手势，只要返回 key 数组即可。
- 修饰键：`Alt` = 临时取消吸附（三条手势一致；且**必须返回空 hits**，否则高亮残留）。**`Shift` 是留给将来等比缩放的坑位，别占用**。
- 容差统一用 `MARGIN_SNAP_PX = 6`（屏幕 px，除以 `pxPerMm` 换算成 mm），不要为不同手势另起第二套手感。

## TypeScript 陷阱（vue-tsc 坏了，没人兜底）

- `Omit` 作用在**联合类型**上会先塌陷成公共字段再剔除，导致 `content` / `fontSize` 这类类型专属字段被静默吃掉。需要逐成员剔除时用 distributive 写法：`type DistributiveOmit<T, K> = T extends unknown ? Omit<T, K> : never`。
- 由于没有类型检查，写这类类型体操后要**人工核对**赋值处是否还认得专属字段。

## 目录 / 组件约定

- `designPanel/components/` 里：背景纹理由下到上是 `PaperGrid`（纸纹，随缩放缩放）→ `ElementLayer` → `MarginGuides`（屏幕恒定 1px，整层 `pointer-events:none`）→ `GuideLines`（可交互，容器 `none` + 单条 `auto`）。
- 视图/编辑方式的开关放底部 `statusLine`；文档属性放右侧设置面板。
- 所有实时刷动的数字读数（坐标、角度、尺寸）必须**定宽 + tabular-nums**，否则会把同行元素推着跳。
