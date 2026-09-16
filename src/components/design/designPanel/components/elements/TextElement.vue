<template>
  <div class="h-full w-full" :style="containerStyle">
    <div :style="textStyle">{{ element.content }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CSSProperties } from "vue";
import { useDesignStore } from "@/store/modules/design";
import { mmToPx } from "@/lib/utils";
import type { TextElement } from "@/components/design/types";

const designState = useDesignStore();

const props = defineProps<{ element: TextElement }>();

const pxPerMm = computed(() => mmToPx(1) * designState.scale);
const verticalAlignment = computed(() =>
  props.element.verticalAlign === "middle"
    ? "center"
    : props.element.verticalAlign === "bottom"
      ? "flex-end"
      : "flex-start"
);

const horizontalAlignment = computed(() =>
  props.element.textAlign === "center"
    ? "center"
    : props.element.textAlign === "right"
      ? "flex-end"
      : "flex-start"
);

const containerStyle = computed<CSSProperties>(() => ({
  backgroundColor: props.element.backgroundColor,
  borderColor: props.element.borderColor,
  borderStyle: props.element.borderStyle,
  borderWidth: `${(props.element.borderWidth ?? 0) * pxPerMm.value}px`,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  justifyContent: verticalAlignment.value,
  // 竖排文字的左右位置属于 flex 交叉轴，text-align 无法控制它。
  alignItems: props.element.layout === "vertical" ? horizontalAlignment.value : undefined
}));

const textStyle = computed<CSSProperties>(() => ({
  color: props.element.color,
  fontFamily: props.element.fontFamily,
  fontSize: `${(props.element.fontSize ?? 4) * pxPerMm.value}px`,
  fontWeight: props.element.fontWeight,
  textAlign: props.element.textAlign,
  writingMode: props.element.layout === "vertical" ? "vertical-rl" : "horizontal-tb",
  width: props.element.layout === "vertical" ? undefined : "100%",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word"
}));
</script>
