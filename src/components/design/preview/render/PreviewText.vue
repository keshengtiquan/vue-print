<template>
  <div class="h-full w-full" :style="containerStyle">
    <div :style="contentStyle">{{ text }}</div>
  </div>
</template>

<script setup lang="ts">
/**
 * 文本元素的**纯渲染**组件（预览 / 导出 / 打印共用）。
 *
 * "纯"指的是：没有内联编辑、没有拖拽、没有字段 drop、没有缩放手柄、没有右键菜单。
 * 设计态那个 `designPanel/.../TextElement.vue` 里绝大部分代码是交互，
 * 给它们加 `mode` 开关会把两套逻辑绞在一起 —— 而设计态是**绝对不能被回归**的部分。
 *
 * 但**样式计算必须共享**（`components/design/render/style.ts`）：
 * 两个视图要画的是同一个元素、同一组字号间距，只有缩放因子不同。
 * 两边各写一份的后果是"设计态调完字号、预览里忘了再调一遍"，
 * 而它的表现就是"预览里看着对、打出来错位"（§5.2）。
 */
import { computed } from "vue";
import { renderTemplate, type TemplateContext } from "@/lib/template";
import { textContainerStyle, textContentStyle } from "@/components/design/render/style";
import type { TextElement } from "@/components/design/types";

const props = defineProps<{
  element: TextElement;
  ctx: TemplateContext;
  pxPerMm: number;
}>();

const containerStyle = computed(() => textContainerStyle(props.element, props.pxPerMm));
const contentStyle = computed(() => textContentStyle(props.element, props.pxPerMm));

/**
 * 值的渲染。
 *
 * **这里是预览层"把占位符变成值"的入口之一**（另一个在单元格里）。
 * `ctx` 由 `useDataBinding.renderContext` 构造（`onMissing: "blank"`），
 * 所以取不到值就是空白 —— 预览是"打印所见"，不能把 `{品名}` 打到纸上。
 * 想知道"为什么空"，看警告条上的体检清单（`preview/inspect.ts`）。
 */
const text = computed(() => renderTemplate(props.element.content, props.ctx));
</script>
