/**
 * 版式编排（纯函数）：把"设计态元素"变成"分页器认得的块"。
 *
 * 设计文档：`docs/preview-design.md` §2（三层职责）、§3.2（元素分类）。
 *
 * 这是三层里的**第二层与第一层之间的那道桥**：
 * ```
 * Element[]  ──layout.ts──▶  FlowBlock[]  ──paginate.ts──▶  LayoutPage[]
 * ```
 * 它自己不画任何东西、也不认 Vue 与 store —— 于是"哪个元素算每页重复"
 * "表格展开后多高"这两件事脱离界面也是可推理的。
 *
 * ## 元素分成三类（§3.2）
 *
 * | 类别 | 判据 | 分页行为 |
 * |---|---|---|
 * | 不输出 | `printable === false` | 预览**不渲染**，列入告警 |
 * | 每页重复 | `repeatOnEachPage === true` | **不参与流式分页**；页内位置 = 设计坐标原样 |
 * | 流式块 | 其余 | 参与分页 |
 *
 * **每页重复元素为什么用"原样坐标"**：页眉 / 页脚的需求是"每页同一位置出现同一内容"。
 * 直接复用设计坐标（`u = y`）就得到了这个语义 —— 用户在纸上 280mm 处放了页码，
 * 每页的 280mm 处都会出现它。若改成"相对内容区顶偏移"，反而要用户自己算
 * `280 - margin.top`，还要在换了纸张尺寸后重算。**少一层换算就少一类错**。
 */

import type { Element, TableElement } from "@/components/design/types";
import type { TableExpansion } from "./types";
import type { FlowBlock, LayoutWarning, MarginBox, PaperBox, PreviewLayout } from "./types";
import { paginate } from "./paginate";

export interface LayoutInput {
  elements: Element[];
  paper: PaperBox;
  margin: MarginBox;
  /**
   * 每个表格元素展开后的行序列。
   * 缺条目的表格按"整表原样 + 不可断"处理（取数失败时的正确表现：版面与设计态一致）。
   */
  expansions?: Map<string, TableExpansion>;
  /** 每个表格元素展开后每行的高度（mm），与 `templateRows` 一一对应 */
  rowHeights?: Map<string, number[]>;
  /** 上游告警（占位符体检等），会在它后面追加版式告警 */
  warnings?: LayoutWarning[];
}

/**
 * 版式编排主入口。
 *
 * 输出 `pages` + `warnings` + 重复/隐藏元素清单，交给渲染层。
 */
export function buildLayout(input: LayoutInput): PreviewLayout {
  const { elements, paper, margin } = input;
  const warnings: LayoutWarning[] = [...(input.warnings ?? [])];

  const hiddenIds: string[] = [];
  /** 每页重复元素（带纵向几何）：分页器按它与流式内容的相对位置分页眉/页脚式锚定（§3.2） */
  const repeated: Array<{ id: string; top: number; height: number }> = [];
  const flow: Element[] = [];

  elements.forEach((el) => {
    // 判据是 `=== false` 而不是 `!el.printable`：字段缺省语义是"打印"，
    // 只有用户明确关掉才算隐藏。写成取反的话，所有老模板（没这个字段）
    // 会在一夜之间全部从预览里消失。
    if (el.printable === false) {
      hiddenIds.push(el.id);
      return;
    }
    if (isOutsidePaper(el, paper)) warnings.push({ kind: "outside-paper", elementId: el.id });
    if (el.repeatOnEachPage === true) {
      repeated.push({ id: el.id, top: el.y, height: el.height });
    } else flow.push(el);
  });

  /*
    流序：y ↑ → zIndex ↑ → 原数组下标（稳定）。

    与绘序（zIndex ↑）**刻意分开**：自由画布允许元素重叠（水印、盖章、叠字），
    所以"谁先占到页面空间"必须按纵向位置决定，而"谁盖住谁"只由 zIndex 决定。
    把两者合成一个排序的后果是"zIndex 高的元素被当成位置更靠下的"，
    于是它会把本来放得下的元素挤到下一页去。
  */
  const ordered = flow
    .map((el, index) => ({ el, index }))
    .sort((a, b) => a.el.y - b.el.y || (a.el.zIndex ?? 0) - (b.el.zIndex ?? 0) || a.index - b.index)
    .map((entry) => entry.el);

  const blocks: FlowBlock[] = ordered.map((el) => toBlock(el, input));

  return paginate({ paper, margin, blocks, repeated, hiddenIds, warnings });
}

/** 单列成函数是为了让它能被单独推理 —— 它承载了"表格展开后多高"这条规则 */
function toBlock(el: Element, input: LayoutInput): FlowBlock {
  if (el.type !== "table") {
    // 原子块：高度就是元素框高，不取决于内容（这正是分页只需算一遍的前提）
    return { elementId: el.id, top: el.y, height: el.height, breakable: false };
  }

  const expansion = input.expansions?.get(el.id);
  const rows = input.rowHeights?.get(el.id);
  if (!expansion || !rows) {
    // 没有展开信息（取数失败 / 调用方没算）→ 与设计态完全一致的整表，且不可断。
    return { elementId: el.id, top: el.y, height: el.height, breakable: false };
  }

  return {
    elementId: el.id,
    top: el.y,
    height: rows.reduce((a, b) => a + b, 0),
    rowHeights: rows,
    // 表头行数只在"展开后确实还有行"时才传 —— 展开成 0 行（blank 策略）时
    // headerRows 会把一个不存在的表头算进分片高度，凭空多出一片。
    headerRows: expansion.expandedRowCount ? expansion.headerRows : 0,
    breakable: (el as TableElement).allowBreakAcrossPages ?? true
  };
}

/**
 * 元素是否完全落在纸张之外。
 *
 * 判据是**完全不相交**而不是"越界一点"：压在页边距上、甚至压出纸边一点，
 * 都是自由画布的常见用法（页眉、出血位），逐个告警会把警告条淹掉。
 * 真正值得报的只有"整个元素都在纸外"—— 那才是"我明明放了东西却看不到"。
 */
function isOutsidePaper(el: Element, paper: PaperBox): boolean {
  return (
    el.x + el.width <= 0 ||
    el.y + el.height <= 0 ||
    el.x >= paper.widthMm ||
    el.y >= paper.heightMm
  );
}
