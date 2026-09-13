<template>
  <div class="h-full w-full" :style="textStyle">{{ element.content }}</div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CSSProperties } from "vue";
import { designState } from "@/components/design/designState";
import { mmToPx } from "@/lib/utils";
import type { TextElement } from "@/components/design/types";

const props = defineProps<{ element: TextElement }>();

const pxPerMm = computed(() => mmToPx(1) * designState.scale);
const textStyle = computed<CSSProperties>(() => ({
  color: props.element.color,
  fontFamily: props.element.fontFamily,
  fontSize: `${(props.element.fontSize ?? 4) * pxPerMm.value}px`,
  fontWeight: props.element.fontWeight,
  textAlign: props.element.textAlign,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
}));
</script>
