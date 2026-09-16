import { toRaw } from "vue";
import { defineStore } from "pinia";
import type { Element, ElementType, Guide, GuideDir } from "@/components/design/types";

/** 生成局部唯一 id。仅用于画布内的临时对象（辅助线），不要求跨会话稳定 */
let seed = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seed++).toString(36)}`;

export const SCALE_MIN = 0.1;
export const SCALE_MAX = 2;

export const useDesignStore = defineStore("design", {
  state: () => ({
    /** 纸张尺寸（mm） */
    paper: { widthMm: 210, heightMm: 297 },
    /** 页面页边距（mm，四向独立） */
    marginMm: { top: 10, right: 10, bottom: 10, left: 10 },
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
    /** 内部剪贴板：复制/剪切后由右键菜单粘贴为一个新元素 */
    clipboardElement: null as Element | null,
    /** 连续粘贴时的视觉偏移，避免新元素完全盖住来源 */
    pasteCount: 0
  }),

  getters: {
    /** 按 zIndex 升序排列的元素 */
    sortedElements: (state) => [...state.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  },

  actions: {
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
      const el = { ...partial, id: nextId("el"), type } as unknown as Element;
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

    getElement(id: string): Element | undefined {
      return this.elements.find((e) => e.id === id);
    },

    /** 更新元素字段（patch 可为任意字段，含类型专属字段如 start/end/content） */
    updateElement(id: string, patch: Record<string, unknown>) {
      const el = this.getElement(id);
      if (!el) return;
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
