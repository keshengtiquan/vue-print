<template>
  <table class="h-full w-full border-collapse">
    <tbody>
      <tr v-for="r in element.rows" :key="r">
        <td v-for="c in element.cols" :key="c" :style="cellStyle"></td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CSSProperties } from "vue";
import { designState } from "@/components/design/designState";
import { mmToPx } from "@/lib/utils";
import type { TableElement } from "@/components/design/types";

const props = defineProps<{ element: TableElement }>();

const pxPerMm = computed(() => mmToPx(1) * designState.scale);
const cellStyle = computed<CSSProperties>(() => {
  const c = props.element.cellStyle ?? {};
  return {
    border: `${(c.borderWidth ?? 0.1) * pxPerMm.value}px solid ${c.borderColor ?? "#000"}`,
    padding: `${(c.padding ?? 0.5) * pxPerMm.value}px`,
  };
});
</script>
