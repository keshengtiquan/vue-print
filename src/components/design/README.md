# 设计面板（design editor）实现总结

> 本文件是设计面板（纸张页）的架构与实现快照，供后续开发时快速恢复上下文。代码注释均用中文，本文件与之一致。

## 1. 概述

设计面板是一个「印刷设计编辑器」的核心画布区。目前已完成：

- **标尺**：横向/竖向各一条，按 mm 刻度绘制，刻度密度随缩放自适应，纸张左/上方空白区显示负 mm（连续标尺）。
- **纸张**：一张 A4（210×297mm）白纸，横向居中、顶部留白，带阴影。
- **光标引导线**：鼠标悬停在面板上时，标尺各画一条红色引导线标记光标位置。
- **状态栏**：底部 `statusLine` 显示光标坐标（mm，相对纸张左上角原点）。
- **缩放**：header 数字输入框（10%~200%）缩放纸张；Ctrl/⌘+滚轮以光标为锚点缩放（普通滚轮是原生滚动）。**只缩放纸张/标尺，不缩放整个网页。**
- **滚动**：放大后纸张超出可视区时，用原生滚动容器查看，标尺固定不动、0 线随滚动偏移。
- **resize 自适应**：窗口/容器尺寸变化时自动重排（`useResizeObserver`）。
- **素材元素**：纸张上可放置文本/表格/直线/图片元素，支持拖拽移动、选中后虚线框 + 8 方向手柄缩放、绕中心旋转（策略模式按类型渲染）。

## 2. 组件结构

```
src/views/design/index.vue          # 页面骨架：Header + main(左素材台/中设计面板/右属性台) + StatusLine
src/components/design/
  header/index.vue                  # 顶栏：缩放数字框、撤销/重做占位、预览/导出按钮
  material/index.vue                # 素材台（空壳）
  setting/index.vue                 # 属性台（空壳）
  statusLine/index.vue              # 底部状态栏，显示 mm 坐标
  designState.ts                    # 共享响应式状态（无 Pinia，模块级 reactive 单例）
  types.ts                          # 元素数据模型（BaseElement + 各类型 + ResizeHandle）
  useElements.ts                    # 元素 CRUD 工具函数
  designPanel/
    index.vue                       # 画布区：标尺 + 滚动容器 + 纸张 + 鼠标/缩放/滚动逻辑
    components/ruler.vue            # 单个标尺（canvas）
    components/elements/            # 元素渲染（策略模式 DOM 组件）
      index.ts                      # elementComponents 映射表（策略注册）
      ElementLayer.vue              # 按 zIndex 排序遍历渲染元素
      ElementWrapper.vue            # 通用 transform + 选中/拖拽/缩放/旋转交互
      TextElement.vue / TableElement.vue / LineElement.vue / ImageElement.vue
```

页面布局（`views/design/index.vue`）：

```html
<div>
  <Header />
  <main class="flex h-[calc(100vh-64px-24px)]">
    <Material />          <!-- 左，w-70 -->
    <DesignPanel class="flex-1" />   <!-- 中 -->
    <Setting />           <!-- 右，w-70 -->
  </main>
  <StatusLine />          <!-- 高 24px -->
</div>
```

## 3. 共享状态 `designState.ts`

无 Pinia，用一个模块级 `reactive` 单例在兄弟组件间共享：

```ts
export const SCALE_MIN = 0.1;   // 10%
export const SCALE_MAX = 2;     // 200%

export const designState = reactive({
  paper: { widthMm: 210, heightMm: 297 }, // A4，当前写死，后续属性台可改
  scale: 1,                                 // 缩放倍数，1 = 100%
  mouse: { x: 0, y: 0 },                    // 光标 mm 坐标（相对纸张左上角原点）
  inPanel: false,                           // 光标是否在 rootRef 内
  elements: [] as Element[],                // 纸张上的素材元素
  selectedId: null as string | null,        // 当前选中的元素 id
});
```

- `scale` 由 header 数字框 / Ctrl+滚轮写入，designPanel 与标尺读取。
- `mouse` 由 designPanel 写入，statusLine 读取。
- `elements`/`selectedId` 由元素交互（`useElements.ts`）写入，`ElementLayer` 与（未来）属性台读取。
- 视图尺寸（viewW/viewH）与滚动偏移是 designPanel 局部状态，不进共享（依赖 DOM）。

## 4. 坐标模型（核心）

常量：`RULER_SIZE = 22`（标尺厚度，也是左上 22×22 角区），`PAPER_MARGIN = 32`（内容区四周留白）。

```
pxPerMm = mmToPx(1) * scale        // = (96/25.4) * scale
paperW  = paper.widthMm  * pxPerMm  // A4: 210mm ≈ 793.7px @100%
paperH  = paper.heightMm * pxPerMm  //      297mm ≈ 1122.5px @100%
```

滚动容器占据 rootRef 的 `[22,W]×[22,H]`（`top-5.5 left-5.5 right-0 bottom-0`），其可视尺寸 = `viewW×viewH = (W-22)×(H-22)`。内容区可大于可视区：

```
contentW = max(viewW, paperW + 2*PAPER_MARGIN)
contentH = max(viewH, paperH + 2*PAPER_MARGIN)
paperX   = (contentW - paperW) / 2   // 横向居中
paperY   = PAPER_MARGIN              // 顶部留白
```

标尺原点（0mm 落在尺条上的 px 位置，随滚动变化）：

```
originX = paperX - scroll.x
originY = paperY - scroll.y
```

光标 mm（相对纸张左上角原点）：

```
mm = pxToMm((mouse - RULER_SIZE) - origin) / scale
```

引导线（标尺局部 px，与滚动无关，因为标尺固定）：

```
guide = mouse - RULER_SIZE
```

元素坐标（mm，相对纸张左上角原点）：渲染时 `px = mm * pxPerMm`，缩放纸张自动跟随（mm 不变）。

## 5. 各文件职责与关键实现

### 5.1 `designPanel/components/ruler.vue`

单个标尺，`<canvas>` 绘制。Props：

- `orientation: "vertical" | "horizontal"`
- `viewportPx: number`（尺条可见长度，屏幕 px）
- `paperScale?: number`（缩放倍数）
- `origin?: number`（0mm 在尺条上的 px 位置，默认 0）
- `guide?: number | null`（光标在尺条上的 px，null 不显示）

绘制逻辑（`draw()`）：

1. **DPR 处理**：同时设置 CSS 尺寸与缓冲尺寸（关键，否则 Retina 下被放大 2 倍）：
   ```ts
   canvas.style.width/height = cssW/cssH px
   canvas.width/height = cssW/cssH * dpr
   ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
   ```
2. **自适应刻度步长**：`STEPS=[1,2,5,10,20,50,100,200,500,1000]`，`minorMinPx=3`。
   `minor = STEPS.find(s => s*pxPerMm >= 3)`；`medium = 5*minor`，`major = 10*minor`（major 处画长刻度 + mm 数字）。
3. **刻度范围（含负值）**：以 origin 为锚点覆盖可见区：
   ```ts
   firstMm = ceil(-origin / pxPerMm / minor) * minor
   lastMm  = floor((length - origin) / pxPerMm / minor) * minor
   pos = round(origin + mm*pxPerMm) + 0.5   // +0.5 保证 1px 线条清晰
   ```
   标签 `String(mm)`，负值自然显示 "-10"。
4. **引导线**：`guide` 在 `[0, length]` 内时画一条贯穿尺条的竖/横线（`lineWidth=2`，颜色 `--pd-ruler-guide`）。
5. **重绘触发**：`watch(() => props.orientation, draw)`、`watch(() => [viewportPx, paperScale, origin], draw)`、`watch(() => props.guide, draw)`，以及 `ResizeObserver`。

### 5.2 `designPanel/index.vue`

模板结构（标尺固定，纸张在滚动容器内）：

```html
<div ref="rootRef" class="relative overflow-hidden bg-gray-50" @mousemove @mouseleave>
  <Ruler vertical   :viewport-px="viewH" :paper-scale="designState.scale" :origin="originY" :guide="guideY" />
  <Ruler horizontal :viewport-px="viewW" :paper-scale="designState.scale" :origin="originX" :guide="guideX" />
  <div ref="scrollRef" class="absolute top-5.5 left-5.5 right-0 bottom-0 overflow-auto" @scroll @wheel>
    <div class="relative" :style="{width: contentW, height: contentH}">
      <div class="absolute bg-white shadow" :style="{left: paperX, top: paperY, width: paperW, height: paperH}" />
    </div>
  </div>
</div>
```

脚本要点：

- `rulerGeom = reactive({ viewW, viewH })`：`measureRuler()` 里 `viewW = clientWidth - 22`，`viewH = clientHeight - 22`。
- `scroll = reactive({ x, y })`：`@scroll` 同步 `scrollRef.scrollLeft/scrollTop`。
- 派生计算属性：`pxPerMm / paperW / paperH / contentW / contentH / paperX / paperY / originX / originY / guideX / guideY`。
- `onMouseMove`：写 `designState.mouse`（mm），见坐标模型。
- `onWheel`：`ctrlKey || metaKey` 时 `preventDefault()` 并 `zoomAt()`（锚定光标）；普通滚轮放行（原生滚动）。
- `zoomAt(next, ax, ay)`：锚点处纸张 mm 在缩放前后不变，重算 scroll；用 `nextTick` 等 DOM 重渲染后再落 `scrollLeft/scrollTop`（避免浏览器按旧尺寸钳制）。
- `useResizeObserver(rootRef, measureRuler)` 实现 resize 自适应。

### 5.3 `header/index.vue`

数字输入框绑定缩放（reka-ui `NumberField`，`format-options: percent`，值 1=100%）：

```html
<NumberField v-model="designState.scale" :min="SCALE_MIN" :max="SCALE_MAX"
             :format-options="{ style: 'percent' }" :step="0.1">
  <NumberFieldContent>
    <NumberFieldDecrement /> <NumberFieldInput /> <NumberFieldIncrement />
  </NumberFieldContent>
</NumberField>
```

撤销/重做（`Undo/Redo`）与预览/导出仍是占位，未接线。

### 5.4 `statusLine/index.vue`

读 `designState` 显示 mm 坐标（1 位小数，移出面板显示 `—`）：

```ts
const x = computed(() => (designState.inPanel ? designState.mouse.x.toFixed(1) : "—"));
const y = computed(() => (designState.inPanel ? designState.mouse.y.toFixed(1) : "—"));
```

### 5.5 元素系统（`types.ts` + `useElements.ts` + `elements/`）

数据模型见 `types.ts`：所有元素继承 `BaseElement`（`id/type/x/y/width/height/rotation/zIndex`，几何单位 mm），按 `type` 扩展专属字段：

- `TextElement`：`content / fontFamily / fontSize(mm) / fontWeight / color / textAlign`
- `TableElement`：`rows / cols / cellStyle`
- `LineElement`：`start / end`（相对元素左上角的局部 mm）+ `stroke{color,width}` + `dash`（`null` 实线 / `[n,m]` 虚线）
- `ImageElement`：`src / objectFit`

`rotation`/`zIndex`/`color`/`cellStyle` 等有默认值的字段为可选（组件内兜底，手动塞数据不会崩）。

**策略渲染**：`elements/index.ts` 的 `elementComponents: Record<ElementType, Component>` 映射表即策略。`ElementLayer` 按 `zIndex` 排序遍历，`ElementWrapper` 负责通用层——`left/top/width/height` 用 `mm * pxPerMm`，`transform: rotate()` + `transform-origin: center`（绕中心旋转）；内部 `<component :is="elementComponents[el.type]" :element="el">` 渲染类型组件（只做内容，不做交互）。

**交互**（`ElementWrapper` 内，pointer events + `setPointerCapture`）：

- 选中：pointerdown 在元素上 → `selectElement(id)`；点空白（rootRef `@pointerdown`）→ `selectedId = null`。
- 拖拽移动：主体 pointermove 的屏幕位移 `/ pxPerMm` 累加到 `x/y`（从 pointerdown 快照绝对计算，避免累积漂移）。
- 缩放：手柄 pointermove 位移先反向旋转 `-rotation` 得局部 `dxLocal/dyLocal`，再按手柄方向改 `width/height`（w/n 边同时改 x/y），最小 1mm；Line 同时按比例缩放 `start/end`。
- 旋转：顶部圆形手柄，`angle = atan2(pointerY-cy, pointerX-cx)`，`rotation = 起始 rotation + (angle - 起始 angle)`（中心用 `getBoundingClientRect()` 的 AABB 中心，绕中心旋转时中心不变）。

选中态渲染虚线框（`.selection-box`，1px dashed）+ 8 手柄 + 旋转手柄，作为选中元素的子节点、随元素一起旋转（手柄天然落在旋转后的边角）。

## 6. CSS 变量（标尺主题）

定义在 `ruler.vue` 的 `<style scoped>`，JS 里用 `getComputedStyle` 读取（带兜底默认值）：

| 变量 | 默认值 | 含义 |
|---|---|---|
| `--pd-ruler-bg` | `#f8f9fc` | 标尺背景 |
| `--pd-ruler-tick` | `#c1c7cd` | 普通刻度颜色 |
| `--pd-ruler-tick-major` | `#5f6368` | 长刻度颜色 |
| `--pd-ruler-label` | `#5f6368` | 数字颜色 |
| `--pd-ruler-guide` | `#2c08df` | 引导线颜色 |
| `--pd-ruler-font-size` | `9px` | 数字字号 |

## 7. 工具函数（`src/lib/utils.ts`）

```ts
export function pxToMm(px: number) { return px * (25.4 / 96); }   // 96dpi 基准
export function mmToPx(mm: number) { return mm * (96 / 25.4); }
```

## 8. 依赖

- `@vueuse/core`：`useResizeObserver`（resize 自适应）。
- `reka-ui`：`NumberField` 系列（header 缩放框）。

## 9. 已知限制 / 待办（未来开发方向）

1. **纸张尺寸写死 A4**：`designState.paper` 固定，`setting`（属性台）是空壳，后续应接入纸张尺寸选择/自定义。
2. **文本不可编辑 / 表格无单元格数据**：文本双击进入编辑、表格单元格文本内容待做。
3. **Line 仅直线 + 端点拖动待做**：当前 Line 用包围盒统一缩放，端点拖动、折线/曲线待做。
4. **缩放范围 10%~200%**：`SCALE_MIN/MAX`，可放宽。
5. **标尺重绘**：引导线随 mousemove 全量重绘整条尺条，未用 rAF/离屏分层（尺条很小，暂可接受）。
6. **无撤销/重做**：header 的 Undo/Redo 是占位。
7. **素材台/属性台未实现**：左右面板空壳；素材台拖出元素到纸张、属性台编辑选中元素属性待做。
8. **导出/预览**：按钮占位；导出/打印需为每类型补 canvas `draw()` 策略渲染器。
9. **元素交互细节**：拖拽元素时因 `setPointerCapture`，状态栏鼠标坐标暂不更新；未做键盘微调 / 自动置顶 / 多选。
10. **坐标展示**：纸张左/上方的 22px 角区，mm 值可能为负（相对纸张原点），属预期。

## 10. 关键数值备忘

- 标尺厚度 / 角区：`22px`（Tailwind `top-5.5`/`left-5.5` = 22px）。
- 内容区四周留白：`32px`。
- 96dpi 下 `1mm ≈ 3.7795px`。
- A4 竖版 100% 尺寸：约 `794×1123px`。
