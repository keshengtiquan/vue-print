/**
 * 分页引擎自检（约 200 行，不装任何测试框架）。
 *
 * 用法：
 *   node scripts/check-paginate.mjs
 *
 * ## 为什么这个脚本值得存在
 *
 * 分页是**纯函数**：算错了不会报错，只会把元素画到错的地方 ——
 * 而"画到错的地方"要靠肉眼盯着一页页比对才发现，改一次分页就要重验一遍。
 * 本项目 `vue-tsc` 是坏的（`runTsc` MODULE_NOT_FOUND），没有类型检查兜底，
 * 所以这个脚本是**唯一**能自动拦住回归的东西。
 *
 * 它能跑起来靠两件事：
 * 1. Node 22 的**类型擦除**（`node x.ts` 直接可用，本项目实测通过）；
 * 2. `paginate.ts` / `types.ts` 保持**零运行时依赖**（只 `import type`）——
 *    于是路径别名 `@/...` 不会被解析，脚本不需要任何 loader / tsconfig-paths。
 *
 * ⚠️ 一旦往 `paginate.ts` 里加了运行时 import（哪怕只是 import 一个常量），
 * 这个脚本会立刻因路径解析失败而崩 —— 那时请把它挪回纯函数层，别加 loader。
 */

import { paginate, contentHeight, MAX_PAGES } from "../src/components/design/preview/paginate.ts";
import { expansionRowHeights } from "../src/components/design/preview/expand.ts";

/* ============================================================
   断言脚手架
============================================================ */

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    passed += 1;
    return;
  }
  failures.push({ name, actual: a, expected: b });
}

function checkTrue(name, cond, detail = "") {
  if (cond) {
    passed += 1;
    return;
  }
  failures.push({ name, actual: `false ${detail}`, expected: "true" });
}

/** 取某页上的某一项（按 elementId），没找到返回 null */
function itemOf(layout, pageIndex, elementId) {
  const page = layout.pages[pageIndex];
  if (!page) return null;
  return page.items.find((i) => i.elementId === elementId) ?? null;
}

/** 某元素一共出现在第几页（多片时返回数组） */
function pagesOf(layout, elementId) {
  const out = [];
  for (const page of layout.pages) {
    if (page.items.some((i) => i.elementId === elementId)) out.push(page.index);
  }
  return out;
}

/* ============================================================
   公共版式：A4 竖版 + 10mm 页边距
   s = 10，H = 277
============================================================ */

const A4 = { widthMm: 210, heightMm: 297 };
const M10 = { top: 10, right: 10, bottom: 10, left: 10 };

const atomic = (id, top, height) => ({ elementId: id, top, height, breakable: false });
const table = (id, top, rowHeights, headerRows) => ({
  elementId: id,
  top,
  height: rowHeights.reduce((a, b) => a + b, 0),
  rowHeights,
  headerRows,
  breakable: true
});

const run = (blocks, repeatedIds = [], hiddenIds = []) =>
  paginate({ paper: A4, margin: M10, blocks, repeatedIds, hiddenIds });

/* ============================================================
   0. 内容区高
============================================================ */

check("内容区高 = 纸张高 - 上下边距", contentHeight(A4, M10), 277);

/* ============================================================
   1. 第 1 页 ≡ 设计态（那条算术恒等式）
============================================================ */

{
  const layout = run([atomic("a", 20, 50)]);
  const item = itemOf(layout, 0, "a");
  checkTrue("1.1 第 1 页只有一页", layout.pages.length === 1);
  // u = s + (y - s - 0·H) = y。这是"设计态什么样、预览第一页就什么样"的证明。
  check("1.2 页内绝对 y ≡ 设计态 y", item && item.y, 20);
  check("1.3 单项不切分", item && item.rowStart, undefined);
}

/* ============================================================
   2. 页边距内的元素：第 1 页不纠正
   （y < margin.top 是用户故意画在那儿的）
============================================================ */

{
  const layout = run([atomic("hdr", 0, 20)]);
  const item = itemOf(layout, 0, "hdr");
  check("2.1 y=0 留在第 1 页", item && item.y, 0);
}

{
  const layout = run([atomic("hdr", -5, 250)]);
  const item = itemOf(layout, 0, "hdr");
  check("2.2 y=-5 原样保留（负偏移不被钳）", item && item.y, -5);
}

/* ============================================================
   3. 跨界顺延（唯一的移动来源）
============================================================ */

{
  // f = 240，240 + 50 = 290 > 277 → 顺延到下一页顶部
  const layout = run([atomic("a", 250, 50)]);
  checkTrue("3.1 顺延后落到第 2 页", pagesOf(layout, "a").join() === "1");
  check("3.2 顺延后被钳到内容区顶（y = margin.top）", itemOf(layout, 1, "a").y, 10);
}

{
  // 顺延后 f = max(0, 260 - 277) = 0 → 第 2 页顶部
  const layout = run([atomic("a", 270, 50)]);
  check("3.3 顺延后不越界到上边距", itemOf(layout, 1, "a").y, 10);
}

{
  // 刚好贴合页底：f + h = 240 + 37 = 277 → 不该被顺延（容差那一条）
  const layout = run([atomic("a", 250, 37)]);
  checkTrue("3.4 刚好放得下不顺延", pagesOf(layout, "a").join() === "0");
}

/* ============================================================
   4. 不做连锁下推：A 顺延了，B 仍按自己的绝对坐标放置
============================================================ */

{
  const layout = run([atomic("a", 250, 50), atomic("b", 200, 30)]);
  check("4.1 A 顺延到第 2 页", itemOf(layout, 1, "a").y, 10);
  check("4.2 B 没有被下推，仍在第 1 页原坐标", itemOf(layout, 0, "b").y, 200);
}

/* ============================================================
   5. 远处的元素：页号与页内坐标的换算
============================================================ */

{
  // F = 590，p = floor(590 / 277) = 2，f = 36 → y = 46
  const layout = run([atomic("a", 600, 50)]);
  checkTrue("5.1 落到第 3 页", pagesOf(layout, "a").join() === "2");
  check("5.2 u = s + (y - s - p·H)", itemOf(layout, 2, "a").y, 46);
  check("5.3 中间页被补出来（不塌陷）", layout.pages.length, 3);
}

/* ============================================================
   6. 比整页还高的块：放 + 告警，绝不静默裁切
============================================================ */

{
  const layout = run([atomic("tall", 20, 400)]);
  const item = itemOf(layout, 0, "tall");
  checkTrue("6.1 仍然被放置（不丢元素）", !!item);
  checkTrue(
    "6.2 给出 too-tall 告警",
    layout.warnings.some((w) => w.kind === "too-tall" && w.elementId === "tall")
  );
  checkTrue(
    "6.3 同时给出人话的 clipped 说明",
    layout.warnings.some((w) => w.kind === "clipped" && w.elementId === "tall")
  );
}

/* ============================================================
   7. 表格：整表放得下就不拆
============================================================ */

{
  const rows = Array.from({ length: 30 }, () => 8); // 240mm
  const layout = run([table("t", 20, rows, 1)]);
  checkTrue("7.1 不拆（只有一页）", layout.pages.length === 1);
  const item = itemOf(layout, 0, "t");
  check("7.2 分片覆盖全部行", [item.rowStart, item.rowEnd], [0, 30]);
  check("7.3 首片不带重复表头", item.withHeader, false);
}

/* ============================================================
   8. 表格：40 行 × 8mm 超过一页 → 按行切
   第 1 片 33 行（8 + 32×8 = 264 ≤ 267），第 2 片 8 + 7×8 = 64
============================================================ */

{
  const rows = Array.from({ length: 40 }, () => 8); // 320mm
  const layout = run([table("t", 20, rows, 1)]);
  const s1 = itemOf(layout, 0, "t");
  const s2 = itemOf(layout, 1, "t");
  check("8.1 第 1 片行区间", [s1.rowStart, s1.rowEnd], [0, 33]);
  check("8.2 第 1 片高度 = 33 × 8", s1.height, 264);
  check("8.3 第 1 片保留元素的设计位置（y=20，不被顶到内容区顶）", s1.y, 20);
  check("8.4 第 2 片行区间", [s2.rowStart, s2.rowEnd], [33, 40]);
  check("8.5 第 2 片重复表头", s2.withHeader, true);
  check("8.6 第 2 片高度 = 表头 8 + 7 行 × 8", s2.height, 64);
  checkTrue("8.7 一共两页", layout.pages.length === 2);
}

/* ============================================================
   9. 表格：关掉「允许跨页断开」→ 退化成整块顺延
============================================================ */

{
  const rows = Array.from({ length: 40 }, () => 8);
  const blocked = { ...table("t", 20, rows, 1), breakable: false };
  const layout = run([blocked]);
  checkTrue("9.1 不再被切开", layout.pages.filter((p) => p.items.length).length === 1);
  const item = itemOf(layout, 0, "t");
  check("9.2 作为整块放置", item.rowStart, undefined);
  checkTrue(
    "9.3 太高 → too-tall 告警",
    layout.warnings.some((w) => w.kind === "too-tall" && w.elementId === "t")
  );
}

{
  // 小表格放在页底（f = 240，可用 37mm）：会被切成"4 行 + 剩 1 行"。
  // 这正是「允许跨页断开」这个开关存在的理由 —— 嫌难看就关掉它，整表顺延。
  const rows = Array.from({ length: 5 }, () => 8); // 40mm
  const layout = run([table("t", 250, rows, 0)]);
  const s1 = itemOf(layout, 0, "t");
  const s2 = itemOf(layout, 1, "t");
  check("9.4 页底放不下 → 第 1 片 37mm 可用 / 每行 8mm → 4 行", [s1.rowStart, s1.rowEnd], [0, 4]);
  check("9.5 剩余 1 行到下一页顶部", [s2.rowStart, s2.rowEnd], [4, 5]);
  check("9.6 第 2 片贴内容区顶", s2.y, 10);
}

/* ============================================================
   10. 表格：表头在每一片重复（表头 2 行 × 10mm）
============================================================ */

{
  const rows = [10, 10, ...Array.from({ length: 40 }, () => 8)]; // 表头 20 + 明细 320
  const layout = run([table("t", 20, rows, 2)]);
  const s1 = itemOf(layout, 0, "t");
  const s2 = itemOf(layout, 1, "t");
  check("10.1 第 1 片含表头（从 0 起）", s1.rowStart, 0);
  check("10.2 第 2 片重复表头（高度含 20mm）", s2.height - 20 > 0, true);
  checkTrue(
    "10.3 第 2 片标记 withHeader",
    s2.withHeader === true
  );
  // 表头 20 + k×8 ≤ 277 且首片 f=10 → 可用 267 → k ≤ 30
  check("10.4 第 1 片 = 表头 + 30 行", s1.rowEnd, 32);
}

/* ============================================================
   11. 单行高于整页：至少放 1 行（不死循环）+ 告警
============================================================ */

{
  const rows = [400, 8, 8];
  const layout = run([table("t", 20, rows, 0)]);
  checkTrue(
    "11.1 不死循环、产出结果",
    layout.pages.length > 0 && itemOf(layout, 0, "t") !== null
  );
  checkTrue(
    "11.2 给出裁切告警",
    layout.warnings.some((w) => w.kind === "clipped" && w.elementId === "t")
  );
}

/* ============================================================
   12. 隐藏与重复元素
============================================================ */

{
  const layout = run([atomic("a", 20, 50)], ["rep"], ["hid"]);
  checkTrue("12.1 隐藏元素不进分页流", pagesOf(layout, "hid").length === 0);
  check("12.2 隐藏元素 id 被记录", layout.hiddenIds, ["hid"]);
  checkTrue(
    "12.3 隐藏元素给出告警",
    layout.warnings.some((w) => w.kind === "hidden" && w.elementId === "hid")
  );
  check("12.4 每页重复元素 id 被记录", layout.repeatedIds, ["rep"]);
}

{
  // 全部隐藏 → 仍然给一张空白页（好让视图层能区分"模板为空"与"都被隐藏了"）
  const layout = run([], [], ["a", "b"]);
  check("12.5 全隐藏时补一张空白页", layout.pages.length, 1);
  // 真的什么都没有 → 0 页（视图层走空态）
  const empty = run([]);
  check("12.6 空模板 → 0 页", empty.pages.length, 0);
}

/* ============================================================
   13. 上限：页数不会被超大 y 撑爆
============================================================ */

{
  const layout = run([atomic("a", 9_999_999, 50)]);
  checkTrue("13.1 页数 ≤ MAX_PAGES + 1", layout.pages.length <= MAX_PAGES + 1);
  checkTrue("13.2 给出 page-overflow 告警", layout.warnings.some((w) => w.kind === "page-overflow"));
}

/* ============================================================
   14. 病态输入：页边距 ≥ 纸张尺寸
============================================================ */

{
  const layout = paginate({
    paper: { widthMm: 100, heightMm: 50 },
    margin: { top: 30, right: 10, bottom: 30, left: 10 },
    blocks: [atomic("a", 10, 20)],
    repeatedIds: [],
    hiddenIds: []
  });
  checkTrue("14.1 不抛错、至少一页", layout.pages.length >= 1);
  checkTrue("14.2 元素仍在", !!itemOf(layout, 0, "a"));
}

/* ============================================================
   15. 顺序与幂等：同样的输入两次得到同样的结果
============================================================ */

{
  const blocks = [atomic("a", 250, 50), atomic("b", 200, 30), table("t", 20, [8, 8, 8], 1)];
  const r1 = run(blocks);
  const r2 = run(blocks);
  check("15.1 幂等（纯函数、无隐藏状态）", JSON.stringify(r1), JSON.stringify(r2));
}

/* ============================================================
   16. 行高自适应：expansionRowHeights 的 atLeast 融合
============================================================ */

{
  // 3 行：行 0 fixed、行 1 atLeast、行 2 fixed；行高 8 / 10 / 8
  const el = {
    rows: 3,
    cols: 1,
    rowHeights: [8, 10, 8],
    rowHeightModes: ["fixed", "atLeast", "fixed"]
  };
  // 展开：模板行序列 [0, 1, 1, 2]（明细行 1 复制两份）
  const expansion = { templateRows: [0, 1, 1, 2] };

  // 无 measured → 全部回落声明高
  check("16.1 无实测值全部回落", expansionRowHeights(el, expansion), [8, 10, 10, 8]);

  // ⚠️ measured 按**展开下标**索引（与 templateRows 一一对应）：
  // 明细行每份记录不同、自然高度不同，必须逐实例回填。
  // 按模板行取 max 是错的 —— 会把最长那条强加给所有明细，分页按它切、
  // 渲染按各自高画 → "一页没占满就换页"（2026-09-21 真机 bug，此节即回归断言）。
  // 两份明细：第 1 份实测 25（撑高），第 2 份实测 8（不足声明高 10 → 保持 10）
  const m1 = [0, 25, 8, 0];
  check("16.2 两份明细各用各的实测", expansionRowHeights(el, expansion, m1), [8, 25, 10, 8]);

  // 都不足声明高 → 全部不缩矮
  const m2 = [0, 6, 6, 0];
  check("16.3 atLeast 不缩矮（取 max）", expansionRowHeights(el, expansion, m2), [8, 10, 10, 8]);

  // fixed 行即使有实测也不看
  const m3 = [99, 25, 8, 99];
  check("16.4 fixed 行不理会实测", expansionRowHeights(el, expansion, m3), [8, 25, 10, 8]);

  // 稀疏实测（长度不足 / 缺省下标）→ 缺省回落声明高
  const m4 = [0, 25];
  check("16.5 稀疏实测缺省回落", expansionRowHeights(el, expansion, m4), [8, 25, 10, 8]);
}

/* ============================================================
   结果
============================================================ */

const total = passed + failures.length;
if (failures.length) {
  console.error(`\n✗ 分页自检失败：${failures.length} / ${total}\n`);
  for (const f of failures) {
    console.error(`  · ${f.name}`);
    console.error(`      期望 ${f.expected}`);
    console.error(`      实际 ${f.actual}`);
  }
  process.exit(1);
}
console.log(`✓ 分页自检通过：${passed} / ${total} 条断言`);
