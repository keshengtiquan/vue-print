export type ElementType = "text" | "table" | "line" | "image";

/** 尺寸手柄：8 个方向 */
export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number; // 左上角，mm（相对纸张左上角原点）
  y: number; // 左上角，mm
  width: number; // mm
  height: number; // mm
  rotation?: number; // 度，绕元素中心，默认 0
  zIndex?: number; // 默认 0
}

export interface TextElement extends BaseElement {
  type: "text";
  content: string;
  fontFamily?: string;
  fontSize?: number; // mm
  fontWeight?: string;
  color?: string;
  textAlign?: "left" | "center" | "right";
}

export interface TableElement extends BaseElement {
  type: "table";
  rows: number;
  cols: number;
  cellStyle?: { borderColor?: string; borderWidth?: number; padding?: number };
}

export interface LineElement extends BaseElement {
  type: "line";
  /** 端点，相对元素左上角 (x,y) 的局部坐标，mm，范围 [0,width]×[0,height] */
  start: { x: number; y: number };
  end: { x: number; y: number };
  stroke: { color: string; width: number }; // 线宽 mm
  dash: number[] | null; // 虚线模式（mm），null = 实线
}

export interface ImageElement extends BaseElement {
  type: "image";
  src: string;
  objectFit: "fill" | "contain" | "cover" | "none";
}

export type Element = TextElement | TableElement | LineElement | ImageElement;
