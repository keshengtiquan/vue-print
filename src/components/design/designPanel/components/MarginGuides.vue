<template>
  <svg
    class="margin-guides"
    :viewBox="`0 0 ${paperW} ${paperH}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <!--
      上 / 下 / 左 / 右 四条贯穿参考线：横线走满纸宽，竖线走满纸高。
      vector-effect="non-scaling-stroke" 让线宽与 dash 间隔都在屏幕像素空间计算，
      缩放画布时恒定 1px 细线 + 3/3 的虚线节奏。
    -->
    <line
      v-for="(l, i) in lines"
      :key="i"
      class="margin-guides__line"
      :x1="l.x1"
      :y1="l.y1"
      :x2="l.x2"
      :y2="l.y2"
      stroke-width="1"
      stroke-dasharray="3 3"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useDesignStore } from "@/store/modules/design";

const store = useDesignStore();

const m = computed(() => store.marginMm);
const paperW = computed(() => store.paper.widthMm);
const paperH = computed(() => store.paper.heightMm);

/**
 * 四条贯穿参考线，按 上 / 下 / 左 / 右 排列。
 * 横线走满整个纸宽（0 → paperW），竖线走满整个纸高（0 → paperH）——
 * 参照 Figma / PS 的 guide line 语义，而不是只框住内容区，
 * 这样即使元素跨出边界，也能一眼读出它是否越过了某条边距线。
 * 边距设得比纸张还大时坐标会落到画布外，由 viewBox 自动裁掉，无需额外钳制。
 */
const lines = computed(() => {
  const x0 = m.value.left;
  const y0 = m.value.top;
  const x1 = paperW.value - m.value.right;
  const y1 = paperH.value - m.value.bottom;
  return [
    { x1: 0, y1: y0, x2: paperW.value, y2: y0 }, // 上：横向贯穿
    { x1: 0, y1: y1, x2: paperW.value, y2: y1 }, // 下：横向贯穿
    { x1: x0, y1: 0, x2: x0, y2: paperH.value }, // 左：纵向贯穿
    { x1: x1, y1: 0, x2: x1, y2: paperH.value } // 右：纵向贯穿
  ];
});
</script>

<style scoped>
/*
  覆盖整张纸的辅助层：
  - pointer-events: none 是硬要求 —— 绝不能拦截底下元素的选中/拖动/缩放
    （画布根节点有 @pointerdown="deselect"，一旦被拦截会导致选中失效）。
  - z-index 远高于元素（元素 zIndex 从 0 起），参考线应始终可见。
  - 刻意不用 primary 色：蓝在本项目代表"选中/激活"，留给元素选中框；
    边距线是背景参考语义，用中性色退到后景。
*/
.margin-guides {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 9999;
  overflow: visible;
}

.margin-guides__line {
  stroke: var(--color-muted-foreground, #64748b);
  opacity: 0.5;
}
</style>