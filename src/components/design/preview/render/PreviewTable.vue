<template>
  <table ref="tableEl" :style="tableStyle">
    <colgroup>
      <col v-for="(w, i) in element.colWidths" :key="i" :style="{ width: `${w * pxPerMm}px` }" />
    </colgroup>
    <tbody>
      <tr
        v-for="row in rowViews"
        :key="row.key"
        :style="row.tr"
      >
        <td
          v-for="view in row.cells"
          :key="view.key"
          :rowspan="view.rowspan"
          :colspan="view.colspan"
          :style="view.td"
        >
          <div :class="view.atLeast ? '' : 'absolute inset-0'" :style="view.contentBox">
            <img
              v-if="view.image"
              :src="view.image"
              class="h-full w-full"
              :style="{ objectFit: view.objectFit }"
              draggable="false"
              alt=""
            />
            <div v-else :style="view.text">{{ view.display }}</div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
/**
 * 表格的纯渲染组件。
 *
 * ## 它接收的不是元素的行，而是**展开后的行序列**
 *
 * `rows` 是 `usePreviewLayout` 从 `expand.ts` 的结果里切出来的一片
 * （已含重复表头），每一项带自己的 `ctx`。组件本身**不知道数据有几行**，
 * 也不知道这是第几页 —— 那些都是分页层的事。这样的分工让"这一片该画哪几行"
 * 只有一处判断（`sliceIndexes`），而不是散在渲染逻辑里。
 *
 * ## 结构上刻意仍用 `<table>`
 *
 * 预览是我们自己排版，用 div 网格也能画。选 `<table>` 是因为**将来做打印时
 * 结构一致、CSS 能共享**（浏览器的打印引擎对 table 有原生分页支持：
 * 表头逐页重复、行内不断开 —— 那是 div 网格拿不到的）。现在多花的代价是零。
 *
 * ## 取数规则（§3.6，两半一起才成立）
 *
 * - **行 → 记录**：已由分页层决定（`rows[i].ctx` 就是那一行的上下文）；
 * - **列 → 字段**：只在**格子为空**时兜底。格子写了内容就以格子为准 ——
 *   `columnFields` 绝不回写单元格内容，它只是"这一列没写字也去取这个字段"。
 */
import { computed, nextTick, onMounted, onUpdated, ref } from "vue";
import type { CSSProperties } from "vue";
import { makeFieldToken, renderTemplate, type TemplateContext } from "@/lib/template";
import { gridCells, type GridRef } from "@/components/design/table/model";
import { DEFAULT_CELL_PADDING } from "@/components/design/table/model";
import {
  cellContentBoxStyle,
  cellTdStyle,
  cellTextStyle,
  tableBoxStyle
} from "@/components/design/render/style";
import { usePreviewStore } from "@/store/modules/preview";
import type { TableCellContent, TableElement } from "@/components/design/types";
import type { PreviewTableRow } from "../types";

const props = defineProps<{
  element: TableElement;
  rows: PreviewTableRow[];
  pxPerMm: number;
  /**
   * 测量模式（`MeasureLayer` 用）：rows = **全部展开行**、不分片，
   * 渲染后逐行量自然高上报 store。分片渲染（预览正文）不测量 ——
   * 测量与分页解耦是"行高自适应不卡死"的前提，见下方 measure 注释。
   */
  measureMode?: boolean;
}>();

const tableStyle = computed<CSSProperties>(() => tableBoxStyle(props.element, props.pxPerMm));

/**
 * 模板行号 → 该行的起始格列表。
 *
 * 只扫**模板网格**（`el.rows × el.cols`，通常 3×5），与展开后的行数无关 ——
 * 展开成 5000 行也只扫一次。这一步是必须的：直接在渲染函数里对每一行调
 * `gridCells(el)` 就是 O(展开行数 × 模板格数)，5000 行 × 5 列 = 25000 次全表扫描，
 * 表格一长就卡死。
 */
const cellsByTemplateRow = computed(() => {
  const map = new Map<number, GridRef[]>();
  for (const ref of gridCells(props.element)) {
    const list = map.get(ref.r);
    if (list) list.push(ref);
    else map.set(ref.r, [ref]);
  }
  return map;
});

interface CellView {
  key: string;
  colspan: number;
  rowspan: number;
  td: CSSProperties;
  contentBox: CSSProperties;
  text: CSSProperties;
  /** 渲染后的文本（表头 / 尾行 / 明细行都用各自行的 ctx） */
  display: string;
  /** 渲染后的图片地址；空串 = 不画图 */
  image: string;
  objectFit: "fill" | "contain" | "cover" | "none";
  /** 该格所在行是否自适应：决定内容层是绝对铺满还是正常流撑高 */
  atLeast: boolean;
}

interface RowView {
  key: string;
  /**
   * 展开序列下标（`PreviewTableRow.index`）—— 测量上报的**唯一身份**。
   *
   * ⚠️ 这个字段曾经被丢掉（RowView 只带了 templateRow），于是 measure() 里
   * `row.index` 恒为 undefined、防御判断把每一行都拦下，实测值一行都报不上去
   * —— 分页断点永远停在声明高上，"自适应像没生效"、第 2 页从 27 开始
   * （2026-09-21 真机）。它不是可有可无的注释字段，是测量链路的命脉。
   */
  index: number;
  /** 模板行号（取行高、atLeast 判定都用它） */
  templateRow: number;
  /** 声明行高（mm）。atLeast 行是"最小高"，内容可撑开 */
  height: number;
  /** 该模板行是否自适应（内容撑高） */
  atLeast: boolean;
  /** tr 的样式：fixed 行固定高，atLeast 行最小高 */
  tr: CSSProperties;
  cells: CellView[];
}

const preview = usePreviewStore();

const rowViews = computed<RowView[]>(() => {
  const el = props.element;
  const p = props.pxPerMm;
  const defaultPadding = el.cellStyle?.padding ?? DEFAULT_CELL_PADDING;
  /*
    实测值只进**渲染态**的最小高：分页器吃的融合值（expansionRowHeights）
    与这里同源同式（max(声明高, 实测)），于是"分页以为一行多高，
    画出来就多高"—— 行永远画在分页器给它划的空间里，不可能越过页边距线。

    测量态**刻意不吃**：minHeight 若含旧实测值，行就永远量不到"变矮"的
    自然高（列宽调宽 / 文本删短后，行高压不下去，永远卡在历史最大值）。
  */
  const measuredList = props.measureMode ? undefined : preview.measuredRowHeights[el.id];

  return props.rows.map((row, index) => {
    const refs = cellsByTemplateRow.value.get(row.templateRow) ?? [];
    const atLeast = el.rowHeightModes?.[row.templateRow] === "atLeast";
    const cells = refs.map<CellView>((ref) => {
      const cell = ref.cell;
      const content = cell.content;
      const pad = cell.style?.padding ?? defaultPadding;
      const resolved = resolveCell(content, ref.c, row.ctx);
      const td = cellTdStyle(el, cell, p);
      const contentBox = cellContentBoxStyle(content, pad, p);
      // atLeast 行要"内容撑开 td"：td 去掉裁切（绝对定位层不参与文档流、撑不起来）。
      // 只在本组件局部覆盖 —— 画布不撑高，共享样式函数不受影响。
      if (atLeast) td.overflow = "visible";
      return {
        key: `${index}-${ref.c}`,
        colspan: Math.max(1, cell.colspan),
        rowspan: Math.max(1, cell.rowspan),
        td,
        contentBox,
        text: cellTextStyle(content, p),
        display: resolved.text,
        image: resolved.image,
        objectFit: content?.objectFit ?? "contain",
        atLeast
      };
    });
    const height = el.rowHeights[row.templateRow] ?? 0;
    const effHeight = atLeast ? Math.max(height, measuredList?.[row.index] ?? 0) : height;
    return {
      key: `${index}-${row.templateRow}`,
      index: row.index,
      templateRow: row.templateRow,
      height,
      atLeast,
      tr: atLeast
        ? { minHeight: `${effHeight * p}px` }
        : { height: `${height * p}px` },
      cells
    };
  });
});

/**
 * 行高自适应的测量（**只在 measureMode 下激活**）。
 *
 * ## 为什么测量从"分片渲染"挪到了隐藏整表（2026-09-21 架构决策）
 *
 * 最初测量发生在"分页后的分片"里：测到的值改变分页 → 分片重排 → 再测 ——
 * 一个"渲染→测量→重排"反馈环。真机连出三案（亚像素震荡卡死、
 * watch 深比较含函数的 ctx 死循环、数据 5-31 凭空消失），证明这个环在
 * 真实浏览器时序下不可推理。
 *
 * 现在的口径：`MeasureLayer` 在视口外渲染一张**不分页的完整表**（本组件
 * measureMode=true，rows = 全部展开行），挂载后逐行量出自然高上报 store。
 * 测量结果与分页**零耦合** —— 分页器吃的是稳定输入，环不存在，重排最多一次。
 *
 * `measureMode` 下 tr 仍带 `minHeight`（声明高），所以量出的天然就是
 * `max(声明高, 自然高)`，与 `expansionRowHeights` 的 atLeast 语义一致。
 */
const tableEl = ref<HTMLTableElement | null>(null);

function measure() {
  const el = tableEl.value;
  if (!el) return;
  const p = props.pxPerMm;
  const trs = el.querySelectorAll("tbody > tr");
  if (trs.length !== rowViews.value.length) {
    // DOM 与行序列没对上 —— 测量的前提塌了，量出来的下标全是错位的。
    // 绝不拿错位数据上报（宁可这轮不测，等 onUpdated 的下一轮），并大声说出来。
    console.warn(
      `[measure] 表格 ${props.element.id} 的 tr 数(${trs.length})与行序列(${rowViews.value.length})不一致，本轮测量作废`
    );
    return;
  }
  // 上报**全量数组**（下标 = 展开序列下标，与 expansionRowHeights 的消费口径
  // 严格一致）：明细行每份记录不同、高度不同，必须逐实例测量（见 expand.ts）。
  // atLeast 行填实测值，其余填 0（= 不参与融合，回落声明高）。
  // 全量数组 + 整表替换是刻意的：测量层是唯一的上报者、且每次覆盖全部行，
  // 这样行高"变矮"（列宽调宽 / 文本删短）才能被观测到 —— 旧的 max 合并
  // 会让行高永远卡在历史最大值上。
  const values = new Array<number>(rowViews.value.length).fill(0);
  let hasValue = false;
  rowViews.value.forEach((row, i) => {
    if (!row.atLeast) return;
    if (!Number.isInteger(row.index) || row.index < 0) return;
    const tr = trs[i];
    if (!tr) return;
    // 量化到 0.1mm 且**向上取整**：分页按它累加"每页能放几行"，
    // 而渲染层把同一个值当最小高 —— 量出值 ≥ 自然高，分页就永远不会
    // 多排一行去越过页边距线。减 1e-6 是为了别把"刚好落在 0.1 刻度上"
    // 的值顶进下一档（否则量化在临界值上会来回跳）。
    const mm = Math.ceil((tr.getBoundingClientRect().height / p) * 10 - 1e-6) / 10;
    if (mm > 0) {
      values[row.index] = mm;
      hasValue = true;
    }
  });
  if (hasValue) preview.reportRowHeights(props.element.id, values);
}

// 测量模式：**渲染驱动**（onMounted + onUpdated），不是事件驱动（watch 时机）。
//
// ⚠️ 为什么不用 watch + nextTick（2026-09-22 真机排障教训，第二页从 26 开始）：
// watch 触发时 props 已变、`rowViews`（computed）读到的是**新**行序列，
// 但组件 DOM 可能还没 patch —— `trs[i]` 与行序列错位，502 行只有下标 1
// 撞上了旧 DOM，其余全被 `if (!tr) return` 跳过 → 实测值只生效一行，
// 分页断点恰好卡在"1 行真实高 + 500 行声明高"的 26 上。
// `onUpdated` 保证"跑的时候 DOM 一定刚按当前 props 更新完"，行序列与 DOM 严格同步。
// onUpdated 高频触发无害：store 端按容差短路，稳态测量不产生任何重排。
//
// 同理**绝不能 deep 监听 props.rows**：ctx 含函数、每次重算都是新引用，
// 深比较永远判"变" → 无限 measure（2026-09-21 卡死根因之一）。
if (props.measureMode) {
  onMounted(() => nextTick(measure));
  onUpdated(() => nextTick(measure));
}

defineExpose({ measure });

/**
 * 一格画什么。
 *
 * 三种情况，优先级从上到下：
 * 1. 图片格 → 字段值当图片地址（取不到值就空串，**绝不把 `{商品图}` 当 src**，
 *    否则浏览器会当相对路径发 404 + 裂图）；
 * 2. 格子有内容 → `renderTemplate` 渲值（内容里可以是"单价：{单价} 元"这样的混排）；
 * 3. 格子为空且该列声明了列映射 → 用 `columnFields[c]` 兜底。
 *
 * 第 3 条是**兜底而不是覆盖**：格子写了东西就以格子为准。这是 `columnFields`
 * 与"把内容直接写进单元格"两条路并存的前提 —— 否则它就是一份会覆盖用户输入的隐式配置。
 */
function resolveCell(
  content: TableCellContent | undefined,
  c: number,
  ctx: TemplateContext
): { text: string; image: string } {
  if (content?.type === "image") {
    return { text: "", image: renderTemplate(content.value, ctx).trim() };
  }

  const raw = content?.type === "text" ? (content.value ?? "") : "";
  if (raw !== "") return { text: renderTemplate(raw, ctx), image: "" };

  const field = props.element.columnFields?.[c];
  if (field) return { text: renderTemplate(makeFieldToken(field), ctx), image: "" };
  return { text: "", image: "" };
}
</script>
