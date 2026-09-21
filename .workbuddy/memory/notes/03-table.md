# 表格（最复杂的一块，动手前必读）

设计文档 `docs/table-feature-design.md`（**v12**，§9 是实现进度 + 各轮 bug 记录）。定位：数据驱动明细表（单据明细），第一期只做静态排版，数据绑定见 `docs/data-binding-design.md`。

## 几何不变量（违反要返工）

- `width ≡ Σ colWidths`、`height ≡ Σ rowHeights`（**元素 height 不是权威值**）。拖行/列分隔线只改**相邻**两轨、元素框不动；拖元素手柄 / 面板改宽高则**等比缩放全部行列**（`updateElement` 里自动做，别在调用点各写一遍）。
- **插入列不改总宽**（新列借相邻列宽挂入 → `fitTracks` 整组等比缩回、兜 `MIN_TRACK` 下限），**但插入行照旧变高** —— 宽度是版面约束、高度是内容量，刻意不对称。
- **不要写成 `h-full` + 百分比分配行高**（接数据绑定时必须重写）。

## 写入口只有两个

- 几何 / 普通字段走 `updateElement(id, patch)`；表格结构与单元格走 `updateTable(id, mutator)` —— 必须**整包替换**（逐格赋值触发 N 次响应式更新，拖分隔线会被拖垮），mutator 改完由它统一补字段、回算几何、收敛越界选区。**绝不用点路径 patch 写 `cells`**。
- **改表格总宽/总高必须走 `updateElement`**（内部 `scaleTracks`），走 `updateTable` 会被 `syncTableGeometry` 拿 Σ 覆盖 → 表现为"输入框改不动"（静默失效）；**整表行高/列宽反过来必须走 `updateTable`**。

## 单位口径（v12，老板报"单元格边框默认是 0.98"）

- 存储一律 mm，**线宽的 UI 一律用 px 表述**（`lib/utils` 的 `pxToMm`/`mmToPx`，1px = 25.4/96 mm ≈ 0.264583）。两条铁律：① **px 显示必须过 `roundPx`**（1 位小数，与 `roundPt` 对称）—— 不过就会把默认的 1px 显示成 `round2(0.9827) = 0.98`；**存储的 mm 绝不 round**（打印精度不能被显示层吃掉）。② **默认线宽是精确 1px**（`DEFAULT_BORDER_WIDTH = 25.4/96`，**不是**"约等于 1px"的 0.26）；`table/model.ts` 写字面量是有意的 —— 该模块要保持**零运行时依赖**（只用 `import type`），才能脱离 Vite 直接拿 Node 跑验证，改动时与 `MM_PER_PX` 一起改。
- **属性面板里"未设置"的数值字段要显示生效默认值，不是 0（v12）**：靠 `PropertyFieldConfig.fallback`（`displayValue` 里 `raw ?? field.fallback`）。否则 `cellStyle.borderWidth` 没设过时面板显示 0、渲染却走 `DEFAULT_BORDER_WIDTH`（用户看到"线宽 0"画面明明有线）。**fallback 只影响显示、不写回元素**（"没设过就是没设过"）。同类字段一并处理（`cellStyle.padding` → `DEFAULT_CELL_PADDING`）。

## 渲染

**用 `<table>`**（老板指定）：`table-layout: fixed` + 显式 `<colgroup>`；单元格内容层 `absolute inset-0` 且 td `position: relative` —— **内容层绝对定位是行高能精确的关键**（`<tr>` 的 height 本身是最小高度，td 里没有流内内容时它才成为精确值）。`colOffsets`/`rowOffsets` 前缀和仍要保留：选区框、活动格高亮、分隔线热区、行列把手都是**相对表格定位的浮层**。

## 选区不变量（v11，踩过）

`cellRange` 是"当前选区"，**任何写入它的路径都必须先扩张到"包含完整合并格"**（`rangeOfPoint` → `expandRange`，迭代到不动点；`buildTableMap` 会把被覆盖坐标指回宿主格 ref，所以小格子起点也能扩出来）。只写 1×1 时合并格的选区背景只盖一角，而 `activeRect` 内部自己扩过 → 呈现"框是整格、蓝底只有一小块"。已修 `startCellEditing`、`moveActiveCell`；新增写 `cellRange`/`activeCell` 的入口都要带上。

## 改轨道尺寸三个语义（靠"总尺寸变不变"划清，别混用）

`resizeTrackPair` 相邻两轨让位（不变）、`distributeTracks` 选区内等分现有总长（不变）、`setAllTracks` 每条改成 value（= 数量 × value；要挡 `null/undefined/NaN`，否则清空输入框会把全表夹成 `MIN_TRACK`）。
整表批量控件在**「表格」级分组**（`TableProperties.vue`，不依赖选区）；第三条路径是元素级"高度" / 拖手柄 → `updateElement` 对表格走 `scaleTracks` 等比缩放。

## 编辑态面板按粒度分两组（v9，老板纠正）

`ElementProperties` 在 `activeTable` 时渲染「表格」组（`TableProperties.vue`）+「单元格」组（`TableCellProperties.vue`）；早先整个面板被单元格面板**替换**掉，导致编辑表格时连表宽、整表行高都改不了。`ElementLayoutSection.vue` 被两个宿主复用，内部自取 `store.getElement(store.selectedId)`，两宿主互斥渲染所以 `id` 不会重复。

## 行列把手带 Excel 式标号（v10）

上方把手 `colLabel(index)`、左侧 `index + 1`；`HANDLE_SIZE_PX = 18`（**屏幕 px**，不乘 `pxPerMm`）。`colLabel` **唯一实现在 `table/model.ts`**（0→A…25→Z、26→AA，**不是 base-26**），面板选区信息条与画布把手共用。选中态深蓝底 `bg-primary/60` 上文字要换 `text-primary-foreground`。把手只在编辑态出现（非编辑态让位给元素级缩放手柄）。

## 合并用 `covered` 标记保留格

`cells[r*cols+c]` 恒等于网格坐标，渲染时跳过被覆盖的格，合并只保留左上内容。插入/删除行列前先 `expandMergesCrossing` 拆开跨线合并格，否则网格静默错位。

## 边框写入必须"两格同写"（严重，踩过）

共享边几何上是**一条线**（`(r,c).bottom ≡ (r+1,c).top`），渲染交给 `border-collapse` 合并。**只写自己那半边会静默失效** —— CSS 裁决**更宽者胜**，邻格那半边是默认 0.26mm，于是「调细」输给邻格（没反应）、「去掉」回落默认（线还在），只有「调宽」看得见。写入一律走 `writeBorderEdge(el, map, ref, side, edge)`（同时写相邻格对面边，合并格镜像到每一格）。不变式从"渲染时解出同一个值"变成"写入时写成同一个值"（`resolveBorderEdge`/`resolveCellBorders` 已删，`opposite` 留着）。

- **"删掉属性" ≠ "关掉这条边"**：删属性只回落表格默认（仍可见），关边必须写**显式 `{ style: "none", width: 0 }`**，且两侧同写。
- 面板是**批改器**而非"先配笔再应用"：显示当前值，改任一项**立刻**重涂；目标集合是**"可见的边"**（否则只想改外框颜色会把已清掉的内部线**复活**）；混选时只写被改动的那一个属性。侧边按钮是**选区外缘**语义（上 = 首行的上边），激活态读 `ownBorderEdge`（含表格默认），否则新表四边有线、按钮却全未激活。

## 三层编辑态与"哪张表"门禁

`selectedId`（元素）→ `tableEditingId` + `cellRange`/`activeCell`（选区）→ `cellEditing`（格内文本）。第 1 层手势靠 `ElementWrapper` **主动让位**（`tableEditing` 时不启动 move 手势、不渲染元素手柄），不再靠表格内部 `stopPropagation`。

**第 2/3 层状态的消费必须过「表」的门禁（严重，踩过）**：`cellRange`/`activeCell`/`cellEditing` 是**全局单份 + 按坐标索引**，不含"哪张表" —— 两张 3×5 的表坐标 (0,2) 会同时命中。每个消费点先确认 `editing = tableEditingId === element.id`，**只比坐标一定错**。已带门禁：`selectionRect`/`activeRect`/`isColSelected`·`isRowSelected`/单元格右键上下文/`ElementProperties.activeTable`；漏过已修：`isEditingCell`、`editingKey`、`onCellBlur`、`onCellInput`（后果：两表同坐标互抢焦点 →"有两个表格就双击改不了字"）。口诀：**凡读第 2/3 层状态的 computed / handler，第一行先问"我是那张活动表吗"。**

## 数据绑定的表格侧不变量（2026-09-20 落地）

- **画布只渲染模板网格，不做任何数据扩展**（2026-09-20 拆掉明细行机制后的状态）。此前会按记录数把"明细模板行"复制 N 份，代价是 `rowOffsets` 只认模板行、DOM 里多出的行会让分隔线热区与行把手指错行，当时靠"只在非编辑态扩展"绕开。现在扩展整块移除，表格几何不再有编辑态特例。
- **扩展出来的预览行是只读的**：`preview: true` 的行必须挡在 `onCellPointerDown` / `onCellDblClick` / `onCellContextMenu` 之前。它的网格坐标指向模板行，一落就会"点第 4 行、选中的却是第 2 行"。
- **`v-for` 的 key 不能用 `r`**：同一网格行会复制多份，用 `r${r}-d${i}`。
- **渲染值与编辑值必须分开**：`CellView.display` 是过 `renderTemplate` 后的显示文本，**编辑态 textarea 读的仍是 `content.value` 原文** —— 否则双击进编辑看到的是"值"不是占位符，一改就把绑定冲掉了。元素级 textarea 同理（`TextElement.vue`）。
- **字段拖入单元格**：`dragover` 只在自己关心的 MIME（`FIELD_MIME`）上 `preventDefault()` —— 无条件 prevent 会抢走素材拖拽的落点（"把文本素材拖到表格上"会变成"往单元格塞字"），且**不写任何响应式状态**（每帧高频）。落点换算要**把预览行折算回模板行**：`rowOffsets` 里没有预览行，直接按 mm 查前缀和会让"落在第 4 行"变成"落在最后一行"。
- 表格绑定统一读 `binding.dataSetId`（**没有**单独的 `dataSetId` 字段）；`columnFields` 只是"这列绑了谁"的**声明**，真正填值仍靠单元格里的 `{字段}` —— 刻意不引入"改列映射就自动改写单元格"的第二条隐式写入路径。

## 其他

- 图片读取统一走 `src/lib/image.ts`（`readImageFile`）：5MB / 单边 4096px 的口径只能有一份。
- **明确不做**：单元格内富文本（内容从 string 变文档树，模型与渲染要换骨架）、"溢出到相邻单元格"（数据一长就串列）。
- **未做**（别以为有）：非连续选区、`atLeast` 行高撑高、双击自适应列宽、键盘导航、单元格剪贴板、跨页表头重复、斜线表头、格式刷、清除格式、自动调整、条码/二维码。**已知卡点**：跨页表头 + 允许断行依赖多页渲染，而项目目前没有多页渲染器（导出/打印仍是占位）。
