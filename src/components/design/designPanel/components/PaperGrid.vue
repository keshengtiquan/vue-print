<template>
  <svg
    class="paper-grid"
    :viewBox="`0 0 ${paperW} ${paperH}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <!--
        单一均匀网格（10mm），一个 pattern 铺满整张纸，不用手写几十条线。
        尺寸单位是 mm（viewBox 空间），所以网格会随画布缩放一起放大缩小 ——
        这是网格该有的行为，就像放大一张方格纸。
        线宽同样用 mm，在 SCALE_MAX(200%) 下约 0.5px，不会糊成块。
      -->
      <pattern id="paper-grid-cell" :width="CELL" :height="CELL" patternUnits="userSpaceOnUse">
        <path
          :d="`M ${CELL} 0 L 0 0 0 ${CELL}`"
          fill="none"
          class="paper-grid__line"
          stroke-width="0.25"
        />
      </pattern>
    </defs>

    <rect :width="paperW" :height="paperH" fill="url(#paper-grid-cell)" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useDesignStore } from "@/store/modules/design";

/** 网格间距（mm） */
const CELL = 10;

const store = useDesignStore();
const paperW = computed(() => store.paper.widthMm);
const paperH = computed(() => store.paper.heightMm);
</script>

<style scoped>
/*
  网格是**背景**参考，所以挂在元素层之下（与挂在元素之上的页边距线相反）：
  元素盖住网格才符合"网格是纸纹"的直觉，也不会干扰内容的可读性。
*/
.paper-grid {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.paper-grid__line {
  stroke: var(--color-muted-foreground, #64748b);
  opacity: 0.22;
}
</style>