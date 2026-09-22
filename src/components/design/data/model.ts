/**
 * 数据绑定的纯函数模型层。
 *
 * 与 `table/model.ts` 同款约束：**不碰 store、不碰 DOM、不依赖 Vue**，
 * 并且保持**零运行时依赖**（只用 `import type`）——
 * 于是"响应体怎么变成行 / 字段类型怎么推断 / ${参数} 怎么替换"这几件事
 * 只有一份实现，可以脱离 Vite 直接拿 Node 跑校验。
 *
 * 设计文档：docs/data-binding-design.md §2.1 ~ §2.4
 */

import type {
  DataRow,
  DataSetField,
  DataSetFieldType,
  DataSetParam,
  TemplateDataSet
} from "./types";

/* ============================================================
   常量
============================================================ */

/** 默认行数上限。取数放开的量级，同时是"忘了限行也不会拖垮浏览器"的护栏 */
export const DEFAULT_ROW_LIMIT = 5000;
/** 默认超时 ms */
export const DEFAULT_TIMEOUT = 10000;
/** 测试时回给前端的样本行数（服务端裁剪），也是面板预览表显示的行数 */
export const TEST_SAMPLE_ROWS = 20;
/**
 * 样本数据**存进模板**的行数。
 *
 * 只留 3 行：设计态要让模板"打开就看到效果"，而 20 行会把模板体积撑起来
 * （大字段的 JSON 尤其明显）。完整样本只留在内存里，刷新即失效（文档 §4.3）。
 */
export const SAMPLE_ROWS_IN_TEMPLATE = 3;
/** 字段类型推断的扫描行数 */
const INFER_SCAN_ROWS = 50;
/**
 * 对象字段向下展开的最大层数。
 *
 * 到这一层就不再往下钻：再深就是"在字段树里读 JSON"，不是排版。
 * 同时它是一道护栏 —— 接口回一个深度嵌套的大对象时，递归展开会
 * 直接炸出成百上千个字段，面板卡死而用户一个也用不上。
 */
const MAX_FIELD_DEPTH = 4;

/**
 * 字段拖拽载荷的 MIME。
 *
 * 与素材台的 `component-type` **刻意分开**：两者落点不同（素材落纸张、
 * 字段落元素或单元格）。共用一个类型的话，画布 drop 端还得再解一次 JSON
 * 才知道该走哪条分支 —— 而 MIME 本来就是干这个的。
 *
 * 放在模型层而不是组件里，是因为 `<script setup>` 不允许 `export`，
 * 而拖拽的发起端与接收端必须用同一个字面量。
 */
export const FIELD_MIME = "dataset-field";

/*
 * 【字段载荷的主通道】—— 与 materials.ts 的 draggingMaterialId 同一坑、同一解：
 * 某些浏览器扩展会在 dragstart 后清空 dataTransfer（types 变 []），页面代码
 * 在 dragstart 之后无权写 data store，无法自救。字段载荷另存一份模块变量，
 * 三个消费点（文本 / 表格 / 图片元素）的 dragover 门卫与 drop 读取都先走它，
 * dataTransfer 只做跨窗口拖入的兜底。
 */
export interface DraggingFieldPayload {
  /** 字段所属数据集 —— 拖一下自动绑好，不用再去面板选数据集 */
  dataSetId: string;
  /** 字段名（不带花括号的裸名） */
  field: string;
}

let draggingField: DraggingFieldPayload | null = null;

/** dragstart 时写入；非字段拖拽（如素材拖拽）必须显式写 null 防止上次残留被误读 */
export function setDraggingField(p: DraggingFieldPayload | null): void {
  draggingField = p;
}

export function getDraggingField(): DraggingFieldPayload | null {
  return draggingField;
}

/* ============================================================
   取值路径（resultPath）
============================================================ */

/**
 * 把 `data.rows[0].items` 切成 `["data", "rows", 0, "items"]`。
 *
 * 刻意**不用完整 JsonPath 引擎**（文档 §7 第 1 条）：点路径 + 下标零依赖，
 * 已能覆盖真实接口的响应结构；引进来一个引擎，收益是几个边缘语法，
 * 成本是一份要跟着升级的第三方依赖。
 */
export function tokenizePath(path: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    if (m[2] !== undefined) tokens.push(Number(m[2]));
    else tokens.push(m[1]);
  }
  return tokens;
}

/**
 * 按点路径取值。空路径返回原对象（"留空 = 响应体本身"的语义在这里落地）。
 * 路径走不通时返回 undefined，由调用方决定怎么报错。
 */
export function pickByPath(source: unknown, path: string): unknown {
  if (!path) return source;
  let cur: unknown = source;
  for (const token of tokenizePath(path)) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof token === "number") {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[token];
    } else {
      if (typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[token];
    }
  }
  return cur;
}

/**
 * 把取到的值规整成"行数组"。
 *
 * 不是数组就返回 null —— 由调用方给出**明确报错**（"响应不是数组，请指定取值路径"）。
 * 这里刻意**不做**"猜包装层"（看到 `data` 就往下钻之类）：
 * 猜错的代价是静默绑到错误层级，用户对着空表格排查半天；
 * 而报错一句话就能让人改对。
 */
export function toRows(value: unknown): DataRow[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((item) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? (item as DataRow)
      : // 标量数组（["a","b"] / [1,2]）也允许，包成 {value: x}。
        // 有些接口就是回一组值，直接毙掉太苛刻。
        { value: item }
  );
}

/* ============================================================
   字段推断
============================================================ */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
/** 形如 12 / -3.5 / 1,234.5 的数字串 */
const NUMERIC_RE = /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/;

/**
 * 按样本值推断字段类型。全部空值 → string（无法判断时不要瞎猜）。
 *
 * 关于"数字形态的字符串"：很多接口把金额回成 `"12.50"`。判成 number 才能让
 * 合计、格式（`#,##0.00`）正常工作，所以这里会转。
 * 但**前导零的长度 >1 的串不算数字**（`"007"` 是工号/编码，转成 7 就丢信息了）。
 */
export function inferFieldType(values: unknown[]): DataSetFieldType {
  let seen = 0;
  let allNumber = true;
  let allBoolean = true;
  let allDate = true;
  let allDateTime = true;
  let hasObject = false;

  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    seen++;

    const isNum = typeof v === "number";
    const isBool = typeof v === "boolean";
    const isStr = typeof v === "string";

    if (!isNum && !isBool && !isStr) {
      // 对象 / 数组 / 其它：只可能是 json，其余判据一次全部否掉
      hasObject = true;
      allNumber = allBoolean = allDate = allDateTime = false;
      continue;
    }

    /*
      每个判据**独立**评估，不能放在互斥的 if/else 链里。
      踩过：早先把"是 number → allBoolean = false"写成链式分支，
      结果纯数字数组里 allDate 一直是初始的 true —— 于是推断出 datetime。
      日期判据对非字符串必须先否，否则"没见过日期"和"见过但不是日期"分不开。
    */
    const numericLike =
      isNum ||
      (isStr && NUMERIC_RE.test(v.trim()) && !(v.trim().length > 1 && v.trim().startsWith("0")));
    if (!numericLike) allNumber = false;
    if (!isBool) allBoolean = false;
    if (!isStr || !DATE_RE.test(v)) allDate = false;
    if (!isStr || !DATETIME_RE.test(v)) allDateTime = false;
  }

  if (seen === 0) return "string";
  if (allDateTime) return "datetime";
  if (allDate) return "date";
  if (allNumber) return "number";
  if (allBoolean) return "boolean";
  if (hasObject) return "json";
  return "string";
}

/**
 * 从样本行里推断字段列表。
 *
 * **键的顺序 = 第一行的键顺序**，后续行里才出现的键追加在后面 ——
 * 顺序稳定对字段树与列映射下拉都重要，
 * 用 Set 随便遍历会得到与接口 JSON 不同的顺序，看着很随机。
 */
export function inferFields(rows: DataRow[], scanRows = INFER_SCAN_ROWS): DataSetField[] {
  const scan = rows.slice(0, scanRows);
  return collectKeys(scan).map((name) => inferField(name, scan.map((row) => row[name]), 0));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * 一组对象里出现过的键，顺序 = 第一个对象的键顺序（与顶层字段同款口径）。
 */
function collectKeys(objects: Record<string, unknown>[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const obj of objects) {
    for (const key of Object.keys(obj)) {
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(key);
    }
  }
  return names;
}

/**
 * 把一组样本值展开成子字段。展开不了时返回 undefined。
 *
 * 只有"扫到的每个非空值都是纯对象"才展开 —— 混着对象和标量说明这一列的形状
 * 不稳定（有的记录是对象、有的是字符串），照第一行展开会得到一堆永远取不到值的
 * 子字段，比不展开更误导。数组也走这条：`isPlainObject` 会把它判掉，
 * 于是数组保持叶子（整块 JSON 化）。
 */
function expandChildren(name: string, values: unknown[], depth: number): DataSetField[] | undefined {
  if (depth >= MAX_FIELD_DEPTH) return undefined;
  const present = values.filter((v) => v !== null && v !== undefined);
  const objects = present.filter(isPlainObject);
  if (!objects.length || objects.length !== present.length) return undefined;

  const children = collectKeys(objects).map((key) =>
    inferField(`${name}.${key}`, objects.map((o) => o[key]), depth + 1)
  );
  return children.length ? children : undefined;
}

/**
 * 推断一个字段。`name` 是**完整路径**（顶层是键名，子字段是 `address.city`），
 * 见 `types.ts` 里 `children` 的两条约定。
 */
function inferField(name: string, values: unknown[], depth: number): DataSetField {
  const field: DataSetField = { name, type: inferFieldType(values) };
  if (field.type !== "json") return field;
  const children = expandChildren(name, values, depth);
  if (children) field.children = children;
  return field;
}

/**
 * 给**宿主返回的**字段列表补上对象子字段。
 *
 * 宿主的最小契约是只回 `{ name, type }`，于是 `address` 会是一个没有 `children`
 * 的 json 叶子，字段树里看不出结构 —— 但"对象能不能展开"取决于取数实现在哪儿，
 * 不该取决于走的是直连还是宿主托管。所以这里用样本行把缺的 children 补出来。
 *
 * 宿主已经给了 children 的字段原样尊重，不覆盖（它可能把 `json` 手工标成了
 * 别的类型，或刻意不展开某个大对象）。
 */
export function attachChildren(fields: DataSetField[], rows: DataRow[]): DataSetField[] {
  const scan = rows.slice(0, INFER_SCAN_ROWS);
  return fields.map((field) => {
    if (field.children?.length || field.type !== "json") return field;
    const children = expandChildren(field.name, scan.map((row) => pickByPath(row, field.name)), 0);
    return children ? { ...field, children } : field;
  });
}

/**
 * 把字段树摊平成"可选项列表"（父在前、子紧随其后）。
 *
 * 给面板上的字段下拉用：原生下拉表达不了层级，但至少要能选到子字段 ——
 * 否则"字段树里能点嵌套字段、下拉里却找不到它"就是明显的不一致。
 */
export function flattenFields(fields: DataSetField[] | undefined): DataSetField[] {
  const out: DataSetField[] = [];
  const walk = (list: DataSetField[]) => {
    for (const f of list) {
      out.push(f);
      if (f.children?.length) walk(f.children);
    }
  };
  walk(fields ?? []);
  return out;
}

/* ============================================================
   参数（${name}）
============================================================ */

/**
 * 从一段文本里抽出所有 `${name}`。
 *
 * 用于"改完 URL 自动更新参数列表"——手工维护参数清单是纯负担，
 * 而且漏一个就是运行期静默失败。
 */
export function collectTokenNames(text: string | undefined | null): string[] {
  if (!text) return [];
  const out: string[] = [];
  const re = /\$\{\s*([^}\s]+)\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** 一个数据集里出现过的全部 `${参数}`（sql / url / headers / body 四处） */
export function collectDataSetTokenNames(ds: TemplateDataSet): string[] {
  const texts: (string | undefined)[] = [ds.sql, ds.request?.url, ds.request?.body];
  if (ds.request?.headers) texts.push(...Object.values(ds.request.headers));
  const out: string[] = [];
  for (const t of texts) {
    for (const name of collectTokenNames(t)) if (!out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * 替换 `${name}`。
 *
 * **未提供值的参数保留原样**（不替换成空串）：
 * 保留 `${orderId}` 能让用户一眼看出"这个参数没值"，
 * 替换成空串则会得到 `/orders/` 这种看着正常、实则查错数据的 URL —— 排查成本高得多。
 */
export function resolveTokens(text: string | undefined | null, values: Record<string, unknown>): string {
  if (!text) return "";
  return text.replace(/\$\{\s*([^}\s]+)\s*\}/g, (whole, name: string) => {
    if (!(name in values) || values[name] === null || values[name] === undefined) return whole;
    return String(values[name]);
  });
}

/**
 * 由 `${name}` 清单补齐参数数组 —— 保留已有参数的配置（类型/来源/默认值），
 * 只增不删，并且**只给真正新出现的**参数一个默认值。
 *
 * 不删是刻意的：用户可能刚把 URL 里的 `${a}` 临时改掉，参数配置还得留着。
 * （真正要删的走面板上的删除按钮。）
 */
export function mergeParams(existing: DataSetParam[], names: string[]): DataSetParam[] {
  const out = existing.filter((p) => names.includes(p.name));
  for (const name of names) {
    if (!out.some((p) => p.name === name)) {
      out.push({ name, type: "string", source: "context", required: true });
    }
  }
  return out;
}

/* ============================================================
   安全校验（红线，不能只写在文档里）
============================================================ */

/**
 * 浏览器**禁止** JS 设置的请求头（规范里的 forbidden header names）。
 * 直连模式下设了也是静默失败，宿主模式下设了则可能被用来伪造来源，
 * 所以两条路都在前端先拦掉，给一句人话解释。
 */
const FORBIDDEN_HEADERS = new Set(
  [
    "accept-charset",
    "accept-encoding",
    "access-control-request-headers",
    "access-control-request-method",
    "connection",
    "content-length",
    "cookie",
    "cookie2",
    "date",
    "dnt",
    "expect",
    "host",
    "keep-alive",
    "origin",
    "referer",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "via"
  ].map((h) => h.toLowerCase())
);

export function isForbiddenHeader(name: string): boolean {
  const n = name.trim().toLowerCase();
  return FORBIDDEN_HEADERS.has(n) || n.startsWith("proxy-") || n.startsWith("sec-");
}

/**
 * 请求地址白名单：只允许 http(s)。
 *
 * `javascript:` / `data:` / `file:` 这类协议一旦流到宿主侧，就是一次 SSRF 或脚本注入，
 * 而且**它必须在前端就被挡掉** —— 不能指望每个宿主都记得做这件事。
 * 允许相对路径（`/api/orders`），它与数据源的 baseUrl 拼接后才是完整地址。
 */
export function isSafeRequestUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("//")) return false; // protocol-relative：拼出来的协议不可控
  if (trimmed.startsWith("/") || trimmed.startsWith("${")) return true;
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  if (!m) return true; // 无协议的相对路径
  return m[1].toLowerCase() === "http" || m[1].toLowerCase() === "https";
}

/** 拼接 baseUrl 与相对地址；url 已是绝对地址时原样返回 */
export function buildRequestUrl(baseUrl: string | undefined, url: string): string {
  const u = url.trim();
  if (!baseUrl || /^[a-z][a-z0-9+.-]*:/i.test(u) || !u.startsWith("/")) return u;
  return baseUrl.trim().replace(/\/+$/, "") + u;
}

/**
 * 校验请求体是不是合法 JSON。留空算合法（GET 没有体）。
 * 返回错误描述，合法时返回 null。
 */
export function validateJsonBody(body: string | undefined): string | null {
  if (!body || !body.trim()) return null;
  try {
    JSON.parse(body);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "JSON 格式不合法";
  }
}

/** 数据集标识符是否可用作占位符前缀：字母数字下划线中文，且不以数字开头 */
export function isValidDataSetName(name: string): boolean {
  return /^[^\s{}.$][^\s{}.$]*$/.test(name.trim()) && name.trim().length > 0;
}
