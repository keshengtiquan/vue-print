/**
 * 数据绑定 —— 数据层类型定义（数据源 / 数据集 / 字段 / 参数）。
 *
 * 设计文档：docs/data-binding-design.md
 *
 * 三条决定了下面所有字段形状的结论（来自竞品调研，文档 §0）：
 *
 * 1. **三层模型是固定的**：数据源（连接） → 数据集（查询） → 绑定（谁消费数据）。
 *    "接口"与"SQL"的差别**只在数据集里的一个字段**（`type`），
 *    上层模型、字段列表、绑定语法、占位符渲染完全共用 ——
 *    所以这里 `sql?` 与 `request?` 是同一层的两个互斥分支，不是两种对象。
 *
 * 2. **模板里存的是"声明"，不是"能执行的东西"**。
 *    这里没有任何 host / port / user / password 字段，也**绝不存执行结果** ——
 *    `TemplateDataSource.connectionRef` 只是一个指向宿主侧预登记连接的 id。
 *    凭据泄露是不可回滚的事故，靠"约定别写"守不住，所以从类型上就不给位置。
 *
 * 3. **本文件必须保持零运行时依赖**（只允许 `import type`），
 *    与 `table/model.ts` 同款约束：这样才能脱离 Vite 直接拿 Node 跑校验，
 *    也让"数据长什么样"这件事只有一份定义。
 */

/** 字段类型。推断只做一层（扫样本值），错了允许在面板上手工改 */
export type DataSetFieldType = "string" | "number" | "boolean" | "date" | "datetime" | "json";

/** 数据集字段。由"测试并解析"回填的快照，也允许手工声明（离线设计时） */
export interface DataSetField {
  /** 取值键。占位符 `{品名}` 里的"品名"就是它 */
  name: string;
  /** 显示名。留空时面板显示 name */
  label?: string;
  type: DataSetFieldType;
  /**
   * 展示格式：数字 `#,##0.00`、日期 `YYYY-MM-DD`。
   * 落在**字段**上作为默认格式；单元格可以再覆盖（二期）。
   */
  format?: string;
  /**
   * 对象字段的子字段（`address` 下的 `city` / `street` / `geo`…）。
   *
   * 两条约定，它们决定了"嵌套字段能不能当普通字段用"：
   *
   * 1. **子字段的 `name` 是从行根算起的完整路径**（`address.city`，再深就
   *    `address.geo.lat`）。这样拖出去当占位符、按路径取值、列映射三种消费方式
   *    都能直接拿 `name` 用，不必到处再拼一次前缀 —— 拼接迟早会在某处漏掉。
   * 2. **只在纯对象上出现**：数组不展开。数组的长度和元素形状都不固定，
   *    展开成 `items[0].x` / `items[1].x` 会把字段树变成一份数据快照的翻版，
   *    而正确的用法是让它当一个叶子值整块 JSON 化。
   */
  children?: DataSetField[];
}

export type DataSetParamType = "string" | "number" | "date" | "datetime" | "boolean" | "array";

/**
 * 参数值的来源。
 *
 * **一期只做这三种**，刻意没有"用户在预览界面输入"——那是报表的查询面板，
 * 属于另一个功能（文档 §2.4）。
 */
export type DataSetParamSource = "context" | "sys" | "fixed";

/** 系统变量。`{$date}` 这类占位符取的就是它 */
export type SysVarName =
  | "date"
  | "time"
  | "datetime"
  | "userId"
  | "userName"
  | "pageIndex"
  | "pageCount"
  | "docTitle";

/**
 * 数据集参数。对应 `sql` / `url` / `headers` / `body` 里的 `${name}`。
 *
 * **最容易混的一点**：`${name}` 在本体系里有两个完全不同的出现位置 ——
 * 出现在查询声明里是**查询参数**（要传给数据库/接口，由执行侧预编译绑定）；
 * 出现在单元格 `content.value` 里是**字段占位符**（由前端渲染函数替换）。
 * 前者是 `${}`，后者是 `{}`，语法上刻意区分开，别混。
 */
export interface DataSetParam {
  name: string;
  label?: string;
  type: DataSetParamType;
  required?: boolean;
  defaultValue?: string | number | boolean | null;
  source?: DataSetParamSource;
  /** source = "sys" 时取哪个系统变量 */
  sysVar?: SysVarName;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/**
 * 接口方式的请求声明。
 *
 * 三个字段允许含 `${参数}`：url / headers 的值 / body。
 * 替换在**执行侧**完成（宿主或直连时的前端），前端只负责声明。
 */
export interface DataSetRequest {
  /** 完整 URL，允许 `https://x/api/orders/${orderId}`；也允许相对路径 + 数据源 baseUrl */
  url: string;
  method: HttpMethod;
  /** 请求头。值允许 `${参数}`，用于放 token */
  headers?: Record<string, string>;
  /** 请求体文本模板，允许 `${参数}`；POST / PUT 用 */
  body?: string;
  /**
   * 取值路径：从响应体里取出"记录数组"。
   *
   * 留空 = 响应体本身就是数组；否则支持 `data.list` / `data.rows[0].items`。
   * **刻意不引入完整 JsonPath 引擎**（文档 §7 第 1 条）：点路径 + 下标零依赖，
   * 已能覆盖真实接口的响应结构。
   */
  resultPath?: string;
}

/**
 * 数据源（连接信息）。
 *
 * 注意它**只有 id / 名字 / 类型**，凭据一律不落模板 —— 见文件头第 2 条。
 */
export interface TemplateDataSource {
  id: string;
  name: string;
  type: "http" | "sql";
  /** sql：引用宿主侧配置好的连接（本模板只存 id） */
  connectionRef?: string;
  /** sql：方言，用于前端做语法提示与校验 */
  dialect?: "mysql" | "postgres" | "oracle" | "sqlserver" | "sqlite" | "dameng" | "kingbase";
  /** http：可选基地址，便于同域接口复用 */
  baseUrl?: string;
}

/** 数据集运行时策略 */
export interface DataSetOptions {
  /** 行数上限，默认 5000 */
  limit?: number;
  /** 超时 ms，默认 10000 */
  timeout?: number;
  /**
   * 无数据时怎么办：
   * - `keepTemplate`（默认）：保留设计内容 —— 与"占位符在设计态原样渲染"一致，最不容易出 bug
   * - `blank`：渲染空白
   */
  onEmpty?: "keepTemplate" | "blank";
}

/**
 * 数据集：一次"查询"的完整声明。这是模板里最重要的数据单元。
 */
export interface TemplateDataSet {
  id: string;
  /**
   * 唯一标识符，供占位符引用：`{订单明细.品名}` 里的"订单明细"。
   * 必须是合法的标识符形态 —— 它要能出现在文本里而不产生歧义，
   * 带空格/点号的字段会直接破坏占位符解析。
   */
  name: string;
  /** 显示名，面板展示用 */
  label?: string;
  dataSourceId: string;

  /* ---- 分叉只在这里 ---- */
  type: "sql" | "http";
  /** type = "sql"：查询语句，允许 ${参数} 占位 */
  sql?: string;
  /** type = "http"：请求声明 */
  request?: DataSetRequest;
  /* --------------------- */

  /** 从 sql / url / headers / body 里自动解析出的 ${name}，也可手工加 */
  params?: DataSetParam[];
  /** 字段快照，由"测试并解析"回填，也允许手工声明 */
  fields?: DataSetField[];
  /** 字段快照时间。用于面板提示"字段可能已过期" */
  fieldsRefreshedAt?: number;

  options?: DataSetOptions;
}

/** 一行数据。键 = 字段名 */
export type DataRow = Record<string, unknown>;

/**
 * 请求数据服务的载荷。
 *
 * 三个接口（test / run / context）收的都是它，于是"设计态测试"与"运行态取数"
 * 走的是同一条契约 —— 差异只在服务端的输出裁剪（test 只回样本）。
 */
export interface DataSetPayload {
  dataSource?: TemplateDataSource;
  dataset: TemplateDataSet;
  /** 运行期实际参数值（按 name 索引） */
  params?: Record<string, unknown>;
}

/** 字段 + 样本的测试结果 */
export interface DataSetTestResult {
  fields: DataSetField[];
  rows: DataRow[];
  /** 服务端耗时 ms，用于面板显示"取数 128ms" */
  took?: number;
}

/** 运行态取数结果 */
export interface DataSetRunResult {
  rows: DataRow[];
  total?: number;
  /** 是否被 limit 截断。截断了要在画布上明说，不能静默少行 */
  truncated?: boolean;
}

/**
 * 数据服务的错误。
 *
 * 刻意保留 `kind` 而不是只抛字符串：调用方要根据它决定**能不能重试**、
 * **要不要提示用户去改配置**（前者是网络抖动，后者是 URL 写错了）。
 */
export interface DataServiceError extends Error {
  kind: "unavailable" | "network" | "http" | "parse" | "config";
  status?: number;
  /** 服务端返回的原始信息，透传给用户时比自己编一句更有用 */
  detail?: string;
}
