/**
 * 数据服务层：把"数据集声明"变成"真实数据"的那一段。
 *
 * 设计文档：docs/data-binding-design.md §3
 *
 * ## 为什么这里有两条路
 *
 * 我们是纯前端设计器。**浏览器不能直连数据库**（凭据必泄 + 无法跨域 + 无法限权），
 * 所以 SQL 只有一条活法：**声明在模板里、执行在宿主侧**。而接口方式有个选择：
 * 由宿主代理转发（绕开 CORS、不把 token 暴露给浏览器），还是浏览器直接请求。
 *
 * 两种都保留，是因为它们的**最佳使用场景不同**：
 *
 * | | remote（宿主托管） | direct（浏览器直连） |
 * |---|---|---|
 * | 适合 | 生产。已有业务系统、接口需要鉴权 | 开发/演示。目标接口允许 CORS |
 * | 代价 | 宿主要实现约定的 3 个接口 | 受 CORS 限制、token 落在浏览器 |
 *
 * `mode: "auto"`（默认）在"配了 baseUrl 就走 remote、没配就走 direct"之间自动选择，
 * 于是**没有后端的项目开箱就能跑起来**，接入宿主后无需改任何业务代码。
 */
import axios, { AxiosError } from "axios";
import {
  attachChildren,
  buildRequestUrl,
  DEFAULT_TIMEOUT,
  inferFields,
  isForbiddenHeader,
  isSafeRequestUrl,
  pickByPath,
  resolveTokens,
  toRows,
  validateJsonBody
} from "@/components/design/data/model";
import type {
  DataRow,
  DataServiceError,
  DataSetPayload,
  DataSetRunResult,
  DataSetTestResult,
  HttpMethod,
  TemplateDataSet
} from "@/components/design/data/types";

/** 执行模式。`auto` = 有 baseUrl 走 remote，否则 direct */
export type DataServiceMode = "auto" | "remote" | "direct";

export interface DataServiceConfig {
  mode: DataServiceMode;
  /** 宿主数据服务基地址。留空 = 未接入后端 */
  baseUrl: string;
  /** 接口前缀 */
  prefix: string;
  /** 请求超时 ms */
  timeout: number;
}

export const dataServiceConfig: DataServiceConfig = {
  mode: "auto",
  baseUrl: "",
  prefix: "/api/print/dataset",
  timeout: DEFAULT_TIMEOUT
};

/** axios 实例。这里不设 baseURL —— 由 resolveBase 每次现算，便于面板改配置后立即生效 */
const http = axios.create({ timeout: dataServiceConfig.timeout });

function errorOf(kind: DataServiceError["kind"], message: string, extra?: Partial<DataServiceError>): DataServiceError {
  const err = new Error(message) as DataServiceError;
  err.kind = kind;
  // 用 Object.assign 而不是展开：Error 的 message/stack 是非枚举属性，展开会丢
  Object.assign(err, extra);
  return err;
}

/** 当前实际生效的执行模式 */
export function resolveMode(): "remote" | "direct" {
  const cfg = dataServiceConfig;
  if (cfg.mode === "direct") return "direct";
  if (cfg.mode === "remote") return "remote";
  return cfg.baseUrl ? "remote" : "direct";
}

/** 数据服务是否可用。不可用时数据面板整体退化为引导态（绝不能白屏） */
export function isDataServiceAvailable(): boolean {
  return resolveMode() === "direct" || !!dataServiceConfig.baseUrl;
}

/**
 * 当前配置下、该数据集能否被执行。
 * 用于给面板一句准确的解释（"未接入数据服务" vs "目标接口地址不合法"）。
 */
export function describeAvailability(dataset?: TemplateDataSet): { ok: boolean; message: string } {
  const mode = resolveMode();
  if (mode === "remote" && !dataServiceConfig.baseUrl) {
    return { ok: false, message: "未接入数据服务：请在 config 里配置宿主地址，或改用直连模式" };
  }
  if (dataset?.type === "sql" && mode === "direct") {
    return { ok: false, message: "SQL 数据集必须由宿主执行，浏览器无法直连数据库" };
  }
  if (dataset?.type === "http") {
    const req = dataset.request;
    if (!req?.url?.trim()) return { ok: false, message: "请先填写请求地址" };
    if (!isSafeRequestUrl(req.url)) return { ok: false, message: "请求地址必须以 http(s) 开头" };
  }
  return { ok: true, message: mode === "remote" ? "宿主数据服务" : "浏览器直连" };
}

/* ============================================================
   remote：把声明交给宿主执行
============================================================ */

/**
 * 宿主响应的宽松解包。
 *
 * 只做一层、且有明确判据（顶层就是结果、或结果在 `.data` 里）——
 * 再往下猜就是"猜包装层"，猜错的代价是静默绑到错误层级，
 * 用户对着空表格排查半天，比直接报错贵得多。
 */
function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const looksLikeResult =
      "fields" in obj || "rows" in obj || "total" in obj || "truncated" in obj;
    if (looksLikeResult) return obj as T;
    if (obj.data && typeof obj.data === "object") return obj.data as T;
  }
  throw errorOf("parse", "数据服务返回的结构无法识别（期望 { fields, rows } 或 { data: {...} }）");
}

async function postRemote<T>(path: string, payload: DataSetPayload): Promise<T> {
  const url = `${dataServiceConfig.baseUrl.replace(/\/+$/, "")}${dataServiceConfig.prefix}${path}`;
  try {
    const res = await http.post(url, payload, { timeout: dataServiceConfig.timeout });
    return unwrap<T>(res.data);
  } catch (err) {
    throw toServiceError(err, url);
  }
}

function toServiceError(err: unknown, url: string): DataServiceError {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<{ message?: string; detail?: string }>;
    const detail =
      ax.response?.data?.message ?? ax.response?.data?.detail ?? (ax.response ? undefined : ax.message);
    if (!ax.response) {
      return errorOf("network", `连不上数据服务（${url}）：${ax.message}`, { detail });
    }
    return errorOf("http", `数据服务返回 ${ax.response.status}`, {
      status: ax.response.status,
      detail: detail ?? JSON.stringify(ax.response.data).slice(0, 300)
    });
  }
  return errorOf("network", err instanceof Error ? err.message : "请求失败");
}

/* ============================================================
   direct：浏览器直接请求目标接口
============================================================ */

/** 逐条校验并替换请求头里的 `${参数}` */
function buildHeaders(
  headers: Record<string, string> | undefined,
  values: Record<string, unknown>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (!key.trim()) continue;
    if (isForbiddenHeader(key)) {
      throw errorOf(
        "config",
        `请求头「${key}」被浏览器禁止设置，请删掉它（这类头由浏览器自己管理）`
      );
    }
    out[key] = resolveTokens(value, values);
  }
  return out;
}

async function requestDirect<T>(
  method: HttpMethod,
  url: string,
  init: { headers?: Record<string, string>; body?: string },
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: init.headers,
      body: method === "GET" || method === "DELETE" ? undefined : init.body,
      signal: controller.signal,
      // 允许带 cookie 的场景（同域接口）；跨域时浏览器仍会按 CORS 规则裁决
      credentials: "include"
    });
    if (!res.ok) {
      throw errorOf("http", `接口返回 ${res.status} ${res.statusText}`, { status: res.status });
    }
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw errorOf("parse", "接口返回的不是 JSON", { detail: text.slice(0, 300) });
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw errorOf("network", `请求超时（${timeoutMs / 1000}s）`);
    }
    if ((err as DataServiceError).kind) throw err;
    // fetch 在 CORS 失败时只给一个笼统的 TypeError —— 这里补一句人话，
    // 否则用户看到 "Failed to fetch" 完全不知道该去查什么。
    throw errorOf(
      "network",
      "请求失败：可能是目标接口不允许跨域（CORS），或地址/网络不通。生产环境请改用宿主托管模式。",
      { detail: err instanceof Error ? err.message : undefined }
    );
  } finally {
    window.clearTimeout(timer);
  }
}

/** 直连模式下把声明翻译成真实请求并取回行数据 */
async function runDirect(payload: DataSetPayload, sampleLimit?: number): Promise<DataSetRunResult> {
  const { dataset, dataSource } = payload;
  const values = payload.params ?? {};
  const req = dataset.request;
  if (!req) throw errorOf("config", "接口数据集缺少请求声明");

  const body = req.body?.trim() ? resolveTokens(req.body, values) : undefined;
  if (body) {
    const jsonError = validateJsonBody(body);
    if (jsonError) throw errorOf("config", `请求体 JSON 不合法：${jsonError}`);
  }
  if (dataset.type === "sql") {
    throw errorOf("config", "SQL 数据集必须由宿主执行，浏览器无法直连数据库");
  }

  const url = buildRequestUrl(dataSource?.baseUrl, resolveTokens(req.url, values));
  if (!isSafeRequestUrl(url)) throw errorOf("config", "请求地址必须以 http(s) 开头");

  const started = Date.now();
  const raw = await requestDirect<unknown>(
    req.method,
    url,
    { headers: buildHeaders(req.headers, values), body },
    dataset.options?.timeout ?? dataServiceConfig.timeout
  );

  const picked = pickByPath(raw, req.resultPath ?? "");
  const rows = toRows(picked);
  if (!rows) {
    // 取值路径留空且响应不是数组 —— 这是最常见的配置错误，必须说清楚怎么改
    throw errorOf(
      "parse",
      req.resultPath
        ? `按取值路径「${req.resultPath}」取到的不是数组（拿到 ${describe(picked)}）`
        : `响应不是记录数组（拿到 ${describe(picked)}），请指定取值路径，例如 data.list`
    );
  }

  const limit = dataset.options?.limit ?? 5000;
  const limited = rows.length > limit ? rows.slice(0, limit) : rows;
  const result: DataSetRunResult = {
    rows: sampleLimit ? limited.slice(0, sampleLimit) : limited,
    total: rows.length,
    truncated: rows.length > limited.length
  };
  // took 走 total 之外的通道会污染契约，直接挂在对象上由调用方按需读取
  Object.assign(result, { took: Date.now() - started });
  return result;
}

function describe(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return `数组（${value.length} 项）`;
  if (typeof value === "object") return "对象";
  return `${typeof value}（${String(value).slice(0, 40)}）`;
}

/* ============================================================
   对外的两个方法
============================================================ */

/** 设计态：只回样本 + 字段，不落数据 */
export async function testDataSet(payload: DataSetPayload): Promise<DataSetTestResult> {
  const { dataset } = payload;
  const availability = describeAvailability(dataset);
  if (!availability.ok) throw errorOf("unavailable", availability.message);

  if (resolveMode() === "remote") {
    const res = await postRemote<DataSetTestResult>("/test", payload);
    const rows: DataRow[] = Array.isArray(res.rows) ? res.rows : [];
    return {
      /*
        宿主没回字段时前端自己推一份，保证面板一定有东西可展示；
        回了字段则补上对象子字段 —— 宿主可能只回 `{ name, type }`，
        那样嵌套结构在字段树里就看不见了（详见 attachChildren 的注释）。
      */
      fields: res.fields?.length ? attachChildren(res.fields, rows) : inferFields(rows),
      rows,
      took: res.took
    };
  }

  const result = await runDirect(payload, 20);
  return {
    fields: inferFields(result.rows),
    rows: result.rows,
    took: (result as { took?: number }).took
  };
}

/** 预览/打印：取全量（受 limit 约束） */
export async function runDataSet(payload: DataSetPayload): Promise<DataSetRunResult> {
  const availability = describeAvailability(payload.dataset);
  if (!availability.ok) throw errorOf("unavailable", availability.message);

  if (resolveMode() === "remote") {
    const res = await postRemote<DataSetRunResult>("/run", payload);
    return { rows: res.rows ?? [], total: res.total, truncated: res.truncated };
  }
  return runDirect(payload);
}

/** 错误 → 面板上的一句人话 */
export function describeServiceError(err: unknown): string {
  if (err && typeof err === "object" && "kind" in err) {
    const e = err as DataServiceError;
    return e.detail && e.kind === "http" ? `${e.message}：${e.detail}` : e.message;
  }
  return err instanceof Error ? err.message : "未知错误";
}
