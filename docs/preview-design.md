# 预览与自动分页设计（计划书 v1）

> 前置阅读：`docs/data-binding-design.md`（三层数据模型 + §6.7「设计态只显示占位符」口径）、
> `docs/table-feature-design.md`（表格几何不变量）。
> 本文档状态：**设计稿 + §12 实现进度（P0+P1 已落地）**。§10 是老板已拍板的清单。

---

## 0. 结论先行（9 条）

1. **预览态是「渲染态」的第一站**，它要同时回答两个问题：**值是什么**（占位符 → 真值）、
   **落在哪一页**（内容 → 页）。这两件事正交，文档里也分成「取数层」与「分页层」两块。

2. **自动分页的真实触发源只有一个：表格明细行按数据行数生长。**
   设计态画布是**单张纸**（`paper.widthMm × heightMm`，元素坐标是绝对 mm），
   元素固定不动 ⇒ 普通元素"超出纸张"在设计态**当场就看得见**（会被裁掉），
   不需要一个分页器来替用户发现。
   真正"设计态看不见、只有取数后才知道"的，只有**行数由数据决定**的那一类内容。
   → **「自动分页」与「表格明细行扩展」是同一件事的两半，只做一半等于没做**（§10 第 1 条）。

3. **分页采用「绝对坐标 + 跨界顺延」，刻意不做流式重排。**
   元素在设计态排在哪，预览里就在哪；**唯一会移动的情况是"这一块跨了页边界放不下"**，
   那时整块顺延到下一页。理由是本项目的底线：**设计态排好的版，预览/打印必须一模一样**。
   流式重排（Word 那种"内容自动往上挤"）会让同一个元素在两处位置不同，
   而"预览里看着对、打出来错位"正是这类模型的经典故障。

4. **分页是纯函数，不做 DOM 测量。** 输入「纸张 + 页边距 + 元素几何 + 数据行数」，
   输出「每页有哪些块、各自在页内什么位置」。好处：结果可预测（不受字体加载/图片加载时序影响）、
   无闪烁（不需要"先渲染再量再重排"）、可复用（打印、导出、将来的服务端渲染都调它）。
   代价明确接受：**文本溢出元素框时按框裁切** —— 这与设计态所见完全一致。

5. **两个"只存不消费"的开关必须在轮内了结。** `repeatOnEachPage`（每页重复）与
   `printable`（是否打印）**已经暴露在属性面板上**（`setting/element/ElementProperties.vue`
   第 178–201 行的「数据 & 行为」分组），但渲染链路**零处读取**（全仓 grep 只有面板与类型定义）。
   按 `data-binding-design.md` §11.16 定下的判据 ——「会不会让用户以为某件事生效了？会 → 删」——
   它们现在正属于该删的那一类。预览是它们的第一个真实消费者：**要么本轮让它们生效，要么从面板上摘掉。**

6. **预览不复用设计态元素组件。** `designPanel/components/elements/` 下的四个组件带拖拽、
   内联编辑、右键菜单、缩放手柄、字段 drop；`TableElement.vue` 有 927 行，其中大部分是交互。
   给它们加 `mode: "design" | "preview"` 会把两套逻辑绞在一起，而设计态是**绝对不能被回归**的部分。
   → 新写一层"纯渲染"组件；但**算 CSS 的那部分必须抽成共享纯函数**，两边都调它（§5.2）。

7. **预览取全量数据，绝不复用 `dataBinding.run()`。** 那个方法会把结果写进 `state.samples`
   （设计态样本，20 行）。预览可能取回 5000 行，覆盖上去等于**用打印数据污染设计态的样本**
   —— 之后面板里看到的"前 20 行"就不再是测试结果了。预览自己存一份运行数据（§4.1）。

8. **缺值一律渲染空白，但必须给警告条。** 预览是"打印所见"，所以
   `onMissing: "blank"`（`renderTemplate` 的既有开关）；同时把**所有没取到值的占位符
   汇总成一条可见清单**（元素名 + 占位符原文 + 原因）。这一条是刻意的组合：
   空白对打印正确，清单对排查正确 —— 单独给任何一个都会出问题
   （留原文会打错纸，纯空白会让人以为绑定坏了）。

9. **页码系统变量本轮就能做，成本极低。** `context.ts` 的 `systemVariables()` 已经支持
   `pageIndex` / `pageCount`（`SysVarName` 里已有），`renderTemplate` 已支持 `{$page.index}`。
   分页器算出总页数后逐页注入即可。属于"顺手就让一个既有声明真正生效"的事。

---

## 1. 现状盘点

### 1.1 已经有了什么

| 能力 | 落点 | 状态 |
|---|---|---|
| 数据集 / 数据源 / 测试解析 | `data/` 目录、`store/modules/dataBinding.ts`、`api/dataset.ts` | ✅ 已落地 |
| 取全量数据的接口 | `api/dataset.ts` 的 `runDataSet(payload)`、store 的 `run(id, params)` | ✅ 已存在，**预览直接可用** |
| 占位符渲染 | `lib/template.ts` 的 `renderTemplate` | ✅ 已实现，**零调用点**（等预览来接） |
| 取值上下文 | `data/context.ts` 的 `buildRowContext` / `systemVariables` / `applyFieldFormat` | ✅ 已实现，**零调用点** |
| 元素绑定 | `element.binding.dataSetId` + `data/useDataBinding.ts` | ✅ 已落地 |
| 每页重复 / 是否打印 | `BaseElement.repeatOnEachPage` / `printable` + 面板开关 | ⚠️ **有 UI、零消费**（§0 第 5 条） |
| 允许跨页断开 | `TableElement.allowBreakAcrossPages` | ⚠️ **无 UI、零消费** |
| 预览按钮 | `header/index.vue` 第 53 行 | ⚠️ 纯占位，无 `@click` |

**一句话**：数据侧和渲染侧的两条腿都造好了，中间**缺的就是"谁来消费它们"** —— 也就是预览。
`renderTemplate` / `buildRowContext` / `repeatOnEachPage` / `printable` 这几个"零消费方"的东西，
在本文档里全部有了归宿。这正是 `data-binding-design.md` §11.16 说的"接缝不是遗漏"。

### 1.2 缺什么

1. **没有多页概念**：画布只有一张纸，`elements` 的 y 坐标超出纸张就被裁掉，没有任何"第 N 页"的存在。
2. **没有渲染态入口**：`renderTemplate` 一处都没被调用。
3. **没有明细行声明**：表格与数据绑定唯一的交点是 `binding.dataSetId`，没有"哪一行是明细模板行"
   （`detailRowIndex` / `headerRows` / `columnFields` 已在 §11.12 / §11.14 / §11.16 三次删除）。
4. **没有"整页平移"的坐标换算**：现有所有几何都是"相对纸张左上角"的单页坐标系。

---

## 2. 三层职责（这张图是本文档的骨架）

```
┌─ 取数层 ────────────────────────────────────────────────┐
│  预览打开 → 收集被引用的 dataSetId → runDataSet（全量）  │
│  → store/modules/preview.ts：rowsById / errors / 状态     │
│  失败不阻塞：哪一个失败就记哪一个，页面照常渲染 + 警告条   │
└──────────────────────────────────────────────────────────┘
                          ↓ 数据
┌─ 布局层（分页引擎，纯函数）───────────────────────────────┐
│  ① expand.ts   ：元素 + 行数据 → FlowItem[]（表格展开成行）│
│  ② paginate.ts ：FlowItem[] + 纸张 → LayoutPage[]          │
│  输出：每页有哪些块、块在页内的 mm 坐标、页码/总页数        │
└──────────────────────────────────────────────────────────┘
                          ↓ 版式
┌─ 渲染层 ─────────────────────────────────────────────────┐
│  PreviewCanvas：多页垂直堆叠 + 缩放 + 工具栏 + 警告条      │
│  PreviewPage  ：单页（纸张 + 页内绝对定位的渲染元素）      │
│  render/*.vue ：Text / Image / Line / Table 的纯渲染组件   │
│  → 调 renderTemplate(value, ctx)，ctx 由 buildRowContext  │
└──────────────────────────────────────────────────────────┘
```

**分层的判据**：布局层**不 import Vue**，也**不 import store**。
它只认识"纸张、边距、元素几何、数据行数"这四个东西。
这条约束的价值在于：分页结果可以被单元测试直接验（拿 Node 跑纯函数），
将来做导出 / 服务端打印时**原样搬过去**，不用重写一遍。

---

## 3. 分页引擎

### 3.1 坐标与"页窗口"

沿用项目的既有坐标系：**元素 (x, y) 是相对纸张左上角的绝对 mm**。

派生量（全部来自 `design` store 的 `paper` / `marginMm`）：

```
s = marginMm.top                       // 内容区顶（纸内绝对 y，mm）
H = paper.heightMm - marginMm.top - marginMm.bottom   // 内容区高
页 p（0 起）的"设计坐标窗口" = [ s + p*H , s + (p+1)*H ]
页内绝对位置 u = y - p*H                // p = 0 时 u ≡ y ⟹ 第 1 页与设计态逐像素一致
```

**两个刻意的决定**：

1. **第 1 页 ≡ 设计态**。`u = y - 0*H = y`，不做任何偏移。于是"设计里什么样，预览第一页就是什么样"
   是一条算术恒等式，而不是靠实现小心翼翼维护出来的。
2. **`margin.top` / `margin.bottom` 每页只出现一次**，不是页页叠加。
   页窗口按 `H` 平移即得，不必为每页单独算上下边距。

### 3.2 元素分类

| 类别 | 判据 | 分页行为 |
|---|---|---|
| **不输出** | `printable === false` | 预览**不渲染**（文案写的是"关闭后仅在编辑画布中保留"），列入提示条 |
| **每页重复** | `repeatOnEachPage === true` | **不参与流式分页**；**页内位置 = 设计态坐标原样**（`u = y`，x 不变），每页画一次 |
| **流式块** | 其余 | 参与分页（§3.4） |

**每页重复元素为什么用"原样坐标"**：页眉/页脚的需求是"每页同一位置出现同一内容"。
直接复用设计坐标（`u = y`）就得到了这个语义 —— 用户在纸上 280mm 处放了页码，
每页的 280mm 处都会出现它。若改成"相对内容区顶偏移"，反而要用户自己算
`280 - margin.top`，还要在换了纸张尺寸后重算。**少一层换算就少一类错**。

**两种锚定（2026-09-22，判据 = 与流式内容的相对位置）**：只有"原样坐标"一种语义
覆盖不了真实版式 —— 标题放表格上方设每页重复（期望每页都在表格上方），
页脚表格放数据表格下方也设每页重复（期望每页都贴底）。分页器按重复元素与
流式内容的相对位置自动分两种：

- **页眉式**（完全在所有流式内容之上）：每页按**设计坐标**画；
  顺延页（p > 0）的内容起点 `f0` 让到它底部之下 —— 不让位的话第 2 页内容
  从页顶重排会压过它。**f0 只约束 p > 0**：「第 1 页 ≡ 设计态」恒等式不动；
  只统计与内容窗口相交的区间（整个在上边距区的不占内容区）。
- **页脚式**（上方有流式内容）：每页**贴内容区底**画（y = s + H - height）；
  内容流每页的可用底 `bottomLimit` 抬到它顶部 —— **对每一页生效（含第 1 页）**，
  这样数据表格跨页时每页都是「标题顶 / 内容中 / 页脚表格底」的一致版式。
  无流式内容时不分页眉/页脚，全按设计坐标。

可用区随之缩成 `[f0, bottomLimit]`。块/明细行比它还高（但比整页矮）时，
按"超高"同一口径**就地放 + 裁切告警**，绝不顺延空转甩到第 500 页。
页脚元素比内容区还高属于病态用法：不抬高可用底（否则为负、全部内容爆页），
落位退回设计坐标。

⚠️ 若 repeat 元素的 y 超出纸张范围，它每页都会被裁 —— 列入警告条，不静默。

### 3.3 排序

两个顺序，别混：

- **流序（分页用）**：按 `y` 升序 → `zIndex` 升序 → 数组下标（稳定）。
  决定"谁先占到页面空间"。
- **绘序（渲染用）**：按 `zIndex` 升序（复用 `design.sortedElements` 的既有规则）。
  决定"谁盖住谁"。

自由画布允许元素重叠（水印、盖章、叠字），**所以分页时绝不因为"位置重叠"去移动元素**
—— 只有"页内放不下"才移动（§3.4 的 `while` 循环是唯一的移动来源）。

### 3.4 放置算法

对每一个流式块（块高 `h`）：

```ts
let F = el.y - s;                       // 流坐标（相对内容区顶）
let p = F < 0 ? 0 : Math.floor(F / H);  // 自然页；y 落在页边距内时归第 1 页
let f = F - p * H;                      // 页内相对内容区顶的偏移

// y 在页边距内（F < 0）是用户故意画在那儿的，第 1 页不纠正；跨页顺延后才钳到 0
if (p > 0 && f < 0) f = 0;

if (h <= H) {
  while (f + h > H + EPS) {             // 页内放不下 → 顺延下一页
    p += 1;
    f = Math.max(0, F - p * H);
    if (p > MAX_PAGES) { warn("页数超出上限"); break; }
  }
} else {
  warn(`元素「${name}」高 ${h}mm，超过整页内容区 ${H}mm，已按页裁切`);
}

place(el, { page: p, u: s + f, x: el.x });   // u = 页内绝对 y
```

**这段代码的四条语义**：

1. **不重叠不移动**：只要 `f + h <= H`，`f` 原样保留 —— 与设计态完全一致。
2. **顺延只发生在跨界时**，且顺延后钳到内容区顶部（`f = 0`）而不是跑进上边距。
3. **不对后续元素做"连锁下推"**：A 顺延了，后面的 B 仍按自己的绝对坐标放置。
   理由 —— 连锁下推是流式布局的第一步，一旦引入，"设计态位置 = 预览位置"就不成立了（§0 第 3 条）。
   代价是**顺延可能在页底留下空洞**，这是明确接受的行为，会在警告条里说明。
4. **比整页还高的块**：无法避免裁切，放当前页 + 告警（绝不静默裁切）。

### 3.5 表格的行内分页

表格是唯一**可拆**的块。它的展开与拆分（§3.6）产出"行序列"，分页时按行累加：

```
可用高度 R = H - f
若表格总高 <= R            → 整表放本页（不拆）
否则若 allowBreakAcrossPages === false → 整表顺延下一页（§3.4 的 while）
否则                        → 逐行累加：
    本页放得下的完整行 → 第一片
    剩余行 → 下一页 f=0 继续，直到放完
    ⚠️ 单行高 > R 时至少放 1 行，否则死循环；该行被裁 + 告警
```

**表头重复**：声明了 `headerRows`（前 N 行是表头）时，**每一片**的头部都重画这 N 行。
第一片本身就含表头（它是行序列的开头），所以第一片不额外插。
`TableElement.vue` 里那段"用真 `<table>` + `<thead>` 拿浏览器原生分页"的注释讲的是**打印**路径；
预览是我们自己排版，用 `<table>` 还是 div 网格都可以 —— 建议仍用 `<table>`，
这样预览与打印（将来）结构一致，CSS 能共享。

**`allowBreakAcrossPages` 的语义**本轮定死为：**"这张表允许被分页切开吗"**。
它现在没有任何 UI 入口 —— 要么给它加一个开关（属性面板表格分组），要么删掉。
建议加（成本一行开关），因为"小表格不想被劈成两页"是真实需求。

### 3.6 表格明细行扩展（自动分页的另一半）

这是**本轮最大的拍板项**（§10 第 1 条）。若老板决定做，形状如下。

**声明字段（重建 §11.16 删掉的那一套，但只重建必要的三个）**：

```ts
// TableElement 增补
detailRowIndex?: number;            // 哪一行是明细模板行（0 起）；undefined = 整表静态
headerRows?: number;                // 前 N 行是表头，不展开、每片重复
columnFields?: (string | null)[];   // 长度 = cols；空格子取该列的字段值（兜底）
```

**展开规则**（`expand.ts`，纯函数）：

```
行序列 = [0 .. detailRowIndex-1]                 // 表头区：取第 1 条记录渲值
       + [detailRowIndex 重复 N 次]              // 明细区：第 i 次取第 i 条记录
       + [detailRowIndex+1 .. rows-1]            // 尾行（合计等）：取第 1 条记录渲值
```

- `N` = 数据集行数（首期为全部，`detailRowsPerPage` 属套打，见 §9）。
- `N === 0` 时按 `dataset.options.onEmpty` 处理：`keepTemplate` → 保留 1 行模板内容；
  `blank` → 0 行。
- 明细行高度用**模板行的 `rowHeight`**（首期不做行高自适应）。
- 每行的取值上下文：明细行 = `buildRowContext(rows[i], { dataSetName, fields, sys })`；
  非明细行 = 第 1 条记录（与画布上单值元素的规则一致，`data-binding-design.md` §6.5 第 1 条）。
- 每行内每一格：**有内容（含占位符）→ `renderTemplate` 渲值**；
  **空格 且 `columnFields[c]` 有值 → 取该字段**；都没有 → 空。
  （这就是 §11.15 里论证过的"列 → 字段"与"行 → 记录"两个映射同时成立才成立，
  当时因为只恢复了一半而被推翻；这次两半一起做。**列映射只兜底空格，绝不回写单元格内容**。）

**为什么这次不会重蹈 §11.16 的覆辙**：

§11.16 推翻它的理由是"改了画布上看不见、只有面板预览里看得见 ⇒ 它不属于设计态"。
这次的区别是**它服务于渲染态（预览/打印），本来就该在画布外发生** ——
而设计态需要给的只是**一处轻量可见反馈**：表格处于编辑态时，
在明细行行号槽里加一个小标记（`≡ ×N` 或实心点）+ 右侧面板显示"明细行：第 3 行"。
**不进单元格、不改字宽**（`data-binding-design.md` §1.5 约束 2 点名不许给占位符加视觉标记，
这条对明细行标记同样适用：它只能出现在**行号槽**这种本来就不承载内容的位置）。

### 3.7 页码变量与"两阶段"

**元素几何不依赖内容**（框是固定尺寸），所以分页**只需算一遍**：

```
阶段 1：分页 → pages.length = 总页数
阶段 2：逐页渲染，注入 sys = { ...systemVariables(), pageIndex: p + 1, pageCount: pages.length }
```

`renderTemplate` 里 `{$page.index}` → `ctx.getSys("pageIndex")`；
`systemVariables()` 已经能把 `pageIndex` / `pageCount` 透出来（`SysVarName` 已含这两项）。
**零新增渲染逻辑**，只是把已有的两个值真的填进去。

> ⚠️ **将来做"行高自适应"（`atLeast` / `auto`）时，这个单向流程会破** ——
> 那时元素高度取决于渲染结果，必须先测量再分页（两阶段变两遍）。本轮不做，
> 但要在 `paginate.ts` 顶部写一句注释，免得下一个人以为可以随便加 auto。

### 3.8 上限与告警

| 常量 | 值 | 作用 |
|---|---|---|
| `MAX_PAGES` | 500 | 分页循环的硬上限。超过则停止并告警，防止 10 万行数据把浏览器钉死 |
| `MAX_FLOW_ROWS` | 5000 | 沿用 `data/model.ts` 的 `DEFAULT_ROW_LIMIT`（数据集侧已限） |

**告警（`LayoutWarning[]`）是分页器的一等输出**，不是附属品：

```ts
type LayoutWarning =
  | { kind: "clipped";      elementId: string; reason: string }   // 被裁切
  | { kind: "too-tall";     elementId: string; height: number }   // 比整页还高
  | { kind: "page-overflow"; pageCount: number }                  // 超过 MAX_PAGES
  | { kind: "hidden";       elementId: string }                   // printable=false
  | { kind: "unresolved";   elementId: string; token: string; why: string }; // 占位符没取到值
```

预览页把 `warnings` 汇总成顶部一条**警告条**（可展开看明细）。
绝不允许"页数少了、元素少了、值空着"而界面上没有任何说明 —— 那正是最难排查的一类问题。

---

## 4. 取数层

### 4.1 新 store：`src/store/modules/preview.ts`

**为什么不复用 `dataBinding`**：`run()` 会把结果写进 `samples`（设计态样本）。
预览全量数据覆盖上去 = 污染设计态（§0 第 7 条）。预览是"一次性加载 + 只读运行数据"，
生命周期与设计态样本完全不同，混在一起迟早出问题。

```
state:
  status: "idle" | "loading" | "ready" | "partial" | "error"
  rowsById: Record<dataSetId, DataRow[]>        // 运行态全量
  errorsByDataSetId: Record<dataSetId, string>  // 人话错误
  loadedAt?: number
  pageCount: number
  currentPage: number                            // 1 起，仅用于"跳到第 N 页"

actions:
  loadAll()      // 收集 dataSetId → 并发 runDataSet → 不写 samples
  refresh()      // 手动重新取数
  reset()        // 离开预览时清空
getters:
  rowsOf(dataSetId)
```

**取数范围**：遍历 `design.elements`，取 `el.binding?.dataSetId`。
不去解析单元格里的 `{数据集.字段}` 前缀 —— 按 `data-binding-design.md` §11.9/§11.16 的口径，
**绑定只有一个来源**（`binding.dataSetId`），从占位符文本反推数据集等于把同一件事记第二遍。

**参数**：沿用 `dataBinding.resolveParamValues(ds)`（优先级：面板手填测试值 → 系统变量 → 默认值）。
预览态等于"打印入参取默认值"，一期不引入参数输入界面（那是报表的查询面板，另一个功能）。

**并发与失败**：`Promise.allSettled`。单个失败 → 记进 `errorsByDataSetId`，
状态置 `partial`，**其余数据集照常渲染**。全失败 → `error`，页面仍渲染静态内容 + 警告条。

### 4.2 缺值策略

预览态 ctx 统一 `onMissing: "blank"`：打印时值不存在就是空白，不能把 `{数据集.备注}` 打在纸上。

**但空白必须可解释**，所以取数后跑一遍**占位符体检**（纯计算，成本极低）：

```
遍历每个元素的文本（含表格每格）→ parseTemplate → 逐 token 用该元素的 ctx 试取
→ 取不到的汇总成 { elementId, token, why }
   why ∈ { "数据集不存在", "字段不存在", "值为空（null/undefined）", "元素未绑定数据集" }
```

这份清单进警告条。它把"预览里那一格为什么是空的"从"用户自己猜"
变成"界面上直接写着"。**这是本轮性价比最高的一块。**

---

## 5. 渲染层

### 5.1 目录

```
src/components/design/preview/
  PreviewCanvas.vue      // 容器：工具栏 + 多页垂直堆叠 + 缩放 + 警告条 + 加载/空态
  PreviewPage.vue        // 单页：纸张白底 + 页内绝对定位渲染所有 PlacedItem
  usePreviewZoom.ts      // 缩放（适应宽度 / 自定义），**独立于 design.scale**
  render/
    PreviewText.vue      // 纯渲染：无编辑、无拖拽、无手柄
    PreviewImage.vue     // 含 @error 兜底（真 URL 404 时显示占位，不裂图）
    PreviewLine.vue
    PreviewTable.vue     // 接收"行序列"（分片后的），逐行渲值
  expand.ts              // 元素 + 行数据 → FlowItem[]（§3.6）
  paginate.ts            // FlowItem[] + 纸张 → LayoutPage[]（§3.4）
  inspect.ts             // 占位符体检（§4.2）
```

### 5.2 渲染必须复用几何纯函数（本轮唯一的重构）

`TextElement.vue` 的 `containerStyle` / `textStyle`、`TableElement.vue` 的
`cellTdStyle` / `rowViews`（其中"从元素数据算 CSSProperties"的部分）、`ImageElement.vue` 的
`objectFit` 映射 —— 这些**必须抽成纯函数**，放在 `src/components/design/render/style.ts`，
设计态组件与预览组件**都调它**。

```
TextElement.vue      ←─┐
PreviewText.vue      ←─┤
                        ├─→ render/style.ts（纯函数：Element + pxPerMm → CSSProperties）
TableElement.vue     ←─┤
PreviewTable.vue     ←─┘
```

预算：`pxPerMm` 是唯一的外部输入（设计态 = `mmToPx(1) * design.scale`；
预览 = `mmToPx(1) * previewZoom`），所以这个抽法是干净的 —— 两个视图只差一个缩放因子。

> **不做这一步的后果**：设计态调完字号间距，预览里得再调一遍；
> 改一处忘一处 ⇒ "预览里看着对、打出来错位"。这是所有"设计器 + 预览"项目最经典的一类 bug，
> 而它从结构上是可以避免的。

**看门狗（写进文档、动手时自查）**：

```bash
# 1. 预览渲染层不得读设计态的"视图状态"（只允许读 paper/marginMm/elements 这类文档数据）
grep -rn "selectedId\|editingId\|tableEditingId\|cellRange\|activeCell\|cellEditing\|designState.scale" \
  src/components/design/preview/render/
# 期望：0 命中

# 2. 分页层必须是纯的（不 import Vue、不 import store）
grep -rn "from \"vue\"\|store/modules" src/components/design/preview/paginate.ts \
  src/components/design/preview/expand.ts
# 期望：0 命中

# 3. 渲染值的入口唯一 —— 预览层里只准通过 context.ts 构造 ctx
grep -rn "renderTemplate" src/components/design/preview/
# 期望：命中点全部走 previewContext()，不出现手写正则或手工拼接
```

### 5.3 ctx 构造收敛成一份

`useDataBinding.designContext(el, row)` 现在把 `sys` 写死成 `systemVariables()`（每页现算），
没有注入页码的口子。本轮在 `useDataBinding.ts` 增加：

```ts
/** 预览/导出/打印的取值上下文。sys 由调用方注入（分页器要填 pageIndex / pageCount） */
function renderContext(el, row: DataRow | undefined, sys: Record<string, unknown>): TemplateContext {
  const ds = effectiveDataSet(el);
  if (!ds) return buildEmptyContext(sys);
  return buildRowContext(row, { dataSetName: ds.name, fields: ds.fields, sys, onMissing: "blank" });
}
```

并让既有的 `designContext` 委托它（一个传 `systemVariables()`、一个传分页器给的 sys），
**避免两处各写一份 ctx 构造** —— 这正是 `lib/template.ts` 文件头反复强调的那条口径。

### 5.4 图片元素

- 设计态：`src` 含占位符 → **不交给浏览器**（否则被当相对路径发 404 + 裂图）。
- 预览态：`src = renderTemplate(el.src, ctx)`；结果为空 → 显示"暂无图片"占位；
  结果非空但加载失败（`@error`）→ 同样回落占位，**不留裂图**。
  字段值是相对路径时以数据源 `baseUrl` 为基准拼接（`buildRequestUrl` 已有可复用逻辑）。

---

## 6. 交互设计

### 6.1 入口

`header/index.vue` 第 53 行的「预览」按钮 → `router.push({ name: "Preview", params: { id } })`。
新增路由 `/preview/:id`（与 `/design/:id` 平行，`router/routes/modules/main.ts`）。

**为什么用独立路由而不是弹窗/覆盖层**：

- 预览是"另一种视图"，不是"一个对话框"。独立路由天然有返回、可刷新、URL 可分享。
- 覆盖层要处理 `z-index` / 焦点陷阱 / 滚动锁定，而画布已经为层级问题付出过一次代价
  （`designPanel/index.vue` 的 `isolate` 修复）。没必要再造一个。
- ⚠️ 项目**当前没有模板持久化**，store 是唯一数据源。所以直接访问 `/preview/xxx`
  会得到空模板 → 渲染"模板为空"态 + 一个「返回设计」按钮。**不白屏、不报错**。

### 6.2 预览页布局

```
┌ 顶部工具条 ────────────────────────────────────────────────┐
│ ← 返回设计 │ 数据：2 个数据集 · 取数 128ms │ ⟳ 刷新数据      │
│ 第 [1] / 3 页  ‹ › │ 缩放：适应宽度 ▾ │ (将来) 打印          │
├────────────────────────────────────────────────────────────┤
│ ⚠️ 2 条提示：[被裁切 1] [3 个占位符未取到值 ▾]   ← 可展开      │
├────────────────────────────────────────────────────────────┤
│        ┌──────────────┐   ← 第 1 页（纸张白底 + 阴影）        │
│        │              │                                     │
│        └──────────────┘                                     │
│              ↓ 24px 间隔                                    │
│        ┌──────────────┐   ← 第 2 页                         │
│        │              │                                     │
│        └──────────────┘                                     │
└────────────────────────────────────────────────────────────┘
```

- **多页垂直堆叠**（像 PDF 阅读器），不做"一次只显示一页"。理由：分页的常见问题
  （页底空洞、段落被劈开、表头没重复）**只有连着看才发现**，一次一页会把它藏起来。
- **缩放**：默认「适应宽度」（纸张宽贴合容器），可选 100% / 50% / 200%。
  用**预览自己的局部 ref**，不复用 `design.scale`（那是设计态的视图偏好，混用会让
  关掉预览后设计态缩放被改掉）。
- **页码输入框**只做"滚动到第 N 页"（`scrollIntoView`），不做虚拟滚动。
  500 页 × 少量元素的 DOM 规模可控；真到规模瓶颈时再引入虚拟化（不进本轮）。

### 6.3 各类状态

| 状态 | 表现 |
|---|---|
| 取数中 | 纸张骨架 + "正在取数…"，**不阻塞渲染静态内容**（先画占位符/静态文本，取完再刷） |
| 全部成功 | 正常渲染，警告条只显示"结构性"告警（裁切 / 隐藏 / 未取到值） |
| 部分失败 | 正常渲染 + 警告条红点：`数据集「订单明细」取数失败：请求超时（10s）` |
| 无数据集 | 直接渲染静态内容（占位符按 `blank` → 空白），提示"模板还没有绑定数据集" |
| 模板为空 | 空态：图标 + "还没有任何元素" + 「返回设计」按钮 |

---

## 7. 改动清单

### 7.1 新增

| 文件 | 内容 |
|---|---|
| `src/store/modules/preview.ts` | 运行数据 / 错误 / 页数 / 当前页（§4.1） |
| `src/components/design/preview/paginate.ts` | **分页唯一实现**（纯函数，§3） |
| `src/components/design/preview/expand.ts` | 表格明细行展开 + 逐行 ctx（纯函数，§3.6） |
| `src/components/design/preview/inspect.ts` | 占位符体检（§4.2） |
| `src/components/design/preview/PreviewCanvas.vue` | 多页容器 + 工具栏 + 警告条 |
| `src/components/design/preview/PreviewPage.vue` | 单页渲染 |
| `src/components/design/preview/usePreviewZoom.ts` | 预览缩放 |
| `src/components/design/preview/render/Preview{Text,Image,Line,Table}.vue` | 纯渲染组件 |
| `src/components/design/render/style.ts` | **设计态与预览共享的样式纯函数**（§5.2） |
| `src/views/preview/index.vue` | 路由页（取数 + 空态 + 挂 PreviewCanvas） |

### 7.2 修改

| 文件 | 改动 | 风险 |
|---|---|---|
| `router/routes/modules/main.ts` | 新增 `/preview/:id` | 低 |
| `header/index.vue` | 「预览」按钮接路由 | 低 |
| `data/useDataBinding.ts` | 新增 `renderContext(el, row, sys)`；`designContext` 委托它 | 低 |
| `designPanel/.../TextElement.vue` | 样式计算改为调 `render/style.ts`（**行为不变，纯重构**） | **中**（设计态） |
| `designPanel/.../ImageElement.vue` | 同上 | 中 |
| `designPanel/.../TableElement.vue` | `cellTdStyle` / CSS 部分改调共享函数；`rowViews` 的**结构**仍是模板网格（预览不走它） | **中** |
| `design/types.ts` | 若做明细行：恢复 `detailRowIndex` / `headerRows` / `columnFields`（§10 第 1 条） | 低 |
| `table/model.ts` | 若做：`insertRow` / `removeRow` 维护 `detailRowIndex`；`insertCol` / `removeCol` 维护 `columnFields` | 中 |
| `setting/element/BindingSection.vue` | 若做：恢复「明细模板行」下拉 + 「表头行数」；加「允许跨页断开」开关 | 中 |
| `setting/element/ElementProperties.vue` | `repeatOnEachPage` / `printable` 文案补齐"预览/打印生效"；或按 §0 第 5 条从面板摘掉（若本轮不消费它们） | 低 |

### 7.3 四条既有铁律（照 `data-binding-design.md` §9，本轮同样适用）

1. **数据所有权**：`preview.rowsById` 写入前深拷贝（`structuredClone(toRaw(...))`）；
   分页产出的 `LayoutPage` 是每次 `loadAll` / 尺寸变化时**新构造**的对象，不与 store 共享引用。
2. **表格写入只能整包替换**：本轮**不改表格数据**（明细行声明是元素级字段，走 `updateElement`），
   但 `insertRow` / `removeRow` 里的行号维护必须在 `updateTable` 的 mutator 内完成。
3. **第 2/3 层状态的消费必须过"哪张表"门禁**：预览层**完全不读** `tableEditingId` / `cellRange`
   （§5.2 看门狗 1），从根上规避。
4. **画布不引入"行数 ≠ 模型行数"**：预览是另一套 DOM，不得把分页结果塞回画布。
   `TableElement.vue` 的 `rowViews` 继续只渲染模板网格。

---

## 8. 分期计划

| 期 | 内容 | 交付判据 |
|---|---|---|
| **P0** | 预览路由 + 取数 + 纯渲染 + 分页引擎（元素级顺延）+ `repeatOnEachPage` / `printable` 生效 + 页码变量 + 警告条 + 占位符体检 | 打开预览能看到真数据；元素排到纸外/超页时能正确分页；页码正确 |
| **P1** | **表格明细行扩展** + 行内分页 + 表头每片重复 + `allowBreakAcrossPages` 开关 + 画布上的明细行标记 | 30 行明细能自动流到第 2、3 页，每页表头齐全 |
| **P2** | 套打行数控制（`detailRowsPerPage` / `padEmptyRows` / `summaryOnLastPageOnly`）+ 缩略图栏 + 打印 CSS（`window.print()`）+ 导出 PDF | 对齐预印纸 |

**关于 P0 要不要单独先出**：P0 单独交付时，"自动分页"的输入确实很弱
（只有"元素排到纸外"一种，而那在设计态就看得见）。但 P0 建立的是**渲染态 + 分页引擎**这条链路，
且顺手让四个"零消费方"的东西（`renderTemplate` / `buildRowContext` / `repeatOnEachPage` / `printable`）
全部生效 —— 这些价值与表格明细行无关。**建议 P0 / P1 同一轮做完**（P1 是本轮的真正目的，
P0 是它的地基），若老板想更快看到东西，P0 也可独立先合。

---

## 9. 明确不做（本轮）

- **行高自适应**（`atLeast` / `auto` 的 `SizeMode`）：需要测量，会把单向流程变两遍（§3.7 的警告）。
- **文本自动撑高元素**：同上。文本溢出按框裁切（与设计态一致）。
- **多数据集 JOIN / 主从关联**：`ElementBinding.filter` 仍不消费。
- **打印 / 导出**：预览只显示，不产出文件。P2 再说。
- **虚拟滚动 / 缩略图**：P2。
- **参数输入界面**：预览不提供"让用户填参数"的查询面板（`data-binding-design.md` §6.2 的口径不变）。
- **模板持久化**：本轮仍无存取功能，预览只读内存中的 store。

---

## 10. 待老板拍板（请逐条给结论）

| # | 问题 | 我的建议 | 卡着什么 |
|---|---|---|---|
| 1 | **表格明细行扩展本轮做不做？**（不做则自动分页几乎没有输入，见 §0 第 2 条） | **做**，与 P0 同轮（P0+P1） | **卡整轮的规模与交付物** |
| 2 | 预览入口：独立路由 `/preview/:id` vs 设计页内覆盖层 | 独立路由（§6.1） | 影响目录与交互结构 |
| 3 | 分页模型：**绝对坐标 + 跨界顺延**（页底可能留空洞） vs 流式重排（预览位置会偏离设计态） | 绝对坐标 + 顺延 | **卡分页引擎的全部实现** |
| 4 | 每页重复元素的位置语义：**设计坐标原样**（§3.2）vs 相对内容区顶 | 原样 | 影响页眉页脚用法 |
| 5 | 缺值策略：预览渲染空白 + 警告条清单（§4.2 / §0 第 8 条） | 空白 + 清单 | 影响用户对空格的解读 |
| 6 | `repeatOnEachPage` / `printable` 现在"有开关、无效果"（§0 第 5 条）：本轮让它们生效（建议）还是从面板摘掉？ | 生效（预览 + 打印都认它） | 卡面板文案与实现 |
| 7 | `allowBreakAcrossPages`：加一个「允许跨页断开」开关（建议）还是删掉这个字段？ | 加开关 | 卡表格分页行为 |
| 8 | 页码变量 `{$page.index}` / `{$page.count}` 本轮做？ | 做（成本极低，§0 第 9 条） | 卡渲染 ctx 签名 |
| 9 | 画布上要不要给明细行一个小标记（仅行号槽，不动字宽）？ | 要（否则又是"改了看不见"，见 §3.6） | 卡 P1 的画布改动 |
| 10 | 同轮是否做打印（`window.print()` + `@media print`）？ | 不做，P2 | 卡本轮范围 |

---

## 11. 验证方式（沿用项目约定，别加戏）

只做三样，与 `data-binding-design.md` §9 一致：

1. `npx vite` + `curl --noproxy '*'` 取转换后模块，确认编译通过
   （⚠️ 只 curl `.vue` 只能证明编译通过；涉及 Tailwind 新类时**必须**附带 curl
   `src/styles/index.css` 确认类真被生成）。
2. `npx eslint`（改动范围 0 problem；全仓允许保留既有的
   `views/dashboard/index.vue` 那 1 个 error + 19 个 warning）。
3. 人工静态核对 + §5.2 的三条看门狗 grep。

`vue-tsc` 是坏的（`runTsc` MODULE_NOT_FOUND），**没有类型检查兜底** ⇒
分页引擎这种"纯逻辑、算错了不会报错只会画错"的模块，**必须人工核对每一处坐标换算**：
`u = y - p*H` 这条式子在代码里出现的每一处都要验一遍符号。

**额外建议（本轮新提出，请老板定）**：分页是纯函数、无 Vue 依赖，
所以可以写一个**极小的 Node 自检脚本**（不装任何测试框架，用 `node xxx.mjs` 跑几组
"纸张 + 元素 + 行数 → 期望页数/位置"的断言）。这是本项目第一次有机会把
"算错了没人知道"的那块逻辑变成可自动验证的 —— 成本约 30 行，收益是每次改分页都不用重头验。
**是否允许，请老板一并给个话。**

### 需要老板手点一遍的链路（自动化覆盖不到）

1. 设计 3 个文本元素 + 1 个表格 → 点右上「预览」→ **必须能看到真值**（不是 `{数据集.字段}`）。
2. 把某个元素拖到纸张底部之外 → 预览里它应出现在**第 2 页顶部**，且警告条说明原因。
3. 勾选某元素的「每页重复」→ 预览里它应出现在**每一页的同一位置**。
4. 关掉某元素的「是否打印」→ 预览里它**不出现**，且警告条列出"已隐藏 N 个元素"。
5. 文本里写 `{$page.index} / {$page.count}` → 每页应显示正确的页码与总页数。
6. 绑一个会返回 30+ 行的接口 → 表格明细应按数据自动长出多页，每页表头齐全（P1）。
7. 故意把某个占位符的数据集前缀写错 → 预览该处为空白，**且警告条列出这个占位符**。
8. 数据集 URL 写错 → 预览**不白屏**，静态内容照常显示 + 警告条给出人话原因。
9. 回归：**设计态一切不变** —— 元素位置、字号、表格行列、拖拽、右键菜单、
   内联编辑、字段拖入全部与改动前一致（§7.2 那三个元素组件是纯重构，但必须手点确认）。

---

## 12. 实现进度（P0 + P1 已落地）

老板一句「按照你的建议开始做吧」= §10 十条全部按建议采纳 + §11「额外建议」的 Node 自检脚本获批。
本轮把 P0（预览链路）与 P1（表格明细行扩展 = 自动分页的另一半）**一次做完**。

### 12.1 交付物

**新增**

| 文件 | 职责 |
|---|---|
| `src/components/design/preview/types.ts` | 预览子系统的类型（`FlowBlock` / `PlacedItem` / `LayoutPage` / `LayoutWarning` / `PreviewView` …）。**零运行时依赖** |
| `src/components/design/preview/paginate.ts` | 分页引擎（纯函数）。`paginate` / `MAX_PAGES` / `EPS` / `contentTop` / `contentHeight` / `pageOffset` |
| `src/components/design/preview/expand.ts` | 表格明细行扩展（纯函数）。`expandTable` / `isDetailTable` / `expansionRowHeights` |
| `src/components/design/preview/layout.ts` | `Element[]` → `FlowBlock[]` → `paginate()`：元素三分类（隐藏 / 每页重复 / 流式） |
| `src/components/design/preview/inspect.ts` | 占位符体检（纯函数）。抓 `onMissing:"blank"` 显不出来的那些引用 |
| `src/components/design/preview/usePreviewLayout.ts` | 编排两个 store + 上述纯函数 → `PreviewView`（唯一"脏"的地方） |
| `src/components/design/preview/usePreviewZoom.ts` | 预览自己的缩放（fit/50/75/100/150/200），与 `design.scale` 无关 |
| `src/components/design/preview/PreviewCanvas.vue` | 工具条 + 告警条 + 多页纵向堆叠 + 空态 |
| `src/components/design/preview/PreviewPage.vue` | 单页纸面（绝对定位逐项落位） |
| `src/components/design/preview/render/Preview{Text,Image,Line,Table}.vue` | 四个纯渲染组件 |
| `src/components/design/render/style.ts` | 设计态与预览**共用**的几何/样式纯函数（本轮唯一重构，见 §5.2） |
| `src/store/modules/preview.ts` | `usePreviewStore`：独立取数，**不碰** `dataBinding.samples` |
| `src/views/preview/index.vue` | 路由页 `/preview/:id` |
| `scripts/check-paginate.mjs` | 分页引擎自检（51 条断言，零依赖） |
| `scripts/check-templates.mjs` | 模板语法自检（见 12.2 第 4 条） |

**修改**

| 文件 | 改了什么 |
|---|---|
| `src/components/design/types.ts` | `TableElement` 新增四个**渲染态**字段：`allowBreakAcrossPages` / `detailRowIndex` / `headerRows` / `columnFields` |
| `src/components/design/table/model.ts` | `normalizeTable` 校验并夹取上述声明；`insertRow/removeRow/insertCol/removeCol` 维护它们（行号平移、表头平移、列映射 splice） |
| `designPanel/.../TextElement.vue`、`LineElement.vue` | 纯重构：本地样式 computed 换成 `render/style.ts` 的共用函数 |
| `designPanel/.../TableElement.vue` | 同上，外加明细行的行号槽标记 |
| `setting/element/BindingSection.vue` | 新增表格取数四项（明细模板行 / 表头行数 / 列映射 / 允许跨页断开），一律走 `updateElement` |
| `setting/element/ElementProperties.vue` | 「每页重复」「是否打印」的说明补上"预览/打印时" |
| `data/context.ts` | `buildEmptyContext(sys, onMissing)` 支持 `blank` |
| `data/useDataBinding.ts` | 抽出 `renderContext(el, row, sysVars)`（blank、记录不回落样本）；`fieldToken` 改为薄壳（见 12.2 第 1 条） |
| `lib/template.ts` | 新增 `makeFieldToken()` —— 占位符字面量的**唯一构造点** |
| `header/index.vue` | 「预览」按钮接到 `router.push({name:"Preview"})` |
| `router/routes/modules/main.ts` | 新增 `/preview/:id` |

### 12.2 实现与设计稿的四处偏差（都请老板过一眼）

1. **占位符字面量的构造点下沉了。**
   原计划写的是"唯一构造点 = `useDataBinding.fieldToken()`"。动手时发现**读取侧也要拼花括号**：
   列映射 `columnFields` 存的是用户手输的字段声明，得先规范化成 `{...}` 才能交给 `renderTemplate`；
   而读取侧在**纯函数层**（`inspect.ts` / `PreviewTable.vue`），不能引 composable，否则
   `paginate.ts` 那套"零运行时依赖 ⇒ Node 能直接跑"的地基就没了。
   就地拼的后果是实测出来的：`inspect.ts` 无条件包 `{}`、`PreviewTable` 加了"已是占位符就不包"的判断 ⇒
   **列映射里直接写整段 `{订单明细.品名}` 时，预览渲得出值、体检却报"字段不存在"**。
   最终做法：字面量构造下沉到语法权威模块 `lib/template.ts` 的 `makeFieldToken()`，
   `useDataBinding.fieldToken()` 变成"解析 `dataSetId` → 调 `makeFieldToken`"的薄壳。
   `grep -rn '`{\${' src` 现在恰好命中 1 行。

2. **明细行的画布标记改用色条。**
   §10 第 9 条定的是"仅行号槽"。实现时从"改行号数字"改成"2px 左侧色条 + `title` 说明"：
   行号槽宽 18px 且固定显示行号，加字符（`≡3`）会在两位数/三位数时溢出。

3. **表格取数 UI 属于"复职"，与 `data-binding-design.md` §11.16 表面冲突。**
   §11.16 曾把表格取数整体砍掉，理由是"改了画布上看不见 ⇒ 不属于设计态"。
   本轮的处置是：把它放回来，因为它服务的本来就是**画布之外**的渲染态。
   设计态只给一处不进单元格、不改字宽的轻量反馈（即第 2 条的色条）。
   这个理由写在 `BindingSection.vue` 的注释里。**如果老板不认这个翻案，说一声即可拆掉。**

4. **额外加了一个 `scripts/check-templates.mjs`（不在原计划内）。**
   §11 写的是"人工静态核对" —— 而模板语法错恰恰是最容易漏的一类：开发服务器**只在浏览器真的请求到
   那个模块时**才返回 500，撞不撞上全看点到哪。本轮就被它咬了一口（见 12.3）。
   脚本约 100 行、零依赖、1 秒跑完全仓 125 个 `.vue`。**不需要可以直接删。**

### 12.3 实现期间抓到的两个真 bug（都是"算错了不会报错、只会画错"那一类）

| # | 位置 | 症状 | 修法 |
|---|---|---|---|
| 1 | `paginate.ts` `place()` | 没夹页号上界。一个 `y` 极大的元素（或 `groupY` 异常）能撑出**几千张空页** | `place()` 内把页号夹到 `[0, MAX_PAGES]`；`paginateAtomic` 溢出分支同时夹 `f` |
| 2 | `paginateBreakable` | "一行都放不下"的分支只在 `f <= EPS` 时触发 ⇒ 一个**超高行**（`need > H`）不在页顶时**死循环** | 拆成两条：`need > H` → 照放 + 告警 + `row += 1`；局部不够 → 换页。与 `paginateAtomic` 的超高语义对齐 |

抓法就是 `scripts/check-paginate.mjs` —— 这两个 bug 靠肉眼看分页结果基本发现不了。

另外修掉一个**模板编译致命错**：`TableElement.vue` 里把说明写成了 `:class="[ /* … */ ]"`，
而且注释文本里用了 **ASCII 双引号**。属性值里的裸 `"` 会把 `:class="..."` 提前截断，
`/* */` 又会被 tokenizer 当成标签结束 —— 于是报出一串位置全不对的错
（`stateInAttrName` / `Illegal '/' in tags`）。**属性值里只能放中文全角引号，注释请放属性外或 `<script>` 里。**
这就是第 12.2 条第 4 个脚本存在的原因。

### 12.4 验证结果

| 项 | 结果 |
|---|---|
| `node scripts/check-paginate.mjs` | **51 / 51 通过** |
| `node scripts/check-templates.mjs` | **125 个 `.vue`，零语法错误** |
| `npx vite` + `curl` 全部新增/修改模块 | **全部 200** |
| `npx vite build`（输出重定向到临时目录，不污染已提交的 `dist/`） | **2810 模块打包通过**，含独立 `preview` chunk（24.35 kB） |
| `npx eslint`（改动范围） | **0 problem** |
| `npx eslint src`（全仓） | 仅剩**既有**的 `views/dashboard/index.vue` 1 error + 19 warning（该文件本轮未触碰，`git diff` 为空） |

看门狗与铁律自查：

| # | 检查 | 结果 |
|---|---|---|
| ① | 预览层不得读设计态**视图状态**（`selectedId`/`editingId`/`tableEditingId`/`cellRange`/`activeCell`/`cellEditing`/`designState.scale`） | ✅ 0 命中。预览只读 `design.elements` / `getElement` / `paper` / `marginMm`（文档数据），`design.scale` 仅出现在注释里 |
| ② | 分页层不得 import Vue / store / 组件 | ✅ `paginate` / `expand` / `layout` / `inspect` / `types` 只有 `import type` + `paginate`（纯） + `lib/template`（纯） |
| ③ | `renderTemplate` 在预览层只经 `context.ts` 构造 ctx | ✅ 设计面板真实调用点 0（两条 grep 命中均为 JSDoc 注释行） |
| ④ | 占位符唯一构造点 | ✅ `grep -rn '`{\${' src` 命中 1 行（`lib/template.ts` 的 `makeFieldToken`） |
| ⑤ | 预览取数不得污染设计态样本 `samples` | ✅ 0 命中；`preview.ts` 直接调 `api/dataset.runDataSet`，写入前 `structuredClone(toRaw(rows))` |
| ⑥ | 设计态画布不渲染字段值 | ✅ 画布组件零 `renderTemplate` 调用 |

### 12.5 本轮没做（留给下一轮）

- **打印**（`window.print()` + `@media print`）—— §10 第 10 条已定，P2。预览页的 `<table>` 结构就是为它留的。

### 12.6 2026-09-21 晚补丁：列映射下拉与"拖进格子的字段"显示不一致（老板截图指出）

**症状**：明细行格子里拖了 `{数据集1.username}` / `{数据集1.name}`，预览取数正常
（格子为准），但面板「列映射」一排下拉全部显示「不映射」—— 显示层与取数层各说各话。

**根因**：下拉只读 `columnFields[c]`（用户手输的兜底声明），从不读格子内容；
而拖拽写入的是格子的 `content`，两条路各存各的。取数规则没坏（§3.6 格子为准），
坏的是**显示**。

**修法**（`BindingSection.vue`，语义有变，请老板过目）：

1. **下拉显示"实际生效"的映射**：明细行格子里恰好写了单一占位符（trim 后整格就是
   `{…}`）时显示该字段（记作"格子驱动"）；否则回落显示 `columnFields[c]`。
   混排内容（`单价：{单价} 元`）、被合并覆盖的格子、前缀指向别的数据集的占位符
   都不算格子驱动，仍走兜底显示。
2. **格子驱动的列，在下拉里改动会写回格子**（走 `updateTable` 整包替换，铁律不变）：
   选字段 = 替换格子里那个占位符；选「不映射」= 清空格子的占位符
   —— 此时格子 trim 后恰好只有这一个占位符、没有别的可丢内容，清空不构成破坏。
   非格子驱动的列维持原语义：写 `columnFields` 兜底声明，绝不碰格子。
3. **失效字段不再伪装成「不映射」**：格子里引用的字段已从数据集删除时，下拉动态补一项
   `字段名（字段已失效）`，而不是静默显示成"没有映射"。

验证：`check-templates` 125 个 0 错、`check-paginate` 51/51、eslint 0 problem、
`vite` + `curl` 该模块 200。需要老板手点：拖字段进明细行格子 → 看「列映射」下拉
是否立刻显示该字段；在下拉里换一个字段 / 选「不映射」→ 看格子内容是否如预期被改写。
- 字段格式化 UI、模板序列化/持久化、分页取数（明细行不回查接口）、多数据集关联。
- §11 里那 9 条**需要老板手点**的链路 —— 尤其第 9 条"设计态一切不变"的回归，
  那三个元素组件是纯重构，但**必须手点确认**（`vue-tsc` 是坏的，没有类型检查兜底）。
