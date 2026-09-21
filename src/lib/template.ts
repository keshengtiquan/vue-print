/**
 * 占位符模板：解析与渲染的**唯一实现**。
 *
 * 为什么必须收敛成一份（这不是洁癖，是踩过口子的）：
 * 预览态、导出、打印 —— 这一串都要把同一个 `{字段}` 换成值，
 * 而它们必须在**边界情况上给出一致结果**（字段名带空格、嵌套字段、缺值、
 * `{字段}` 与 `${参数}` 混排、空字符串 vs 无值）。如果每处各写一个正则去替换，
 * 那"面板里看着对、打印出来空"是必然的。这里把口径定死，
 * 需要"把占位符变成值"的地方**只准调 `renderTemplate`**。
 *
 * ⚠️ **设计态画布不在这个清单里，而且是有意的**：画布只显示占位符原文，
 * 一个字符都不替换（表格文档 §1.5 约束 2 / data-binding-design.md §6.7）。
 * 于是"哪里调了 `renderTemplate`"就等于"哪里会把字段值显示出来" ——
 * 这个 grep 应该只在面板预览与预览 / 导出 / 打印链路里命中，画布层不该出现它。
 *
 * 设计文档：docs/data-binding-design.md §2.5
 *
 * ## 两套语法，刻意长得像但完全不同
 *
 * | 写法 | 含义 | 谁替换 |
 * |---|---|---|
 * | `{字段}` / `{数据集.字段}` | **字段占位符**，数据填进来 | 前端（本文件） |
 * | `{$date}` / `{$pageIndex}` | **系统变量** | 前端（本文件） |
 * | `${参数}` | **查询参数**，传给数据库/接口 | 执行侧预编译绑定（**不在这里**） |
 *
 * `${}` 与 `{}` 的区别就是那条铁律的可视化：前者是"要送出去的查询条件"，
 * 后者是"要填进来的数据"。混了的话轻则查不到数据，重则是一次注入。
 */

/** 占位符整段：`{...}`，内部不允许再出现花括号 */
const TOKEN_RE = /\{\s*([^{}]+?)\s*\}/g;

/** 一个占位符片段 */
export interface TemplateToken {
  /** 原文（含花括号），回填时用 */
  raw: string;
  /**
   * 键名（已 trim）：
   * - `字段`
   * - `数据集.字段`
   * - `$系统变量`
   */
  key: string;
}

export interface TemplateContext {
  /**
   * 取字段值。
   * @param field 字段名
   * @param dataSetName 占位符里显式写的数据集名（`{ds.f}` 才有）；未写为 undefined
   */
  get(field: string, dataSetName?: string): unknown;
  /** 取系统变量。不提供时 `{$xxx}` 一律按缺值处理 */
  getSys?(name: string): unknown;
  /**
   * 取不到值时的策略：
   * - `keep`（默认）：**原样保留** `{字段}` —— 缺值处显示空白会让人分不清
   *   "这个字段本来就没值"和"绑定根本没生效"，缺值宁可留原文
   * - `blank`：渲染成空白 —— 预览 / 打印等"以真值出图"的场景用
   */
  onMissing?: "keep" | "blank";
  /** 值格式化。返回 null 表示不处理，走默认 String(value) */
  format?(field: string, value: unknown, dataSetName?: string): string | null;
}

/** 解析出内容里全部占位符。没写占位符时返回空数组 */
export function parseTemplate(value: string | undefined | null): TemplateToken[] {
  if (!value) return [];
  const out: TemplateToken[] = [];
  // 每次调用都要重置 lastIndex：TOKEN_RE 带 g 且是模块级常量，
  // 共享实例的 lastIndex 会在连续调用之间“记住”上一次的位置，导致跳匹配。
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(value)) !== null) {
    out.push({ raw: m[0], key: m[1].trim() });
  }
  return out;
}

/** 内容里是否含占位符。比 parseTemplate 便宜，用于快速分支 */
export function hasPlaceholder(value: string | undefined | null): boolean {
  if (!value) return false;
  const re = /\{\s*[^{}]+?\s*\}/;
  return re.test(value);
}

/**
 * 收集内容引用到的字段名（不含系统变量）。
 * 面板用它显示"这个元素引用了哪些字段"，以便提示"字段已失效"。
 */
export function collectPlaceholderFields(value: string | undefined | null): string[] {
  const out: string[] = [];
  for (const token of parseTemplate(value)) {
    if (token.key.startsWith("$")) continue;
    const field = token.key.includes(".")
      ? token.key.slice(token.key.indexOf(".") + 1).trim()
      : token.key;
    if (field && !out.includes(field)) out.push(field);
  }
  return out;
}

/** 把 `数据集.字段` 拆成两段；没有点号时 dataSetName 为 undefined */
export function splitTokenKey(key: string): { dataSetName?: string; field: string } {
  const i = key.indexOf(".");
  // 点号在最前或最后都算无效，整体当字段名 —— 宁可让用户看到原样占位符，
  // 也不要把 `{.}` 这种输入解释成"某个数据集的空字段"。
  if (i <= 0 || i === key.length - 1) return { field: key };
  return { dataSetName: key.slice(0, i).trim(), field: key.slice(i + 1).trim() };
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    // 对象/数组字段（json 类型）直接 JSON 化：`{地址}` 至少能看出结构，
    // 而 `[object Object]` 是纯噪音。
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * 渲染一段可能含占位符的文本。
 *
 * **缺值判定只看 `null` / `undefined`**：空字符串 `""` 是"有值且为空"，
 * 应当渲染成空 —— 把它也当缺值的话，样本里那些空字段会全部显示出 `{字段}`，
 * 用户会以为绑定没生效。
 */
export function renderTemplate(value: string | undefined | null, ctx: TemplateContext): string {
  if (!value) return "";
  if (!value.includes("{")) return value;

  return value.replace(TOKEN_RE, (raw, rawKey: string) => {
    const key = rawKey.trim();
    if (!key) return raw;

    let resolved: unknown;
    let formatKey = key;

    if (key.startsWith("$")) {
      const name = key.slice(1).trim();
      resolved = ctx.getSys?.(name);
      formatKey = name;
    } else {
      const { dataSetName, field } = splitTokenKey(key);
      resolved = ctx.get(field, dataSetName);
    }

    const missing = resolved === null || resolved === undefined;
    if (missing) return ctx.onMissing === "blank" ? "" : raw;

    const formatted = ctx.format?.(formatKey, resolved);
    return formatted ?? stringify(resolved);
  });
}
