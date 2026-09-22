/**
 * 预览（渲染态）的类型定义。
 *
 * 设计文档：`docs/preview-design.md` §2（三层职责）、§3（分页引擎）。
 *
 * ## 本文件必须保持零运行时依赖（只允许 `import type`）
 *
 * 与 `table/model.ts` / `data/model.ts` 同款约束，理由也一样，而且这次更硬：
 * 分页是**纯函数**，算错了不会报错、只会把元素画到错的地方。
 * 只有保持零导入，才能让 `scripts/check-paginate.mjs` 用 `node` 直接跑断言
 * （Node 22 的类型擦除会把这些 `import type` 整段删掉，于是不存在路径解析问题）。
 *
 * ## 三层的数据形状（这是本文档的骨架）
 *
 * ```
 * Element[]（设计态元素，绝对 mm 坐标）
 *     ↓ expand.ts        表格按数据行数展开 + 逐行取值记录
 * FlowBlock[]（"块"：位置 + 高度 + 能不能被切开）
 *     ↓ paginate.ts      绝对坐标 + 跨界顺延（唯一的移动来源）
 * LayoutPage[]（每页有哪些块、块在页内什么位置）
 *     ↓ 渲染层           PreviewPage / render/Preview*.vue
 * ```
 *
 * 注意 `Element[] → FlowBlock[]` 与 `FlowBlock[] → LayoutPage[]` 是**两步**：
 * 前者的输入是文档数据、后者只认数字。分开之后分页器可以脱离本项目单测，
 * 将来做导出 / 服务端打印时也能原样搬走。
 */
import type { Element } from "@/components/design/types";
import type { TemplateContext } from "@/lib/template";

/* ============================================================
   版式输入（纸张 / 页边距）
============================================================ */

/** 纸张尺寸（mm） */
export interface PaperBox {
  widthMm: number;
  heightMm: number;
}

/** 页边距（mm，四向独立）。与 `design.marginMm` 同形 */
export interface MarginBox {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/* ============================================================
   分页层：块与落位
============================================================ */

/**
 * 一个参与分页的"块"。
 *
 * 块是分页的最小单位，也是**唯一**会被移动的东西。
 * - 普通元素（文本 / 图片 / 线条）：不可拆，放不下就整块顺延；
 * - 表格：`rowHeights` 非空时可拆，按行累加切成多片（§3.5）。
 *
 * `top` 是**纸张绝对坐标**下的 y —— 与设计态元素 y 完全一致，不做任何换算。
 * 这一步是刻意的：第 1 页与设计态逐像素一致（`u = y - 0*H ≡ y`）因此是一条
 * 算术恒等式，而不是靠实现小心翼翼维护出来的。
 */
export interface FlowBlock {
  elementId: string;
  /** 块顶的纸张绝对 y（mm） */
  top: number;
  /** 块总高（mm） */
  height: number;
  /** 可拆块（表格）展开后每行的高度；Σ ≡ height。空 = 不可拆 */
  rowHeights?: number[];
  /** 每片重复的表头行数（只对表格有意义，且是**展开后行序列**的前 N 行） */
  headerRows?: number;
  /** 能不能被切开。false 时退化成不可拆块，整块顺延 */
  breakable: boolean;
}

/** 分页结果里的一项：一个块在某一页上的落位 */
export interface PlacedItem {
  elementId: string;
  /** 页内绝对 y（mm，从纸张顶算）。未顺延时 ≡ 设计态 y */
  y: number;
  /** 本片占用高度（mm）。表格分片 = 该片行高之和（含重复表头） */
  height: number;
  /**
   * 表格分片：行序列的起止下标（左闭右开）。
   * `undefined` = 整块放本页（不做行列切分），渲染时画完整个表格。
   */
  rowStart?: number;
  rowEnd?: number;
  /** 表格分片：本片是否要重复表头（首片不含 —— 表头本来就是行序列的开头） */
  withHeader?: boolean;
}

/** 一页 */
export interface LayoutPage {
  /** 0 起 */
  index: number;
  items: PlacedItem[];
}

/**
 * 版式告警。
 *
 * **这是分页器的一等输出，不是附属品。** 它存在的唯一理由是那条底线：
 * 绝不允许"页数少了、元素少了、值空着"而界面上没有任何说明 ——
 * 那正是最难排查的一类问题（设计态看得见的东西都不会出问题，
 * 出问题的全是"只有取数后才知道"的那部分）。
 */
export type LayoutWarning =
  /** 元素被裁切（比整页还高 / 明细表单行超过整页） */
  | { kind: "clipped"; elementId: string; reason: string }
  /** 元素比整页内容区还高，无法避免裁切 */
  | { kind: "too-tall"; elementId: string; height: number }
  /** 页数超过 MAX_PAGES，分页被截断 */
  | { kind: "page-overflow"; pageCount: number }
  /** printable === false，预览里不渲染 */
  | { kind: "hidden"; elementId: string }
  /** 占位符没取到值（由 inspect.ts 产出） */
  | { kind: "unresolved"; elementId: string; token: string; why: string }
  /** 元素排在了纸张之外（每页重复元素也会被裁，所以它不静默） */
  | { kind: "outside-paper"; elementId: string }
  /** 行高自适应：某模板行被内容撑高（声明 X → 实际 Y），下方元素会被推下 */
  | { kind: "row-expanded"; elementId: string; row: number; declared: number; actual: number };

/** 分页器的完整输出 */
export interface PreviewLayout {
  pages: LayoutPage[];
  warnings: LayoutWarning[];
  /** 每页重复的元素 id（不进分页流，每页按设计坐标画一次，§3.2） */
  repeatedIds: string[];
  /** 被隐藏（printable === false）的元素 id */
  hiddenIds: string[];
}

/* ============================================================
   展开层：表格的行序列
============================================================ */

/**
 * 表格展开结果。
 *
 * `templateRows[i]` 与 `records[i]` 一一对应：第 i 个输出行用的是**模板网格的哪一行**、
 * 取**哪一条记录**的值。渲染层据此逐行构造 ctx。
 *
 * 行高不在这里算 —— 由调用方按 `templateRows[i]` 去查 `el.rowHeights`，
 * 这样"明细行的行高 = 模板行的行高"这条规则只有一处实现（§3.6）。
 */
export interface TableExpansion {
  templateRows: number[];
  /** 每行的取值记录；undefined = 用该数据集第 1 条（表头 / 尾行的口径，§3.6） */
  records: (Record<string, unknown> | undefined)[];
  /** 前 N 行是表头，每片重复 */
  headerRows: number;
  /** 展开后总行数 */
  expandedRowCount: number;
  /** 明细区实际复制了几份（0 = 空数据 + blank 策略） */
  detailCopies: number;
  /** 是不是"按数据展开"的（false = 静态表，整表原样） */
  expanded: boolean;
}

/* ============================================================
   渲染层：视图模型
============================================================ */

/** 表格某一行在渲染时需要的全部信息 */
export interface PreviewTableRow {
  /**
   * 展开序列下标（`expansion.templateRows` 里的位置）。
   *
   * 行高自适应（`row-auto-height-design.md`）按这个下标测量与回填：
   * **明细行每一份取的记录不同，自然高度天差地别** —— 若按 `templateRow`
   * 聚合取 max，一条超长记录会把"所有明细行都撑到 95mm"喂给分页器，
   * 而实际渲染各行是各自的自然高度，于是"一页没占满就换页"
   * （2026-09-21 真机踩过）。表头重复行内容相同，按展开下标测出的值也相同，无损。
   */
  index: number;
  /** 模板网格里的行号（取行高、取单元格样式都用它） */
  templateRow: number;
  /** 这一行的取值上下文 */
  ctx: TemplateContext;
}

/** 一个渲染项：已经算好坐标、上下文、表格分片 */
export interface PreviewItemView {
  element: Element;
  /** 相对纸张左上角（mm）。表格分片永远 = element.x */
  x: number;
  /** 页内绝对 y（mm） */
  y: number;
  width: number;
  /** 本项渲染高度（mm）。表格分片 = 分片高度 */
  height: number;
  /** 系统变量（含本页页码 / 总页数） */
  sys: Record<string, unknown>;
  /** 原子元素的取值上下文（含 `{$page.index}` 这类系统变量） */
  ctx: TemplateContext;
  /**
   * 表格：本片要画的行（已含重复表头）。
   * 非表格、或表格整表放本页时，这里是整表的全部行。
   */
  tableRows?: PreviewTableRow[];
}

/** 页视图 */
export interface PreviewPageView {
  index: number;
  /** 已按 zIndex 升序排好（绘序） */
  items: PreviewItemView[];
}

/** 预览的完整视图模型 */
export interface PreviewView {
  pages: PreviewPageView[];
  warnings: LayoutWarning[];
}
