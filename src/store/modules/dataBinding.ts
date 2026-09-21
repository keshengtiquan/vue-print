/**
 * 数据绑定 store：数据源 / 数据集 / 样本 / 测试状态。
 *
 * 设计文档：docs/data-binding-design.md
 *
 * ## 两条边界，先说清楚
 *
 * 1. **这里只存"数据"，不存"绑定"**。元素绑了哪个数据集是元素自己的字段
 *    （`element.binding.dataSetId`），写入口仍然是 `designStore.updateElement` ——
 *    "谁消费数据"属于文档模型，"数据从哪来"属于这个 store。混在一起的话，
 *    删一个数据集就得在两个 store 之间做双向同步。
 *
 *    由此推出第二条：**没有"主数据集 / 默认数据集"这个概念**。
 *    元素绑谁，取决于"用户从哪个字段拖进来的"——`FieldNode` 的拖拽载荷里
 *    本来就带 `dataSetId`。没绑定的元素就当静态内容渲染，不去猜用户想要哪份数据；
 *    猜错的代价（画布上显示的是另一份数据、且没有任何提示）远大于省下的那一次点选。
 *
 * 2. **样本数据只在内存里**（文档 §7 第 5 条）。它有两个用途：设计态看到
 *    "填了数据长什么样"、以及测试时确认字段解析对不对。存进模板会让体积失控，
 *    而模板真正需要携带的只有 `fields` 快照，不是数据本身。
 */
import { toRaw } from "vue";
import { defineStore } from "pinia";
import {
  collectDataSetTokenNames,
  mergeParams
} from "@/components/design/data/model";
import { systemVariables } from "@/components/design/data/context";
import type {
  DataRow,
  DataSetField,
  DataSetPayload,
  TemplateDataSet,
  TemplateDataSource
} from "@/components/design/data/types";
import {
  describeServiceError,
  isDataServiceAvailable,
  resolveMode,
  runDataSet as apiRunDataSet,
  testDataSet as apiTestDataSet
} from "@/api/dataset";
import { useDesignStore } from "./design";

/** 生成局部唯一 id。与 design store 同款（不要求跨会话稳定） */
let seed = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seed++).toString(36)}`;

/**
 * 深拷贝。
 *
 * 与 `design.ts` 的 `cloneElementPayload` 同一个理由：数据集里的
 * `params` / `fields` / `request.headers` 都是嵌套结构，
 * 浅拷贝会让"面板上改 A 数据集"顺手改掉别处持有的同一份引用。
 * Pinia 返回的是 Proxy，`structuredClone` 克隆不了，所以先 `toRaw`。
 */
function clone<T>(value: T): T {
  try {
    return structuredClone(toRaw(value));
  } catch (err) {
    console.warn("[dataBinding] 深拷贝失败，已退回浅拷贝（嵌套数据可能被共享）", err);
    return { ...value };
  }
}

export type TestStatus = "idle" | "running" | "ok" | "error";

export interface DataSetTestState {
  status: TestStatus;
  /** 失败原因（已转成人话） */
  message?: string;
  took?: number;
  at?: number;
}

export const useDataBindingStore = defineStore("dataBinding", {
  state: () => ({
    /** 数据源（连接声明）。凭据不在模板里，见 types.ts 文件头 */
    dataSources: [] as TemplateDataSource[],
    /** 数据集（查询声明）。这是模板里最重要的数据单元 */
    dataSets: [] as TemplateDataSet[],

    /** 样本数据（内存，刷新即失效）：dataSetId → 行 */
    samples: {} as Record<string, DataRow[]>,
    /** 测试用参数值：dataSetId → { 参数名: 值 } */
    paramValues: {} as Record<string, Record<string, unknown>>,
    /** 每个数据集的测试状态 */
    testState: {} as Record<string, DataSetTestState>,

    /**
     * 数据面板当前选中的数据集（字段树 / 绑定面板的上下文）。
     * 放 store 而不是面板局部状态，是因为左侧字段树与右侧绑定面板读的是**同一个**上下文。
     */
    selectedDataSetId: null as string | null,

    /** 当前数据服务是否可用（配置变化需刷新页面重新求值） */
    serviceAvailable: isDataServiceAvailable()
  }),

  getters: {
    hasDataSets: (state): boolean => state.dataSets.length > 0,

    dataSetById(state) {
      return (id: string | undefined): TemplateDataSet | undefined =>
        id ? state.dataSets.find((d) => d.id === id) : undefined;
    },

    dataSourceById(state) {
      return (id: string | undefined): TemplateDataSource | undefined =>
        id ? state.dataSources.find((s) => s.id === id) : undefined;
    },

    /** 按**名字**查数据集：占位符 `{数据集.字段}` 走这条 */
    dataSetByName(state) {
      return (name: string): TemplateDataSet | undefined =>
        state.dataSets.find((d) => d.name === name);
    },

    /** 某数据集的样本行（内存快照） */
    sampleOf(state) {
      return (id: string | undefined): DataRow[] => (id ? (state.samples[id] ?? []) : []);
    },

    testStateOf(state) {
      return (id: string | undefined): DataSetTestState =>
        (id ? state.testState[id] : undefined) ?? { status: "idle" };
    },

    /**
     * 数据面板的上下文数据集（字段树 / 绑定面板的"可插入字段"都取它）。
     *
     * 它**只管面板显示，不参与画布渲染** —— 画布上的元素只认自己
     * `binding.dataSetId` 指向的那一个。没选过时回落到第一个，纯粹是
     * 为了让面板一开始不是空的（否则第一次进来要点一下才看得到字段树）。
     */
    selectedDataSet(state): TemplateDataSet | undefined {
      if (state.selectedDataSetId) {
        const hit = state.dataSets.find((d) => d.id === state.selectedDataSetId);
        if (hit) return hit;
      }
      return state.dataSets[0];
    }
  },

  actions: {
    /* ============================================================
       数据源
    ============================================================ */

    createDataSource(name: string, type: TemplateDataSource["type"] = "http"): TemplateDataSource {
      const ds: TemplateDataSource = { id: nextId("src"), name, type };
      this.dataSources.push(ds);
      return ds;
    },

    /** 没有数据源时自动建一个 —— 让"新建数据集"这一步不需要先学会建数据源 */
    ensureDefaultDataSource(): TemplateDataSource {
      if (this.dataSources.length) return this.dataSources[0];
      return this.createDataSource("默认接口源", "http");
    },

    updateDataSource(id: string, patch: Partial<TemplateDataSource>) {
      const src = this.dataSources.find((s) => s.id === id);
      if (src) Object.assign(src, patch);
    },

    /**
     * 删除数据源。**下面还挂着数据集时拒绝** ——
     * 级联删数据集是"用户点了删除，结果数据全没了"的经典事故现场，
     * 让他先把数据集挪走或删掉，成本很低而风险归零。
     */
    removeDataSource(id: string): { ok: boolean; message?: string } {
      const used = this.dataSets.filter((d) => d.dataSourceId === id);
      if (used.length) {
        return { ok: false, message: `该数据源下还有 ${used.length} 个数据集，请先删除或转移它们` };
      }
      const i = this.dataSources.findIndex((s) => s.id === id);
      if (i !== -1) this.dataSources.splice(i, 1);
      return { ok: true };
    },

    /* ============================================================
       数据集
    ============================================================ */

    /** 新建接口数据集。SQL 分支保留在类型里，但当前不作为入口暴露 */
    createDataSet(partial: Partial<TemplateDataSet> = {}): TemplateDataSet {
      const source = this.ensureDefaultDataSource();
      const base = `数据集${this.dataSets.length + 1}`;
      const ds: TemplateDataSet = {
        id: nextId("ds"),
        name: this.uniqueDataSetName(base),
        label: base,
        dataSourceId: source.id,
        type: "http",
        request: { url: "", method: "GET" },
        params: [],
        fields: [],
        options: { limit: 5000, timeout: 10000, onEmpty: "keepTemplate" },
        ...clone(partial)
      };
      this.dataSets.push(ds);
      // 新建的数据集立刻成为面板上下文 —— 建完就要填 URL，不该还要再去点一下它
      this.selectedDataSetId = ds.id;
      return ds;
    },

    /** 名字必须唯一：占位符靠它寻址，重名会让 `{ds.f}` 指向不明 */
    uniqueDataSetName(base: string, exceptId?: string): string {
      const taken = new Set(this.dataSets.filter((d) => d.id !== exceptId).map((d) => d.name));
      if (!taken.has(base)) return base;
      let i = 2;
      while (taken.has(`${base}${i}`)) i++;
      return `${base}${i}`;
    },

    /**
     * 写入数据集（新增或整体替换）。
     * 入参会被深拷贝 —— 数据所有权铁律，与 `createElement` 同款要求。
     */
    upsertDataSet(dataset: TemplateDataSet) {
      const next = clone(dataset);
      const i = this.dataSets.findIndex((d) => d.id === next.id);
      if (i === -1) this.dataSets.push(next);
      else this.dataSets[i] = next;
    },

    /** 局部更新。只用于面板上的浅字段（名字、备注等），结构变更请走 upsertDataSet */
    updateDataSet(id: string, patch: Partial<TemplateDataSet>) {
      const ds = this.dataSetById(id);
      if (ds) Object.assign(ds, clone(patch));
    },

    duplicateDataSet(id: string): TemplateDataSet | undefined {
      const src = this.dataSetById(id);
      if (!src) return undefined;
      const copy = clone(src);
      copy.id = nextId("ds");
      copy.name = this.uniqueDataSetName(`${src.name}_copy`);
      copy.label = `${src.label ?? src.name} 副本`;
      copy.fieldsRefreshedAt = undefined;
      this.dataSets.push(copy);
      return copy;
    },

    /**
     * 删除数据集，并**清理所有指向它的元素绑定**。
     *
     * 不清理的话，元素上的 `binding.dataSetId` 会指向一个不存在的 id ——
     * 渲染时取不到数据、面板上又显示"已绑定"，是最难排查的一类悬空引用。
     */
    removeDataSet(id: string) {
      const i = this.dataSets.findIndex((d) => d.id === id);
      if (i === -1) return;
      this.dataSets.splice(i, 1);
      if (this.selectedDataSetId === id) this.selectedDataSetId = this.dataSets[0]?.id ?? null;
      delete this.samples[id];
      delete this.paramValues[id];
      delete this.testState[id];

      const design = useDesignStore();
      for (const el of design.elements) {
        if (el.binding?.dataSetId === id) design.updateElement(el.id, { binding: undefined });
      }
    },

    /** 切换数据面板上下文（字段树跟着换）。只影响面板，不影响画布渲染 */
    selectDataSet(id: string | null) {
      this.selectedDataSetId = id;
    },

    /* ============================================================
       参数
    ============================================================ */

    /**
     * 按 `${参数}` 的出现情况同步参数列表（只增不删已有的配置）。
     * 改完 URL 点一下即可，不用手工维护清单。
     */
    syncParams(id: string) {
      const ds = this.dataSetById(id);
      if (!ds) return;
      ds.params = mergeParams(ds.params ?? [], collectDataSetTokenNames(ds));
    },

    setParamValue(dataSetId: string, name: string, value: unknown) {
      const bag = (this.paramValues[dataSetId] ??= {});
      bag[name] = value;
    },

    /**
     * 算出这次实际要用的参数值。
     *
     * 优先级：面板上手填的测试值 → 系统变量 → 参数默认值。
     * **凑不出的参数不进结果**，于是 `resolveTokens` 会保留 `${name}` 原样 ——
     * 用户能在 URL 里一眼看到哪个参数没值，比替换成空串好排查得多。
     */
    resolveParamValues(ds: TemplateDataSet): Record<string, unknown> {
      const sys = systemVariables();
      const manual = this.paramValues[ds.id] ?? {};
      const out: Record<string, unknown> = {};
      for (const p of ds.params ?? []) {
        const manualValue = manual[p.name];
        if (manualValue !== undefined && manualValue !== "") {
          out[p.name] = manualValue;
          continue;
        }
        if (p.source === "sys" && p.sysVar) {
          const v = sys[p.sysVar];
          if (v !== undefined) {
            out[p.name] = v;
            continue;
          }
        }
        if (p.defaultValue !== undefined && p.defaultValue !== null) out[p.name] = p.defaultValue;
      }
      return out;
    },

    /** 组装发给数据服务的载荷。三个接口共用这一份 */
    buildPayload(id: string, params?: Record<string, unknown>): DataSetPayload | null {
      const ds = this.dataSetById(id);
      if (!ds) return null;
      return {
        dataset: clone(ds),
        dataSource: this.dataSourceById(ds.dataSourceId),
        params: params ?? this.resolveParamValues(ds)
      };
    },

    /* ============================================================
       取数与测试
    ============================================================ */

    setSample(id: string, rows: DataRow[]) {
      this.samples[id] = rows;
    },

    /** 设计态：测试并解析字段。成功时回填字段快照与样本 */
    async runTest(id: string): Promise<boolean> {
      const payload = this.buildPayload(id);
      if (!payload) return false;
      this.testState[id] = { status: "running" };
      try {
        const res = await apiTestDataSet(payload);
        this.samples[id] = res.rows;
        const ds = this.dataSetById(id);
        if (ds) {
          ds.fields = clone(res.fields) as DataSetField[];
          ds.fieldsRefreshedAt = Date.now();
        }
        this.testState[id] = { status: "ok", took: res.took, at: Date.now() };
        return true;
      } catch (err) {
        console.error("[dataBinding] 数据集测试失败", err);
        this.testState[id] = { status: "error", message: describeServiceError(err), at: Date.now() };
        return false;
      }
    },

    /** 运行态：取全量数据（受 limit 约束） */
    async run(id: string, params?: Record<string, unknown>): Promise<DataRow[]> {
      const payload = this.buildPayload(id, params);
      if (!payload) return [];
      const res = await apiRunDataSet(payload);
      this.samples[id] = res.rows;
      return res.rows;
    },

    /** 当前生效的执行模式，用于面板显示"宿主数据服务 / 浏览器直连" */
    modeLabel(): string {
      return resolveMode() === "remote" ? "宿主数据服务" : "浏览器直连";
    }
  }
});
