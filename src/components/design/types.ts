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
  /** 每页重复：多页文档里每一页都绘制该元素（页眉/页脚/流水号类）。默认 false */
  repeatOnEachPage?: boolean;
  /** 是否参与打印输出。默认 true；画布上的定位标注/备注可关掉 */
  printable?: boolean;
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

/**
 * 辅助线方向。注意它与拖出它的标尺是**交叉**的：
 * - "v" 竖线：位置由横坐标决定，从**顶部水平标尺**向下拖出
 * - "h" 横线：位置由纵坐标决定，从**左侧垂直标尺**向右拖出
 */
export type GuideDir = "v" | "h";

/**
 * 辅助线：用户手动拖出的对齐参考线。
 * pos 单位 mm、相对**纸张左上角原点**（与元素坐标系一致），
 * 因此缩放、切换纸张方向都自动跟随，不需要维护两份坐标。
 */
export interface Guide {
  id: string;
  dir: GuideDir;
  pos: number;
}
