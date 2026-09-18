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
- 反过来，**某条路径一旦 preventDefault 了，那条路径就必须自己显式收编辑态**（`stopCellEditing()`），不能指望 `onBlur` —— 焦点转移正是被拦掉的那个默认行为，blur 永远不会来。同一个根因已经踩过两次：元素级文本编辑、表格单元格（`onCellPointerDown` 里那段 `preventDefault` 让点击别的格子退不出编辑态）。判断口诀：**这条交互里 preventDefault 了吗？是 → 退出编辑必须显式写，别等失焦。**
- 不要在编辑态禁用属性面板的"内容"字段：禁用控件点不着 → 画布 textarea 不失焦 → 用户要点两次才生效。两条编辑路径靠"失焦即退出"天然互斥，不需要禁用。

## reka-ui 焦点回填

关闭 Content 类组件（ContextMenu / Popover …）时，reka 走 FocusScope 的 unmount 钩子 → `emits("closeAutoFocus")` → 按 `defaultPrevented` 决定是否把焦点还给 trigger。trigger 不可聚焦时焦点会掉到 body，顶掉自己刚聚焦的元素。正确解法是 `@close-auto-focus` + `preventDefault()`（emits 同步，一定先于回填执行），不要在 nextTick 里延迟聚焦来赌时序。

## 事件冒泡与 reka 菜单关闭（架构级，改动前必读）

- reka 的"点外面关闭"监听在 **document 的冒泡阶段**（`DismissableLayer` → `usePointerDownOutside`，`addEventListener("pointerdown", handler)`，**没有 capture**）。**元素内部任何一处 `stopPropagation` 都会让它彻底失效。**
- 因此**不要再用 `@pointerdown.stop` 达成"别让画布根取消选中"** —— 它顺手切断了 document 层的一切监听（右键菜单关不掉就是第一个撞上来的）。正确做法是**打标记 + 判落点**：元素根带 `data-design-element`，画布根的 `onRootPointerDown` 用 `closest("[data-design-element]")` 判断，命中就放行。
  - **要保留 stop 的地方**：`GuideLines`、文本 textarea、各手势手柄（缩放/端点/旋转）。它们拦的是**同一元素内的其它手势**，不是 document，去掉会让两套手势打架。
- **去掉 stop 的连带代价：父容器 handler 不能假设"事件到达我 = 落点在我身上"。** 子元素不再 stop 之后，它的 pointerdown 会冒泡到父容器 —— 父容器里那些"清理型"动作（清选区、退出编辑态）若无条件执行，就会在子元素刚设好状态之后**下一行把它抹掉**。踩过：`TableElement` 的 `onRootPointerDown` 无条件 `setCellRange(null)`，导致"点单元格不出现蓝框"（单元格 handler 刚选中，冒泡上来又被清空）。
  - 规矩：**父容器的清理动作一律先判落点**。表格里用 `e.target === rootRef.value`（只有落在 root 自身的留白/边框上才清），画布里用 `closest("[data-design-element]")`。两个 `onRootPointerDown` 现在是同一套惯例。
- `ContextMenu` 默认 **`modal: true`**，reka 会给 `document.body` 设 `pointer-events: none` —— 菜单开着时下面的元素**全都点不中**（事件目标退化成 `<html>`）。所以**右键菜单必须 `:modal="false"`**，否则"点一下既关菜单、又切到那个单元格"只能做到前半截。
- 关闭的兜底：`designPanel/components/ContextMenuAutoClose.ts` 哨兵。放进 `<ContextMenu>` 内（与 Trigger/Content 并列），用 reka **公开导出**的 `injectContextMenuRootContext` 拿 `onOpenChange`，在 document 的 **capture 阶段**监听左键 —— capture 是路径第一站，不受任何 stop 影响。判断"落点在 `[data-dismissable-layer]` 内就不关"，保护菜单项自己的 click（提前卸载会让所有菜单命令失效）。
- 关闭只写状态：Vue 的 DOM 更新是异步的（nextTick），事件仍会完整传播到底下的元素，「关菜单」与「点击生效」不冲突，不会吞掉这次点击。

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

## 元素数据的**所有权**（严重，已踩过两次面）

**铁律：每个元素必须自持嵌套数据，绝不与别的元素或模块级常量共用引用。**

- 素材清单（`materials.ts`）的 `defaults` 是**模块级常量、全清单只有一份实例**，含 `cells` / `colWidths` / `rowHeights` / `rowRoles`（表格）、`start` / `end` / `stroke`（线条）等嵌套结构。
- `createElement` **必须**深拷贝载荷（`cloneElementPayload`：`structuredClone(toRaw(v))`，失败退回浅拷贝并警告）。
  - 曾经是 `{...partial}` 浅展开 → 拖两个表格出来就是"两份外壳、一份内脏"：**在 A 表删一行，B 表跟着少一行**（实测复现，`cells` 同引用）。
  - **更狠的连带后果**：`before1.cells === defaults.cells`，所以 A 表的操作会**直接改到模块级模板本身** —— 之后拖出来的新表格也带着被污染的行数/结构，且**刷新页面才会好**。
- 同类入口的一致性：`copyElement` / `pasteElement` 已用 `structuredClone(toRaw(...))`；`addElement` 是裸 `push`，**契约是"入参必须自持数据"**（见其注释），新代码从素材台创建一律走 `createElement`。
- 判断方法：凡是「模块级常量 / 默认值对象」进入 `elements`，都要过一遍深拷贝。不要用"看起来一样"解释串改现象 —— **现象是"两份数据是同一个对象"**。

## 表格（P0 已实现）

设计文档：`docs/table-feature-design.md`（v10，**§9 是实现进度 + 各轮 bug 记录**）。**动手前必读**。定位：**数据驱动的明细表**（单据明细），第一期只做静态排版，数据绑定后续再做。

**几何不变量（最关键，违反要返工）**：元素 `height` 不是权威值 —— `width ≡ Σ colWidths`、`height ≡ Σ rowHeights`。拖行/列分隔线只改**相邻**两行/列、**元素框不动**；拖元素手柄 / 面板改宽高则**等比缩放全部行列**（`updateElement` 里自动做，别在调用点各写一遍）。**插入列也不改总宽**：宽度在内部重分配（新列借相邻列宽挂入 → `fitTracks` 整组等比缩回原总宽，`fitTracks` 额外兜 `MIN_TRACK` 下限），**但插入行照旧让表格变高** —— 宽度是版面约束、高度是内容量，两者刻意不对称。**不要写成 `h-full` + 百分比分配行高**：那套假设接数据绑定时必须重写。

**写入口只有两个**：几何/普通字段走 `updateElement(id, patch)`；表格结构与单元格走 **`updateTable(id, mutator)`** —— 它必须**整包替换**（逐格赋值会触发 N 次响应式更新，拖分隔线会被直接拖垮），mutator 改完由它统一补齐字段、回算几何、收敛越界选区。**绝不要用点路径 patch 写 `cells`**（二维数组没法用点路径表达）。

**渲染用 `<table>`**（老板指定，v4 定的）：`table-layout: fixed` + 显式 `<colgroup>`（列宽钉死在数据上，auto 布局内容会参与列宽计算）+ 单元格内容层 `absolute inset-0`。**内容层绝对定位是行高能精确的关键** —— `<tr>` 的 height 本身是最小高度，只有 td 里没有流内内容时它才成为精确值。前提是 td 设 `position: relative` 当锚点。**别把这条改回"按百分比分配行高"或"让内容撑高行"**，那会破坏 `Σ rowHeights ≡ height`。
`colOffsets` / `rowOffsets` 前缀和仍要保留：选区框、活动格高亮、分隔线热区、行列把手都是**相对表格定位的浮层**，没有表格布局可依托。

**改轨道尺寸有三个语义，靠「表格总尺寸变不变」划清**（`model.ts`，别混用）：拖分隔线 `resizeTrackPair` 相邻两轨让位、总尺寸不动；右键"平均分布" `distributeTracks` 选区内等分现有总长、总尺寸不动；面板「整表行高 / 列宽」`setAllTracks` 每条都改成 value、总尺寸 = 数量 × value（`setAllTracks` 要挡 `null/undefined/NaN`，否则清空输入框会把全表夹成 `MIN_TRACK`）。**整表批量控件在「表格」级分组**（`TableProperties.vue` 的 `table-tracks` 项，不依赖选区；v9 前曾挂在单元格面板，粒度不对已搬走）—— 因为单元格面板的行高输入框 `v-if="rowHeight !== null"` 只在选中整行时渲染，随手点一格根本找不到入口。第三条路径是元素级面板的"高度" / 拖缩放手柄 → `updateElement` 对表格走 `scaleTracks` 等比缩放（比例不变）。

**行列把手带 Excel 式标号（v10）**：编辑态下上方把手（`colHandles`）显示 `colLabel(index)`、左侧把手（`rowHandles`）显示 `index + 1`；`HANDLE_SIZE_PX = 18`（**屏幕 px**，不乘 `pxPerMm`，缩到 50% 也看得清是第几列）。`colLabel` 的**唯一实现在 `table/model.ts`**（0→A…25→Z、26→AA —— 注意 `Z` 之后是 `AA` 不是 `BA`，不是 base-26），面板的选区信息条与画布把手共用，**别在组件里再写一份**。选中态文字要跟着底色换：`bg-primary/60` 的深蓝底上用 `text-primary-foreground`，否则 `text-primary` 看不清。把手**只在编辑态出现**（非编辑态让位给元素级缩放手柄），标号跟着走。

**合并用 `covered` 标记保留格**：`cells[r*cols+c]` 恒等于网格坐标，渲染时跳过被覆盖的格。合并只保留左上内容。插入/删除行列前先把跨线的合并格拆开（`expandMergesCrossing`），否则网格会静默错位。

**边框写入必须"两格同写"（严重，踩过）**。数据层存"格四边"，共享边在几何上是**一条线**（`(r,c).bottom` ≡ `(r+1,c).top`）。渲染交给 `border-collapse: collapse` 合并 —— 但**只写自己那半边会静默失效**：CSS 的裁决规则是**更宽者胜**，邻格那半边通常是表格默认的 0.26mm，于是「调细」输给邻格（看着没反应）、「去掉」回落默认（线还在），只有「调宽」看得见效果。所以写入一律走 `model.ts` 的 `writeBorderEdge(el, map, ref, side, edge)`，它同时写相邻格的对面边（合并格横跨多格时镜像到每一格）。
- **不变式从"渲染时解出同一个值"变成"写入时写成同一个值"** —— 原先那套 `resolveBorderEdge` / `resolveCellBorders` 已删除（`opposite` 留着给 `writeBorderEdge` 用）。
- **"删掉属性" ≠ "关掉这条边"**：删属性只是回落表格默认（仍然可见）。关边必须写**显式的 `{ style: "none", width: 0 }`**，且两侧同写。
- 边框面板是**批改器**（不是"先配笔再应用"）：显示的就是选区当前值，改任一项**立刻**重涂。目标集合是**"可见的边"**，不是"选区内所有格的所有边" —— 否则只想改外框线颜色时会把已清掉的内部线**复活**。混选时只写被改动的那一个属性，其余保留每条边自己的值（见 `TableCellProperties.vue` 的 `paintVisibleEdges` / `setEdgeProp`）。
- 侧边按钮是**选区外缘**语义（上 = 首行的上边），与「外框线」一致；激活态读 `ownBorderEdge`（含表格默认）而不是只看显式设置 —— 否则新建表格四边明明有线、按钮却全是未激活。

**三层编辑态**：`selectedId`（元素）→ `tableEditingId` + `cellRange`/`activeCell`（单元格）→ `cellEditing`（格内文本）。第 1 层手势必须给第 2 层让位 —— 但**靠 `ElementWrapper` 主动让位**（`tableEditing` 时不启动 move 手势、不渲染元素手柄），**不再靠表格内部 `stopPropagation`**（那会切断 document，见「事件冒泡与 reka 菜单关闭」一节）。

**第 2/3 层状态的消费必须过「表」的门禁（严重，踩过）**：`cellRange` / `activeCell` / `cellEditing` 是**全局单份 + 按坐标索引**的，本身**不含"哪张表"这个信息** —— 画布上两张 3×5 的表，坐标 (0,2) 会同时命中两边。所以每个消费点都要先确认「本表就是那张活动表」（即 `editing = tableEditingId === element.id`），**只比坐标一定错**。
- 已带门禁的：`selectionRect` / `activeRect` / `isColSelected`·`isRowSelected`（在 `v-if="editing"` 内）/ 单元格右键菜单上下文（`menuContext` 首行就比 `tableEditingId`）/ `ElementProperties.activeTable`（`activeTable` getter + 比对 selectedId）。
- 漏过的（已修）：`isEditingCell`、`editingKey`（focus 用的 watch）、`onCellBlur`、`onCellInput`。后果是连锁的 —— 编辑 A 表某格时 B 表同坐标的格子也渲染 textarea → 两个 textarea 在 watch 里互相抢焦点 → 先被聚焦的那个失焦触发 `onCellBlur`，坐标比对命中 → 把刚开好的 `cellEditing` 关掉。表现为**「画布上一有两个表格，双击就改不了字」**。
- 口诀：**凡是读第 2/3 层状态的 computed / handler，第一行先问「我是那张活动表吗」。**

**编辑态面板按粒度分两组（v9，老板纠正的）**：`ElementProperties` 在 `activeTable` 时渲染「表格」组（`TableProperties.vue` = `ElementLayoutSection` 位置&尺寸 + 整表行高/列宽）**和**「单元格」组（`TableCellProperties.vue` = 选区级：行高列宽/文本/对齐/边框/填充/合并）。早先是整个元素级面板被单元格面板**替换**掉（`v-if="activeTable"`），代价是编辑表格时连表宽、整表行高都改不了 —— 而"统一所有行高"恰恰是编辑表格时最想做的事。
- **改表格总宽/总高必须走 `updateElement`**（内部按几何不变量调 `scaleTracks` 等比缩放全部列宽/行高）；走 `updateTable` 会被随后的 `syncTableGeometry` 覆盖成 `Σ colWidths`/`Σ rowHeights`，表现为**"输入框改不动"**（静默失效）。整表行高/列宽反过来必须走 `updateTable`（要 `syncTableGeometry` 回算总尺寸）。
- `ElementLayoutSection.vue`（位置 & 尺寸）被**两个宿主复用**（非编辑态元素面板 + 编辑态「表格」组），内部自取 `store.getElement(store.selectedId)` 不传 props；两个宿主互斥渲染，所以 `id="element-x"` 那套不会重复。

**吸附基础设施已抽到 `designPanel/composables/useSnapTargets.ts`**（`snapTargets` / `snapAxis` / `snapEdge` / `MARGIN_SNAP_PX`），元素拖拽与表格拖分隔线共用。新增会吸附的手势请复用它，别另起一套手感。

**图片读取统一走 `src/lib/image.ts`（`readImageFile`）**：体积 5MB / 单边 4096px 的校验口径只能有一份，否则会出现"面板传不上去、右键却能传"。

**明确不做**：单元格内富文本（内容从 string 变文档树，模型与渲染要换骨架）；"溢出到相邻单元格"（数据一长就串列）。

**P0 未做的（别以为有）**：非连续选区、`atLeast` 行高撑高、双击自适应列宽、键盘导航、单元格剪贴板、跨页表头重复、斜线表头、格式刷。

**已知卡点**：跨页表头重复 + 允许断行依赖多页渲染能力，而项目目前没有多页渲染器（导出/打印仍是占位）。
