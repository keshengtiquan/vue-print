import type { Component } from "vue";
import TextElement from "./TextElement.vue";
import TableElement from "./TableElement.vue";
import LineElement from "./LineElement.vue";
import ImageElement from "./ImageElement.vue";
import type { ElementType } from "@/components/design/types";

/** 策略注册表：按元素类型选择渲染组件 */
export const elementComponents: Record<ElementType, Component> = {
  text: TextElement,
  table: TableElement,
  line: LineElement,
  image: ImageElement,
};
