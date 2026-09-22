<template>
  <div
    ref="rootRef"
    class="relative h-full w-full"
    :class="editing ? 'cursor-cell' : ''"
    @pointerdown="onRootPointerDown"
    @dragover="onCellDragOver"
    @drop="onCellDrop"
  >
    <!--
      改这段之前先读注释。

      单元格用 <table> 渲染。行高能做到 mm 精确靠两条，缺一不可：
      1. `<tr style="height">` 在表格布局里是**最小高度**。要让它成为精确高度，
         单元格里就不能有流内内容 —— 所以内容层是 `absolute inset-0`，
         脱离文档流后 td 的"内容高度"归零，高度完全由 tr 的 height 决定。
         内容超出时被 overflow:hidden 裁掉（第一期不做 atLeast 撑高，见设计文档 §9.4）。
      2. `table-layout: fixed` + 显式 <colgroup>：列宽只由数据决定。
         auto 布局下内容会参与列宽计算，文字一长列就变宽，mm 精度当场失效。

      边框走 td 的 border + `border-collapse: collapse`，共享边由浏览器合并 ——
      相邻两格之间那条线只画一次，不会两条并排加粗。冲突规则因此遵循 CSS 规范
      （更宽者胜 → 样式优先级 → 靠前者），不必自己裁决，表现与 Word/Excel 一致，
      也省掉一层手工几何（选区框、分隔线热区仍用 colOffsets/rowOffsets 前缀和）。

      将来做"表头行跨页重复"时，得先把"前 N 行是表头"这个声明加回 TableElement
      （预留字段 `headerRows` 已作为"只存不消费"删除，见 data-binding-design §11.14），
      再把那几行从 tbody 挪进 <thead>：浏览器的打印引擎对 table 有原生分页支持
      （表头逐页重复、行内不断开），这是 div 网格无论怎么写都拿不到的。
    -->
    <table :style="tableStyle">
      <colgroup>
        <col
          v-for="(w, i) in element.colWidths"
          :key="i"
          :style="{ width: `${w * pxPerMm}px` }"
        />
      </colgroup>
      <tbody>
        <tr v-for="row in rowViews" :key="row.key" :style="{ height: `${row.height * pxPerMm}px` }">
          <td
            v-for="view in row.cells"
            :key="view.key"
            :rowspan="view.rowspan"
            :colspan="view.colspan"
            :style="view.td"
            @pointerdown="onCellPointerDown(view, $event)"
            @dblclick.stop="onCellDblClick(view)"
            @contextmenu="onCellContextMenu(view)"
          >
            <div class="absolute inset-0 overflow-hidden" :style="view.contentBox">
              <img
                v-if="view.content?.type === 'image' && view.content.value"
                :src="view.content.value"
                class="h-full w-full"
                :style="{ objectFit: view.content.objectFit ?? 'contain' }"
                draggable="false"
                alt=""
              />
              <!--
                第 3 层编辑：与 TextElement 用同一套 textarea 范式。
                :value 绑 draft（组件内 ref，恒等于 DOM 值）→ 合成期间外部写入不会打断中文输入；
                @pointerdown.stop 必须留，否则在格内拖选文字会变成框选单元格。
              -->
              <textarea
                v-else-if="isEditingCell(view)"
                ref="editorRefs"
                rows="1"
                spellcheck="false"
                class="block h-full w-full resize-none border-0 bg-transparent p-0 outline-none select-text"
                :style="view.text"
                :value="draft"
                @input="onCellInput"
                @blur="onCellBlur(view)"
                @keydown.esc="onCellEscape"
                @pointerdown.stop
                @dblclick.stop
              ></textarea>
              <div v-else :style="view.text">{{ view.display }}</div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- 选区高亮与活动格：都在单元格之上，且不吃指针事件 -->
    <div
      v-if="selectionRect"
      class="bg-primary/10 pointer-events-none absolute"
      :style="pxRect(selectionRect)"
    ></div>
    <div
      v-if="activeRect"
      class="border-primary pointer-events-none absolute border-2"
      :style="pxRect(activeRect)"
    ></div>

    <!--
      行高列宽分隔线：**只在表格内编辑态出现**。
      不在编辑态也显示的话，它会和元素级的 8 个缩放手柄抢同一片区域 ——
      用户想缩放整张表，结果拖到了列宽上。
    -->
    <template v-if="editing">
      <div
        v-for="line in colGuides"
        :key="`cg-${line.index}`"
        class="absolute cursor-col-resize"
        :class="activeGuide === `c${line.index}` ? 'bg-primary/45' : 'hover:bg-primary/25'"
        :style="line.style"
        @pointerdown="onGuideDown('col', line.index, $event)"
        @dblclick.stop
      ></div>
      <div
        v-for="line in rowGuides"
        :key="`rg-${line.index}`"
        class="absolute cursor-row-resize"
        :class="activeGuide === `r${line.index}` ? 'bg-primary/45' : 'hover:bg-primary/25'"
        :style="line.style"
        @pointerdown="onGuideDown('row', line.index, $event)"
        @dblclick.stop
      ></div>
    </template>

    <!--
      行 / 列选择把手：需求 ③"右键当前行/列"的前提是"先能选中一行/列"。
      没有这个入口，"当前行"只能靠活动格隐式推断，而用户根本看不出当前是哪一行。
      放在元素框外（负偏移）是刻意的：框内的每一寸都已经被单元格占满了。
    -->
    <template v-if="editing">
      <div
        v-for="handle in colHandles"
        :key="`ch-${handle.index}`"
        class="absolute flex cursor-pointer items-center justify-center overflow-hidden text-[10px] leading-none select-none"
        :class="
          isColSelected(handle.index)
            ? 'bg-primary/60 text-primary-foreground'
            : 'bg-primary/15 text-primary hover:bg-primary/35'
        "
        :style="handle.style"
        @pointerdown="onColHandleDown(handle.index, $event)"
        @contextmenu="onColHandleContextMenu(handle.index)"
      >
        {{ colLabel(handle.index) }}
      </div>
      <!--
        行号槽的明细模板行标记：**只落在行号槽上**。

        为什么只能在这儿（表格文档 §1.5 约束 2 的同一条精神）：
        单元格内容区承载排版，给它加视觉标记会改字宽、破坏对齐测量；
        而行号槽本来就不承载内容，往上面加东西不影响任何几何。

        做成 2px 的左侧色条而不是改数字（≡3）：
        行号槽宽 18px、固定显示行号，加字符会把行号挤到两位/三位数时溢出，
        而色条零宽度代价、和数字并排一眼就能认出是哪一行。
        另配 title 说明它是什么意思 —— 光有一个色点，用户猜不出这是干什么的。
      -->
      <div
        v-for="handle in rowHandles"
        :key="`rh-${handle.index}`"
        class="absolute flex cursor-pointer items-center justify-center overflow-hidden text-[10px] leading-none select-none"
        :class="[
          isRowSelected(handle.index)
            ? 'bg-primary/60 text-primary-foreground'
            : 'bg-primary/15 text-primary hover:bg-primary/35',
          handle.index === element.detailRowIndex ? 'border-primary border-l-2' : ''
        ]"
        :title="
          handle.index === element.detailRowIndex
            ? '明细模板行：预览 / 打印时这一行会按数据行数纵向复制'
            : undefined
        "
        :style="handle.style"
        @pointerdown="onRowHandleDown(handle.index, $event)"
        @contextmenu="onRowHandleContextMenu(handle.index)"
      >
        {{ handle.index + 1 }}
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeMount, onUnmounted, ref, watch } from "vue";
import type { CSSProperties } from "vue";
import { useDesignStore } from "@/store/modules/design";
import { mmToPx } from "@/lib/utils";
import type { TableCellContent, TableElement } from "@/components/design/types";
import {
  cellAt,
  colLabel,
  colOffsets,
  colRange,
  DEFAULT_CELL_PADDING,
  expandRange,
  gridCells,
  normalizeRange,
  rangeContains,
  rangeOfPoint,
  resizeTrackPair,
  rowOffsets,
  rowRange,
  segmentAt
} from "@/components/design/table/model";
import {
  cellContentBoxStyle,
  cellTdStyle,
  cellTextStyle,
  tableBoxStyle
} from "@/components/design/render/style";
import { useDrag } from "../../composables/useDrag";
import { useSnapFeedback, type SnapKey } from "../../composables/useSnapFeedback";
import { snapEdge, snapTargets, snapTolerance } from "../../composables/useSnapTargets";
import { FIELD_MIME, getDraggingField } from "@/components/design/data/model";
import { useDataBinding } from "@/components/design/data/useDataBinding";

const store = useDesignStore();
const ops = useDataBinding();
const props = defineProps<{ element: TableElement }>();

const rootRef = ref<HTMLElement | null>(null);
const pxPerMm = computed(() => mmToPx(1) * store.scale);
const editing = computed(() => store.tableEditingId === props.element.id);

// 兜底补齐一次：老数据只有 rows/cols/cellStyle，缺 colWidths/rowHeights/cells。
// 放在挂载前是因为渲染层的每一个 computed 都直接读那几个数组。
onBeforeMount(() => store.updateTable(props.element.id, () => {}));

interface CellView {
  key: string;
  /** 起始格的网格坐标（textarea 定位、选区锚点都用它） */
  r: number;
  c: number;
  colspan: number;
  rowspan: number;
  td: CSSProperties;
  contentBox: CSSProperties;
  text: CSSProperties;
  content: TableCellContent | undefined;
  /** 单元格里写的文本原文（含 `{字段}` 占位符），**不替换** */
  display: string;
}

interface RowView {
  /** v-for 的 key */
  key: string;
  r: number;
  height: number;
  cells: CellView[];
}

/**
 * 表格级样式。
 *
 * 与 `cellTdStyle` / `cellContentBoxStyle` / `cellTextStyle` 一样，
 * 计算全部在 `render/style.ts` 里 —— 预览渲染组件调的是同一批函数，
 * 两边只差一个 `pxPerMm`（原因见那个文件的文件头）。
 */
const tableStyle = computed<CSSProperties>(() => tableBoxStyle(props.element, pxPerMm.value));

/**
 * 一屏要渲染的全部信息，一次算完并按行分组 ——
 * 模板里只做取值，不做几何，也不做分组。
 *
 * 按行分组是为了配合 `<tr>`：网格坐标 → tr 的对应关系必须在渲染前就确定，
 * 否则模板里每行都要重新扫一遍 cells 才知道自己有哪些格。
 */
const rowViews = computed<RowView[]>(() => {
  const el = props.element;
  const p = pxPerMm.value;
  const defaultPadding = el.cellStyle?.padding ?? DEFAULT_CELL_PADDING;
  const byRow = new Map<number, CellView[]>();

  for (const ref of gridCells(el)) {
    const cell = ref.cell;
    const content = cell.content;
    const pad = cell.style?.padding ?? defaultPadding;

    const list = byRow.get(ref.r) ?? [];
    list.push({
      key: `${ref.r}-${ref.c}`,
      r: ref.r,
      c: ref.c,
      colspan: Math.max(1, cell.colspan),
      rowspan: Math.max(1, cell.rowspan),
      td: cellTdStyle(el, cell, p),
      contentBox: cellContentBoxStyle(content, pad, p),
      text: cellTextStyle(content, p),
      content,
      display: ""
    });
    byRow.set(ref.r, list);
  }

  const baseRows = Array.from({ length: el.rows }, (_, r) => ({
    r,
    height: el.rowHeights[r] ?? 0,
    cells: byRow.get(r) ?? []
  }));

  /*
    画布**只渲染模板网格本身**，不做任何数据扩展。这是明确做过的决定，不是还没做：

    早先版本会按样本记录数把"明细模板行"复制 N 份（抄金蝶的规则）。改成
    "画布不渲染字段值"（§6.7 / 表格文档 §1.5 约束 2）之后，复制出来的 N 行内容
    **完全相同**，只剩视觉噪音；而代价是实打实的 —— `rowOffsets` 只认模板行，
    DOM 里一旦多出几行，行分隔线热区与行把手就会画在错的位置上。
    "哪一行要重复 N 遍"是**导出 / 套打**的语义，画布不承担。

    后来一度把这件事挪到面板的整表预览里（`detailRowIndex` + `data/tableRender.ts`），
    老板看过之后要求整块拿掉（§11.16）：表格的取数留到导出 / 套打阶段再做，
    不值得在面板上养一套"只有预览看得见"的展开规则。
  */
  return baseRows.map((row) => ({
    ...row,
    key: `r${row.r}`,
    cells: row.cells.map((cell) => ({ ...cell, display: renderCell(cell.content) }))
  }));
});

/**
 * 单元格的显示文本：**原样返回，一个字符都不替换**。
 *
 * 与 `TextElement.displayContent` 同一个口径（§6.7 / 表格文档 §1.5 约束 2）：
 * 设计态画布是排版视图，单元格里写 `{品名}` 就显示 `{品名}`，
 * 字宽与换行不跟着数据抖。
 *
 * 之所以还留一个函数、而不是在调用处内联 `content.value`：它是"这一格要吃数据"
 * 的**唯一入口**。将来预览 / 导出 / 打印态接线时，在**这里**接上
 * `renderTemplate(content.value, ctx)`（`ctx` 由导出层逐行构造）即可，
 * 不用去翻三处调用点。
 */
function renderCell(content: TableCellContent | undefined): string {
  if (content?.type !== "text") return "";
  return content.value;
}

/** 选区矩形（mm，相对表格左上角）。非编辑态不显示 —— 那是第 1 层的事 */
const selectionRect = computed(() => {
  if (!editing.value) return null;
  const range = store.cellRange;
  if (!range) return null;
  const ox = colOffsets(props.element);
  const oy = rowOffsets(props.element);
  const c1 = ox[range.c1] ?? 0;
  const r1 = oy[range.r1] ?? 0;
  return {
    x: c1,
    y: r1,
    width: (ox[range.c2 + 1] ?? c1) - c1,
    height: (oy[range.r2 + 1] ?? r1) - r1
  };
});

/** 活动格矩形：点在合并格内部时，整个合并区一起高亮（与选区扩张的语义一致） */
const activeRect = computed(() => {
  if (!editing.value) return null;
  const ac = store.activeCell;
  if (!ac) return null;
  const el = props.element;
  const ox = colOffsets(el);
  const oy = rowOffsets(el);
  const range = rangeOfPoint(el, ac.r, ac.c);
  const c1 = ox[range.c1] ?? 0;
  const r1 = oy[range.r1] ?? 0;
  return {
    x: c1,
    y: r1,
    width: (ox[range.c2 + 1] ?? c1) - c1,
    height: (oy[range.r2 + 1] ?? r1) - r1
  };
});

function pxRect(rect: { x: number; y: number; width: number; height: number }): CSSProperties {
  const p = pxPerMm.value;
  return {
    left: `${rect.x * p}px`,
    top: `${rect.y * p}px`,
    width: `${rect.width * p}px`,
    height: `${rect.height * p}px`
  };
}

/* ============================================================
   第 2 层：单元格选区
============================================================ */

/**
 * 屏幕坐标 → 网格坐标。
 *
 * 先用元素框的**实际渲染矩形**（已含缩放与滚动）取中心，
 * 再把点逆旋转到元素局部坐标 —— 元素转了 30°，鼠标位置与"第几列"的对应关系也跟着转，
 * 不做这一步的话旋转后的表格选区会完全对不上。
 */
function pointToCell(clientX: number, clientY: number): { r: number; c: number } | null {
  const root = rootRef.value;
  if (!root) return null;
  const el = props.element;
  const p = pxPerMm.value;
  const rect = root.getBoundingClientRect();
  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);
  const rad = ((el.rotation ?? 0) * Math.PI) / 180;
  const lx = dx * Math.cos(rad) + dy * Math.sin(rad);
  const ly = -dx * Math.sin(rad) + dy * Math.cos(rad);
  const mmX = lx / p + el.width / 2;
  const mmY = ly / p + el.height / 2;
  return {
    r: segmentAt(rowOffsets(el), mmY),
    c: segmentAt(colOffsets(el), mmX)
  };
}

/** 框选锚点（pointerdown 落下的那一格） */
const anchor = ref<{ r: number; c: number } | null>(null);

const drag = useDrag({
  onMove: (e) => {
    const from = anchor.value;
    if (!from) return;
    const to = pointToCell(e.clientX, e.clientY);
    if (!to) return;
    // 扩张到完整包含合并格：选区切到合并格一半时语义会悬空（改样式改给谁？）
    const range = expandRange(props.element, normalizeRange(from, to));
    store.setCellRange(range, to);
  },
  onEnd: () => {
    anchor.value = null;
  }
});
onUnmounted(drag.dispose);

/**
 * Esc 退出表格编辑态。
 *
 * 挂在 window 上而不是元素上：第 2 层的手势经常以"鼠标还在格子里、焦点却已经在 body"
 * 的状态结束（点一下表格并不会让任何元素获得焦点），挂在元素上的 keydown 收不到。
 * 第 3 层的 Esc 由 textarea 自己消费（它 stopPropagation 了，到不了这里）。
 */
function onWindowKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || !editing.value) return;
  // 焦点不在 textarea 上时的兜底：先退文本编辑，再按一次才退表格 —— 分两级退出，
  // 一次 Esc 把两层一起关掉的话，用户想改回上一个格就得重新进两次。
  if (store.cellEditing) {
    store.stopCellEditing();
    return;
  }
  store.exitTable();
}
window.addEventListener("keydown", onWindowKeyDown);
onUnmounted(() => window.removeEventListener("keydown", onWindowKeyDown));

function onCellPointerDown(view: CellView, e: PointerEvent) {
  if (e.button !== 0) return;
  // 非编辑态：不处理也不 stop，事件继续冒泡到 ElementWrapper —— 那里负责"选中 + 拖动整张表"
  if (!editing.value) return;
  // 正在编辑这一格：连 preventDefault 都不要，好让 textarea 能正常接收落点与拖选
  if (isEditingCell(view)) return;
  // 点到别的格 = 结束上一格的文本编辑。必须**显式**收，不能指望 textarea 的 blur：
  // 下面这行 preventDefault 拦掉的正是浏览器"按下鼠标即转移焦点"的默认行为，
  // 焦点不走 → blur 不来 → 只靠 onCellBlur 的话编辑态会一直挂着，用户点哪都还在改上一个格。
  // （内容由 @input 实时写进 store，所以这里不需要额外的提交动作。）
  store.stopCellEditing();
  e.preventDefault();
  // 刻意**不** stopPropagation：让事件照常冒泡到 document。
  // 挡住冒泡会顺手切断 reka 的菜单关闭（它挂在 document 冒泡阶段），
  // 于是"右键单元格 → 左键点另一格"时菜单不消失。
  // 不必担心 ElementWrapper 把这一下当成"拖走整张表"：它在表格内编辑态里会
  // 直接让位（见 onPointerDown 的 tableEditing 分支），画布根的取消选中也会
  // 因为落点在 [data-design-element] 内而跳过。
  const el = props.element;
  const point = { r: view.r, c: view.c };
  anchor.value = point;
  store.setCellRange(rangeOfPoint(el, point.r, point.c), point);
  drag.start(e);
}

/**
 * 编辑态下点在**表格自身的空白区 / 边框**：按 Excel 的惯例清空选区。
 * 同样不 stopPropagation —— 理由见 onCellPointerDown。
 *
 * 判定条件是「落点就是 root 自己」，而不是「事件到达了 root」——
 * 这两者差得非常远，踩过一次：
 * 单元格上的 pointerdown 会**冒泡到这里**（为了不切断 document 上的菜单关闭，
 * 单元格刻意没有 stopPropagation），若在这里无条件清空，就会在
 * onCellPointerDown 刚设好选区的下一行把它抹掉，表现为"点单元格不出现蓝框"。
 * 行列把手 / 分隔线同样是 root 的子元素，一并靠这个条件豁免，不再被误清。
 * 表格由 Σ colWidths × Σ rowHeights 决定尺寸、通常正好撑满元素框，
 * 所以这条路径主要覆盖的是表格没铺满时的边缘留白。
 */
function onRootPointerDown(e: PointerEvent) {
  if (!editing.value || e.button !== 0) return;
  if (e.target !== rootRef.value) return;
  store.stopCellEditing();
  store.setCellRange(null);
}

function onCellDblClick(view: CellView) {
  if (props.element.locked) return;
  store.enterTable(props.element.id);
  // 图片格没有可编辑的文本，双击只把它带进第 2 层
  if (view.content?.type === "image") return;
  store.startCellEditing(view.r, view.c);
}

/* ============================================================
   第 3 层：单元格内文本编辑
============================================================ */

const draft = ref("");
/** v-for 里的模板 ref 会收集成数组；同一时刻只有一个 textarea 存在 */
const editorRefs = ref<HTMLTextAreaElement[]>([]);

/**
 * 本表是否正处于第 3 层（格内文本编辑）。
 *
 * **必须先确认「本表就是那张活动表」，光比坐标不够。**
 * 画布上两张 3×5 的表，坐标 (0,2) 会同时命中两边 —— 第 3 层的状态是
 * 「全局单份 + 按坐标索引」，它本身不含"哪张表"这个信息。
 *
 * 只比坐标的后果是连锁的：编辑 A 表某格时，B 表同坐标的格子也渲染出一个 textarea，
 * 两个 textarea 在 watch 里互相抢焦点 → 先被聚焦的那个被抢走焦点后触发 blur →
 * `onCellBlur` 一比对坐标命中 → 把刚开好的 `cellEditing` 关掉。
 * 净效果就是"一有两个表格，双击就改不了字"。
 */
function isEditingCell(view: CellView) {
  if (!editing.value) return false;
  const cur = store.cellEditing;
  return !!cur && cur.r === view.r && cur.c === view.c;
}

/** 同上：非活动表不该因为这个坐标去写 draft、更不该去抢焦点 */
const editingKey = computed(() => {
  if (!editing.value) return null;
  const cur = store.cellEditing;
  return cur ? `${cur.r}:${cur.c}` : null;
});

watch(editingKey, () => {
  const cur = store.cellEditing;
  if (!cur) return;
  draft.value = cellAt(props.element, cur.r, cur.c)?.content?.value ?? "";
  nextTick(() => {
    const el = editorRefs.value[0];
    if (!el) return;
    el.focus();
    // 光标落末尾而不是全选：全选状态下下一笔输入会把内容整块替换，误删代价太大
    const end = el.value.length;
    el.setSelectionRange(end, end);
  });
});

function onCellInput(e: Event) {
  const value = (e.target as HTMLTextAreaElement).value;
  draft.value = value;
  // 兜底门禁：只有活动表能往自己身上写。正常路径上非活动表根本不存在 textarea
  // （见 isEditingCell），但真漏了的话这里会写成"打字进了另一张表"，代价太大。
  if (!editing.value) return;
  const cur = store.cellEditing;
  if (!cur) return;
  store.updateTable(props.element.id, (el) => {
    const cell = el.cells[cur.r * el.cols + cur.c];
    if (!cell) return;
    cell.content = { ...(cell.content ?? { type: "text" as const }), type: "text", value };
  });
}

/**
 * 失焦即退出。两道门禁缺一不可：
 *
 * 1. `editing` —— 只有**活动表**的失焦代表"这次编辑结束"。别的表格里恰好同坐标的格子
 *    若也渲染了 textarea（见 isEditingCell 的说明），它的失焦会替活动表把编辑态关掉。
 * 2. 坐标比对 —— 切换到另一格编辑时，旧 textarea 的卸载会让浏览器补一次 blur，
 *    那次迟到的 blur 会把刚开始的新编辑一起掐掉。
 */
function onCellBlur(view: CellView) {
  if (!editing.value) return;
  const cur = store.cellEditing;
  if (cur && cur.r === view.r && cur.c === view.c) store.stopCellEditing();
}

/** Esc = 提交并退出，不回滚（本项目没有撤销栈，回滚等于静默丢用户输入） */
function onCellEscape(e: KeyboardEvent) {
  // 输入法组字期间先按 Esc 是"取消候选字"，那一刻它属于输入法
  if (e.isComposing) return;
  e.stopPropagation();
  e.preventDefault();
  store.stopCellEditing();
}

/* ============================================================
   行高列宽
============================================================ */

const { setSnapKeys, clearSnapKeys } = useSnapFeedback();

/** 分隔线热区宽（屏幕 px）。再窄点不中，再宽会吃掉单元格的可点区域 */
const GUIDE_HIT_PX = 8;
/**
 * 行列把手尺寸（屏幕 px）。
 *
 * 它同时是"列标 / 行号"的容器，所以比单纯的抓取条宽一点 ——
 * 用**屏幕 px**而不是 mm：把手是浮层，缩到 50% 时也得看清是第几列。
 */
const HANDLE_SIZE_PX = 18;
/** 角度容差：只有真正 0° 才做吸附（旋转后 origin 不再是纸张坐标，吸附会算错） */
const SNAP_ALIGN_EPS = 1e-3;

interface HandleView {
  index: number;
  style: CSSProperties;
}

/** 列分隔线：第 i 条在列 i-1 与列 i 之间（i 从 1 起，所以共 cols-1 条） */
const colGuides = computed<HandleView[]>(() => {
  const el = props.element;
  const p = pxPerMm.value;
  const ox = colOffsets(el);
  return Array.from({ length: Math.max(0, el.cols - 1) }, (_, i) => {
    const index = i + 1;
    return {
      index,
      style: {
        left: `${ox[index] * p - GUIDE_HIT_PX / 2}px`,
        top: 0,
        bottom: 0,
        width: `${GUIDE_HIT_PX}px`
      }
    };
  });
});

const rowGuides = computed<HandleView[]>(() => {
  const el = props.element;
  const p = pxPerMm.value;
  const oy = rowOffsets(el);
  return Array.from({ length: Math.max(0, el.rows - 1) }, (_, i) => {
    const index = i + 1;
    return {
      index,
      style: {
        top: `${oy[index] * p - GUIDE_HIT_PX / 2}px`,
        left: 0,
        right: 0,
        height: `${GUIDE_HIT_PX}px`
      }
    };
  });
});

/** 列把手：宽度跟着列宽走，所以一眼能看出"这一列的宽度是多少" */
const colHandles = computed<HandleView[]>(() => {
  const el = props.element;
  const p = pxPerMm.value;
  const ox = colOffsets(el);
  return el.colWidths.map((w, index) => ({
    index,
    style: {
      left: `${ox[index] * p}px`,
      top: `${-HANDLE_SIZE_PX}px`,
      width: `${w * p}px`,
      height: `${HANDLE_SIZE_PX}px`
    }
  }));
});

const rowHandles = computed<HandleView[]>(() => {
  const el = props.element;
  const p = pxPerMm.value;
  const oy = rowOffsets(el);
  return el.rowHeights.map((h, index) => ({
    index,
    style: {
      top: `${oy[index] * p}px`,
      left: `${-HANDLE_SIZE_PX}px`,
      height: `${h * p}px`,
      width: `${HANDLE_SIZE_PX}px`
    }
  }));
});

function isColSelected(index: number) {
  const r = store.cellRange;
  const el = props.element;
  return !!r && r.c1 <= index && index <= r.c2 && r.r1 === 0 && r.r2 === el.rows - 1;
}

function isRowSelected(index: number) {
  const r = store.cellRange;
  const el = props.element;
  return !!r && r.r1 <= index && index <= r.r2 && r.c1 === 0 && r.c2 === el.cols - 1;
}

interface GuideDragState {
  axis: "col" | "row";
  /** 分隔线序号（1..n-1）：它改的是第 index-1 与第 index 两条轨道 */
  index: number;
  /** 手势开始时的尺寸快照。每次都从快照重算，避免逐帧累积浮点误差 */
  sizes: number[];
  /** 该分隔线在纸张坐标系里的初始位置（mm），吸附时以它为基准 */
  origin: number;
}

const guideDragState: GuideDragState = { axis: "col", index: 0, sizes: [], origin: 0 };
const activeGuide = ref<string | null>(null);

const guideDrag = useDrag({
  onMove: (e, dx, dy) => applyGuideDrag(dx, dy, e.altKey),
  onEnd: () => {
    activeGuide.value = null;
    clearSnapKeys();
  }
});
onUnmounted(guideDrag.dispose);

function onGuideDown(axis: "col" | "row", index: number, e: PointerEvent) {
  if (e.button !== 0 || props.element.locked) return;
  e.preventDefault();
  const el = props.element;
  // 先退出单元格文本编辑：textarea 抓着焦点的话，这一路的 pointermove 会被它吃掉
  store.stopCellEditing();
  const ox = colOffsets(el);
  const oy = rowOffsets(el);
  guideDragState.axis = axis;
  guideDragState.index = index;
  guideDragState.sizes = axis === "col" ? [...el.colWidths] : [...el.rowHeights];
  guideDragState.origin = axis === "col" ? el.x + ox[index] : el.y + oy[index];
  activeGuide.value = `${axis === "col" ? "c" : "r"}${index}`;
  guideDrag.start(e);
}

/**
 * 拖分隔线：只改相邻两条轨道，**总和不变 → 元素框不动**（文档 §1.5 约束 1）。
 *
 * 与"拖元素缩放手柄"的区别是刻意的：那条路是等比缩放全部行列、元素框跟着变。
 * 两种操作动的东西完全不同，所以是两条独立的分支，不要试图合并。
 */
function applyGuideDrag(dx: number, dy: number, altKey: boolean) {
  const el = props.element;
  const p = pxPerMm.value;
  // 屏幕位移 → 元素局部 mm。元素被旋转时，位移也要跟着转，否则斜着拖动会算出错误的增量
  const rad = ((el.rotation ?? 0) * Math.PI) / 180;
  const dxLocal = (dx * Math.cos(rad) + dy * Math.sin(rad)) / p;
  const dyLocal = (-dx * Math.sin(rad) + dy * Math.cos(rad)) / p;
  let delta = guideDragState.axis === "col" ? dxLocal : dyLocal;

  const hits: SnapKey[] = [];
  // 吸附只在 0° 时有几何意义 —— 转过角度之后 origin 已不是它在纸张上的真实位置。
  // 旋转态照旧能拖（局部换算精确），只是不吸，这比"干脆禁止拖"更符合预期。
  const normalized = (((el.rotation ?? 0) % 360) + 360) % 360;
  if (store.snapEnabled && !altKey && normalized < SNAP_ALIGN_EPS) {
    const tol = snapTolerance(p);
    const lines = snapTargets(guideDragState.axis === "col" ? "v" : "h");
    const snapped = snapEdge(guideDragState.origin + delta, lines, tol);
    delta = snapped.value - guideDragState.origin;
    if (snapped.hit) hits.push(snapped.hit);
  }

  const sizes = [...guideDragState.sizes];
  resizeTrackPair(sizes, guideDragState.index - 1, delta);
  store.updateTable(el.id, (table) => {
    if (guideDragState.axis === "col") table.colWidths = sizes;
    else table.rowHeights = sizes;
  });
  setSnapKeys(hits);
}

/**
 * 行 / 列把手按下：整行 / 整列选中。
 *
 * 与单元格一致，**不** stopPropagation —— 冒泡到 document 才能让右键菜单按
 * "点了别处"关掉（见 onCellPointerDown 的说明）。这里不担心被外层当成拖动整表：
 * 表格编辑态下 ElementWrapper 已经让位。
 */
function onColHandleDown(index: number, e: PointerEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  store.stopCellEditing();
  store.setCellRange(colRange(props.element, index), { r: 0, c: index });
}

function onRowHandleDown(index: number, e: PointerEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  store.stopCellEditing();
  store.setCellRange(rowRange(props.element, index), { r: index, c: 0 });
}

/*
  右键行 / 列把手：**刻意不 stopPropagation**。
  菜单是外层 ElementContextMenu 的 trigger 打开的，拦掉冒泡就没有菜单了。
  这里只负责把"选中哪一行/列"落下来 —— 菜单那边从 store.cellRange 读上下文，
  于是"右键行头"和"右键单元格"自然分流出两套菜单，不需要再传一个 context 参数。
*/
function onColHandleContextMenu(index: number) {
  store.setCellRange(colRange(props.element, index), { r: 0, c: index });
}

function onRowHandleContextMenu(index: number) {
  store.setCellRange(rowRange(props.element, index), { r: index, c: 0 });
}

/** 右键单元格：不在选区内就先选中它（Excel 语义），已在选区内则保留原选区 */
function onCellContextMenu(view: CellView) {
  if (!editing.value) return;
  const range = store.cellRange;
  if (range && rangeContains(range, view.r, view.c)) return;
  store.setCellRange(rangeOfPoint(props.element, view.r, view.c), { r: view.r, c: view.c });
}

/* ============================================================
   字段拖入：把素材台的字段拖到某个单元格
============================================================ */

/**
 * dragover **必须** preventDefault，否则浏览器不认为这里是有效放置目标、不会派发 drop。
 * 但只在自己关心的 MIME 上这么做：无条件 preventDefault 会抢走素材拖拽的落点，
 * 于是"把文本素材拖到表格上"会变成"往单元格里塞字"。
 *
 * 与画布同款：这里**不写任何响应式状态** —— dragover 每帧都触发。
 */
function onCellDragOver(e: DragEvent) {
  // 双通道门卫：模块变量有载荷就直接放行（dataTransfer 的 types 可能被扩展清空，
  // 见 model.ts draggingField）；素材/外部拖入两者皆无，照旧不接（落点归画布）。
  if (!getDraggingField() && !e.dataTransfer?.types.includes(FIELD_MIME)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
}

function onCellDrop(e: DragEvent) {
  // 主通道优先，dataTransfer 兜底（跨窗口拖入字段时模块变量为空）
  const dragging = getDraggingField();
  const raw = dragging ? JSON.stringify(dragging) : e.dataTransfer?.getData(FIELD_MIME);
  if (!raw) return;
  e.preventDefault();
  // 别让画布再处理一次 —— 否则会同时"插进单元格"和"尝试放置素材"
  e.stopPropagation();
  let payload: { field?: string; dataSetId?: string };
  try {
    payload = JSON.parse(raw) as { field?: string; dataSetId?: string };
  } catch {
    return;
  }
  const field = payload.field ?? "";
  if (!field) return;
  const cell = pointToTemplateCell(e.clientX, e.clientY);
  if (!cell) return;
  // 往单元格拖字段 = 声明"这张表用这个字段所属的数据集"，所以连 dataSetId 一起传
  ops.appendFieldToCell(props.element.id, cell.r, cell.c, field, payload.dataSetId);
}

/**
 * 落点 → 网格坐标（局部 mm → 行列，含旋转反算）。
 *
 * 画布只渲染模板网格，DOM 里的行与 `rowOffsets` 一一对应，所以这里**不需要**
 * 任何"把展开出来的数据行折算回模板行"的处理 —— 表格里压根没有数据行
 * （见 §11.10；曾经短暂存在的"面板整表预览"也已移除，§11.16）。
 * 函数名里的 "template" 是历史遗留，直接当 `pointToCell` 读即可。
 */
function pointToTemplateCell(clientX: number, clientY: number): { r: number; c: number } | null {
  const root = rootRef.value;
  const el = props.element;
  if (!root) return null;
  const p = pxPerMm.value;
  const rect = root.getBoundingClientRect();
  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);
  const rad = ((el.rotation ?? 0) * Math.PI) / 180;
  const lx = dx * Math.cos(rad) + dy * Math.sin(rad);
  const ly = -dx * Math.sin(rad) + dy * Math.cos(rad);
  const mmX = lx / p + el.width / 2;
  const mmY = ly / p + el.height / 2;
  const col = segmentAt(colOffsets(el), mmX);
  return { r: segmentAt(rowOffsets(el), mmY), c: col };
}
</script>
