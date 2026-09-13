import { reactive } from "vue";
import type { Element } from "./types";

export const SCALE_MIN = 0.1;
export const SCALE_MAX = 2;

export const designState = reactive({
  /** 纸张尺寸（mm） */
  paper: { widthMm: 210, heightMm: 297 },
  /** 缩放倍数，1 = 100% */
  scale: 1,
  /** 鼠标在纸张区的坐标（mm，相对纸张原点） */
  mouse: { x: 0, y: 0 },
  /** 鼠标是否在 rootRef 内 */
  inPanel: false,
  /** 纸张上的素材元素 */
  elements: [
    { id: "1", type: "text", x: 0, y: 0, width: 50, height: 100, content: "Hello World" },
    { id: "2", type: "table", x: 0, y: 0, width: 50, height: 100, rows: 3, cols: 3 }
  ] as Element[],
  /** 当前选中的元素 id */
  selectedId: null as string | null
});
