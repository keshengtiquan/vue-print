<template>
  <svg class="block h-full w-full overflow-visible">
    <line
      :x1="sx"
      :y1="sy"
      :x2="ex"
      :y2="ey"
      :stroke="element.stroke.color"
      :stroke-width="strokeWidth"
      :stroke-dasharray="dashArray"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useDesignStore } from "@/store/modules/design";
import { mmToPx } from "@/lib/utils";
import type { LineElement } from "@/components/design/types";

const designState = useDesignStore();

const props = defineProps<{ element: LineElement }>();

const pxPerMm = computed(() => mmToPx(1) * designState.scale);
const sx = computed(() => props.element.start.x * pxPerMm.value);
const sy = computed(() => props.element.start.y * pxPerMm.value);
const ex = computed(() => props.element.end.x * pxPerMm.value);
const ey = computed(() => props.element.end.y * pxPerMm.value);
const strokeWidth = computed(() => props.element.stroke.width * pxPerMm.value);
const dashArray = computed(() =>
  props.element.dash ? props.element.dash.map((d) => d * pxPerMm.value).join(" ") : undefined
);
</script>
