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
import { computed } from "vue";
import { useDesignStore } from "@/store/modules/design";
import { mmToPx } from "@/lib/utils";
import { lineGeometry } from "@/components/design/render/style";
import type { LineElement } from "@/components/design/types";

const designState = useDesignStore();

const props = defineProps<{ element: LineElement }>();

const pxPerMm = computed(() => mmToPx(1) * designState.scale);

/** 端点、线宽、虚线全部来自 `render/style.ts` 的共享函数（预览渲染调的是同一个） */
const geom = computed(() => lineGeometry(props.element, pxPerMm.value));
</script>
