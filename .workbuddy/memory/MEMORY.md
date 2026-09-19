# vue-print 项目长期约定

## 怎么验证（重要）

- 只有三样：`npx vite` + `curl` 取转换后模块确认编译通过、`npx eslint`、人工静态核对代码。**不要擅自做浏览器自动化验证**（老板原话：只要保证编译通过和冒烟，做必要的正确性检查，不要额外的视觉校验）。`vue-tsc` 是坏的（`runTsc` MODULE_NOT_FOUND），没有类型检查兜底 —— 但这**不是**自己补浏览器测试的理由。
- **不要用 Playwright 装浏览器**：从没装成功过，曾反复重试三次以上（明确的错误示范）。真要验证交互，**先问老板**，别在后台悄悄起长耗时下载。
- 没能真机验证的交互，交付说明里**逐条列出需要老板手点哪条链路**。
- **交互异常（尤其拖拽）第一步先用 Chrome 无痕模式复现**排除扩展/缓存干扰 —— 实测过"普通模式一拖就卡死、无痕完全正常"，为此把好用的方案推翻重做了三次。

## reka-ui 与事件冒泡（架构级，改动前必读）

- reka 的"点外面关闭"挂在 **document 冒泡阶段**（`DismissableLayer` → `usePointerDownOutside`，无 capture）→ **元素内任何一处 `stopPropagation` 都会让它彻底失效**。所以**不要用 `@pointerdown.stop` 实现"别让画布根取消选中"**，改用**打标记 + 判落点**：元素根带 `data-design-element`，画布根 `closest()` 命中即放行。
  - **仍要保留 stop**：`GuideLines`、文本 textarea、各手势手柄 —— 它们拦的是**同一元素内的其它手势**，不是 document。
- **去掉 stop 的连带代价：父容器不能假设"事件到达我 = 落点在我身上"**。子元素的 pointerdown 会冒泡上来，父容器里"清理型"动作（清选区、退编辑）若无条件执行，就会在子元素刚设好状态后**下一行把它抹掉**（踩过：`onRootPointerDown` 无条件清选区 → "点单元格不出现蓝框"）。**规矩：父容器的清理动作一律先判落点**（表格用 `e.target === rootRef.value`，画布用 `closest("[data-design-element]")`）。
- `ContextMenu` 默认 `modal: true` → reka 给 body 设 `pointer-events:none`，菜单开着时下面元素全点不中 → **右键菜单必须 `:modal="false"`**。
- 关闭兜底 `ContextMenuAutoClose.ts` 哨兵（放进 `<ContextMenu>` 内）：公开导出 `injectContextMenuRootContext` 拿 `onOpenChange`，在 document **capture** 阶段监听左键；落点在 `[data-dismissable-layer]` 内就不关（保护菜单项自己的 click）。关闭只写状态 —— Vue 更新是异步的，不会吞掉这次点击。
- **焦点回填**：关闭 Content 类组件时 reka 走 FocusScope unmount 钩子 `emits("closeAutoFocus")`，trigger 不可聚焦则焦点掉到 body、顶掉刚聚焦的元素。解法 `@close-auto-focus` + `preventDefault()`（emits 同步，必先于回填），**不要**用 nextTick 延迟聚焦赌时序。

## 内联编辑（textarea 范式）

- 画布与单元格的文本编辑都用 **textarea 覆盖层**（老板拍板，别换回 contenteditable）：中文输入法不用自己写 composition 锁、粘贴天然纯文本、不跟 Vue 抢 DOM 所有权。编辑态放 Pinia（`editingId` 元素级 / `cellEditing` 格级），不做模块级单例。
- 三条实现约束：① `:value` 绑**组件内 draft ref**（恒等于 DOM 值 → Vue 必跳过 patch），`@input` 里同步写 store，中文合成期不被外部写入打断；② autosize 量高前临时塌 `auto`，量完**还原原值**（清空会把框永久塌成一行）；③ 容器 `select-none` 会继承进来，须补 `select-text`，并给 textarea `@pointerdown.stop`，否则拖选文字变成拖元素。
- `onBlur` 里先判"我还是当前编辑者"再退出：元素被移除时浏览器补的那次 blur 会掐掉刚开始的下一段编辑。
- **某条路径一旦 `preventDefault()`，那条路径就必须自己显式收编辑态，不能指望 blur** —— 焦点转移正是被拦掉的默认行为（同根因踩过两次：元素级文本编辑、表格 `onCellPointerDown`）。口诀：**这条交互 preventDefault 了吗？是 → 退出编辑必须显式写。**
- 不要在编辑态禁用属性面板的"内容"字段：禁用控件点不着 → textarea 不失焦 → 要点两次才生效。两条编辑路径靠"失焦即退出"天然互斥。

## 几何不变量与吸附

- **元素框中心就是旋转支点**（`ElementWrapper` 写死 `transformOrigin:center`）。凡**重算包围盒**的操作都会挪走支点，而"屏幕位移→局部位移"隐含"支点不动" → 旋转态必然漂移（θ=90° 实测漂 9mm）。解法：**先把已有 rotation 烘焙进纸张 mm 坐标**，算完写回、rotation 归 0。
- **line 的不变量：框 = 线段轴对齐包围盒**（两方向各兜 `ENDPOINT_MIN_THICKNESS = 4mm`，否则水平/垂直线框退化成 0 厚）；**line 只有 2 个端点手柄 + 旋转手柄，没有缩放手柄** —— 端点必然落在角/边中点、与缩放手柄几何重合，只能二选一（几何结论，不是偏好）。拖端点保持**端点身份**。
- **两套吸附语义绝不合并**：`snapAxis`（移动）= 两边都够线、整框平移；`snapEdge`（缩放、线条端点）= 只动被拖那条边、对边锁死（缩放套 `snapAxis` 会让对边跟着跑）。
- **缩放吸附只在 rotation ∈ {0°,180°} 生效**（容差 1e-3°，因旋转吸附产出浮点角）：非正交角上边与参考线不平行，且旋转态缩放本身就会漂。90°/270° 需换轴反解，明确不做。**线条端点不受此限**（全程在纸张 mm 空间）。
- **吸附与最小尺寸（1mm）冲突时整轴退回自由值并撤销该轴高亮**，别硬夹成 min。`Alt` = 临时取消吸附（**必须返回空 hits**，否则高亮残留）；`Shift` 留给将来等比缩放，别占用。容差统一 `MARGIN_SNAP_PX = 6` 屏幕 px。
- 三条手势共用 `useSnapFeedback.setSnapKeys` 一条高亮通道，渲染层不用改；`designPanel/composables/useSnapTargets.ts` 是共用底座。

## 数据所有权（严重，已踩两次）

**铁律：每个元素必须自持嵌套数据，绝不与别的元素或模块级常量共用引用。** 素材清单 `materials.ts` 的 `defaults` 是**模块级常量、全清单一份实例**（表格 `cells`/`colWidths`/`rowHeights`/`rowRoles`，线条 `start`/`end`/`stroke`）。

- `createElement` **必须**深拷贝：`cloneElementPayload` = `structuredClone(toRaw(v))`，失败退浅拷贝并警告。曾用 `{...partial}` 浅展开 → 拖两个表格出来"两份外壳、一份内脏"（A 表删行 B 表跟着少）。
- **更狠的连带后果**：`before1.cells === defaults.cells` → 改 A 表会**直接污染模块级模板**，之后拖出来的新表也带坏数据，刷新才好。
- `copyElement`/`pasteElement` 已用 `structuredClone(toRaw(...))`；`addElement` 是裸 `push`，契约是"入参必须自持数据"，新建一律走 `createElement`。
- 判断方法：凡是模块级常量/默认值对象进入 `elements` 都要过深拷贝。**不要用"看起来一样"解释串改 —— 现象是"两份数据是同一个对象"。**

## 工程习惯 / 环境坑

- 本地 curl 必须 `--noproxy '*'`（否则被系统代理拦成 502 / 000）；dev server 用 `run_in_background` 起、**用完立刻 TaskStop**；Windows 原生 curl **不要 `-o /tmp/xxx`**（不认 Git Bash 路径，静默写 0 字节，`size_download=0` 是假象）。
- **同一文件不要并行发多个 Edit**：实测竞态 —— 后一次写入会覆盖前一次的改动，前一个改动凭空消失（真丢过一次，只能重发）。
- **Tailwind v4 按需生成，类名写错 / 组件没被扫描到都是静默失效**。改完 class 要 `curl .../src/styles/index.css` grep 新类是否真生成（只 curl `.vue` 只能证明编译通过）。颜色一律用主题 token，别硬编码 hex。
- `designPanel/components/` 从下到上：`PaperGrid` → `ElementLayer` → `MarginGuides`（屏幕恒定 1px，整层 `pointer-events:none`）→ `GuideLines`（容器 none + 单条 auto）。视图/编辑开关放底部 `statusLine`，文档属性放右侧设置面板。实时刷动的数字读数必须**定宽 + tabular-nums**。
- **TypeScript 陷阱**：`Omit` 作用在联合类型上会先塌陷成公共字段再剔除，`content`/`fontSize` 这类专属字段被静默吃掉 → 用 distributive 写法 `T extends unknown ? Omit<T,K> : never`，写完要**人工核对**赋值处还认不认得专属字段。

## 拖拽（素材台 → 画布）

- 用 **HTML5 DnD**（`draggable`/`dragstart`/`dataTransfer`）—— 老板明确指定；曾擅自改成 `useDrag` 指针事件被判"偏离意图"。**老板指定了方案就在方案内解决坑，不要擅自换。**
- 三条硬规矩（违反会"一拖就卡死"）：① `dragstart` 只写 dataTransfer、**绝不碰响应式状态**（浏览器正在生成 drag image，Vue 同步改源元素样式会打架）；② 源卡片**不要 transform/opacity 过渡**，hover 只改颜色，图标文字加 `pointer-events:none`；③ `dragover` 必须 `preventDefault()` 且**不写状态**（每帧高频），`dragleave` 用 `e.relatedTarget` 判真离开（null = 拖出窗口）。
- `dataTransfer` 只传**素材 id**（最小载荷），drop 端回查清单；自定义 MIME + `text/plain` 双写，非素材 id 直接忽略。
- 落点用 `getBoundingClientRect()`（已含滚动与缩放）除以 `mmToPx(1)*scale` 得 mm，**不要再手工叠加 scroll 偏移**；元素以落点为中心放置。

## 表格

设计文档 `docs/table-feature-design.md`（**v12**，§9 是实现进度 + 各轮 bug 记录）。**动手前必读**。定位：数据驱动明细表（单据明细），第一期只做静态排版，数据绑定后续再做。

- **几何不变量（违反要返工）**：`width ≡ Σ colWidths`、`height ≡ Σ rowHeights`（元素 height 不是权威值）。拖行/列分隔线只改**相邻**两轨、元素框不动；拖元素手柄 / 面板改宽高则**等比缩放全部行列**（`updateElement` 里自动做，别在调用点各写一遍）。**插入列不改总宽**（新列借相邻列宽挂入 → `fitTracks` 整组等比缩回、兜 `MIN_TRACK` 下限），**但插入行照旧变高** —— 宽度是版面约束、高度是内容量，刻意不对称。**不要写成 `h-full` + 百分比分配行高**（接数据绑定时必须重写）。
- **写入口只有两个**：几何 / 普通字段走 `updateElement(id, patch)`；表格结构与单元格走 `updateTable(id, mutator)` —— 必须**整包替换**（逐格赋值触发 N 次响应式更新，拖分隔线会被拖垮），mutator 改完由它统一补字段、回算几何、收敛越界选区。**绝不用点路径 patch 写 `cells`**。
- **单位口径（v12，老板报"单元格边框默认是 0.98"）**：存储一律 mm，**线宽的 UI 一律用 px 表述**（`lib/utils` 的 `pxToMm`/`mmToPx`，1px = 25.4/96 mm ≈ 0.264583）。两条铁律：① **px 显示必须过 `roundPx`**（1 位小数，与 `roundPt` 对称）—— 不过就会把默认的 1px 显示成 `round2(0.9827) = 0.98`；**存储的 mm 绝不 round**（打印精度不能被显示层吃掉）。② **默认线宽是精确 1px**（`DEFAULT_BORDER_WIDTH = 25.4/96`，**不是**"约等于 1px"的 0.26）；`table/model.ts` 写字面量是有意的 —— 该模块要保持**零运行时依赖**（只用 `import type`），才能脱离 Vite 直接拿 Node 跑验证，改动时与 `MM_PER_PX` 一起改。
- **属性面板里"未设置"的数值字段要显示生效默认值，不是 0（v12）**：靠 `PropertyFieldConfig.fallback`（`displayValue` 里 `raw ?? field.fallback`）。否则 `cellStyle.borderWidth` 没设过时面板显示 0、渲染却走 `DEFAULT_BORDER_WIDTH`（用户看到"线宽 0"画面明明有线）。**fallback 只影响显示、不写回元素**（"没设过就是没设过"）。同类字段一并处理（`cellStyle.padding` → `DEFAULT_CELL_PADDING`）。
- **渲染用 `<table>`**（老板指定）：`table-layout: fixed` + 显式 `<colgroup>`；单元格内容层 `absolute inset-0` 且 td `position: relative` —— **内容层绝对定位是行高能精确的关键**（`<tr>` 的 height 本身是最小高度，td 里没有流内内容时它才成为精确值）。`colOffsets`/`rowOffsets` 前缀和仍要保留：选区框、活动格高亮、分隔线热区、行列把手都是**相对表格定位的浮层**。
- **选区不变量（v11，踩过）**：`cellRange` 是"当前选区"，**任何写入它的路径都必须先扩张到"包含完整合并格"**（`rangeOfPoint` → `expandRange`，迭代到不动点；`buildTableMap` 会把被覆盖坐标指回宿主格 ref，所以小格子起点也能扩出来）。只写 1×1 时合并格的选区背景只盖一角，而 `activeRect` 内部自己扩过 → 呈现"框是整格、蓝底只有一小块"。已修 `startCellEditing`、`moveActiveCell`；新增写 `cellRange`/`activeCell` 的入口都要带上。
- **改轨道尺寸三个语义，靠"总尺寸变不变"划清**（别混用）：`resizeTrackPair` 相邻两轨让位（不变）、`distributeTracks` 选区内等分现有总长（不变）、`setAllTracks` 每条改成 value（= 数量 × value；要挡 `null/undefined/NaN`，否则清空输入框会把全表夹成 `MIN_TRACK`）。整表批量控件在**「表格」级分组**（`TableProperties.vue`，不依赖选区）；第三条路径是元素级"高度" / 拖手柄 → `updateElement` 对表格走 `scaleTracks` 等比缩放。
- **编辑态面板按粒度分两组**（v9，老板纠正）：`ElementProperties` 在 `activeTable` 时渲染「表格」组（`TableProperties.vue`）+「单元格」组（`TableCellProperties.vue`）；早先整个面板被单元格面板**替换**掉，导致编辑表格时连表宽、整表行高都改不了。**改表格总宽/总高必须走 `updateElement`**（内部 `scaleTracks`），走 `updateTable` 会被 `syncTableGeometry` 拿 Σ 覆盖 → 表现为"输入框改不动"（静默失效）；整表行高/列宽反过来必须走 `updateTable`。`ElementLayoutSection.vue` 被两个宿主复用，内部自取 `store.getElement(store.selectedId)`，两宿主互斥渲染所以 `id` 不会重复。
- **行列把手带 Excel 式标号（v10）**：上方把手 `colLabel(index)`、左侧 `index + 1`；`HANDLE_SIZE_PX = 18`（**屏幕 px**，不乘 `pxPerMm`）。`colLabel` **唯一实现在 `table/model.ts`**（0→A…25→Z、26→AA，**不是 base-26**），面板选区信息条与画布把手共用。选中态深蓝底 `bg-primary/60` 上文字要换 `text-primary-foreground`。把手只在编辑态出现（非编辑态让位给元素级缩放手柄）。
- **合并用 `covered` 标记保留格**：`cells[r*cols+c]` 恒等于网格坐标，渲染时跳过被覆盖的格，合并只保留左上内容。插入/删除行列前先 `expandMergesCrossing` 拆开跨线合并格，否则网格静默错位。
- **边框写入必须"两格同写"（严重，踩过）**：共享边几何上是**一条线**（`(r,c).bottom ≡ (r+1,c).top`），渲染交给 `border-collapse` 合并。**只写自己那半边会静默失效** —— CSS 裁决**更宽者胜**，邻格那半边是默认 0.26mm，于是「调细」输给邻格（没反应）、「去掉」回落默认（线还在），只有「调宽」看得见。写入一律走 `writeBorderEdge(el, map, ref, side, edge)`（同时写相邻格对面边，合并格镜像到每一格）。不变式从"渲染时解出同一个值"变成"写入时写成同一个值"（`resolveBorderEdge`/`resolveCellBorders` 已删，`opposite` 留着）。
  - **"删掉属性" ≠ "关掉这条边"**：删属性只回落表格默认（仍可见），关边必须写**显式 `{ style: "none", width: 0 }`**，且两侧同写。
  - 面板是**批改器**而非"先配笔再应用"：显示当前值，改任一项**立刻**重涂；目标集合是**"可见的边"**（否则只想改外框颜色会把已清掉的内部线**复活**）；混选时只写被改动的那一个属性。侧边按钮是**选区外缘**语义（上 = 首行的上边），激活态读 `ownBorderEdge`（含表格默认），否则新表四边有线、按钮却全未激活。
- **三层编辑态**：`selectedId`（元素）→ `tableEditingId` + `cellRange`/`activeCell`（选区）→ `cellEditing`（格内文本）。第 1 层手势靠 `ElementWrapper` **主动让位**（`tableEditing` 时不启动 move 手势、不渲染元素手柄），不再靠表格内部 `stopPropagation`。
- **第 2/3 层状态的消费必须过「表」的门禁（严重，踩过）**：`cellRange`/`activeCell`/`cellEditing` 是**全局单份 + 按坐标索引**，不含"哪张表" —— 两张 3×5 的表坐标 (0,2) 会同时命中。每个消费点先确认 `editing = tableEditingId === element.id`，**只比坐标一定错**。已带门禁：`selectionRect`/`activeRect`/`isColSelected`·`isRowSelected`/单元格右键上下文/`ElementProperties.activeTable`；漏过已修：`isEditingCell`、`editingKey`、`onCellBlur`、`onCellInput`（后果：两表同坐标互抢焦点 →"有两个表格就双击改不了字"）。口诀：**凡读第 2/3 层状态的 computed / handler，第一行先问"我是那张活动表吗"。**
- 图片读取统一走 `src/lib/image.ts`（`readImageFile`）：5MB / 单边 4096px 的口径只能有一份。
- **明确不做**：单元格内富文本（内容从 string 变文档树，模型与渲染要换骨架）、"溢出到相邻单元格"（数据一长就串列）。
- **未做**（别以为有）：非连续选区、`atLeast` 行高撑高、双击自适应列宽、键盘导航、单元格剪贴板、跨页表头重复、斜线表头、格式刷、清除格式、自动调整、条码/二维码。**已知卡点**：跨页表头 + 允许断行依赖多页渲染，而项目目前没有多页渲染器（导出/打印仍是占位）。
