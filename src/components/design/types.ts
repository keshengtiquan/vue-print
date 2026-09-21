export type ElementType = "text" | "table" | "line" | "image";

/** 尺寸手柄：8 个方向 */
export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/* ============================================================
   数据绑定（设计文档：docs/data-binding-design.md）

   绑定分两级，这是"自由画布 + 元素"相对"纯单元格模型"的必然差异：
   - 元素级（文本 / 图片）：绑一个数据集，取**第一条记录**的字段 → 单据头场景
   - 表格级：绑一个数据集 + 指定明细模板行 → 按记录数纵向复制 → 明细区场景

   表格的绑定同样落在 `binding` 上，**不再单独存一份 `dataSetId`** ——
   同一件事有两个字段，迟早会分叉。
============================================================ */

/**
 * 元素的数据绑定声明。
 *
 * 一期只有"绑哪个数据集"，**刻意不做** `filter`/关联条件（文档 §2.6 明确一期不做：
 * 多数据集 JOIN、子表嵌在父表行里、跨表聚合）。字段先占位留下，
 * 是因为等主从关联真做的时候，改的是消费方逻辑而不是数据形状。
 */
export interface ElementBinding {
  /**
   * 绑定的数据集 id。
   *
   * **不填 = 未绑定**：元素按静态内容渲染，里面的占位符会原样留在画布上 ——
   * 一眼就能看出"这里没取到数据"，比悄悄换成另一份数据好排查得多。
   *
   * 正常路径下用户不需要手填：从左侧字段树拖一个字段到元素上就自动写上了。
   * "字段属于哪个数据集"是字段自带的信息（`FieldNode` 的拖拽载荷里带 `dataSetId`），
   * 所以**没有"默认数据集 / 主数据集"这种兜底概念** ——
   * 元素绑谁，永远等于"用户往它里面拖了哪份数据的字段"。
   */
  dataSetId?: string;
  /** 二期：过滤条件。一期不消费 */
  filter?: string;
}

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number; // 左上角，mm（相对纸张左上角原点）
  y: number; // 左上角，mm
  width: number; // mm
  height: number; // mm
  rotation?: number; // 度，绕元素中心，默认 0
  zIndex?: number; // 默认 0
  /** 锁定后仍可选中和查看属性，但不能移动、缩放或旋转 */
  locked?: boolean;
  /** 每页重复：多页文档里每一页都绘制该元素（页眉/页脚/流水号类）。默认 false */
  repeatOnEachPage?: boolean;
  /** 是否参与打印输出。默认 true；画布上的定位标注/备注可关掉 */
  printable?: boolean;
  /** 数据绑定。不绑数据集的元素按静态内容渲染 */
  binding?: ElementBinding;
}

export interface TextElement extends BaseElement {
  type: "text";
  content: string;
  fontFamily?: string;
  fontSize?: number; // mm
  fontWeight?: string;
  color?: string;
  textAlign?: "left" | "center" | "right";
  /** 内容在元素框内的垂直位置 */
  verticalAlign?: "top" | "middle" | "bottom";
  /** 文字排列方向 */
  layout?: "horizontal" | "vertical";
  borderStyle?: "none" | "solid" | "dashed" | "dotted";
  borderWidth?: number; // mm
  borderColor?: string;
  backgroundColor?: string;
}

/* ============================================================
   表格 —— 数据驱动明细表的静态交互基础
   设计文档：docs/table-feature-design.md

   改这块之前先读三条不变量，它们决定了下面所有字段的形状：

   1. 几何：Σ colWidths ≡ width、Σ rowHeights ≡ height。
      - 拖行/列分隔线 → 只改**相邻**两行/列，总和不变，元素框不动；
      - 拖元素缩放手柄 / 面板改宽高 → **等比缩放**全部行列。
      行高列宽用绝对值 mm（不是百分比），因为行数将来由数据决定，
      "按比例填满框"的假设在行数变化时会整个失效。

   2. 合并用 covered **标记**而非删格：cells 的下标永远等于网格坐标
      (r * cols + c)。删格的话，任何"第 r 行第 c 列是谁"都要先做拓扑推导，
      选区 / 命中检测 / 拖拽热区会全部变复杂。

   3. 单元格内容一开始就是"可含 {占位符} 的文本"，且**不拆**成
      "固定文本 / 绑定字段"两种结构 —— 混排（"单价：{单价} 元"）时
      两个字段要拼接，越往后越难合。设计态占位符原样渲染，不校验不高亮。
============================================================ */

/** 单元格边框线型 */
export type CellBorderStyle = "none" | "solid" | "dashed" | "dotted" | "double";

/** 单元格某一条边的边框 */
export interface CellBorderEdge {
  style: CellBorderStyle;
  /** 线宽 mm */
  width: number;
  color: string;
}

/** 单元格四边边框。缺省的一边回落到表格默认边框（cellStyle.borders / borderWidth+borderColor） */
export interface CellBorders {
  top?: CellBorderEdge;
  right?: CellBorderEdge;
  bottom?: CellBorderEdge;
  left?: CellBorderEdge;
}

export type CellBorderSide = keyof CellBorders;

/** 行高 / 列宽的尺寸模式。Word 的默认手感是 atLeast（拖出来的是最小值） */
export type SizeMode = "fixed" | "atLeast" | "auto";

/**
 * 单元格内容。第一期支持文本与图片；type 的联合里从第一期就留出 barcode ——
 * 定位是数据驱动的明细表，条码/二维码迟早要进来，留个联合成员的成本是零。
 */
export interface TableCellContent {
  type: "text" | "image" | "barcode";
  /** text：文本（允许含 {占位符}）；image / barcode：资源标识 */
  value: string;
  fontFamily?: string;
  /** 字号 mm（与元素体系一致，UI 层再换算为 pt） */
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  layout?: "horizontal" | "vertical";
  objectFit?: "fill" | "contain" | "cover" | "none";
}

/**
 * 内容溢出策略。
 * 刻意**没有** Word 的"适应文字"（溢到相邻空格）—— 数据一长就串列，
 * 静态期看着能用、数据版必崩，第一期就不做，免得用上瘾。
 */
export type CellOverflow = "wrap" | "clip" | "shrink";

export interface TableCellStyle {
  backgroundColor?: string;
  /** 内边距 mm */
  padding?: number;
  borders?: CellBorders;
  overflow?: CellOverflow;
}

export interface TableCell {
  /** 横跨列数，≥1 */
  colspan: number;
  /** 纵跨行数，≥1 */
  rowspan: number;
  /** 被左上角格合并覆盖：保留格子以维持网格索引，渲染时跳过 */
  covered?: boolean;
  content?: TableCellContent;
  style?: TableCellStyle;
}

/** 矩形选区（网格坐标，含端点，已归一化为 r1≤r2 / c1≤c2） */
export interface CellRange {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface TableElement extends BaseElement {
  type: "table";
  /** 行数（派生缓存：以 rowHeights.length 为准） */
  rows: number;
  /** 列数（派生缓存：以 colWidths.length 为准） */
  cols: number;
  /** 列宽 mm（绝对值）。不变量：Σ colWidths ≡ width */
  colWidths: number[];
  /** 行高 mm（绝对值）。不变量：Σ rowHeights ≡ height */
  rowHeights: number[];
  colWidthModes?: SizeMode[];
  rowHeightModes?: SizeMode[];
  /** 行优先扁平数组，长度 = rows × cols */
  cells: TableCell[];
  allowBreakAcrossPages?: boolean;
  /** 表格默认单元格边框与内边距：新格子与"缺省边"的回落值 */
  cellStyle?: {
    borderColor?: string;
    borderWidth?: number;
    padding?: number;
    borders?: CellBorders;
  };
}

export interface LineElement extends BaseElement {
  type: "line";
  /** 端点，相对元素左上角 (x,y) 的局部坐标，mm，范围 [0,width]×[0,height] */
  start: { x: number; y: number };
  end: { x: number; y: number };
  stroke: { color: string; width: number }; // 线宽 mm
  dash: number[] | null; // 虚线模式（mm），null = 实线
}

export interface ImageElement extends BaseElement {
  type: "image";
  src: string;
  objectFit: "fill" | "contain" | "cover" | "none";
}

export type Element = TextElement | TableElement | LineElement | ImageElement;

/**
 * 辅助线方向。注意它与拖出它的标尺是**交叉**的：
 * - "v" 竖线：位置由横坐标决定，从**顶部水平标尺**向下拖出
 * - "h" 横线：位置由纵坐标决定，从**左侧垂直标尺**向右拖出
 */
export type GuideDir = "v" | "h";

/**
 * 辅助线：用户手动拖出的对齐参考线。
 * pos 单位 mm、相对**纸张左上角原点**（与元素坐标系一致），
 * 因此缩放、切换纸张方向都自动跟随，不需要维护两份坐标。
 */
export interface Guide {
  id: string;
  dir: GuideDir;
  pos: number;
}
