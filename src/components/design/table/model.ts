/**
 * 表格的纯函数模型层。
 *
 * 这里只做数据：矩阵操作、网格映射、几何前缀和、合并拆分、边框冲突解析。
 * 不碰 store、不碰 DOM、不依赖 Vue —— 因此可以单独推理与验证，
 * 也让「几何」这件事只有一份实现（渲染、命中检测、拖拽热区共用同一套 offsets）。
 *
 * 设计文档：docs/table-feature-design.md（§1.5 六条反向约束、§4 数据模型）
 */
import type {
  CellBorderEdge,
  CellBorderSide,
  CellRange,
  SizeMode,
  TableCell,
  TableElement
} from "@/components/design/types";

/** 行/列的最小尺寸（mm）。低于这个值既看不见也点不中 */
export const MIN_TRACK = 2;

/**
 * 表格默认边框线宽（mm）。
 *
 * **就是 1px**（25.4/96 mm ≈ 0.2646），不是"约等于 1px"的 0.26 ——
 * 线宽 UI 的单位是 px，存 0.26 换算回来是 0.98px，面板上就显示成 0.98，
 * 看着像默认值本身是残的。
 *
 * 这里写字面量而不是 import `lib/utils` 的 `MM_PER_PX` 是有意的：本模块要保持
 * **零运行时依赖**（只用 `import type`），才能脱离 Vite 直接拿 Node 跑验证。
 * 两者同源（1in = 25.4mm = 96px），改动时一起改。
 */
export const DEFAULT_BORDER_WIDTH = 25.4 / 96; // = 1px @96dpi
/** 表格默认边框颜色 */
export const DEFAULT_BORDER_COLOR = "#000000";
/** 单元格默认内边距（mm） */
export const DEFAULT_CELL_PADDING = 0.5;
/** 前 N 行设为表头时用的默认值 */
export const DEFAULT_ROW_MIN_HEIGHT = 6;

export const BORDER_SIDES: CellBorderSide[] = ["top", "right", "bottom", "left"];

/** 毫米取两位小数。表格里所有几何写入都过它，避免浮点噪声累积成"总和差 0.01" */
export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

/* ============================================================
   构造
============================================================ */

/**
 * 把 total(mm) 均分成 count 份，**最后一份吸收舍入误差**，保证 Σ ≡ total。
 * 不这么写的话，210/3 这类除不尽的宽度会让表格总宽与元素框差出零点几毫米，
 * 而"Σ colWidths ≡ width"是后面所有几何计算的立身之本。
 */
export function distribute(total: number, count: number): number[] {
  const n = Math.max(1, Math.floor(count));
  const each = round2(total / n);
  const arr = Array.from({ length: n }, () => each);
  arr[n - 1] = round2(total - each * (n - 1));
  return arr;
}

/**
 * 按目标总长等比缩放一组轨道尺寸，**末项吸收舍入误差**保证 Σ ≡ target。
 *
 * 这是"拖元素缩放手柄 → 等比缩放全部行列"这条约定的落点：
 * 用户改的是元素框总宽高，行列按现有比例分配，比例不变。
 * 不吸收误差的话，缩几次之后 Σ colWidths 会和 width 差出零点几毫米，
 * 表格内容与元素框、选区框就会各自错位。
 */
export function scaleTracks(sizes: number[], target: number): number[] {
  const total = sum(sizes);
  if (!sizes.length) return [];
  if (total <= 0) return distribute(target, sizes.length);
  const scaled = sizes.map((v) => round2((v * target) / total));
  const diff = round2(target - sum(scaled));
  scaled[scaled.length - 1] = round2(scaled[scaled.length - 1] + diff);
  return scaled;
}

/**
 * 把一组轨道尺寸等比缩放到 target 总长，**同时保证每项不低于 MIN_TRACK**。
 *
 * 与 `scaleTracks` 的分工：那个是"纯等比"，用在用户明确要把框改到某个尺寸时；
 * 这个是"插入列时把新列挤进去"的场景 —— 列数多了一列，总宽却要原地不动，
 * 于是所有列都得让出一点。缩放后总和恒等于 target，所以表格总宽不动。
 *
 * 只有在**原表里已有列贴着 MIN_TRACK** 时，等比结果才会跌破下限，
 * 这时把跌破的项抬回下限，抬出来的量再从"还有富余的列"里按富余比例扣回去 ——
 * 不这样做的话，插几列之后会出现 1.2mm 这种既看不见也点不中的列。
 */
export function fitTracks(sizes: number[], target: number): number[] {
  const n = sizes.length;
  if (!n) return [];
  const minTotal = round2(MIN_TRACK * n);
  if (target <= minTotal) return distribute(target, n); // 空间连下限都不够，只能人人平分
  let out = scaleTracks(sizes, target);
  for (let pass = 0; pass < 4; pass++) {
    const deficit = round2(sum(out.map((v) => Math.max(0, MIN_TRACK - v))));
    if (deficit <= 0) break; // 常态：等比结果全部达标，一轮就出
    out = out.map((v) => Math.max(MIN_TRACK, v));
    const surplus = round2(sum(out) - minTotal);
    if (surplus <= 0) break;
    const ratio = deficit / surplus;
    out = out.map((v) => (v > MIN_TRACK ? round2(v - (v - MIN_TRACK) * ratio) : v));
  }
  // 收尾把舍入残差贴到最宽的一项，保证 Σ ≡ target（"Σ 轨道 ≡ 元素框"这条不变量）
  const diff = round2(target - sum(out));
  if (diff !== 0) {
    let widest = 0;
    for (let i = 1; i < n; i++) if (out[i] > out[widest]) widest = i;
    out[widest] = round2(out[widest] + diff);
  }
  return out;
}

export function createCell(): TableCell {
  return { colspan: 1, rowspan: 1 };
}

/** 被合并覆盖的格子 */
export function coveredCell(): TableCell {
  return { colspan: 1, rowspan: 1, covered: true };
}

export function createCells(rows: number, cols: number): TableCell[] {
  return Array.from({ length: Math.max(1, rows) * Math.max(1, cols) }, () => createCell());
}

/** 素材台拖出表格时的完整默认值 */
export function createTableDefaults(
  width: number,
  height: number,
  rows: number,
  cols: number
): Pick<TableElement, "rows" | "cols" | "colWidths" | "rowHeights" | "cells" | "rowRoles" | "headerRows"> {
  const r = Math.max(1, rows);
  const c = Math.max(1, cols);
  return {
    rows: r,
    cols: c,
    colWidths: distribute(width, c),
    rowHeights: distribute(height, r),
    cells: createCells(r, c),
    rowRoles: Array.from({ length: r }, () => "normal" as const),
    headerRows: 0
  };
}

/* ============================================================
   归一化与几何不变量
============================================================ */

/** 索引：网格坐标 → cells 下标。列数变化会让它失效，所以它是**计算**而非存储 */
export function cellIndex(cols: number, r: number, c: number): number {
  return r * cols + c;
}

export function cellAt(el: TableElement, r: number, c: number): TableCell | undefined {
  if (r < 0 || c < 0 || r >= el.rows || c >= el.cols) return undefined;
  return el.cells[r * el.cols + c];
}

/**
 * 补齐缺省字段（幂等，就地修改）。
 *
 * 谁权威：**数组优先**。colWidths/rowHeights 只要有内容就以它为准去定 rows/cols，
 * 只在完全缺失时（旧数据只有 rows/cols/cellStyle）才按元素宽高均分重建。
 * 反过来以 rows/cols 为准的话，一次"插入列只改了数组"就会被这里推回去。
 */
export function normalizeTable(el: TableElement): void {
  if (!Array.isArray(el.colWidths) || el.colWidths.length === 0) {
    el.cols = Math.max(1, Math.floor(el.cols || 1));
    el.colWidths = distribute(el.width, el.cols);
  } else {
    el.cols = el.colWidths.length;
  }
  if (!Array.isArray(el.rowHeights) || el.rowHeights.length === 0) {
    el.rows = Math.max(1, Math.floor(el.rows || 1));
    el.rowHeights = distribute(el.height, el.rows);
  } else {
    el.rows = el.rowHeights.length;
  }
  if (!Array.isArray(el.cells) || el.cells.length !== el.rows * el.cols) {
    // 长度对不上说明数据被外部改坏了（例如旧版只有 rows/cols）。
    // 这里重建会丢内容，但比让渲染层拿到 undefined 崩掉好 —— 而且这条路径只在异常态走。
    el.cells = createCells(el.rows, el.cols);
  }
  for (const cell of el.cells) {
    cell.colspan = Math.max(1, Math.floor(cell.colspan || 1));
    cell.rowspan = Math.max(1, Math.floor(cell.rowspan || 1));
  }
  if (!Array.isArray(el.rowRoles) || el.rowRoles.length !== el.rows) {
    el.rowRoles = Array.from({ length: el.rows }, () => "normal" as const);
  }
  if (!Array.isArray(el.rowHeightModes) || el.rowHeightModes.length !== el.rows) {
    el.rowHeightModes = Array.from({ length: el.rows }, () => "fixed" as const);
  }
  if (!Array.isArray(el.colWidthModes) || el.colWidthModes.length !== el.cols) {
    el.colWidthModes = Array.from({ length: el.cols }, () => "fixed" as const);
  }
}

/**
 * 回算几何不变量：元素框尺寸 ≡ 行列尺寸之和。
 *
 * 所有结构性变更（插入/删除行列、拖分隔线）的出口都走它，
 * 于是"改数组"和"改元素框"永远不会各说各话。
 * width/height 是**结果**不是输入 —— 谁想改总宽高，请去改 colWidths/rowHeights。
 */
export function syncTableGeometry(el: TableElement): void {
  el.rows = el.rowHeights.length;
  el.cols = el.colWidths.length;
  el.width = round2(sum(el.colWidths));
  el.height = round2(sum(el.rowHeights));
}

/* ============================================================
   网格映射（ProseMirror TableMap 的简化版）
============================================================ */

export interface GridRef {
  /** 该格左上角的网格坐标 */
  r: number;
  c: number;
  cell: TableCell;
}

/**
 * 网格映射：每个网格坐标 → 占据它的那个"起始格"。
 * 合并区里除左上角之外的坐标都指向同一个 GridRef，
 * 于是"这个位置是谁"永远是一次 O(1) 查表，不用做拓扑推导。
 */
export function buildTableMap(el: TableElement): (GridRef | null)[][] {
  const map: (GridRef | null)[][] = Array.from({ length: el.rows }, () =>
    Array.from({ length: el.cols }, () => null)
  );
  const refs = gridCells(el);
  for (const ref of refs) {
    for (let dr = 0; dr < ref.cell.rowspan; dr++) {
      for (let dc = 0; dc < ref.cell.colspan; dc++) {
        const rr = ref.r + dr;
        const cc = ref.c + dc;
        if (rr < el.rows && cc < el.cols) map[rr][cc] = ref;
      }
    }
  }
  return map;
}

/** 所有"起始格"（渲染时要画的就是这些），按行优先顺序 */
export function gridCells(el: TableElement): GridRef[] {
  const out: GridRef[] = [];
  for (let r = 0; r < el.rows; r++) {
    for (let c = 0; c < el.cols; c++) {
      const cell = el.cells[r * el.cols + c];
      if (cell && !cell.covered) out.push({ r, c, cell });
    }
  }
  return out;
}

/** 该格在网格上占据的行区间 / 列区间（右开） */
export function cellSpan(el: TableElement, ref: GridRef) {
  return {
    r0: ref.r,
    r1: Math.min(el.rows, ref.r + ref.cell.rowspan),
    c0: ref.c,
    c1: Math.min(el.cols, ref.c + ref.cell.colspan)
  };
}

/**
 * 列索引 → Excel 式列标：0→A、25→Z、26→AA、27→AB。
 *
 * 两份消费方（画布的列把手、面板的选区信息条），所以放在模型层当唯一来源 ——
 * 各写一份的话，迟早会在"第 27 列叫什么"这种边界上分叉。
 */
export function colLabel(index: number): string {
  let label = "";
  let n = Math.floor(index);
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

/* ============================================================
   几何
============================================================ */

/** 前缀和 → 每条分隔线的位置（mm），长度 = 轨道数 + 1，首项恒为 0 */
export function trackOffsets(sizes: number[]): number[] {
  const out: number[] = [0];
  for (const s of sizes) out.push(out[out.length - 1] + s);
  return out;
}

export const colOffsets = (el: TableElement) => trackOffsets(el.colWidths);
export const rowOffsets = (el: TableElement) => trackOffsets(el.rowHeights);

/** 某条轨道在 [offsets[i], offsets[i+1]) 内，落在哪一段；超出范围钳到最近的一段 */
export function segmentAt(offsets: number[], v: number): number {
  const n = offsets.length - 1;
  if (n <= 0) return 0;
  if (v <= offsets[0]) return 0;
  if (v >= offsets[n]) return n - 1;
  for (let i = 0; i < n; i++) {
    if (v >= offsets[i] && v < offsets[i + 1]) return i;
  }
  return n - 1;
}

/*
  单元格自身的矩形不需要在这里算：渲染层是 <table>，格子位置由浏览器布局给出，
  不再需要"逐格算出 x/y/宽/高 再绝对定位"。前缀和（trackOffsets）仍要保留 ——
  选区框、分隔线热区、行列把手都是相对表格定位的浮层，它们没有表格布局可依托。
*/

/* ============================================================
   选区
============================================================ */

export interface CellPoint {
  r: number;
  c: number;
}

export function normalizeRange(a: CellPoint, b: CellPoint): CellRange {
  return {
    r1: Math.min(a.r, b.r),
    c1: Math.min(a.c, b.c),
    r2: Math.max(a.r, b.r),
    c2: Math.max(a.c, b.c)
  };
}

export function rangeContains(range: CellRange, r: number, c: number): boolean {
  return r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;
}

export function rangeCellCount(range: CellRange): number {
  return (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1);
}

export function isSingleCell(range: CellRange): boolean {
  return range.r1 === range.r2 && range.c1 === range.c2;
}

/** 整行选区 */
export const rowRange = (el: TableElement, r: number): CellRange => ({
  r1: r,
  c1: 0,
  r2: r,
  c2: el.cols - 1
});

/** 整列选区 */
export const colRange = (el: TableElement, c: number): CellRange => ({
  r1: 0,
  c1: c,
  r2: el.rows - 1,
  c2: c
});

export function clampRange(range: CellRange, el: TableElement): CellRange {
  return {
    r1: clamp(range.r1, 0, el.rows - 1),
    c1: clamp(range.c1, 0, el.cols - 1),
    r2: clamp(range.r2, 0, el.rows - 1),
    c2: clamp(range.c2, 0, el.cols - 1)
  };
}

/**
 * 把选区扩张到"包含完整的合并格"。
 *
 * 合并格占据多个网格坐标，选区若只切到它的一半，语义就悬空了：
 * 改样式该改给谁？删行该删哪一段？所以任何选区进入系统前都先过这一步，
 * 扩张到"要么整格在内、要么整格在外"。迭代到不动点是因为扩张可能碰到新的合并格。
 */
export function expandRange(el: TableElement, range: CellRange): CellRange {
  const map = buildTableMap(el);
  let { r1, c1, r2, c2 } = range;
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const ref = map[r]?.[c];
        if (!ref) continue;
        const span = cellSpan(el, ref);
        const nr1 = Math.min(r1, span.r0);
        const nc1 = Math.min(c1, span.c0);
        const nr2 = Math.max(r2, span.r1 - 1);
        const nc2 = Math.max(c2, span.c1 - 1);
        if (nr1 !== r1 || nc1 !== c1 || nr2 !== r2 || nc2 !== c2) {
          r1 = nr1;
          c1 = nc1;
          r2 = nr2;
          c2 = nc2;
          changed = true;
        }
      }
    }
  }
  return { r1, c1, r2, c2 };
}

/** 某个网格坐标所属的完整合并区（点合并格内部时，选中它整体） */
export function rangeOfPoint(el: TableElement, r: number, c: number): CellRange {
  const cell = cellAt(el, r, c);
  if (!cell || cell.covered) return { r1: r, c1: c, r2: r, c2: c };
  return { r1: r, c1: c, r2: r + cell.rowspan - 1, c2: c + cell.colspan - 1 };
}

/** 选区当前覆盖的"起始格"列表（用于批量改样式，不含被覆盖的格） */
export function refsInRange(el: TableElement, range: CellRange): GridRef[] {
  const map = buildTableMap(el);
  const seen = new Set<GridRef>();
  const out: GridRef[] = [];
  for (let r = range.r1; r <= range.r2; r++) {
    for (let c = range.c1; c <= range.c2; c++) {
      const ref = map[r]?.[c];
      if (!ref || seen.has(ref)) continue;
      seen.add(ref);
      out.push(ref);
    }
  }
  return out;
}

/* ============================================================
   合并 / 拆分
============================================================ */

/**
 * 能否合并。
 *
 * 两条限制，都是几何上的硬要求而非偏好：
 * 1. 选区必须是矩形（已经在类型上保证）；
 * 2. 选区里不能有"被外部合并覆盖"的格，也不能有"跨越了选区边界"的合并格 ——
 *    后者若允许，合并结果会是个非矩形，网格拓扑直接破掉。
 */
export function canMerge(el: TableElement, range: CellRange): boolean {
  if (isSingleCell(range)) return false;
  for (let r = range.r1; r <= range.r2; r++) {
    for (let c = range.c1; c <= range.c2; c++) {
      const cell = el.cells[r * el.cols + c];
      if (!cell) return false;
      if (cell.covered) return false;
      if (r + cell.rowspan - 1 > range.r2 || c + cell.colspan - 1 > range.c2) return false;
    }
  }
  return true;
}

/** 合并：只保留左上角内容（文档 §4 的约定），其余格标记为 covered 并清空内容与样式 */
export function mergeRange(el: TableElement, range: CellRange): void {
  if (!canMerge(el, range)) return;
  const main = el.cells[range.r1 * el.cols + range.c1];
  if (!main) return;
  main.colspan = range.c2 - range.c1 + 1;
  main.rowspan = range.r2 - range.r1 + 1;
  main.covered = false;
  for (let r = range.r1; r <= range.r2; r++) {
    for (let c = range.c1; c <= range.c2; c++) {
      if (r === range.r1 && c === range.c1) continue;
      const cell = el.cells[r * el.cols + c];
      if (!cell) continue;
      cell.colspan = 1;
      cell.rowspan = 1;
      cell.covered = true;
      cell.content = undefined;
      cell.style = undefined;
    }
  }
}

/** 该格是否是合并格（任一方向跨格） */
export function isMergedCell(cell: TableCell): boolean {
  return cell.colspan > 1 || cell.rowspan > 1;
}

/**
 * 拆分：把合并格还原成 colspan × rowspan 个独立格。
 * 内容只留在左上角 —— 与合并的语义对称（合并不可能变出内容来，拆分也就不该变出）。
 */
export function splitCell(el: TableElement, r: number, c: number): void {
  const cell = el.cells[r * el.cols + c];
  if (!cell || !isMergedCell(cell)) return;
  const a = cell.colspan;
  const b = cell.rowspan;
  cell.colspan = 1;
  cell.rowspan = 1;
  cell.covered = false;
  for (let dr = 0; dr < b; dr++) {
    for (let dc = 0; dc < a; dc++) {
      if (dr === 0 && dc === 0) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= el.rows || cc >= el.cols) continue;
      el.cells[rr * el.cols + cc] = createCell();
    }
  }
}

/** 选区里所有合并格都拆开（供"删除行列"前调用） */
export function splitMergedInRange(el: TableElement, range: CellRange): void {
  for (const ref of refsInRange(el, range)) {
    if (isMergedCell(ref.cell)) splitCell(el, ref.r, ref.c);
  }
}

/* ============================================================
   插入 / 删除行列
============================================================ */

/**
 * 拆开所有与指定行/列相交的合并格。
 *
 * 删除行列前必须先做这一步：一个跨行的合并格如果被删掉中间一行，
 * rowspan 与实际占位就对不上了，网格会静默错位（比拆开难查得多）。
 * 拆开是"看得见的行为"，用户能理解。
 */
function expandMergesCrossing(el: TableElement, rows: Set<number>, cols: Set<number>): void {
  for (let r = 0; r < el.rows; r++) {
    for (let c = 0; c < el.cols; c++) {
      const cell = el.cells[r * el.cols + c];
      if (!cell || cell.covered || !isMergedCell(cell)) continue;
      const a = cell.colspan;
      const b = cell.rowspan;
      let hit = false;
      for (let dr = 0; dr < b && !hit; dr++) if (rows.has(r + dr)) hit = true;
      for (let dc = 0; dc < a && !hit; dc++) if (cols.has(c + dc)) hit = true;
      if (!hit) continue;
      const keep = cell.content;
      const keepStyle = cell.style;
      cell.colspan = 1;
      cell.rowspan = 1;
      cell.covered = false;
      for (let dr = 0; dr < b; dr++) {
        for (let dc = 0; dc < a; dc++) {
          if (dr === 0 && dc === 0) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= el.rows || cc >= el.cols) continue;
          el.cells[rr * el.cols + cc] = createCell();
        }
      }
      cell.content = keep;
      cell.style = keepStyle;
    }
  }
}

/** 新行/新列的默认尺寸：借相邻轨道的高度，"插一行结果行高突兀"是很差的体验 */
function borrowSize(sizes: number[], at: number): number {
  return round2(sizes[at] ?? sizes[at - 1] ?? sizes[0] ?? 8);
}

/**
 * 在第 at 行**之前**插入一行（at === rows 表示追加到末尾）。
 *
 * 跨越插入线的合并格 rowspan + 1（Word 行为：合并格跟着长高），
 * 被它盖住的那些新格标记为 covered —— 否则合并区里会凭空多出一个能选中的格。
 */
export function insertRow(el: TableElement, at: number): void {
  const a = clamp(Math.floor(at), 0, el.rows);
  const cols = el.cols;
  const coveredFlags = Array.from({ length: cols }, () => false);
  for (let r = 0; r < a; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = el.cells[r * cols + c];
      if (!cell || cell.covered) continue;
      if (r + cell.rowspan > a) {
        cell.rowspan += 1;
        for (let dc = 0; dc < cell.colspan && c + dc < cols; dc++) coveredFlags[c + dc] = true;
      }
    }
  }
  const row: TableCell[] = coveredFlags.map((covered) => (covered ? coveredCell() : createCell()));
  el.cells.splice(a * cols, 0, ...row);
  el.rowHeights.splice(a, 0, borrowSize(el.rowHeights, a));
  el.rowRoles?.splice(a, 0, "normal");
  el.rowHeightModes?.splice(a, 0, "fixed");
}

/** 在第 at 列**之前**插入一列（at === cols 表示追加到末尾） */
export function insertCol(el: TableElement, at: number): void {
  const oldCols = el.cols;
  const a = clamp(Math.floor(at), 0, oldCols);
  const coveredFlags = Array.from({ length: el.rows }, () => false);
  for (let r = 0; r < el.rows; r++) {
    for (let c = 0; c < a; c++) {
      const cell = el.cells[r * oldCols + c];
      if (!cell || cell.covered) continue;
      if (c + cell.colspan > a) {
        cell.colspan += 1;
        coveredFlags[r] = true;
      }
    }
  }
  const next: TableCell[] = [];
  for (let r = 0; r < el.rows; r++) {
    for (let c = 0; c <= oldCols; c++) {
      if (c === a) {
        next.push(coveredFlags[r] ? coveredCell() : createCell());
      } else {
        next.push(el.cells[r * oldCols + (c < a ? c : c - 1)]);
      }
    }
  }
  el.cells = next;

  /*
    列宽：**表格总宽不变**，多出来的一列从整行里匀，不往外长。
    （打印场景里表格宽度通常就是内容区宽度 —— 插一列把表格顶出右边界，
    用户还得回头去缩它，这是纯手动的负担。）

    两步：新列先按**相邻列的宽度**挂进去（新列与邻居同宽，视觉上最好理解），
    再让整组等比缩回原来的总宽。等比的好处是"在内部变"这件事对所有列一视同仁：
    原本等宽的表插完还是等宽，手工调过比例的表保持原比例，不会有某一列被单独牺牲。
    下限由 fitTracks 兜住（列贴着 MIN_TRACK 时不会缩成看不见的缝）。

    行高不这样处理：插入行让表格变高是明细表的正常预期（行数就是内容量），
    所以 insertRow 仍然只加一行高度 —— 宽度是"版面约束"，高度是"内容结果"。
  */
  const total = round2(sum(el.colWidths));
  el.colWidths.splice(a, 0, borrowSize(el.colWidths, a));
  el.colWidths = fitTracks(el.colWidths, total);
  el.colWidthModes?.splice(a, 0, "fixed");
}

/** 删除第 at 行。最后一行不允许删（表格不能退化成 0 行） */
export function removeRow(el: TableElement, at: number): void {
  if (el.rows <= 1) return;
  const a = clamp(Math.floor(at), 0, el.rows - 1);
  expandMergesCrossing(el, new Set([a]), new Set());
  el.cells.splice(a * el.cols, el.cols);
  el.rowHeights.splice(a, 1);
  el.rowRoles?.splice(a, 1);
  el.rowHeightModes?.splice(a, 1);
}

/** 删除第 at 列。最后一列不允许删 */
export function removeCol(el: TableElement, at: number): void {
  if (el.cols <= 1) return;
  const a = clamp(Math.floor(at), 0, el.cols - 1);
  expandMergesCrossing(el, new Set(), new Set([a]));
  const oldCols = el.cols;
  const next: TableCell[] = [];
  for (let r = 0; r < el.rows; r++) {
    for (let c = 0; c < oldCols; c++) {
      if (c === a) continue;
      next.push(el.cells[r * oldCols + c]);
    }
  }
  el.cells = next;
  el.colWidths.splice(a, 1);
  el.colWidthModes?.splice(a, 1);
}

/** 清空选区内容（保留合并与样式） */
export function clearRangeContent(el: TableElement, range: CellRange): void {
  for (const ref of refsInRange(el, range)) ref.cell.content = undefined;
}

/** 清空选区样式（保留内容与合并） */
export function clearRangeStyle(el: TableElement, range: CellRange): void {
  for (const ref of refsInRange(el, range)) ref.cell.style = undefined;
}

/** 平均分布行高 / 列宽：总和不变，各轨道等分 */
export function distributeTracks(el: TableElement, axis: "row" | "col", range: CellRange): void {
  if (axis === "col") {
    const total = round2(sum(el.colWidths.slice(range.c1, range.c2 + 1)));
    const next = distribute(total, range.c2 - range.c1 + 1);
    next.forEach((w, i) => (el.colWidths[range.c1 + i] = w));
    if (el.colWidthModes) {
      for (let i = range.c1; i <= range.c2; i++) el.colWidthModes[i] = "fixed";
    }
  } else {
    const total = round2(sum(el.rowHeights.slice(range.r1, range.r2 + 1)));
    const next = distribute(total, range.r2 - range.r1 + 1);
    next.forEach((h, i) => (el.rowHeights[range.r1 + i] = h));
    if (el.rowHeightModes) {
      for (let i = range.r1; i <= range.r2; i++) el.rowHeightModes[i] = "fixed";
    }
  }
}

/**
 * 把某一轴的**所有**轨道设成同一个尺寸（"统一行高 / 统一列宽"）。
 *
 * 与 `resizeTrackPair` / `distributeTracks` 的分工靠"总尺寸变不变"划清：
 * - `resizeTrackPair`（拖分隔线）：相邻两轨互相让位，总长不变；
 * - `distributeTracks`（平均分布）：选区内的轨道等分**现有总长**；
 * - 本函数：每条都改成 value，于是元素框总尺寸随之为 `count × value`
 *   （由 `syncTableGeometry` 回算）。
 *
 * 三个都要，因为"我要每行都是 8mm"、"把这两行的分界线挪 3mm"、"这几行一样高但总高别动"
 * 是三件不同的事。
 */
export function setAllTracks(el: TableElement, axis: "row" | "col", value: number): void {
  // 输入框清空时上层会送来 null / undefined / NaN，一律忽略而不是夹成最小尺寸 ——
  // "清空"是编辑过程中的中间态，不该被理解成"把所有行缩到 2mm"
  if (value === null || !Number.isFinite(Number(value))) return;
  const v = round2(Math.max(MIN_TRACK, Number(value)));
  const sizes = axis === "row" ? el.rowHeights : el.colWidths;
  for (let i = 0; i < sizes.length; i++) sizes[i] = v;
  const modes = axis === "row" ? el.rowHeightModes : el.colWidthModes;
  if (modes) for (let i = 0; i < modes.length; i++) modes[i] = "fixed";
}

/**
 * 拖某条分隔线：把 delta(mm) 从一侧挪到另一侧，**总和不变**。
 *
 * 这是"拖分隔线元素框不动"那条约定的落点 —— 只动相邻两条轨道，
 * 因此不需要碰元素 width/height，也不会牵动其它行列。
 *
 * 两条轨道都不允许小于 MIN_TRACK：把 delta 夹在"两侧各自的可让空间"之间，
 * 而不是事后单边夹紧（后者会让总和漏掉被夹掉的那部分）。
 */
export function resizeTrackPair(sizes: number[], index: number, delta: number): number {
  if (index < 0 || index + 1 >= sizes.length) return 0;
  const a = sizes[index];
  const b = sizes[index + 1];
  const min = MIN_TRACK;
  const maxGrow = b - min; // 右侧还能让出多少
  const minGrow = min - a; // 左侧最多缩多少
  const d = clamp(delta, minGrow, maxGrow);
  if (d === 0) return 0;
  sizes[index] = round2(a + d);
  sizes[index + 1] = round2(b - d);
  return d;
}

/* ============================================================
   边框（含共享边冲突）
============================================================ */

/** 表格默认边框（某一边没有显式设置时的回落值） */
export function defaultBorderEdge(el: TableElement): CellBorderEdge {
  return {
    style: "solid",
    width: el.cellStyle?.borderWidth ?? DEFAULT_BORDER_WIDTH,
    color: el.cellStyle?.borderColor ?? DEFAULT_BORDER_COLOR
  };
}

export function ownBorderEdge(
  el: TableElement,
  cell: TableCell,
  side: CellBorderSide
): CellBorderEdge {
  return cell.style?.borders?.[side] ?? defaultBorderEdge(el);
}

export function borderVisible(edge: CellBorderEdge | undefined): boolean {
  return !!edge && edge.style !== "none" && edge.width > 0;
}

const opposite = (side: CellBorderSide): CellBorderSide =>
  side === "top" ? "bottom" : side === "bottom" ? "top" : side === "left" ? "right" : "left";

/** 把某条边写进一格的 borders（edge 传 null = 删掉这条属性，回落表格默认） */
export function applyBorderEdge(
  cell: TableCell,
  side: CellBorderSide,
  edge: CellBorderEdge | null
): void {
  const borders = { ...(cell.style?.borders ?? {}) };
  if (edge) borders[side] = { ...edge };
  else delete borders[side];
  cell.style = { ...(cell.style ?? {}), borders };
}

/**
 * 写一条边，并**镜像写到共享这条边的那一格的对面边**。
 *
 * 为什么必须镜像 —— 这条线在几何上是**一条**：`(r,c).bottom` 与 `(r+1,c).top`
 * 是同一条线段的两个半边。渲染交给 `border-collapse` 合并，而 CSS 的裁决规则是
 * **更宽者胜**：只写自己那一半时，"把线调细"永远输给邻居那半边（通常是表格默认的
 * 0.26mm），用户看到的就是"线宽只能调宽、调细没反应"；"去掉这条线"同理 ——
 * 写 `none` 也压不住邻居的 `solid`，线照样在。
 *
 * 两侧同时写，两个半边的值恒等，CSS 就没有可裁决的余地：调细、调没、改色都立刻生效。
 * 表格外侧边没有邻居，只写自己那一半。
 *
 * @param map 预算好的 `buildTableMap(el)` —— 批量改边框时传同一个，别每格重建
 */
export function writeBorderEdge(
  el: TableElement,
  map: (GridRef | null)[][],
  ref: GridRef,
  side: CellBorderSide,
  edge: CellBorderEdge | null
): void {
  applyBorderEdge(ref.cell, side, edge);

  const span = cellSpan(el, ref);
  const mirrored = opposite(side);
  const seen = new Set<GridRef>([ref]);
  const mirror = (r: number, c: number) => {
    if (r < 0 || r >= el.rows || c < 0 || c >= el.cols) return; // 表格外侧边：没有邻居
    const neighbor = map[r]?.[c];
    if (!neighbor || seen.has(neighbor)) return;
    seen.add(neighbor);
    applyBorderEdge(neighbor.cell, mirrored, edge);
  };

  // 邻居可能不止一个（自己的 colspan / rowspan > 1 时），逐个镜像，保证整条线一致
  if (side === "top" || side === "bottom") {
    const rr = side === "top" ? span.r0 - 1 : span.r1;
    for (let c = span.c0; c < span.c1; c++) mirror(rr, c);
  } else {
    const cc = side === "left" ? span.c0 - 1 : span.c1;
    for (let r = span.r0; r < span.r1; r++) mirror(r, cc);
  }
}

/**
 * 选区某条**外缘边**上的格：上 / 下取首末行，左 / 右取首末列。
 *
 * 用于"给选区的上边框加线"这类操作 —— 它作用于**选区的外缘**，而不是每一格的该侧。
 * （否则在一个 3×3 选区里点"上"，内部两道横线也会跟着出现，这不是用户的意图。）
 */
export function outlineRefsInRange(
  el: TableElement,
  range: CellRange,
  side: CellBorderSide
): GridRef[] {
  const refs = refsInRange(el, range);
  if (side === "top") return refs.filter((ref) => ref.r === range.r1);
  if (side === "bottom") return refs.filter((ref) => ref.r + ref.cell.rowspan - 1 === range.r2);
  if (side === "left") return refs.filter((ref) => ref.c === range.c1);
  return refs.filter((ref) => ref.c + ref.cell.colspan - 1 === range.c2);
}

/** 选区内的格是否"共有一个值"（属性面板显示 / 批量赋值用） */
export function commonValue<T>(
  el: TableElement,
  range: CellRange,
  pick: (cell: TableCell) => T | undefined
): { mixed: boolean; value: T | undefined } {
  const refs = refsInRange(el, range);
  if (!refs.length) return { mixed: false, value: undefined };
  const first = pick(refs[0].cell);
  for (const ref of refs.slice(1)) {
    if (pick(ref.cell) !== first) return { mixed: true, value: undefined };
  }
  return { mixed: false, value: first };
}

/** 选区共有行高/列宽（行高列宽面板用）：只对"整行 / 整列"选区有意义 */
export function rangeRowHeight(el: TableElement, range: CellRange): number | null {
  if (range.c1 !== 0 || range.c2 !== el.cols - 1) return null;
  if (range.r1 !== range.r2) return null;
  return el.rowHeights[range.r1] ?? null;
}

export function rangeColWidth(el: TableElement, range: CellRange): number | null {
  if (range.r1 !== 0 || range.r2 !== el.rows - 1) return null;
  if (range.c1 !== range.c2) return null;
  return el.colWidths[range.c1] ?? null;
}

/** 给新格子用的默认样式（继承表格级设置） */
export function defaultCellStyleOf(el: TableElement) {
  return {
    padding: el.cellStyle?.padding ?? DEFAULT_CELL_PADDING
  };
}

export type { SizeMode };
