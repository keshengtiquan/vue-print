/**
 * 数据绑定的高层操作：把"两个 store + 若干纯函数"包成消费方要的那几件事。
 *
 * 放在 composable 而不是 store 里，是因为这里干的活**都跨越了两个 store**
 * （数据在 dataBinding、元素在 design）。写进任一个 store 都会造成
 * 双向依赖，那是删一个数据集就得两边同步的开端。
 */
import { useDesignStore } from "@/store/modules/design";
import { useDataBindingStore } from "@/store/modules/dataBinding";
import type { Element, TextElement } from "@/components/design/types";
import { makeFieldToken, type TemplateContext } from "@/lib/template";
import { buildEmptyContext, buildRowContext, systemVariables } from "./context";
import type { DataRow, TemplateDataSet } from "./types";

export function useDataBinding() {
  const binding = useDataBindingStore();
  const design = useDesignStore();

  /**
   * 元素实际生效的数据集：**元素自己显式绑定的那一个，是唯一来源**。
   *
   * 绑谁取决于"用户从哪个字段拖进来的"（`FieldNode` 的拖拽载荷里带 `dataSetId`），
   * 或者用户在绑定面板上手动选的。没绑定就返回 `undefined`，元素按静态内容渲染。
   *
   * 刻意**不做"绑了但找不到就退回某个默认数据集"的兜底**：那会让一个悬空引用
   * （模板 JSON 被手工改过、将来跨模板复制粘贴）静默显示成**另一份数据** ——
   * 用户以为在用 A、看到的却是 B，且没有任何提示。宁可什么都不给：
   * 占位符会原样留在画布上，一眼就能看出"这里没取到数据"。
   */
  function effectiveDataSet(el: Element | undefined | null): TemplateDataSet | undefined {
    if (!el) return undefined;
    return binding.dataSetById(el.binding?.dataSetId);
  }

  /**
   * 字段落点后的绑定写入：**谁被拖进来，元素就绑谁**。
   *
   * 绑定是元素的普通字段，按写入口约定走 `updateElement`，不塞进 `updateTable`
   * 的 mutator —— 那会把"表格结构写入"的职责撑大。
   *
   * 两种情况直接返回：调用方没给 `dataSetId`（面板插入时上下文缺失），
   * 或元素已经绑着同一个数据集（不重建对象，`binding` 的引用保持稳定）。
   *
   * **已绑定到别的数据集时会改绑（后拖的赢）**：一期不支持一个元素跨数据集取数，
   * 而"追加了占位符却渲染不出值"比"改绑"更难排查 —— 后者在绑定面板上直接可见。
   */
  function bindElementIfNeeded(elementId: string, dataSetId: string | undefined) {
    if (!dataSetId) return;
    const el = design.getElement(elementId);
    if (!el || el.binding?.dataSetId === dataSetId) return;
    design.updateElement(elementId, { binding: { ...(el.binding ?? {}), dataSetId } });
  }

  /** 系统变量。每次现算 —— `{$date}` 在跨天时不该还显示昨天的值 */
  const sys = () => systemVariables();

  /**
   * **取值上下文的唯一构造点**（一个元素 + 一条记录 + 一组系统变量 → ctx）。
   *
   * 设计态与渲染态的差别只有三个参数，所以它们共用这一个函数体：
   * | | 记录 | sys | 缺值 |
   * |---|---|---|---|
   * | 设计态 `designContext` | 指定行，缺省取样本第 1 行 | 现算 `systemVariables()` | `keep`（留占位符原文） |
   * | 渲染态 `renderContext` | 由调用方给（分页器逐行给） | 由调用方注入（页码） | `blank`（打印所见） |
   *
   * 分成两个函数是刻意的（调用方的关注点不同），但**构造逻辑只有这一份** ——
   * `lib/template.ts` 的文件头把这条口径讲得很死："需要把占位符变成值的地方
   * 只准调 `renderTemplate`"，而喂给它的 ctx 当然也只能有一份构造。
   *
   * ⚠️ 记录**不做任何兜底**：`renderContext` 里 `row === undefined` 就是"这一行没有记录"，
   * 不许偷偷回落到样本数据 —— 那会把设计态的测试数据渲染到打印纸上。
   */
  function contextOf(
    el: Element | undefined | null,
    record: DataRow | undefined,
    sysVars: Record<string, unknown>,
    onMissing: "keep" | "blank"
  ): TemplateContext {
    const ds = effectiveDataSet(el);
    if (!ds) return buildEmptyContext(sysVars, onMissing);
    return buildRowContext(record, {
      dataSetName: ds.name,
      fields: ds.fields,
      sys: sysVars,
      onMissing
    });
  }

  /**
   * 设计态取值上下文。
   *
   * ⚠️ **当前没有任何消费方**（画布只显示占位符原文，§6.7 / 表格文档 §1.5 约束 2），
   * 它是**渲染层与数据层之间那条接缝**的保留落点。
   * 真正在用的是它的兄弟 `renderContext`（预览 / 导出 / 打印）。
   */
  function designContext(el: Element | undefined | null, row?: DataRow): TemplateContext {
    const ds = effectiveDataSet(el);
    const target = row ?? (ds ? binding.sampleOf(ds.id)[0] : undefined);
    // `keep` 是刻意的：取不到值时保留 `{字段}` 原文而不是留白 ——
    // 显示空白会让人分不清"这个字段本来就没值"和"绑定根本没生效"。
    return contextOf(el, target, sys(), "keep");
  }

  /**
   * 渲染态取值上下文（预览 / 导出 / 打印）。
   *
   * 与 `designContext` 的两点差别，都是"以真值出图"这条底线推出来的：
   * 1. **记录由调用方给**（分页器逐行给），绝不回落到样本 —— 那会把设计态的
   *    测试数据渲染到打印纸上；
   * 2. **`onMissing: "blank"`** —— 值不存在就是空白，不能把 `{订单明细.备注}`
   *    原样打在纸上。代价是"空格子为什么空"要靠 `preview/inspect.ts` 的清单回答，
   *    这是刻意的组合（`preview-design.md` §0 第 8 条）。
   *
   * `sys` 由调用方注入而不是现算，是因为**页码只有分页器知道**：
   * `{$page.index}` / `{$page.count}` 必须逐页不同。
   */
  function renderContext(
    el: Element | undefined | null,
    row: DataRow | undefined,
    sysVars: Record<string, unknown>
  ): TemplateContext {
    return contextOf(el, row, sysVars, "blank");
  }

  /* ============================================================
     绑定写入（都走 design store 的既有写入口）
  ============================================================ */

  /**
   * 绑定 / 解绑元素到某个数据集。
   * `dataSetId` 传 null 表示解绑（同时删掉这个字段，不留 `binding: {}` 这种空壳）。
   */
  function bindElement(elementId: string, dataSetId: string | null) {
    const el = design.getElement(elementId);
    if (!el) return;
    if (!dataSetId) {
      design.updateElement(elementId, { binding: undefined });
      return;
    }
    // 深拷贝铁律：binding 是嵌套对象，绝不能让两个元素共用同一个引用
    design.updateElement(elementId, { binding: { ...(el.binding ?? {}), dataSetId } });
  }

  /* ============================================================
     占位符插入
  ============================================================ */

  /**
   * 构造插入用的占位符：**一律带数据集标识** —— `{订单明细.品名}`。
   *
   * 为什么必须带前缀：`{字段}` 与 `{数据集.字段}` 是 `lib/template.ts` 定义的
   * 两种合法写法，而**只有后者能表达"这个值来自哪份数据"**。
   * 单数据集时 `{品名}` 看着够用，但模板一旦出现第二份数据
   * （"单据头 + 明细"这种最常见的单据形态），画布上所有占位符就得人工重写一遍。
   * 现在带上，以后一份都不用改。
   *
   * 前缀取 `dataSet.name`（面板上叫「标识符」，默认值形如 `数据集1`）：
   * 它的校验规则 `isValidDataSetName` 排除了空格 / 点号 / 花括号 / `$`，
   * 正好就是"能安全放进占位符而不会切断解析"的那套字符 ——
   * 这不是巧合，那个字段本来就是为了当占位符前缀准备的。
   *
   * 拿不到数据集（id 缺失 / 已删除）时退回 `{字段}`：至少让用户看见引用了什么，
   * 总好过插出一个 `{undefined.品名}`。
   *
   * 字符串本身由 `lib/template.makeFieldToken` 拼 —— 那里是全仓唯一构造点，
   * 这里只负责把 `dataSetId` 解析成可读的标识符（读取侧不需要这一步）。
   */
  function fieldToken(field: string, dataSetId?: string): string {
    const name = dataSetId ? binding.dataSetById(dataSetId)?.name : undefined;
    return makeFieldToken(field, name);
  }

  /**
   * 文本元素：把占位符追加到内容末尾，并把元素绑到该字段所属的数据集。
   *
   * `dataSetId` 由拖拽载荷带过来 —— 字段树上的每个节点都知道自己属于哪个数据集，
   * 所以"拖一下就绑好"不需要用户再去面板上选一次。
   */
  function appendFieldToElement(elementId: string, field: string, dataSetId?: string) {
    const el = design.getElement(elementId);
    if (!el || el.type !== "text") return;
    const text = (el as TextElement).content ?? "";
    const token = fieldToken(field, dataSetId);
    // 已有内容且不以空白结尾时补一个空格。纯粹是为了好看 ——
    // "单价：{单价}元"和"单价：{单价} 元"的阅读体验差很远。
    const next = text && !/\s$/.test(text) ? `${text} ${token}` : `${text}${token}`;
    design.updateElement(elementId, { content: next });
    bindElementIfNeeded(elementId, dataSetId);
  }

  /** 单元格：把占位符追加到该格内容末尾（整包替换，绝不点路径写 cells） */
  function appendFieldToCell(tableId: string, r: number, c: number, field: string, dataSetId?: string) {
    const token = fieldToken(field, dataSetId);
    design.updateTable(tableId, (el) => {
      const cell = el.cells[r * el.cols + c];
      if (!cell || cell.covered) return;
      const current = cell.content?.value ?? "";
      const next = current && !/\s$/.test(current) ? `${current} ${token}` : `${current}${token}`;
      cell.content = { ...(cell.content ?? { type: "text" as const }), type: "text", value: next };
    });
    // 往单元格里拖字段 = 这张表要用这个字段的数据集（列映射读它）
    bindElementIfNeeded(tableId, dataSetId);
  }

  /**
   * 图片元素：占位符直接替换 `src`（字段值应当是一个图片地址）。
   * 图片没有"文本内容"可以追加，所以这里是替换而不是拼接。
   */
  function bindImageSource(elementId: string, field: string, dataSetId?: string) {
    design.updateElement(elementId, { src: fieldToken(field, dataSetId) });
    bindElementIfNeeded(elementId, dataSetId);
  }

  return {
    effectiveDataSet,
    designContext,
    renderContext,
    bindElement,
    /** 导出给提示文案用 —— 让"提示说插入什么"与"实际插入什么"不可能不一致 */
    fieldToken,
    appendFieldToElement,
    appendFieldToCell,
    bindImageSource
  };
}
