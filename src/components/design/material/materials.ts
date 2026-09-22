import type { Component } from "vue";
import { Type, LineStyle, Image, Table } from "@lucide/vue";
import type { Element, ElementType } from "@/components/design/types";
import { createTableDefaults } from "@/components/design/table/model";

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
   *
   * 注意：这是**模块级常量、单份模板**，里面的嵌套结构（表格的 cells/colWidths、
   * 线条的 start/end/stroke）在整份清单里只有一份实例。
   * 消费时**必须**交给 `store.createElement`（它内部做深拷贝），
   * 不要自己 `{...m.defaults}` 后直接塞进 elements —— 浅展开会让同种素材的多个元素
   * 共享同一份内脏：改 A 的行，B 跟着变。踩过一次，见 cloneElementPayload 的注释。
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
  },
  {
    id: "mat-img",
    type: "image",
    label: "图片",
    icon: Image,
    defaults: { width: 50, height: 50, objectFit: "contain" }
  },
  {
    id: "mat-table",
    type: "table",
    label: "表格",
    icon: Table,
    // 表格的默认值不只是宽高：行列尺寸是**必须**与元素框一致的数据
    // （Σ colWidths ≡ width），所以由 createTableDefaults 一次算全，
    // 不要让 TableElement 渲染时再去补 —— 那等于把不变量交给消费方维护。
    defaults: {
      width: 100,
      height: 50,
      ...createTableDefaults(100, 50, 3, 5)
    }
  }
];

/**
 * 拖拽载荷的 MIME。不能用 text/plain 单独承载 —— 画布也接受外部拖入的文本，
 * 会被误认成素材。自定义类型 + text/plain 兜底双写。
 */
export const MATERIAL_MIME = "component-type";

/*
 * 【素材 id 的主通道】—— dataTransfer 之外的进程内备份。
 *
 * 真机观测（2026-09-22，老板环境）：dragstart 时 setData 成功、types =
 * ["component-type"]，到 dragenter/drop 时 types 变成 []——有浏览器扩展在
 * dragstart 之后清空 drag data store。而规范规定 data store 只在 dragstart
 * 阶段可写，页面代码事后**无法自救**，所以素材 id 另走一份模块变量：
 * dragstart 写入，drop **优先读它**，dataTransfer 只做兜底（跨窗口拖素材
 * 不在需求内，放弃之）。
 *
 * 不用 ref()：它不是视图状态，纯模块变量即可。
 */
let draggingMaterialId: string | null = null;

/** dragstart 时写入；非素材拖拽（如字段拖拽）必须显式写 null 防止上次残留被误读 */
export function setDraggingMaterialId(id: string | null): void {
  draggingMaterialId = id;
}

export function getDraggingMaterialId(): string | null {
  return draggingMaterialId;
}

/** 按 id 回查素材定义；drop 端用 */
export function findMaterial(id: string): MaterialDef | null {
  return materials.find((m) => m.id === id) ?? null;
}
