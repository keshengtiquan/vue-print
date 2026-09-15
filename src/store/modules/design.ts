import { defineStore } from "pinia";
import type { Element, Guide, GuideDir } from "@/components/design/types";

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
      { id: "1", x: 0, y: 0, width: 50, height: 50, type: "text", content: "hello" }
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
    selectedId: null as string | null
  }),

  getters: {
    /** 按 zIndex 升序排列的元素 */
    sortedElements: (state) => [...state.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  },

  actions: {
    addElement(el: Element) {
      this.elements.push(el);
    },

    removeElement(id: string) {
      const i = this.elements.findIndex((e) => e.id === id);
      if (i !== -1) this.elements.splice(i, 1);
      if (this.selectedId === id) this.selectedId = null;
    },

    selectElement(id: string | null) {
      this.selectedId = id;
    },

    getElement(id: string): Element | undefined {
      return this.elements.find((e) => e.id === id);
    },

    /** 更新元素字段（patch 可为任意字段，含类型专属字段如 start/end/content） */
    updateElement(id: string, patch: Record<string, unknown>) {
      const el = this.getElement(id);
      if (!el) return;
      Object.assign(el, patch);
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
