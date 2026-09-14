import { defineStore } from "pinia";
import type { Element } from "@/components/design/types";

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
    }
  }
});
