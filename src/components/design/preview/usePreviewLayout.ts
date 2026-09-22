/**
 * 预览视图模型：把三个 store + 纯函数层编排成"页面已经可以直接渲染"的形状。
 *
 * 设计文档：`docs/preview-design.md` §2（三层职责）、§5（渲染层）。
 *
 * ## 为什么单独有一个 composable 而不是把这些塞进 PreviewPage.vue
 *
 * 因为它是**唯一**读 store 的那一层。分页 / 展开 / 体检三个纯函数模块都不认 Vue，
 * 而"元素从哪个 store 拿、ctx 用哪条记录构造、页码怎么注入"这些**编排**问题
 * 集中在这里 —— 于是"纯的部分"可以单独被 node 跑（`scripts/check-paginate.mjs`），
 * "脏的部分"只有这一处需要读着 store 去推理。
 *
 * ## 数据流
 *
 * ```
 * design.elements ─┬─▶ expand.ts       每个表格的行序列
 *                  ├─▶ inspect.ts      占位符体检（缺值清单）
 *                  └─▶ layout.ts ─▶ paginate.ts   每页有哪些块、块在页内什么位置
 *                          ↓
 *        preview.rowsById ─▶ 逐块构造 ctx（含逐页页码）─▶ PreviewView
 * ```
 */
import { computed } from "vue";
import { mmToPx } from "@/lib/utils";
import { useDesignStore } from "@/store/modules/design";
import { usePreviewStore } from "@/store/modules/preview";
import { useDataBinding } from "@/components/design/data/useDataBinding";
import { systemVariables } from "@/components/design/data/context";
import { flattenFields } from "@/components/design/data/model";
import { collectPlaceholderTexts, inspectPlaceholders } from "./inspect";
import type { InspectTarget } from "./inspect";
import { expandTable, expansionRowHeights, isDetailTable } from "./expand";
import { buildLayout } from "./layout";
import type { TableExpansion, PreviewItemView, PreviewTableRow, PreviewView } from "./types";
import type { Element, TableElement } from "@/components/design/types";
import type { LayoutWarning } from "./types";

/** 1mm 对应多少屏幕 px（不含缩放） */
export const PX_PER_MM = mmToPx(1);

export function usePreviewLayout() {
  const design = useDesignStore();
  const preview = usePreviewStore();
  const ops = useDataBinding();

  /**
   * 每个表格元素展开后的行序列。**所有表格都算**（包括静态表）——
   * 静态表的展开结果就是"整表原样"，走同一套代码比走两套少一类分支。
   */
  const expansions = computed(() => {
    const map = new Map<string, TableExpansion>();
    for (const el of design.elements) {
      if (el.type !== "table") continue;
      const ds = ops.effectiveDataSet(el);
      // 记录用「该元素绑定的数据集」的全量行；没绑 / 取数失败时是空数组，
      // 于是走 `onEmpty`（默认 keepTemplate：保留一行，表格不至于凭空消失）。
      const rows = preview.rowsOf(el.binding?.dataSetId);
      map.set(el.id, expandTable(el as TableElement, rows, ds?.options));
    }
    return map;
  });

  /** 每个表格展开后每行的高度（mm），与 `templateRows` 一一对应 */
  const rowHeights = computed(() => {
    const map = new Map<string, number[]>();
    for (const [id, expansion] of expansions.value) {
      const el = design.getElement(id);
      if (el?.type === "table") {
        map.set(id, expansionRowHeights(el, expansion, preview.measuredRowHeights[id]));
      }
    }
    return map;
  });

  /**
   * 占位符体检。
   *
   * 用**第 1 条记录**构造 ctx —— 与"元素在预览里取哪条记录"的口径一致
   * （明细表逐行取记录，但"字段存不存在"这件事只用一行就够了）。
   */
  const inspectWarnings = computed<LayoutWarning[]>(() => {
    const targets: InspectTarget[] = design.elements.map((el) => {
      const ds = ops.effectiveDataSet(el);
      const rows = preview.rowsOf(el.binding?.dataSetId);
      const row = rows[0];
      return {
        elementId: el.id,
        texts: collectPlaceholderTexts(el),
        // 这里只需要"取不取得到值"，页码之类的系统变量与它无关（`{$...}` 会被跳过）
        ctx: ops.renderContext(el, row, systemVariables()),
        dataSetName: ds?.name,
        dataSetMissing: !!el.binding?.dataSetId && !ds,
        fieldNames: new Set(flattenFields(ds?.fields).map((f) => f.name)),
        row
      };
    });
    return inspectPlaceholders(targets);
  });

  /** 版式告警：体检的清单 + 分页器的告警 */
  const layout = computed(() =>
    buildLayout({
      elements: design.elements,
      paper: design.paper,
      margin: design.marginMm,
      expansions: expansions.value,
      rowHeights: rowHeights.value,
      warnings: inspectWarnings.value
    })
  );

  /**
   * 明细表里跨行的合并格。
   *
   * 明细行会被复制 N 份，而 `rowspan` 的语义是"往下吃掉几行" ——
   * 复制之后它会吃掉**下一份明细行**的格子，画出来是错位的。
   * 这个组合不禁止（HTML 会宽容地裁掉多余的跨行），但**必须说一声** ——
   * 静默画错正是版式告警要消灭的那类问题。
   */
  const rowspanWarnings = computed<LayoutWarning[]>(() => {
    const out: LayoutWarning[] = [];
    for (const el of design.elements) {
      if (el.type !== "table") continue;
      const table = el as TableElement;
      if (!isDetailTable(table)) continue;
      const d = table.detailRowIndex as number;
      const crossing = table.cells
        .slice(d * table.cols, (d + 1) * table.cols)
        .some((cell) => !cell.covered && cell.rowspan > 1);
      if (crossing) {
        out.push({
          kind: "clipped",
          elementId: el.id,
          reason: "明细模板行里有跨行合并的单元格：这一行会被复制多份，跨行会吃掉下一份的格子"
        });
      }
    }
    return out;
  });

  /**
   * 行高自适应告警：哪些 atLeast 行被内容撑高了。
   *
   * 实测值按**展开下标**存（明细行每一份内容不同、高度不同），告警若逐实例报
   * 会有 500 条 —— 所以这里**按模板行聚合**（取该模板行所有展开实例的最大实测），
   * 一个被撑高的模板行只报一条，警告条才读得动。
   */
  const rowExpandedWarnings = computed<LayoutWarning[]>(() => {
    const out: LayoutWarning[] = [];
    for (const el of design.elements) {
      if (el.type !== "table") continue;
      const table = el as TableElement;
      const measured = preview.measuredRowHeights[el.id];
      if (!measured?.length) continue;
      const expansion = expansions.value.get(el.id);
      if (!expansion) continue;
      // 展开实例 → 模板行聚合最大实测
      const maxByTemplateRow = new Map<number, number>();
      expansion.templateRows.forEach((tr, i) => {
        const m = measured[i];
        if (typeof m !== "number" || m <= 0) return;
        maxByTemplateRow.set(tr, Math.max(maxByTemplateRow.get(tr) ?? 0, m));
      });
      for (const [r, actual] of maxByTemplateRow) {
        if (table.rowHeightModes?.[r] !== "atLeast") continue;
        const declared = table.rowHeights[r] ?? 0;
        if (actual > declared + 0.01) {
          out.push({ kind: "row-expanded", elementId: el.id, row: r, declared, actual });
        }
      }
    }
    return out;
  });

  const warnings = computed<LayoutWarning[]>(() => [
    ...layout.value.warnings,
    ...rowspanWarnings.value,
    ...rowExpandedWarnings.value
  ]);

  /**
   * 行高自适应的**测量诊断**（警告条显示）。
   *
   * 测量层是隐藏的，坏了没有任何肉眼可见的症状 —— 只会表现为"分页断点
   * 奇怪 / 数据像凭空消失"。这一栏把"应测多少行 / 实测到多少行"直接摆在
   * 警告条上：`2/500` 一眼就是测量层没工作，`500/500` 还断点错才轮到查分页器。
   */
  const measureDiagnostics = computed(() => {
    const out: { elementId: string; expected: number; measured: number; sample: number[] }[] = [];
    for (const [id, expansion] of expansions.value) {
      const el = design.getElement(id);
      if (el?.type !== "table") continue;
      const table = el as TableElement;
      if (!table.rowHeightModes?.includes("atLeast")) continue;
      const measured = preview.measuredRowHeights[id] ?? [];
      let expected = 0;
      let count = 0;
      const sample: number[] = [];
      expansion.templateRows.forEach((tr, i) => {
        if (table.rowHeightModes?.[tr] !== "atLeast") return;
        expected += 1;
        const v = measured[i];
        if (typeof v === "number" && v > 0) {
          count += 1;
          if (sample.length < 3) sample.push(Math.round(v * 10) / 10);
        }
      });
      out.push({ elementId: id, expected, measured: count, sample });
    }
    return out;
  });

  const view = computed<PreviewView>(() => {
    const pages = layout.value.pages;
    const pageCount = pages.length;
    const repeatedIds = layout.value.repeatedIds;

    const pageViews = pages.map((page) => {
      // 页码只有分页器知道，所以 sys 在这里逐页现算并注入（§3.7）
      const sys = systemVariables({ pageIndex: page.index + 1, pageCount });

      const items: PreviewItemView[] = [];

      for (const placed of page.items) {
        const el = design.getElement(placed.elementId);
        if (!el) continue;
        items.push(toItemView(el, placed.y, placed.height, sys, {
          rowStart: placed.rowStart,
          rowEnd: placed.rowEnd,
          withHeader: placed.withHeader
        }));
      }

      // 每页重复的元素：**页内位置 = 设计态坐标原样**（§3.2），所以这里直接用 el.y
      for (const id of repeatedIds) {
        const el = design.getElement(id);
        if (!el) continue;
        items.push(toItemView(el, el.y, el.height, sys, {}));
      }

      /*
        页内**绘序**：zIndex ↑。

        与分页用的流序（y ↑）刻意分开 —— 自由画布允许元素重叠（水印、盖章、叠字），
        "谁盖住谁"只由 zIndex 决定。Array.prototype.sort 在 V8 里是稳定的，
        所以同 zIndex 的元素保持"分页器放入的顺序"。
      */
      items.sort((a, b) => (a.element.zIndex ?? 0) - (b.element.zIndex ?? 0));

      return { index: page.index, items };
    });

    return { pages: pageViews, warnings: warnings.value };
  });

  /**
   * 把一个"落位"变成渲染项。
   *
   * 三种取值口径，界限要说清楚：
   * - **原子元素**：取该数据集第 1 条记录（"单据头"语义，与设计态单值元素一致）；
   * - **表格的整表/非明细行**：同上；
   * - **表格的明细行**：取该行对应的那条记录（`expansion.records[i]`）。
   */
  function toItemView(
    el: Element,
    y: number,
    height: number,
    sys: Record<string, unknown>,
    slice: { rowStart?: number; rowEnd?: number; withHeader?: boolean }
  ): PreviewItemView {
    const base: PreviewItemView = {
      element: el,
      x: el.x,
      y,
      width: el.width,
      height,
      sys,
      ctx: ops.renderContext(el, preview.rowsOf(el.binding?.dataSetId)[0], sys)
    };
    if (el.type !== "table") return base;

    const expansion = expansions.value.get(el.id);
    if (!expansion) return base;

    const indexes = sliceIndexes(expansion, slice);
    base.tableRows = indexes.map<PreviewTableRow>((i) => ({
      // index = 展开序列下标，行高自适应按它测量与回填（见 types.ts PreviewTableRow）
      index: i,
      templateRow: expansion.templateRows[i],
      ctx: ops.renderContext(el, expansion.records[i], sys)
    }));
    return base;
  }

  /**
   * 某表格展开后的**全量**行（测量层专用）。
   *
   * `MeasureLayer` 要在视口外渲染一张不分页的完整表来量行高 ——
   * 这里的行结构与 `toItemView` 的分片行**同源同构**（同 index/templateRow/ctx），
   * 保证"量出来的高度"就是"渲染时的高度"。sys 给占位页码：页码文本宽度
   * 不影响行高（不换行），测量无需真实的分页结果 —— 这正是"测量与分页解耦"。
   */
  function expansionRowsOf(id: string): PreviewTableRow[] {
    const expansion = expansions.value.get(id);
    const el = design.getElement(id);
    if (!expansion || el?.type !== "table") return [];
    const sys = systemVariables({ pageIndex: 1, pageCount: 1 });
    return expansion.templateRows.map((tr, i) => ({
      index: i,
      templateRow: tr,
      ctx: ops.renderContext(el, expansion.records[i], sys)
    }));
  }

  return {
    /** 渲染层要的全部东西 */
    view,
    /** 分页结果（页数、重复清单），工具条要用 */
    layout,
    /** 是否存在可见元素（区分"模板为空"与"都被隐藏了"） */
    hasElements: computed(() => design.elements.length > 0),
    /** 绑定了几个数据集（工具条显示） */
    dataSetCount: computed(() => collectCount(design.elements)),
    /** 单个数据集行数（工具条显示"共 N 行"） */
    rowCountOf: (id: string) => preview.rowsOf(id).length,
    /** 某个表格是不是明细表（表格分片的判定用） */
    isDetailTable,
    /** 某表格展开后的全量行（测量层用） */
    expansionRowsOf,
    /** 行高自适应测量诊断（警告条显示：应测 / 已测行数） */
    measureDiagnostics
  };
}

/**
 * 一个表格分片要画哪些行（`expansion.templateRows` 的下标）。
 *
 * 规则：
 * - `rowStart` / `rowEnd` 缺省 → 整表（不做行列切分）；
 * - `withHeader` 为真 → 在分片前**补上重复的表头行**。补的行数夹在 `[0, rowStart)` 里，
 *   否则"首片只放下了部分表头"这种情况会在同一页里把表头画两遍。
 */
function sliceIndexes(
  expansion: TableExpansion,
  slice: { rowStart?: number; rowEnd?: number; withHeader?: boolean }
): number[] {
  const total = expansion.templateRows.length;
  const start = slice.rowStart ?? 0;
  const end = slice.rowEnd ?? total;
  const head = slice.withHeader ? Math.min(expansion.headerRows, start) : 0;
  const out: number[] = [];
  for (let i = 0; i < head; i++) out.push(i);
  for (let i = start; i < end; i++) out.push(i);
  return out;
}

/** 模板里绑了多少个数据集（去重）。与 store 里的 `collectBoundDataSetIds` 同口径 */
function collectCount(elements: Element[]): number {
  const ids = new Set<string>();
  for (const el of elements) if (el.binding?.dataSetId) ids.add(el.binding.dataSetId);
  return ids.size;
}
