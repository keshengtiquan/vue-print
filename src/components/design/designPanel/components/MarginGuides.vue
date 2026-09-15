<template>
  <!--
    覆盖整张纸的辅助层。三条硬约束（原 scoped 样式里的注释，改动时必须保留）：
    - pointer-events: none —— 绝不能拦截底下元素的选中/拖动/缩放
      （画布根节点有 @pointerdown="deselect"，一旦被拦截会导致选中失效）；
    - z-index 远高于元素（元素 zIndex 从 0 起），参考线应始终可见；
    - 刻意不用 primary 色：蓝在本项目代表"选中/激活"，留给元素选中框，
      边距线是背景参考语义，用中性色退到后景。
  -->
  <svg
    class="pointer-events-none absolute inset-0 z-9999 size-full overflow-visible"
    :viewBox="`0 0 ${paperW} ${paperH}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <!--
      上 / 下 / 左 / 右 四条贯穿参考线：横线走满纸宽，竖线走满纸高。
      vector-effect="non-scaling-stroke" 让线宽与 dash 间隔都在屏幕像素空间计算，
      缩放画布时恒定 1px 细线 + 3/3 的虚线节奏。

      命中态（拖拽吸附到这条线）转实线 + 主题色 + 全不透明：吸附必须"看得见"，
      元素悄悄粘住会被误判成卡顿或掉帧。用 primary 不违背"边距线用中性色"的原则 ——
      那条原则针对静息态，命中态语义本就是"激活/对齐"，与元素选中框同一语义色。

      注意用**三元切换**而不是叠加类：Tailwind 同类工具类之间是按生成顺序决胜的，
      同时挂 stroke-muted-foreground 与 stroke-primary 结果不可控。
    -->
    <line
      v-for="l in lines"
      :key="l.key"
      class="transition-[stroke,opacity] duration-80 ease-linear"
      :class="
        activeSnapKeys.includes(l.key)
          ? 'stroke-primary opacity-100'
          : 'stroke-muted-foreground opacity-50'
      "
      :x1="l.x1"
      :y1="l.y1"
      :x2="l.x2"
      :y2="l.y2"
      stroke-width="1"
      :stroke-dasharray="activeSnapKeys.includes(l.key) ? 'none' : '3 3'"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useDesignStore } from "@/store/modules/design";
import { useSnapFeedback, marginKey, type SnapKey } from "../composables/useSnapFeedback";

const store = useDesignStore();
const { activeSnapKeys } = useSnapFeedback();

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
const lines = computed<{ key: SnapKey; x1: number; y1: number; x2: number; y2: number }[]>(() => {
  const x0 = m.value.left;
  const y0 = m.value.top;
  const x1 = paperW.value - m.value.right;
  const y1 = paperH.value - m.value.bottom;
  return [
    { key: marginKey("top"), x1: 0, y1: y0, x2: paperW.value, y2: y0 }, // 上：横向贯穿
    { key: marginKey("bottom"), x1: 0, y1: y1, x2: paperW.value, y2: y1 }, // 下：横向贯穿
    { key: marginKey("left"), x1: x0, y1: 0, x2: x0, y2: paperH.value }, // 左：纵向贯穿
    { key: marginKey("right"), x1: x1, y1: 0, x2: x1, y2: paperH.value } // 右：纵向贯穿
  ];
});
</script>
