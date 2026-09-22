/**
 * 分页引擎 —— **唯一实现**（纯函数）。
 *
 * 设计文档：`docs/preview-design.md` §3。
 *
 * ## 三条定死的语义，读代码前先看这三条
 *
 * 1. **绝对坐标 + 跨界顺延，刻意不做流式重排。**
 *    元素在设计态排在哪，预览里就在哪。唯一会移动的情况是"这一块跨了页边界放不下"，
 *    那时整块顺延到下一页（文本表现为行级切分）。
 *    理由是本项目的底线：**设计态排好的版，预览 / 打印必须一模一样**。
 *    流式重排（Word 那种"内容自动往上挤"）会让同一个元素在两处位置不同，
 *    而"预览里看着对、打出来错位"正是这类模型的经典故障。
 *
 * 2. **第 1 页 ≡ 设计态**（算术恒等式，不是实现细节）。
 *    `s = margin.top`、`H = 纸张高 - 上下边距`、
 *    页 p 的窗口 = `[s + p·H, s + (p+1)·H]`、页内绝对位置 `u = s + (y - s - p·H)`。
 *    p = 0 时 `u ≡ y` —— 一个减一个加，恒等。
 *    **任何"顺手加一点偏移"的改动都会破坏这条恒等式**，动之前先想清楚。
 *
 * 3. **不做 DOM 测量。** 输入只有"纸张 + 边距 + 元素几何 + 数据行数"。
 *    元素高度是**框的固定尺寸**，不取决于内容 —— 所以分页只需算一遍。
 *
 *    > ⚠️ 将来做"行高自适应"（`SizeMode` 的 `atLeast` / `auto`）时，
 *    > 元素高度会取决于渲染结果，这个**单向流程就会破**：必须先测量再分页
 *    > （一遍变两遍，还要处理测量→重排→再测量的收敛）。到时候别在这里打补丁，
 *    > 请回头读设计文档 §3.7 的那条警告。
 *
 * ## 零运行时依赖
 *
 * 只 `import type`。于是 `scripts/check-paginate.mjs` 能用 `node` 直接跑它做断言 ——
 * "算错了不报错、只画错"的模块，本项目第一次可以自动验证。
 */

import type {
  FlowBlock,
  LayoutPage,
  LayoutWarning,
  MarginBox,
  PaperBox,
  PlacedItem,
  PreviewLayout
} from "./types";

/**
 * 分页循环的硬上限。
 *
 * 一道防呆护栏：数据集的 limit 是 5000 行，单行高 6mm 就是 30000mm，
 * 在小页上能算出上百页。页数一旦失控，DOM 规模会直接把浏览器钉死。
 * 到上限就停并告警 —— 绝不静默少画几页。
 */
export const MAX_PAGES = 500;

/**
 * 浮点容差（mm）。
 *
 * 取 1e-4 而不是更小：几何写入会 `round2` 到 0.01mm，行高累加后误差量级在 1e-3。
 * 容差太小会让"刚好贴合页底"的块被误判成放不下而白白顺延一页。
 */
export const EPS = 1e-4;

export interface PaginateInput {
  paper: PaperBox;
  margin: MarginBox;
  /** 流序已排好的块（调用方负责排序：y ↑ → zIndex ↑ → 下标） */
  blocks: FlowBlock[];
  /**
   * 每页重复的元素（不进分页流）：id + 纵向几何（纸张绝对 mm）。
   *
   * 分页器按它与流式内容的相对位置自动分两种锚定（§3.2）：
   * - **页眉式**（完全在所有流式内容之上）：每页按设计坐标画；
   *   顺延页的内容起点让到它底部之下（`f0`）。
   * - **页脚式**（上方有流式内容）：每页**贴内容区底**画；内容流每页
   *   都止于它上方（`bottomLimit`）—— 数据表格跨页时，第 1 页与后续页版式一致。
   */
  repeated?: Array<{ id: string; top: number; height: number }>;
  /** 被隐藏（printable === false）的元素 id */
  hiddenIds: string[];
  /** 上游已有的告警（隐藏、占位符未取到值等），分页器会在它后面追加自己的 */
  warnings?: LayoutWarning[];
}

/** 内容区顶的纸张绝对 y（mm） */
export function contentTop(margin: MarginBox): number {
  return margin.top;
}

/** 内容区高（mm）。页边距之和超过纸张时返回 0 */
export function contentHeight(paper: PaperBox, margin: MarginBox): number {
  return Math.max(0, paper.heightMm - margin.top - margin.bottom);
}

/**
 * 元素"自然"落在第几页 —— 即**不做任何顺延**时它属于哪一页。
 *
 * y 落在上边距里（`F < 0`）时归第 1 页：那是用户故意画在那儿的（比如压在页眉位置），
 * 只有"跨页顺延之后"才把偏移钳到内容区顶（见 `pageOffset`）。
 */
export function naturalPage(top: number, s: number, H: number): number {
  if (!(H > 0)) return 0;
  const f = top - s;
  if (f <= 0) return 0;
  return Math.min(MAX_PAGES, Math.floor(f / H));
}

/**
 * 元素在**它自己那一页**里相对内容区顶的偏移（mm）。
 *
 * `p > 0` 时才把负偏移钳到 0 —— 第 1 页刻意不钳，
 * 理由同 `naturalPage`：`u = s + f` 在 p = 0 时必须还原成 `y`。
 */
export function pageOffset(top: number, s: number, H: number, p: number): number {
  const f = top - s - p * H;
  if (p > 0 && f < 0) return 0;
  return f;
}

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

/**
 * 分页主入口。
 *
 * 输出保证：
 * - `pages[i].items` 里每一项的 `y` 都是**页内绝对 mm**，直接就能定位；
 * - 同一个块的多片按顺序落在**递增**的页上；
 * - `warnings` 覆盖所有"界面上会看到的异常"。
 */
export function paginate(input: PaginateInput): PreviewLayout {
  const { paper, margin, blocks, hiddenIds } = input;
  const warnings: LayoutWarning[] = [...(input.warnings ?? [])];

  const s = contentTop(margin);
  const H = contentHeight(paper, margin);
  const pages: LayoutPage[] = [];

  const reps = input.repeated ?? [];
  const repeatedIds = reps.map((r) => r.id);

  /*
    每页重复元素分两种锚定（判据：与流式内容的相对位置）：

    - **页眉式**（完全在所有流式内容之上）：每页按设计坐标画；
      顺延页（p > 0）的内容起点 f0 让到它底部之下 —— 不让位的话，
      第 2 页内容从页顶重排会压过它（2026-09-22 真机 bug）。
      **f0 只约束 p > 0**：「第 1 页 ≡ 设计态」恒等式不动。
    - **页脚式**（上方有流式内容）：每页**贴内容区底**画（y = s + H - height）；
      内容流每页的可用底 `bottomLimit` 抬到它顶部 —— 对**每一页**生效（含第 1 页），
      这样数据表格跨页时每页都是「标题顶 / 内容中 / 页脚表格底」的一致版式。

    页脚元素比内容区还高属于病态用法：不抬高 bottomLimit（否则可用区为负，
    全部内容顺延爆页），落位退回设计坐标。
  */
  const flowTop = blocks.length ? Math.min(...blocks.map((b) => b.top)) : Infinity;
  let f0 = 0;
  let bottomLimit = H;
  const repeated: Array<{ id: string; y: number }> = [];
  for (const r of reps) {
    const headerStyle = r.top + r.height <= flowTop + EPS;
    if (headerStyle) {
      // 只统计与内容窗口 [s, s+H] 相交的区间：整个在上边距区的不占内容区
      const bottom = Math.min(r.top + r.height, s + H);
      if (r.top < s + H - EPS && bottom > s + EPS) f0 = Math.max(f0, bottom - s);
      repeated.push({ id: r.id, y: r.top });
    } else if (r.height < H - EPS) {
      bottomLimit = Math.min(bottomLimit, H - r.height);
      repeated.push({ id: r.id, y: s + H - r.height });
    } else {
      repeated.push({ id: r.id, y: r.top });
    }
  }

  const ensurePage = (index: number): LayoutPage => {
    while (pages.length <= index) pages.push({ index: pages.length, items: [] });
    return pages[index];
  };

  const place = (page: number, item: PlacedItem) => {
    /*
      页号在这里统一夹取，而不是在每个调用点各夹一次。
      理由：`page` 的来源有三个（自然页、顺延循环、分片循环），漏夹任何一处
      都会让"y 被手输成 9999999"这种输入直接造出上万个空页对象，
      DOM 还没渲染，内存先炸了。夹到 MAX_PAGES 之后，画出来的东西是错的，
      但 `page-overflow` 告警会明说是它错了 —— 比崩掉好。
    */
    const idx = Math.max(0, Math.min(Math.floor(page), MAX_PAGES));
    ensurePage(idx).items.push(item);
  };

  /*
    病态输入：页边距之和 ≥ 纸张尺寸（内容区高为 0）。
    分页在这种输入下没有意义，但如果直接抛错，用户看到的是白屏 ——
    比"所有元素堆在第 1 页、上面有一条警告"糟糕得多。
  */
  if (!(H > EPS)) {
    for (const b of blocks) {
      place(0, { elementId: b.elementId, y: b.top, height: b.height });
    }
    warnings.push({ kind: "page-overflow", pageCount: 1 });
    for (const id of hiddenIds) warnings.push({ kind: "hidden", elementId: id });
    // 内容区高为 0 时"贴底"无从算起，重复元素一律按设计坐标
    return {
      pages: pages.length ? pages : [{ index: 0, items: [] }],
      warnings,
      repeatedIds,
      repeated: reps.map((r) => ({ id: r.id, y: r.top })),
      hiddenIds
    };
  }

  for (const block of blocks) {
    if (block.breakable && block.rowHeights?.length) {
      paginateBreakable(block, s, H, f0, bottomLimit, warnings, place);
    } else {
      paginateAtomic(block, s, H, f0, bottomLimit, warnings, place);
    }
  }

  for (const id of hiddenIds) warnings.push({ kind: "hidden", elementId: id });

  /*
    "模板里有元素、但一页都没排出来"（典型：全部关了「是否打印」）时补一张空白页。

    补页而不是返回空数组，是为了让视图层能区分两件事：
    - `pages.length === 0` + 元素也为 0 → 模板是空的 → 空态引导；
    - 有一张空白页 → 模板有内容，只是都被隐藏了 → 画警告条。
  */
  if (!pages.length && (repeatedIds.length || hiddenIds.length)) pages.push({ index: 0, items: [] });

  return { pages, warnings, repeatedIds, repeated, hiddenIds };
}

/**
 * 不可拆块：放不下就整块顺延（§3.4）。
 *
 * 这里的 `while` 是整个分页器**唯一**的移动来源。除它之外，
 * 任何元素的位置都恒等于设计态坐标。
 */
function paginateAtomic(
  block: FlowBlock,
  s: number,
  H: number,
  f0: number,
  bottomLimit: number,
  warnings: LayoutWarning[],
  place: (page: number, item: PlacedItem) => void
): void {
  let p = naturalPage(block.top, s, H);
  let f = pageOffset(block.top, s, H, p);
  // 自然落位到 p > 0 的页时，同样要让开每页重复元素占据的顶部区间
  if (p > 0) f = Math.max(f, f0);

  // 比整页还高的块：无论怎么顺延都会溢出，放它"自然"该在的那一页 + 告警。
  // 绝不静默裁切 —— 用户必须知道少了一块。
  if (block.height > H + EPS) {
    warnings.push({ kind: "too-tall", elementId: block.elementId, height: block.height });
    warnings.push({
      kind: "clipped",
      elementId: block.elementId,
      reason: `高 ${round1(block.height)}mm，超过整页内容区 ${round1(H)}mm，已按页裁切`
    });
    place(p, { elementId: block.elementId, y: s + f, height: block.height });
    return;
  }

  /*
    顺延页也放不下：本页放不下、而顺延页可用区只剩 bottomLimit - f0
    （上让页眉式重复元素、下让页脚式重复元素），块比它还高（但比整页矮）。
    不拦的话顺延循环会一直空转到触顶，把元素甩到第 500 页 —— 比裁切糟得多。
    按"超高"同一口径就地放 + 告警。
  */
  if (f + block.height > bottomLimit + EPS && f0 + block.height > bottomLimit + EPS) {
    warnings.push({
      kind: "clipped",
      elementId: block.elementId,
      reason: `高 ${round1(block.height)}mm，扣除每页重复元素占位后可用区 ${round1(bottomLimit - f0)}mm，已按页裁切`
    });
    place(p, { elementId: block.elementId, y: s + f, height: block.height });
    return;
  }

  /*
    顺延循环。最多两轮就会收敛：
    f ∈ [f0, bottomLimit)，f + h > bottomLimit ⇒ 下一页 f' = max(f0, f - H) = f0
    ⇒ f0 + h ≤ bottomLimit 成立（更大的块已被上面的"就地放"分支拦住）。
    写 while 而不是 if，是为了让"将来 h > 可用区也能走通"这条路
    不至于因为提前假设而埋一个死循环。
  */
  let guard = 0;
  while (f + block.height > bottomLimit + EPS) {
    p += 1;
    f = Math.max(f0, block.top - s - p * H);
    if (p > MAX_PAGES || ++guard > MAX_PAGES) {
      warnings.push({ kind: "page-overflow", pageCount: MAX_PAGES });
      // 触顶后把落位拉回合法范围：夹到最后一页、并且让它至少落在内容区里。
      // 不夹的话它会以"第 501 页 + 页内 y = 9800000"的形式被画出来 ——
      // 一个谁也看不懂的结果，而告警只说了一句"页数超上限"。
      p = MAX_PAGES;
      f = Math.min(Math.max(0, f), Math.max(0, bottomLimit - block.height));
      break;
    }
  }

  place(p, { elementId: block.elementId, y: s + f, height: block.height });
}

/**
 * 可拆块（表格）：按行累加切成多片（§3.5）。
 *
 * 全表的行序列 = `FlowBlock.rowHeights`。前 `headerRows` 行是表头，
 * **每一片**的头部都重画它们（首片不额外插 —— 表头本来就是行序列的开头）。
 *
 * 与 `paginateAtomic` 的分工靠"能不能拆"划清，靠 `allowBreakAcrossPages` 分流：
 * 小表格不想被劈成两页时关掉它，就退化成原子块（整表顺延）。
 */
function paginateBreakable(
  block: FlowBlock,
  s: number,
  H: number,
  f0: number,
  bottomLimit: number,
  warnings: LayoutWarning[],
  place: (page: number, item: PlacedItem) => void
): void {
  const rowHeights = block.rowHeights as number[];
  const n = rowHeights.length;
  const headRows = Math.min(Math.max(0, Math.floor(block.headerRows ?? 0)), n);
  const headH = sum(rowHeights.slice(0, headRows));

  let p = naturalPage(block.top, s, H);
  let f = pageOffset(block.top, s, H, p);
  // 自然落位到 p > 0 的页时，同样要让开每页重复元素占据的顶部区间
  if (p > 0) f = Math.max(f, f0);

  // 整表放得下 → 整表放本页，一行都不切。这是绝大多数情况的路径，
  // 也是"顺延后刚好放得下"的落点。
  if (f + block.height <= bottomLimit + EPS) {
    place(p, {
      elementId: block.elementId,
      y: s + f,
      height: block.height,
      rowStart: 0,
      rowEnd: n,
      withHeader: false
    });
    return;
  }

  let row = 0;
  let first = true;
  let guard = 0;

  while (row < n) {
    if (++guard > MAX_PAGES * 8) {
      warnings.push({ kind: "page-overflow", pageCount: p });
      break;
    }

    // 非首片要额外让出重复表头的高度
    const repeatHead = first ? 0 : headH;
    const avail = bottomLimit - f;

    if (repeatHead + rowHeights[row] > avail + EPS) {
      const need = repeatHead + rowHeights[row];

      /*
        分两种"放不下"，判据是**换到任何一页的页顶也放不下吗**：

        1. 放不下（`need > bottomLimit - f0`）→ 这一行比"顺延页可用区"
           （上让页眉式、下让页脚式重复元素后）还高。
           **就地放**（与 `paginateAtomic` 的"超高块放它自然该在的位置"同一个口径），
           画出来会被裁，但元素不会凭空消失或把前面几页整页浪费掉。
           `row += 1` 是硬要求 —— 不前进就是死循环。
        2. 只是本页余量不够 → 换一页从顺延起点（f0）重排。这是本函数**唯一**的顺延来源。
      */
      if (need > bottomLimit - f0 + EPS) {
        warnings.push({
          kind: "clipped",
          elementId: block.elementId,
          reason: `明细行高 ${round1(need)}mm，超过整页内容区 ${round1(H)}mm，已按页裁切`
        });
        place(p, {
          elementId: block.elementId,
          y: s + f,
          height: need,
          rowStart: row,
          rowEnd: row + 1,
          withHeader: !first
        });
        row += 1;
        first = false;
        p += 1;
        f = f0;
        continue;
      }

      p += 1;
      f = f0;
      if (p > MAX_PAGES) {
        warnings.push({ kind: "page-overflow", pageCount: MAX_PAGES });
        break;
      }
      continue;
    }

    // 从 row 开始尽量多放。上面那个分支已经排除"一行都放不下"，
    // 所以这里 k > row 必然成立（不会出现空片把循环卡住）。
    let used = repeatHead;
    let k = row;
    while (k < n && used + rowHeights[k] <= avail + EPS) {
      used += rowHeights[k];
      k += 1;
    }

    place(p, {
      elementId: block.elementId,
      y: s + f,
      height: used,
      rowStart: row,
      rowEnd: k,
      withHeader: !first
    });

    first = false;
    row = k;
    p += 1;
    f = f0;
  }
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
