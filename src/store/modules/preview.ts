/**
 * 预览 store：运行数据 / 错误 / 页数 / 当前页。
 *
 * 设计文档：`docs/preview-design.md` §4.1。
 *
 * ## 为什么不复用 `dataBinding`（这是本文件存在的全部理由）
 *
 * `dataBinding.run()` 会把结果写进 `state.samples` —— 那是**设计态样本**
 * （测试解析出来的 20 行，用来让画布"打开就看到效果"）。
 * 预览要取的是全量数据，5000 行覆盖上去等于**用打印数据污染设计态的样本**：
 * 之后面板里看到的"前 20 行"就不再是测试结果了，而用户完全看不出来。
 *
 * 预览是"一次性加载 + 只读运行数据"，生命周期与设计态样本完全不同 ——
 * 混在一起迟早出问题，所以另开一个 store，**直接调 `api/dataset.ts` 的 `runDataSet`**，
 * 绕开 store 层那个会写 samples 的包装。
 *
 * ## 三条边界
 *
 * 1. **这里只存"数据"，不存"绑定"**（与 `dataBinding` 同款）：谁绑哪个数据集
 *    是元素自己的字段，本 store 只按 id 存结果。
 * 2. **失败不阻塞**：`Promise.allSettled`，单个数据集失败就只记它，
 *    其余照常渲染（状态置 `partial`）。全失败 → `error`，但静态内容仍然渲染 ——
 *    "一个接口挂了导致整页白屏"是不可接受的。
 * 3. **取数代次（generation）**：连续点两次「刷新数据」时，先回来的旧响应必须作废。
 *    没有这道闸，后到的旧数据会盖掉新数据，而且表现为"刷新了但没变"。
 */
import { toRaw } from "vue";
import { defineStore } from "pinia";
import { describeServiceError, runDataSet } from "@/api/dataset";
import type { DataRow } from "@/components/design/data/types";
import type { Element } from "@/components/design/types";
import { useDataBindingStore } from "./dataBinding";
import { useDesignStore } from "./design";

/**
 * 深拷贝。
 *
 * 数据所有权铁律（`data-binding-design.md` §9 第 1 条）：存进来的行数组
 * 必须自持数据，绝不与 axios / fetch 的结果对象（或别的预览实例）共用引用 ——
 * 将来一旦有人就地改一行，改的就是"接口返回的那份"，而它同时被别处持有。
 * Pinia 存进去后是 Proxy，`structuredClone` 克隆不了，所以先 `toRaw`。
 */
function cloneRows(rows: DataRow[]): DataRow[] {
  try {
    return structuredClone(toRaw(rows));
  } catch (err) {
    console.warn("[preview] 行数据深拷贝失败，已退回浅拷贝", err);
    return rows.map((row) => ({ ...row }));
  }
}

export type PreviewStatus = "idle" | "loading" | "ready" | "partial" | "error";

/**
 * 从元素里收集"被引用的数据集 id"。
 *
 * **只认 `binding.dataSetId`，不去解析单元格里的 `{数据集.字段}` 前缀。**
 * 按 `data-binding-design.md` §11.9 / §11.16 的口径，绑定只有一个来源；
 * 从占位符文本反推数据集等于把同一件事记第二遍，两份迟早分叉。
 */
export function collectBoundDataSetIds(elements: Element[]): string[] {
  const out: string[] = [];
  for (const el of elements) {
    const id = el.binding?.dataSetId;
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export const usePreviewStore = defineStore("preview", {
  state: () => ({
    status: "idle" as PreviewStatus,
    /** 运行态全量数据：dataSetId → 行 */
    rowsById: {} as Record<string, DataRow[]>,
    /** 每个数据集的失败原因（已转成人话） */
    errorsByDataSetId: {} as Record<string, string>,
    /** 每个数据集的单次耗时 ms */
    tookById: {} as Record<string, number>,
    /** 本次取数的总耗时 ms */
    tookMs: null as number | null,
    loadedAt: null as number | null,
    /** 本次取数覆盖了几个数据集 */
    loadedDataSetCount: 0,
    /** 当前页（1 起）。只用于"跳到第 N 页" */
    currentPage: 1,
    /**
     * 表格行高实测值（mm）：tableId → 按**展开序列下标**索引的全量数组
     * （明细行每份记录不同、高度不同，必须逐实例；`0` = 该行未参与实测，
     * fixed 行 / 未测到，消费端回落声明高，见 `reportRowHeights`）。
     *
     * 行高自适应（`docs/row-auto-height-design.md`）的数据源：
     * 隐藏测量层量出每行真实高 → 写到这里 → `usePreviewLayout` 喂给
     * `expansionRowHeights` → 分页器按真实行高切页 → 渲染层拿同一个值当
     * 最小高 —— 三方同口径，"分页以为多高，画出来就多高"。
     */
    measuredRowHeights: {} as Record<string, number[]>,
    /**
     * 预览缩放。
     *
     * **独立于 `design.scale`** —— 那是设计态的视图偏好。
     * 两者混用的话，在预览里放大一下，回到设计态画布也跟着变了，
     * 而用户根本不会把这两件事联系起来。
     */
    zoomMode: "fit" as "fit" | "custom",
    zoom: 1,
    /** 取数代次：用来丢弃迟到的旧响应 */
    generation: 0
  }),

  getters: {
    /** 某个数据集的行（没有时是空数组，绝不返回 undefined） */
    rowsOf(state) {
      return (id: string | undefined): DataRow[] => (id ? (state.rowsById[id] ?? []) : []);
    },

    /** 有失败的取数吗（状态条显示红点用） */
    hasErrors: (state): boolean => Object.keys(state.errorsByDataSetId).length > 0,

    errorCount: (state): number => Object.keys(state.errorsByDataSetId).length,

    /** 是否什么都没取（模板没绑任何数据集） */
    isEmpty: (state): boolean =>
      state.status !== "loading" && state.loadedDataSetCount === 0 && !state.hasErrors
  },

  actions: {
    /**
     * 取全部被引用的数据集。
     *
     * 并发、失败不阻塞、写入前深拷贝。**绝不写 `dataBinding.samples`。**
     */
    async loadAll(): Promise<void> {
      const design = useDesignStore();
      const binding = useDataBindingStore();

      const ids = collectBoundDataSetIds(design.elements);
      const gen = ++this.generation;

      // 清掉不再被任何元素引用的结果：删掉一个绑定之后，"上次取到的那份数据"
      // 留在 store 里没有任何用途，只会在下次误读时给出一个看似正常的旧值。
      pruneMap(this.rowsById, ids);
      pruneMap(this.errorsByDataSetId, ids);
      pruneMap(this.tookById, ids);

      if (!ids.length) {
        this.status = "ready";
        this.loadedDataSetCount = 0;
        this.tookMs = null;
        this.loadedAt = Date.now();
        return;
      }

      this.status = "loading";
      this.errorsByDataSetId = {};
      this.loadedDataSetCount = ids.length;
      // 取数会改变行内容 → 上次的实测行高全部作废（feedback 环从头再来）
      this.measuredRowHeights = {};
      const startedAt = Date.now();

      const results = await Promise.allSettled(
        ids.map(async (id) => {
          // `buildPayload(id)` 内部会走 `resolveParamValues`：面板手填测试值 →
          // 系统变量 → 参数默认值。预览态等于"打印入参取默认值"，
          // 本期刻意不引入参数输入界面（那是报表的查询面板，属于另一个功能）。
          const payload = binding.buildPayload(id);
          if (!payload) throw new Error("数据集已不存在");
          const res = await runDataSet(payload);
          return { id, rows: res.rows ?? [], took: (res as { took?: number }).took };
        })
      );

      // 有更新的一次取数在跑 → 这一批结果作废（见文件头第 3 条）
      if (gen !== this.generation) return;

      let failed = 0;
      results.forEach((result, i) => {
        const id = ids[i];
        if (result.status === "fulfilled") {
          this.rowsById[id] = cloneRows(result.value.rows);
          if (typeof result.value.took === "number") this.tookById[id] = result.value.took;
          return;
        }
        failed += 1;
        this.rowsById[id] = [];
        this.errorsByDataSetId[id] = describeServiceError(result.reason);
      });

      this.status = failed === 0 ? "ready" : failed === ids.length ? "error" : "partial";
      this.tookMs = Date.now() - startedAt;
      this.loadedAt = Date.now();
    },

    /** 手动重新取数（工具条上的「刷新数据」） */
    refresh(): Promise<void> {
      return this.loadAll();
    },

    /**
     * 测量层上报某张表各行的实测高度（mm）。
     *
     * @param values **全量数组**，下标 = 展开序列下标（与
     * `expansion.templateRows` 一一对应）：atLeast 行填实测值，其余填 0。
     *
     * ## 为什么是"整表替换"而不是逐下标取 max（2026-09-21 教训）
     *
     * max 合并诞生于"多个分片各自上报"的旧架构；现在测量层是**唯一**上报者，
     * 且每次覆盖全部行。max 的致命伤是行高**只增不减**：列宽调宽 / 单元格
     * 文本删短后，行高明明该变矮，max 却把它永远卡在历史最大值上 ——
     * 渲染层还拿这个值当最小高，错误就固化了。整表替换让"变矮"可被观测。
     *
     * ## 只在有变化时写
     *
     * 逐下标按 0.1mm 容差比较，稳态时不再触发重排。容差不是洁癖：
     * `getBoundingClientRect` 返回亚像素浮点，严格 `===` 会把 0.001mm 的
     * 测量噪声当"变了"，measure → 重排 → measure 无限震荡（真机踩过）。
     */
    reportRowHeights(tableId: string, values: number[]): void {
      const prev = this.measuredRowHeights[tableId];
      if (prev && prev.length === values.length) {
        let changed = false;
        for (let i = 0; i < values.length; i++) {
          if (Math.abs((prev[i] ?? 0) - (values[i] ?? 0)) > 0.1) {
            changed = true;
            break;
          }
        }
        if (!changed) return;
      }
      this.measuredRowHeights[tableId] = values.slice();
    },

    /** 清空某张表的实测值（结构 / 数据变了，旧测量作废） */
    clearRowHeights(tableId: string): void {
      delete this.measuredRowHeights[tableId];
    },

    /** 离开预览时清空。**必须清**：运行数据是"这一刻这一份"的东西 */
    reset() {
      this.generation += 1;
      this.status = "idle";
      this.rowsById = {};
      this.errorsByDataSetId = {};
      this.tookById = {};
      this.tookMs = null;
      this.loadedAt = null;
      this.loadedDataSetCount = 0;
      this.currentPage = 1;
      this.zoomMode = "fit";
      this.zoom = 1;
      this.measuredRowHeights = {};
    },

    setCurrentPage(page: number) {
      this.currentPage = Math.max(1, Math.floor(page) || 1);
    },

    setZoomMode(mode: "fit" | "custom") {
      this.zoomMode = mode;
    },

    setZoom(zoom: number) {
      this.zoomMode = "custom";
      this.zoom = Math.min(4, Math.max(0.1, zoom));
    }
  }
});

/** 删掉 map 里不在 keep 列表中的键（就地改，不重建对象） */
function pruneMap<T>(map: Record<string, T>, keep: string[]) {
  for (const key of Object.keys(map)) {
    if (!keep.includes(key)) delete map[key];
  }
}
