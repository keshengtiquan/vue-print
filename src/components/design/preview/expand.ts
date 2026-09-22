/**
 * 表格明细行展开（纯函数）。
 *
 * 设计文档：`docs/preview-design.md` §3.6。
 *
 * ## 为什么"自动分页"和"明细行展开"是同一件事的两半
 *
 * 设计态画布是**单张纸**、元素坐标是绝对 mm，所以普通元素"超出纸张"在设计态
 * 当场就看得见（会被裁掉）。真正"设计态看不见、只有取数后才知道"的，
 * 只有**行数由数据决定**的那一类内容。
 * 于是「自动分页」如果没有「明细行展开」，输入就只剩"元素被拖到纸外"这一种 ——
 * 而那本身就是设计态可见的。**只做分页引擎等于没有输入**。
 *
 * ## 三条规则（§3.6）
 *
 * ```
 * 行序列 = [0 .. detailRowIndex-1]      // 前区（表头等）：取第 1 条记录渲值
 *        + [detailRowIndex] × N        // 明细区：第 i 次取第 i 条记录
 *        + [detailRowIndex+1 .. rows-1] // 尾区（合计等）：取第 1 条记录渲值
 * ```
 *
 * 1. **非明细行一律取第 1 条记录** —— 与"画布上单个值元素取第一条"这条既有规则
 *    （`data-binding-design.md` §6.5 第 1 条）保持一致。若让表头也跟着数据行变，
 *    表头就会出现"第 3 行的表头显示第 3 条记录的单号"这种荒谬结果。
 * 2. **明细行的高度用模板行的高度**（首期不做行高自适应）——
 *    所以这里不返回高度，由调用方按 `templateRows[i]` 去查 `el.rowHeights`，
 *    "明细行的行高 = 模板行的行高"这条规则因此只有一处实现。
 *    （2026-09-21 起加"行高自适应"：见 `expansionRowHeights` 的 `measured` 参数，
 *    "模板行高"仍是基线，`atLeast` 行会被实测值撑高，规则点仍是这一处。）
 * 3. **`N === 0` 按数据集策略分流**：`keepTemplate` → 保留 1 行模板内容；
 *    `blank` → 0 行。后者让"没数据就不占位置"成为可能，前者让用户
 *    在取数失败时仍然看得见表格骨架。
 *
 * ## 零运行时依赖（只 `import type`）
 *
 * 与 `paginate.ts` 同款约束 —— 同样可以被 `node` 直接跑。
 */

import type { DataRow, DataSetOptions } from "@/components/design/data/types";
import type { TableElement } from "@/components/design/types";
import type { TableExpansion } from "./types";

const clampInt = (v: number | undefined, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/**
 * 这个表格元素是不是"按数据展开"的。
 *
 * 判据只有 `detailRowIndex` —— 它是**唯一声明**，绝不从内容里猜
 * （不猜"哪一行看起来像明细行"、也不从 `{字段}` 出现次数反推）。
 */
export function isDetailTable(el: TableElement): boolean {
  const d = el.detailRowIndex;
  return typeof d === "number" && d >= 0 && d < el.rows;
}

/**
 * 把表格展开成"输出行序列"。
 *
 * @param el      表格元素
 * @param rows    数据集的行（全量）；**空数组是合法输入**（走 onEmpty 策略）
 * @param options 数据集运行时策略（`onEmpty`）
 */
export function expandTable(
  el: TableElement,
  rows: DataRow[],
  options?: DataSetOptions
): TableExpansion {
  const templateRows: number[] = [];
  const records: (DataRow | undefined)[] = [];
  const first = rows[0];

  if (!isDetailTable(el)) {
    /*
      静态表：整表原样，一行都不复制。
      每一行都用第 1 条记录 —— 这就是"单据头表格"的语义（同一个单号填在多行里）。
      `expanded: false` 是给调用方的信号：这张表没有"片"的概念差异，
      分页时它和普通元素一样是"一个盒子按行切"。
    */
    for (let r = 0; r < el.rows; r++) {
      templateRows.push(r);
      records.push(first);
    }
    return {
      templateRows,
      records,
      headerRows: clampInt(el.headerRows, 0, el.rows, 0),
      expandedRowCount: templateRows.length,
      detailCopies: 0,
      expanded: false
    };
  }

  const d = clampInt(el.detailRowIndex, 0, el.rows - 1, 0);
  /*
    表头行数夹在 `[0, d]` 里：表头必须在明细行**之前**。
    面板上的下拉本来就不会给出越界的选项，但模板 JSON 可能被手工改过 ——
    一个 `headerRows > detailRowIndex` 会让"表头"里包含明细行本身，
    于是每片重复的那几行会带着第 N 条记录的值，看起来像数据错乱。
  */
  const headerRows = clampInt(el.headerRows, 0, d, 0);

  const detailCopies = detailCopyCount(rows.length, options?.onEmpty);

  for (let r = 0; r < d; r++) {
    templateRows.push(r);
    records.push(first);
  }
  for (let i = 0; i < detailCopies; i++) {
    templateRows.push(d);
    records.push(rows[i]);
  }
  for (let r = d + 1; r < el.rows; r++) {
    templateRows.push(r);
    records.push(first);
  }

  return {
    templateRows,
    records,
    headerRows,
    expandedRowCount: templateRows.length,
    detailCopies,
    expanded: true
  };
}

/**
 * 明细区复制几份。
 *
 * `rows.length === 0` 时的分流是**刻意的选择点**，不是兜底：
 * - `keepTemplate`（默认）：留 1 行 —— 取数失败 / 确实没数据时，
 *   用户看到的是"表格在那儿、里面是空的"，而不是"表格凭空消失了"；
 * - `blank`：0 行 —— 那一行的高度也一起消失，适合"没数据就不该占位"的版面。
 */
function detailCopyCount(rowCount: number, onEmpty: DataSetOptions["onEmpty"]): number {
  if (rowCount > 0) return rowCount;
  return onEmpty === "blank" ? 0 : 1;
}

/**
 * 某个表格元素展开后每行的高度（mm）。
 *
 * 单独抽出来是因为它要在三个地方被调（行数、总高、分页），
 * 而"明细行高 = 模板行高"这条规则一旦复制到多处，迟早有一处忘改。
 *
 * ## 行高自适应（2026-09-21，`docs/row-auto-height-design.md`）
 *
 * 模板行高是**基线**；`rowHeightModes[templateRow] === "atLeast"` 时，
 * 用实测值撑高（`max(声明高, measured)`），否则维持声明高。
 * 规则点仍只有这一处 —— 分页器吃到的 `rowHeights` 数组已经融合好了实测值。
 *
 * @param el        表格元素（读 `rowHeights` / `rowHeightModes`）
 * @param expansion 展开结果（`templateRows` 决定每行用哪条模板行高）
 * @param measured  实测行高（mm），**按展开序列下标索引**（与 `templateRows`
 *                  一一对应，长度 ≈ expansion 行数；稀疏缺省回落声明高）。
 *                  为什么不能按模板行号聚合取 max：**明细行每一份取的记录不同，
 *                  自然高度天差地别** —— 一条超长记录的 95mm 若被当成该模板行
 *                  所有实例的高度喂给分页器，而渲染时各行是各自的自然高度，
 *                  就会出现"一页没占满就换页"（2026-09-21 真机踩过）。
 *                  表头重复行内容相同，按展开下标测出的值相同，逐下标口径对它无损。
 */
export function expansionRowHeights(
  el: TableElement,
  expansion: TableExpansion,
  measured?: number[]
): number[] {
  const modes = el.rowHeightModes;
  return expansion.templateRows.map((r, i) => {
    const base = el.rowHeights[r] ?? 0;
    // 只有 atLeast 行才看实测值；行号 r 对应的声明模式缺省按 fixed 处理
    if (modes?.[r] !== "atLeast") return base;
    const m = measured?.[i];
    return typeof m === "number" && m > base ? m : base;
  });
}
