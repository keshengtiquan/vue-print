<template>
  <svg class="block h-full w-full overflow-visible">
    <line
      :x1="geom.x1"
      :y1="geom.y1"
      :x2="geom.x2"
      :y2="geom.y2"
      :stroke="element.stroke.color"
      :stroke-width="geom.strokeWidth"
      :stroke-dasharray="geom.dashArray"
    />
  </svg>
</template>

<script setup lang="ts">
/**
 * 线条的纯渲染组件。
 *
 * 线条没有"内容"、不吃数据 —— 它与设计态的唯一差别也就是那个 `pxPerMm`。
 * 所以这里连多余的注释都不需要：几何走共享纯函数，别的什么都没有。
 * （保留独立组件而不是在 PreviewPage 里内联 div，是为了让四种元素的渲染
 * 结构一致 —— 将来加"条码 / 二维码"时照着抄一份就行。）
 */
import { computed } from "vue";
import { lineGeometry } from "@/components/design/render/style";
import type { LineElement } from "@/components/design/types";

const props = defineProps<{
  element: LineElement;
  pxPerMm: number;
}>();

const geom = computed(() => lineGeometry(props.element, props.pxPerMm));
</script>
