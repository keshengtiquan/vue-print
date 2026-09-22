/**
 * 占位符体检（`docs/preview-design.md` §4.2）。
 *
 * ## 它解决的是哪个问题
 *
 * 预览是"打印所见"，所以缺值一律渲染**空白**（`onMissing: "blank"`）——
 * 这是对的，打印时值不存在就不能把 `{订单明细.备注}` 打在纸上。
 *
 * 但纯空白对**排查**是灾难：那一格为什么是空的？是数据集没绑？字段名写错了？
 * 数据集没取到数？还是字段本来就是 null？—— 用户只能自己猜。
 *
 * 所以这条链路是**刻意的组合**：空白给打印，清单给排查。
 * 单独给任何一个都会出问题（留原文会打错纸，纯空白会让人以为绑定坏了）。
 *
 * ## 为什么不"从占位符反推数据集"
 *
 * 绑定只有一个来源：`element.binding.dataSetId`（`data-binding-design.md` §11.9）。
 * 从 `{数据集.字段}` 的文本前缀反推"这个元素该去哪个数据集取数"等于把同一件事
 * 记第二遍，两份迟早分叉。这里只**校验**前缀，绝不拿它当取数依据。
 *
 * ## 与 `paginate.ts` 的区别
 *
 * 本文件有运行时依赖（`lib/template` 的解析函数）—— 它是"占位符唯一解析实现"
 * 的既有约束，不能为了 node 可跑而在本地再写一份正则。
 * 所以体检**不在**自检脚本的覆盖范围内（分页是，因为它无依赖）。
 */
import { parseTemplate, splitTokenKey, type TemplateContext } from "@/lib/template";
import type { DataRow } from "@/components/design/data/types";
import type { Element, TableElement } from "@/components/design/types";
import type { LayoutWarning } from "./types";

/** 一个元素的体检输入（由调用方从 store 组装；本文件不碰 store） */
export interface InspectTarget {
  elementId: string;
  /** 该元素上所有可能含占位符的文本 */
  texts: string[];
  /** 该元素在预览里的取值上下文（口径与渲染完全一致：第 1 条记录 + blank） */
  ctx: TemplateContext | null;
  /** 绑定的数据集名；未绑定 = undefined */
  dataSetName?: string;
  /** 绑了 `dataSetId` 但数据集已经不存在（悬空引用） */
  dataSetMissing: boolean;
  /** 数据集声明的字段名集合（含嵌套路径，如 `address.city`） */
  fieldNames: Set<string>;
  /** 第 1 条记录（用来区分"字段不存在"与"字段存在但值为空"） */
  row?: DataRow;
}

/**
 * 收集一个元素上所有含占位符的文本。
 *
 * 表格只收格子里的占位符内容 —— 「列映射」/ `columnFields` 兜底已删（2026-09-22），
 * 取数只剩"往格子里写占位符"这一条显式路径。
 */
export function collectPlaceholderTexts(el: Element): string[] {
  const out: string[] = [];
  if (el.type === "text") {
    if (el.content) out.push(el.content);
  } else if (el.type === "image") {
    if (el.src) out.push(el.src);
  } else if (el.type === "table") {
    const table = el as TableElement;
    for (const cell of table.cells) {
      if (cell.covered) continue;
      const value = cell.content?.value;
      if (value) out.push(value);
    }
  }
  return out;
}

/**
 * 跑一遍体检，返回"没取到值"的清单（已去重）。
 *
 * 去重按 `元素 id + 占位符原文`：一个元素里同一个字段出现 5 次是很常见的
 * （每行都写 `{品名}` 的模板），逐个报出来只会把警告条塞满，
 * 而它们**要改的地方是同一个**。
 */
export function inspectPlaceholders(targets: InspectTarget[]): LayoutWarning[] {
  const out: LayoutWarning[] = [];
  const seen = new Set<string>();

  for (const target of targets) {
    for (const text of target.texts) {
      for (const token of parseTemplate(text)) {
        // 系统变量（`{$page.index}` 这类）不算"没取到值"：
        // 它们由渲染层按页注入，体检这一刻本来就还没有值。
        if (token.key.startsWith("$")) continue;

        const dedupeKey = `${target.elementId}\u0000${token.raw}`;
        if (seen.has(dedupeKey)) continue;

        const { dataSetName: prefix, field } = splitTokenKey(token.key);
        const value = target.ctx?.get(field, prefix);
        if (value !== null && value !== undefined) continue;

        seen.add(dedupeKey);
        out.push({
          kind: "unresolved",
          elementId: target.elementId,
          token: token.raw,
          why: explain(target, prefix, field)
        });
      }
    }
  }

  return out;
}

/**
 * 给"为什么没取到值"一个准确的说法。
 *
 * 顺序是刻意的：从"最上游的原因"往"最下游的原因"排。
 * 元素没绑数据集时，报"字段不存在"是**错的** —— 用户会去改字段名，
 * 而真正该做的是先绑一个数据集。
 */
function explain(target: InspectTarget, prefix: string | undefined, field: string): string {
  if (target.dataSetMissing) return "元素绑定的数据集已不存在";
  if (!target.ctx) return "元素未绑定数据集";

  /*
    `{别的数据集.字段}`：前缀写了、和本元素绑的不是同一个，且那个前缀也不是
    本数据集的一级字段（`{address.city}` 这种"对象子字段"写法是合法的，
    不能误报）。这时**必须说清楚是数据集名对不上** ——
    报成"字段不存在"会让人去字段树里找一个本来存在、只是前缀写错的字段。
  */
  if (prefix && target.dataSetName && prefix !== target.dataSetName && !target.fieldNames.has(prefix)) {
    return `占位符写的数据集「${prefix}」不是本元素绑定的「${target.dataSetName}」`;
  }

  const candidates = prefix ? [`${prefix}.${field}`, field] : [field];
  const declared = candidates.some((name) => target.fieldNames.has(name));
  const inRow =
    !!target.row &&
    candidates.some((name) => Object.prototype.hasOwnProperty.call(target.row, name));
  if (!declared && !inRow) return `字段「${field}」不在数据集的字段列表里`;

  /*
    走到这里说明字段是"认识的"，只是这一行的值是 null / undefined。
    这句话与"字段不存在"必须分开：前者要去看数据，后者要去看模板 ——
    混成一句会让用户在两处之间来回瞎试。
  */
  return "该字段在这一行的值是空（null / undefined）";
}
