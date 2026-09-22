/**
 * 渲染上下文：把"一行数据"变成 `renderTemplate` 要的 `TemplateContext`。
 *
 * 这是数据层与渲染层之间**唯一**的接缝。渲染组件（文本、表格单元格）只需要
 * "给我一个 ctx"，不需要知道数据是怎么取回来的、样本还是真实数据。
 */
import dayjs from "dayjs";
import { renderTemplate, type TemplateContext } from "@/lib/template";
import { pickByPath } from "./model";
import type { DataRow, DataSetField, SysVarName } from "./types";

/** 系统变量的取值集合。分页类变量由分页器在将来注入，当前一律缺省 */
export interface SystemVariableBag extends Partial<Record<SysVarName, unknown>> {
  now?: Date;
}

const DATE_FMT = "YYYY-MM-DD";
const TIME_FMT = "HH:mm:ss";
const DATETIME_FMT = "YYYY-MM-DD HH:mm:ss";

export function systemVariables(bag: SystemVariableBag = {}): Record<string, unknown> {
  const now = dayjs(bag.now ?? new Date());
  return {
    date: bag.date ?? now.format(DATE_FMT),
    time: bag.time ?? now.format(TIME_FMT),
    datetime: bag.datetime ?? now.format(DATETIME_FMT),
    pageIndex: bag.pageIndex,
    pageCount: bag.pageCount,
    userId: bag.userId,
    userName: bag.userName,
    docTitle: bag.docTitle
  };
}

/**
 * 数值格式化。只实现三类够用的形态：
 * - 含 `#,##0` / `0.00` 的数字模式 → `Intl.NumberFormat`
 * - 含 `YYYY` / `MM` / `DD` 等 token 的日期模式 → dayjs
 * - 其他 → 原样
 *
 * 刻意**不做** Excel 自定义格式的完整实现（条件段、颜色段、text 占位）——
 * 那些在打印模板里几乎用不到，而完整实现是一整个子语言。
 */
export function applyFieldFormat(value: unknown, pattern: string | undefined): string | null {
  if (!pattern) return null;
  const p = pattern.trim();
  if (!p) return null;

  if (/[YMDHms]/.test(p) && /^[YMDHms\-/:. ]+$/.test(p)) {
    const d = dayjs(value as string | number | Date);
    return d.isValid() ? d.format(p) : null;
  }

  if (typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)))) {
    const num = Number(value);
    if (Number.isNaN(num)) return null;
    const decimals = p.includes(".") ? (p.split(".")[1] ?? "").replace(/[^0#]/g, "").length : 0;
    const grouped = p.includes(",");
    return new Intl.NumberFormat("zh-CN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: grouped
    }).format(num);
  }
  return null;
}

export interface BuildContextOptions {
  /** 本 ctx 所属的数据集名（用于校验 `{数据集.字段}` 的前缀） */
  dataSetName?: string;
  /** 字段定义，用于取默认格式 */
  fields?: DataSetField[];
  /** 系统变量 */
  sys?: Record<string, unknown>;
  /** 缺值策略：设计态 keep、预览/打印态 blank */
  onMissing?: "keep" | "blank";
}

/**
 * 以**一行数据**构造上下文。
 *
 * `{$xxx}` 一律走系统变量；`{数据集.字段}` 的前缀校验是宽松的 ——
 * 一期只有单数据集，前缀写不写都不影响取值；写成别的数据集名时返回缺值，
 * 让用户在设计态看到原样占位符，从而意识到"这个字段不在当前数据集里"。
 */
export function buildRowContext(row: DataRow | undefined, options: BuildContextOptions = {}): TemplateContext {
  const { dataSetName, fields, sys, onMissing = "keep" } = options;
  const formats = new Map<string, string>();
  for (const f of fields ?? []) if (f.format) formats.set(f.name, f.format);

  /**
   * `{address.city}` 与 `{数据集.字段}` 长得一模一样，怎么区分？
   *
   * `splitTokenKey` 只会按**第一个点**切，于是两者都被切成
   * prefix / field 两段。这里补一条判据：**只有当前缀确实是一个一级字段名时，
   * 才把它当成"对象子字段"**。三种写法的落点：
   *
   * | 写法 | prefix | 判定 |
   * |---|---|---|
   * | `{address.city}` | address | 是一级字段 → 按点路径取 `address.city` |
   * | `{数据集1.address.city}` | 数据集1 | 是数据集名 → 按点路径取 `address.city` |
   * | `{别的数据集.字段}` | 别的数据集 | 两者都不是 → 维持旧的"取不到值" |
   *
   * 于是语义只被**放宽到对象字段**这一条，没有把"写错数据集名"也悄悄变成
   * "去别处取个值"。
   */
  const isTopLevelField = (name: string): boolean =>
    fields?.some((f) => f.name === name) || (row !== undefined && name in row);

  return {
    onMissing,
    get(field: string, prefix?: string) {
      if (!row) return undefined;
      if (prefix && dataSetName && prefix !== dataSetName) {
        return isTopLevelField(prefix) ? pickByPath(row, `${prefix}.${field}`) : undefined;
      }
      /*
        统一走点路径取值：不带点号的普通字段与原先的 `row[field]` 完全等价，
        `address.city` / `address.geo.lat` 则顺带支持了。
        刻意不复用 `splitTokenKey` 的二次拆分 —— 那会把带点号的字段名切碎。
      */
      return pickByPath(row, field);
    },
    getSys(name: string) {
      return sys?.[name];
    },
    format(field: string, value: unknown) {
      return applyFieldFormat(value, formats.get(field));
    }
  };
}

/**
 * 没有任何数据时的上下文（元素还没绑数据集，或数据集还没测试取过数）。
 *
 * `onMissing` 默认 `"keep"` —— 缺值时应原样显示 `{品名}`，而不是变成一片空白：
 * 空白分不清"没数据"和"没绑上"，占位符原文至少还告诉用户"这里引用的是哪个字段"。
 * （这条口径原本是为面板的取数预览定的；预览已移除，但它本身就是 `buildEmptyContext`
 * 的语义，与界面上有没有预览无关。）
 *
 * 但**渲染态必须能覆盖它**：预览 / 打印是"以真值出图"，把 `{品名}` 打到纸上
 * 比打一片空白糟糕得多。所以这里开了第二个参数而不是让调用方自己造一个 ctx ——
 * "什么情况下算缺值、缺值给什么"只该有一处定义（见 `lib/template.ts` 的文件头）。
 */
export function buildEmptyContext(
  sys?: Record<string, unknown>,
  onMissing: "keep" | "blank" = "keep"
): TemplateContext {
  return {
    onMissing,
    get: () => undefined,
    getSys: (name: string) => sys?.[name]
  };
}

export { renderTemplate };
