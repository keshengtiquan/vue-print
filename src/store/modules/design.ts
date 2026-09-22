import { toRaw } from "vue";
import { defineStore } from "pinia";
import type {
  CellRange,
  Element,
  ElementType,
  Guide,
  GuideDir,
  TableElement
} from "@/components/design/types";
import {
  clampRange,
  expandRange,
  normalizeTable,
  rangeOfPoint,
  scaleTracks,
  syncTableGeometry
} from "@/components/design/table/model";

/** 生成局部唯一 id。仅用于画布内的临时对象（辅助线），不要求跨会话稳定 */
let seed = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seed++).toString(36)}`;

/**
 * 新建元素时对载荷做深拷贝 —— 这一步不能省。
 *
 * 素材清单（`materials.ts`）里的 `defaults` 是**模块级常量**，它内部的嵌套结构
 * （表格的 `colWidths` / `rowHeights` / `cells`、线条的 `start` / `end` / `stroke`）
 * 全都是**同一个对象实例**。若 `createElement` 只做浅展开（`{...partial}`），
 * 同一种素材拖出两个就是"两份外壳、一份内脏"：在 A 表里删掉一行，B 表跟着少一行 ——
 * 因为它们本来就共用同一个 `cells` 数组，而不是"看起来一样"。
 *
 * 优先 `structuredClone`（与复制 / 粘贴同一套深拷贝语义）。
 * 载荷理论上只含纯数据，但万一将来混进不可克隆的值（函数 / DOM 节点），
 * 退回浅拷贝并留警告，总好过让编辑器在 drop 那一刻整个炸掉。
 */
function cloneElementPayload<T extends object>(value: T): T {
  try {
    // toRaw：调用方可能传来 Pinia 的响应式 Proxy，而 structuredClone 克隆不了 Proxy
    return structuredClone(toRaw(value));
  } catch (err) {
    console.warn("[design] 元素默认值深拷贝失败，已退回浅拷贝（嵌套数据可能被多个元素共享）", err);
    return { ...value };
  }
}

export const SCALE_MIN = 0.1;
export const SCALE_MAX = 2;

export const useDesignStore = defineStore("design", {
  state: () => ({
    /** 纸张尺寸（mm） */
    paper: { widthMm: 210, heightMm: 297 },
    /** 页面页边距（mm，四向独立） */
    marginMm: { top: 10, right: 10, bottom: 10, left: 10 },
    /**
     * 页码（页脚）配置。**文档数据**，跟随模板持久化，不是视图偏好。
     *
     * - `enabled`：是否在每页底部页边距内显示页码；
     * - `template`：页码文本模板，支持系统变量占位符
     *   `{$pageIndex}`（当前页码，1 起）/ `{$pageCount}`（总页数）；
     * - `align`：底部对齐位置 `left | center | right`；
     * - `oddEven`：奇偶页分侧（书刊式）——开启后奇数页靠右、偶数页靠左，
     *   优先于 `align` 生效。
     */
    pageNumber: {
      enabled: true,
      template: "第 {$pageIndex} 页 / 共 {$pageCount} 页",
      align: "center" as "left" | "center" | "right",
      oddEven: false
    },
    /** 画布上是否显示页边距辅助线（视图偏好，不参与打印输出） */
    showMarginGuides: true,
    /** 画布纸张上是否显示设计网格（视图偏好，不参与打印输出） */
    showGrid: false,
    /**
     * 辅助线（mm，相对纸张原点）。这是**文档数据**而非视图偏好 ——
     * 辅助线是设计稿的一部分，换台机器打开还应该在那儿。
     */
    guides: [] as Guide[],
    /**
     * 画布上是否显示辅助线（视图偏好，不参与打印输出）。
     * 关闭 = 彻底关闭：既不渲染，也不参与吸附 ——
     * 看不见的东西还在拽元素是纯粹的困惑，所以显隐与行为必须绑定。
     */
    showGuides: true,
    /**
     * 吸附总开关（编辑偏好，不参与打印输出）。
     * 关闭后移动不再吸页边距线/辅助线，旋转不再吸正交角/15° 步进，
     * 完全按自由位移走 —— 排版到 0.5mm 级时需要它。
     */
    snapEnabled: true,
    /** 缩放倍数，1 = 100% */
    scale: 1,
    /** 鼠标在纸张区的坐标（mm，相对纸张原点） */
    mouse: { x: 0, y: 0 },
    /** 鼠标是否在 rootRef 内 */
    inPanel: false,
    /** 纸张上的素材元素 */
    elements: [
      // { id: "1", x: 0, y: 0, width: 50, height: 50, type: "text", content: "hello" }
      // { id: "2", x: 20, y: 20, width: 100, height: 100, type: "table", rows: 3, cols: 5 }
      // {
      //   id: "4",
      //   type: "image",
      //   x: 10,
      //   y: 10,
      //   width: 50,
      //   height: 100,
      //   src: "https://cdn.independent-photo.com/wp-content/uploads/2022/02/Yifeng-Ding-1800x1192.jpeg?width=500&quality=85&format=webp%20500w,%20https://cdn.independent-photo.com/wp-content/uploads/2022/02/Yifeng-Ding-1800x1192.jpeg?width=900&quality=85&format=webp%20900w,%20https://cdn.independent-photo.com/wp-content/uploads/2022/02/Yifeng-Ding-1800x1192.jpeg?width=1400&quality=85&format=webp%201400w",
      //   objectFit: "contain"
      // }
      // {
      //   id: "3",
      //   width: 10,
      //   height: 10,
      //   x: 10,
      //   y: 10,
      //   type: "line",
      //   start: { x: 0, y: 0 },
      //   end: { x: 0, y: 10 },
      //   stroke: { color: "#000", width: 0.5 },
      //   dash: null
      // }
    ] as Element[],
    /** 当前选中的元素 id */
    selectedId: null as string | null,
    /**
     * 正在画布上做**内联编辑**的元素 id（null = 没在编辑）。
     *
     * 为什么进 store 而不是像 useSnapFeedback 那样做模块级单例：
     * 那边做单例的判据是"消费方只有两个光纤组件"，而这里要跨三个目录被多处读取 ——
     * ElementWrapper 藏手柄、TextElement 渲染编辑器、右键菜单下命令。
     * 它同时也天然保证了"同一时刻只有一个元素在编辑"。
     */
    editingId: null as string | null,
    /**
     * 表格内编辑态：正在「进入内部操作」的表格元素 id（null = 不在任何表格内）。
     *
     * 这是表格三层选中里的**第 2 层**，与 editingId（第 3 层，单元格内文本编辑）
     * 是两个不同层级，不要合并成一个字段 —— 它们的退出条件也不同：
     * 第 3 层靠失焦退出，第 2 层靠 Esc / 点表格外退出。
     */
    tableEditingId: null as string | null,
    /** 表格内选区（矩形，网格坐标）。null = 没有选中任何单元格 */
    cellRange: null as CellRange | null,
    /** 选区的「活动格」（焦点格）：右键菜单定位、插入行列、键盘导航都以它为锚 */
    activeCell: null as { r: number; c: number } | null,
    /** 第 3 层：正在编辑文本的单元格。null = 没有 */
    cellEditing: null as { r: number; c: number } | null,
    /** 内部剪贴板：复制/剪切后由右键菜单粘贴为一个新元素 */
    clipboardElement: null as Element | null,
    /** 连续粘贴时的视觉偏移，避免新元素完全盖住来源 */
    pasteCount: 0
  }),

  getters: {
    /** 按 zIndex 升序排列的元素 */
    sortedElements: (state) => [...state.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),

    /**
     * 当前处于表格编辑态的表格元素（不在表格内时为 null）。
     * 消费方很多（渲染层、菜单、属性面板、ElementWrapper），所以放 getter 统一算，
     * 避免每一处都自己 `elements.find` 再判类型。
     */
    activeTable(state): TableElement | null {
      if (!state.tableEditingId) return null;
      const el = state.elements.find((e) => e.id === state.tableEditingId);
      return el && el.type === "table" ? el : null;
    }
  },

  actions: {
    /**
     * 直接加入一个**已经构造好**的元素。
     *
     * 契约：`el` 必须自持数据 —— 它的嵌套结构不能与别的元素（或任何模块级常量）共用引用，
     * 否则又会出现"改 A 表 B 表跟着变"（见 cloneElementPayload）。
     * 从素材台创建请走 `createElement`，那里会替你深拷贝。
     */
    addElement(el: Element) {
      this.elements.push(el);
    },

    /**
     * 从素材台创建元素：封装 id 生成 + 默认值填充 + 自动选中。
     *
     * 调用方只关心"放什么类型 + 放在哪儿"。partial 里的字段（x/y/width/content 等）生效，
     * id 和 type 由这里保证唯一与正确，防止 partial 误覆盖。
     */
    createElement(type: ElementType, partial: Record<string, unknown> = {}): Element {
      // partial 必须深拷贝，不能直接展开 —— 理由见 cloneElementPayload。
      const el = { ...cloneElementPayload(partial), id: nextId("el"), type } as unknown as Element;
      this.elements.push(el);
      this.selectedId = el.id;
      return el;
    },

    removeElement(id: string) {
      const i = this.elements.findIndex((e) => e.id === id);
      if (i !== -1) this.elements.splice(i, 1);
      if (this.selectedId === id) this.selectedId = null;
      // 编辑中的元素被删掉，编辑态必须跟着走 —— 否则 editingId 会指向一个不存在的元素
      if (this.editingId === id) this.editingId = null;
      // 表格被删掉同理：表格编辑态与单元格选区一起作废
      if (this.tableEditingId === id) this.exitTable();
    },

    copyElement(id: string) {
      const el = this.getElement(id);
      if (!el) return;
      // Pinia 返回的是 Vue 响应式 Proxy，浏览器的 structuredClone 不能克隆 Proxy。
      // 先解包为原始对象，才保留嵌套字段（如线条端点、表格样式）的深拷贝语义。
      this.clipboardElement = structuredClone(toRaw(el));
      this.pasteCount = 0;
    },

    pasteElement(): Element | undefined {
      if (!this.clipboardElement) return;
      const offset = 5 * (++this.pasteCount);
      // clipboardElement 读回 Pinia state 时也会再次成为 Proxy，粘贴前同样需要解包。
      const el = structuredClone(toRaw(this.clipboardElement)) as Element;
      el.id = nextId("el");
      el.x += offset;
      el.y += offset;
      this.elements.push(el);
      this.selectedId = el.id;
      return el;
    },

    selectElement(id: string | null) {
      this.selectedId = id;
      // 选中目标一换就退出内联编辑（点画布空白、点别的元素都属于"离开这次编辑"）。
      // 这里必须放行 id === editingId 的情况：进入编辑时会先选中同一个元素。
      if (id !== this.editingId) this.editingId = null;
      // 选中目标离开这张表 → 退出表格编辑态（点画布空白、选中别的元素都算"离开"）。
      // 同样放行 id === tableEditingId：进入表格时会先选中它自己。
      if (id !== this.tableEditingId) this.exitTable();
    },

    /**
     * 进入内联编辑。锁定元素不允许 —— 编辑等于改内容，而锁定的语义是"别动它"；
     * 非文本类型没有内容可编。
     */
    startEditing(id: string) {
      const el = this.getElement(id);
      if (!el || el.locked || el.type !== "text") return;
      this.selectedId = id;
      this.editingId = id;
    },

    stopEditing() {
      this.editingId = null;
    },

    /* ============================================================
       表格：第 2 层（表格内编辑态）与第 3 层（单元格文本编辑）
    ============================================================ */

    /**
     * 进入表格内编辑态。只是"让单元格变得可选中"，**不**进入文本编辑 ——
     * 文本编辑是第 3 层，由 startCellEditing 负责。
     * 锁定的表格不给进（锁定语义是"别动它"，而进去就是为了动它）。
     */
    enterTable(id: string) {
      const el = this.getElement(id);
      if (!el || el.type !== "table" || el.locked) return;
      this.selectedId = id;
      this.tableEditingId = id;
      this.cellRange = null;
      this.activeCell = null;
      this.cellEditing = null;
    },

    /**
     * 退出表格编辑态。用早退而不是无条件写四个字段：
     * selectElement 每次都会调它（点画布、点别的元素），
     * 而那几个字段绝大多数时候本来就已经是 null。
     */
    exitTable() {
      if (!this.tableEditingId && !this.cellRange && !this.activeCell && !this.cellEditing) return;
      this.tableEditingId = null;
      this.cellRange = null;
      this.activeCell = null;
      this.cellEditing = null;
    },

    /** 设置单元格选区（矩形）。active 缺省取选区右下角，与 Excel 框选后的活动格一致 */
    setCellRange(range: CellRange | null, active?: { r: number; c: number }) {
      const el = this.activeTable;
      if (!el || !range) {
        this.cellRange = null;
        this.activeCell = null;
        return;
      }
      const next = clampRange(range, el);
      this.cellRange = next;
      this.activeCell = active ?? { r: next.r2, c: next.c2 };
    },

    /**
     * 进入第 3 层：编辑某个单元格的文本。锁定表格不给编。
     *
     * 选区必须和点选 / 框选走**同一条扩张规则**（`rangeOfPoint` → `expandRange`），
     * 不能图省事写 1×1：`cellRange` 是整个系统的"当前选区"，只写单格的话
     * 合并格被双击后选区背景只画在它的一角 —— 边框反倒完整，因为 `activeRect`
     * 内部自己又扩张过一次，于是呈现成"框是整格、蓝底只有一小块"。
     *
     * 顺带把坐标归一到合并区的**宿主格**（左上角）：`cellEditing` 是给渲染层
     * 比对 td 坐标用的，而 td 只画在宿主格上。
     */
    startCellEditing(r: number, c: number) {
      const el = this.activeTable;
      if (!el || el.locked) return;
      const range = clampRange(expandRange(el, rangeOfPoint(el, r, c)), el);
      this.cellRange = range;
      this.activeCell = { r: range.r1, c: range.c1 };
      this.cellEditing = { r: range.r1, c: range.c1 };
    },

    stopCellEditing() {
      this.cellEditing = null;
    },

    /**
     * 移动活动格并把选区收敛为单格（键盘导航 / 点击用）。
     * 越界不报错也不循环，直接不动 —— 表格边界不该有"跳到另一头"的惊喜。
     *
     * 落到合并格内部时要扩张成整个合并区，否则又是"选区只覆盖合并格的一角"。
     * `setCellRange` 只做夹取，不负责扩张，所以这里得自己带上。
     */
    moveActiveCell(dr: number, dc: number) {
      const el = this.activeTable;
      const cur = this.activeCell;
      if (!el || !cur) return;
      const r = Math.min(el.rows - 1, Math.max(0, cur.r + dr));
      const c = Math.min(el.cols - 1, Math.max(0, cur.c + dc));
      const range = expandRange(el, { r1: r, c1: c, r2: r, c2: c });
      this.setCellRange(range, { r: range.r1, c: range.c1 });
    },

    /**
     * 表格结构 / 内容的统一写入口。
     *
     * 为什么不用 updateElement 的点路径 patch：二维单元格数组没法用点路径表达；
     * 更要命的是单元格写入**必须整包替换** —— 逐格赋值会触发 N 次响应式更新，
     * 拖分隔线那种每帧都改的手势会直接被拖垮。
     *
     * mutator 直接改元素（调 model.ts 的纯函数），改完由这里统一做三件事：
     * 补齐缺省字段、回算几何不变量（Σ 行列 ≡ 元素框）、收敛越界的选区。
     */
    updateTable(id: string, mutator: (el: TableElement) => void) {
      const el = this.getElement(id);
      if (!el || el.type !== "table") return;
      mutator(el);
      normalizeTable(el);
      syncTableGeometry(el);
      if (this.tableEditingId !== id) return;
      if (this.cellRange) this.cellRange = clampRange(this.cellRange, el);
      if (this.activeCell) {
        this.activeCell = {
          r: Math.min(this.activeCell.r, el.rows - 1),
          c: Math.min(this.activeCell.c, el.cols - 1)
        };
      }
      if (this.cellEditing && (this.cellEditing.r >= el.rows || this.cellEditing.c >= el.cols)) {
        this.cellEditing = null;
      }
    },

    getElement(id: string): Element | undefined {
      return this.elements.find((e) => e.id === id);
    },

    /** 更新元素字段（patch 可为任意字段，含类型专属字段如 start/end/content） */
    updateElement(id: string, patch: Record<string, unknown>) {
      const el = this.getElement(id);
      if (!el) return;
      // 表格的几何不变量：改总宽高 = 等比缩放全部列宽/行高（文档 §1.5 约束 1）。
      // 放在这里而不是各个调用点，是因为"拖元素手柄"和"面板改宽高"是两条独立路径，
      // 漏掉任何一条都会让 Σ colWidths 与 width 慢慢对不上。
      if (el.type === "table") {
        if (typeof patch.width === "number" && patch.width !== el.width) {
          el.colWidths = scaleTracks(el.colWidths, patch.width);
        }
        if (typeof patch.height === "number" && patch.height !== el.height) {
          el.rowHeights = scaleTracks(el.rowHeights, patch.height);
        }
      }
      Object.assign(el, patch);
      // 锁定即退出编辑。放在这里而不是菜单命令里，是为了让所有加锁路径（菜单、将来的图层面板、
      // 快捷键）都自动满足这条约束，不用各自记得清一遍。
      if (el.locked && this.editingId === id) this.editingId = null;
    },

    /** 新增一条辅助线 */
    addGuide(dir: GuideDir, pos: number): Guide {
      const guide: Guide = { id: nextId("guide"), dir, pos };
      this.guides.push(guide);
      return guide;
    },

    /** 移动辅助线到新位置（mm） */
    moveGuide(id: string, pos: number) {
      const guide = this.guides.find((g) => g.id === id);
      if (guide) guide.pos = pos;
    },

    removeGuide(id: string) {
      const i = this.guides.findIndex((g) => g.id === id);
      if (i !== -1) this.guides.splice(i, 1);
    },

    clearGuides() {
      this.guides = [];
    }
  }
});
