import type { Component } from "vue";
import { Type, LineStyle } from "@lucide/vue";
import type { Element, ElementType } from "@/components/design/types";

/**
 * 逐成员 Omit。
 * 原生 Omit<A|B, K> 会先把联合塌陷成公共字段再剔除，导致 content / fontSize
 * 这类**类型专属**字段被吃掉。这里让 Omit 分配到联合的每个成员上。
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * 素材台的一项：描述"拖到画布上会变成什么元素"。
 *
 * 清单驱动：新增素材 = 往这里加一条，素材台组件自动渲染对应卡片。
 * 不在组件里硬编码素材列表，避免 UI 与数据耦合。
 */
export interface MaterialDef {
  /** 素材库内 id（区别于元素实例 id）。拖拽时它是 dataTransfer 里传的唯一载荷 */
  id: string;
  /** 对应的元素类型，drop 时交给 store.createElement */
  type: ElementType;
  /** 卡片显示名 */
  label: string;
  /** 卡片图标 */
  icon: Component;
  /**
   * 创建元素时的默认字段。
   * 不含 id / x / y / type —— id 由 store 生成，x/y 由落点决定，type 就是上面的字段。
   */
  defaults: DistributiveOmit<Partial<Element>, "id" | "x" | "y" | "type">;
}

export const materials: MaterialDef[] = [
  {
    id: "mat-text",
    type: "text",
    label: "文本",
    icon: Type,
    defaults: { width: 50, height: 12, content: "文本", fontSize: 4 }
  },
  {
    id: "mat-line",
    type: "line",
    label: "线",
    icon: LineStyle,
    defaults: {
      width: 30,
      height: 4,
      start: { x: 0, y: 2 },
      end: { x: 30, y: 2 },
      stroke: { color: "#000", width: 0.26 },
      dash: null
    }
  }
];

/**
 * 拖拽载荷的 MIME。不能用 text/plain 单独承载 —— 画布也接受外部拖入的文本，
 * 会被误认成素材。自定义类型 + text/plain 兜底双写。
 */
export const MATERIAL_MIME = "component-type";

/** 按 id 回查素材定义；drop 端用 */
export function findMaterial(id: string): MaterialDef | null {
  return materials.find((m) => m.id === id) ?? null;
}
