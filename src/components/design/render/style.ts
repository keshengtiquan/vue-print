/**
 * 设计态与预览态**共享的样式纯函数**。
 *
 * 设计文档：`docs/preview-design.md` §5.2。
 *
 * ## 为什么必须抽出来（这一条是整个预览功能里最容易省、也最不能省的一步）
 *
 * 设计态元素组件（`designPanel/components/elements/*.vue`）和预览渲染组件
 * （`preview/render/Preview*.vue`）要画的东西**是同一套**：同一个元素、同一组字号
 * 间距对齐边框，只有"缩放因子"不同。
 *
 * 不抽这一层的后果是实打实的：设计态调完字号间距，预览里得再调一遍；
 * 改一处忘一处 ⇒ **"预览里看着对、打出来错位"**。
 * 这是所有"设计器 + 预览"项目最经典的一类 bug，而它从结构上是可以避免的 ——
 * 只要"元素数据 → CSSProperties"这段换算只有一个实现。
 *
 * ## 契约
 *
 * 每个函数的**唯一外部输入是 `pxPerMm`**（1mm 对应多少屏幕 px）：
 * ```
 * 设计态：pxPerMm = mmToPx(1) * design.scale
 * 预览态：pxPerMm = mmToPx(1) * previewZoom
 * ```
 * 于是两个视图的差别被压缩成一个乘数，没有第二处需要同步。
 *
 * ## 本文件不做的事
 *
 * - 不读 store、不读 `scale`、不 import Vue 的响应式（只要 `CSSProperties` 类型）；
 * - 不处理交互（拖拽 / 编辑 / 选区）—— 那些是设计态独有的，留在原组件里。
 */
import type { CSSProperties } from "vue";
import type {
  TableCell,
  TableCellContent,
  TableElement,
  TextElement
} from "@/components/design/types";
import { BORDER_SIDES, borderVisible, ownBorderEdge } from "@/components/design/table/model";
import { ptToMm } from "@/lib/utils";

/**
 * 单元格默认字号：五号（10.5pt）。
 *
 * 取"五号"而不是随手定一个毫米数 —— 属性面板的字号下拉是 pt 档位，
 * 基准对不上的话，用户什么都不改也会看到显示值与实际值差一档。
 */
export const DEFAULT_CELL_FONT_SIZE = ptToMm(10.5);

/* ============================================================
   文本元素
============================================================ */

/**
 * 文本元素的外框样式（背景、边框、以及"内容在框内的垂直/横向落位"）。
 *
 * 竖排文字的左右位置属于 flex 交叉轴（`alignItems`），`text-align` 管不到它 ——
 * 所以竖排时要用 `alignItems` 接 `textAlign`，横排时留给 `textStyle`。
 */
export function textContainerStyle(el: TextElement, pxPerMm: number): CSSProperties {
  const vertical =
    el.verticalAlign === "middle" ? "center" : el.verticalAlign === "bottom" ? "flex-end" : "flex-start";
  const horizontal =
    el.textAlign === "center" ? "center" : el.textAlign === "right" ? "flex-end" : "flex-start";

  return {
    backgroundColor: el.backgroundColor,
    borderColor: el.borderColor,
    borderStyle: el.borderStyle,
    borderWidth: `${(el.borderWidth ?? 0) * pxPerMm}px`,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: vertical,
    alignItems: el.layout === "vertical" ? horizontal : undefined
  };
}

/** 文本元素的文字样式。横排时宽度铺满（让 `textAlign` 生效），竖排时交给父级 flex */
export function textContentStyle(el: TextElement, pxPerMm: number): CSSProperties {
  return {
    color: el.color,
    fontFamily: el.fontFamily,
    fontSize: `${(el.fontSize ?? 4) * pxPerMm}px`,
    fontWeight: el.fontWeight,
    textAlign: el.textAlign,
    writingMode: el.layout === "vertical" ? "vertical-rl" : "horizontal-tb",
    width: el.layout === "vertical" ? undefined : "100%",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  };
}

/* ============================================================
   表格
============================================================ */

/**
 * 表格盒样式。
 *
 * `width` 用元素宽（≡ Σ colWidths，由 `syncTableGeometry` 保证），
 * 与 `<colgroup>` 各列宽度之和一致，于是"表格盒宽 ≡ 元素框宽"，浮层不会错位。
 *
 * **高度刻意不设**：由各行 `<tr>` 的 height 自然累加得出，
 * 免得 table 的 height 反过来参与行高分配 —— 那是"行数由数据决定"这条不变量最怕的事。
 */
export function tableBoxStyle(el: TableElement, pxPerMm: number): CSSProperties {
  return {
    tableLayout: "fixed",
    borderCollapse: "collapse",
    width: `${el.width * pxPerMm}px`
  };
}

/**
 * 某格的 `<td>` 样式。
 *
 * 只设**自己的四边**、不做任何冲突裁决 —— 共享边由 `border-collapse: collapse`
 * 合并，浏览器只画一次，两个方向的解必然是同一个值。
 * 内边距不落在 td 的 padding 上，而是给内容层（内容层绝对定位铺满整格）。
 */
export function cellTdStyle(el: TableElement, cell: TableCell, pxPerMm: number): CSSProperties {
  const style: CSSProperties = {
    // relative 是内容层 absolute inset-0 的定位锚点；td 上原是内容流，
    // 内容一旦绝对定位，tr 的 height 才能成为精确值而不是最小高度
    position: "relative",
    overflow: "hidden",
    padding: 0,
    verticalAlign: "top"
  };
  if (cell.style?.backgroundColor) style.backgroundColor = cell.style.backgroundColor;
  for (const side of BORDER_SIDES) {
    const edge = ownBorderEdge(el, cell, side);
    if (!borderVisible(edge)) continue;
    // 下限 0.5px：0.1mm 在屏幕上不到半像素会被浏览器抹掉，用户以为没设成功
    const line = `${Math.max(0.5, edge.width * pxPerMm)}px ${edge.style} ${edge.color}`;
    if (side === "top") style.borderTop = line;
    else if (side === "right") style.borderRight = line;
    else if (side === "bottom") style.borderBottom = line;
    else style.borderLeft = line;
  }
  return style;
}

/** 单元格内容层（`absolute inset-0`）的样式：内边距 + 垂直/横向落位 */
export function cellContentBoxStyle(
  content: TableCellContent | undefined,
  padding: number,
  pxPerMm: number
): CSSProperties {
  return {
    padding: `${padding * pxPerMm}px`,
    display: "flex",
    flexDirection: "column",
    justifyContent:
      content?.verticalAlign === "middle"
        ? "center"
        : content?.verticalAlign === "bottom"
          ? "flex-end"
          : "flex-start",
    // 竖排文字的左右位置属于 flex 交叉轴，text-align 管不到它（与 TextElement 同款处理）
    alignItems:
      content?.layout === "vertical"
        ? content?.textAlign === "center"
          ? "center"
          : content?.textAlign === "right"
            ? "flex-end"
            : "flex-start"
        : undefined
  };
}

/** 单元格文字样式。与文本元素同款，只是默认字号走"五号" */
export function cellTextStyle(content: TableCellContent | undefined, pxPerMm: number): CSSProperties {
  return {
    color: content?.color,
    fontFamily: content?.fontFamily,
    fontSize: `${(content?.fontSize ?? DEFAULT_CELL_FONT_SIZE) * pxPerMm}px`,
    fontWeight: content?.fontWeight,
    textAlign: content?.textAlign,
    writingMode: content?.layout === "vertical" ? "vertical-rl" : "horizontal-tb",
    width: content?.layout === "vertical" ? undefined : "100%",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  };
}

/* ============================================================
   线条
============================================================ */

/** 只取 `lineGeometry` 真正用到的那几个字段 —— 免得这个共享函数被绑死在完整元素类型上 */
export interface LineElementLike {
  start: { x: number; y: number };
  end: { x: number; y: number };
  stroke: { color: string; width: number };
  dash: number[] | null;
}

/** 线条的渲染几何（元素局部 px）。端点与线宽、虚线全部来自元素数据，与视图无关 */
export function lineGeometry(el: LineElementLike, pxPerMm: number) {
  return {
    x1: el.start.x * pxPerMm,
    y1: el.start.y * pxPerMm,
    x2: el.end.x * pxPerMm,
    y2: el.end.y * pxPerMm,
    strokeWidth: el.stroke.width * pxPerMm,
    dashArray: el.dash ? el.dash.map((d) => d * pxPerMm).join(" ") : undefined
  };
}
