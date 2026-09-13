<template>
  <canvas ref="canvasRef" :class="orientation"></canvas>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, useTemplateRef, watch } from "vue";
import { mmToPx } from "@/lib/utils";

const props = defineProps<{
  orientation: "vertical" | "horizontal";
  viewportPx: number; /** 尺条可见长度（屏幕 px，不随缩放变化） */
  paperScale?: number; /** 缩放倍数，1 = 100%（96dpi），>1 放大 */
  guide?: number | null; /** 光标在尺条上的位置（px，沿测量轴，相对尺条起点）；null 表示不显示 */
  origin?: number; /** 0mm 在尺条上的 px 位置（标尺原点偏移，相对尺条起点） */
}>();

const canvasRef = useTemplateRef("canvasRef");
let resizeObserver: ResizeObserver | undefined;
const horizontal = computed(() => props.orientation === "horizontal");

const draw = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const thickness = 22;
  const length = Math.max(0, Math.round(props.viewportPx));
  const dpr = window.devicePixelRatio || 1;
  const cssW = horizontal.value ? length : thickness;
  const cssH = horizontal.value ? thickness : length;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const style = getComputedStyle(canvas);
  const bg = style.getPropertyValue("--pd-ruler-bg").trim() || "#F8F9FC";
  const tick = style.getPropertyValue("--pd-ruler-tick").trim() || "#C1C7CD";
  const tickMajor = style.getPropertyValue("--pd-ruler-tick-major").trim() || "#5F6368";
  const label = style.getPropertyValue("--pd-ruler-label").trim() || "#5F6368";
  const guideColor = style.getPropertyValue("--pd-ruler-guide").trim() || "#ff4d4f";
  const fontSize = Number(style.getPropertyValue("--pd-ruler-font-size").trim()) || 9;

  // 背景
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, horizontal.value ? length : thickness, horizontal.value ? thickness : length);

  // 缩放 → 每 mm 对应的屏幕 px
  const scale = Math.max(0.01, props.paperScale ?? 1);
  const pxPerMm = mmToPx(1) * scale;
  const origin = props.origin ?? 0; // 0mm 在尺条上的 px 位置

  // 自适应步长（mm）：放大刻度变密、缩小变疏
  const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const minorMinPx = 3; // 最小刻度间距（px）
  const minor = STEPS.find((s) => s * pxPerMm >= minorMinPx) ?? STEPS[STEPS.length - 1];
  const medium = minor * 5; // 中刻度
  const major = minor * 10; // 长刻度 + mm 数字

  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  const firstMm = Math.ceil(-origin / pxPerMm / minor) * minor; // 首个可见刻度（可能为负）
  const lastMm = Math.floor((length - origin) / pxPerMm / minor) * minor;
  for (let mm = firstMm; mm <= lastMm; mm += minor) {
    const pos = Math.round(origin + mm * pxPerMm) + 0.5; // 0.5 保证 1px 线条清晰
    const isMajor = mm % major === 0;
    const isMedium = mm % medium === 0;
    const len = isMajor ? 12 : isMedium ? 8 : 4;

    ctx.strokeStyle = isMajor ? tickMajor : tick;
    ctx.beginPath();
    if (horizontal.value) {
      ctx.moveTo(pos, thickness);
      ctx.lineTo(pos, thickness - len);
    } else {
      ctx.moveTo(thickness, pos);
      ctx.lineTo(thickness - len, pos);
    }
    ctx.stroke();

    if (isMajor) {
      ctx.fillStyle = label;
      if (horizontal.value) {
        ctx.fillText(String(mm), pos + 3, fontSize + 2);
      } else {
        ctx.save();
        ctx.translate(fontSize + 2, pos + 3);
        ctx.rotate(Math.PI / 2); // 竖向数字，自上而下阅读
        ctx.fillText(String(mm), 0, 0);
        ctx.restore();
      }
    }
  }

  // 光标引导线
  if (props.guide != null && props.guide >= 0 && props.guide <= length) {
    const g = Math.round(props.guide) + 0.5;
    ctx.strokeStyle = guideColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (horizontal.value) {
      ctx.moveTo(g, 0);
      ctx.lineTo(g, thickness);
    } else {
      ctx.moveTo(0, g);
      ctx.lineTo(thickness, g);
    }
    ctx.stroke();
  }
};

onMounted(() => {
  draw();
  if (canvasRef.value) {
    resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvasRef.value);
  }
});

watch(() => props.orientation, draw);
watch(() => [props.viewportPx, props.paperScale, props.origin], draw);
watch(() => props.guide, draw);

onUnmounted(() => {
  resizeObserver?.disconnect();
});
</script>

<style scoped>
canvas {
  display: block;
  --pd-ruler-bg: #f8f9fc;
  --pd-ruler-tick: #c1c7cd;
  --pd-ruler-tick-major: #5f6368;
  --pd-ruler-label: #5f6368;
  --pd-ruler-guide: #2c08df;
  --pd-ruler-font-size: 9px;
}
</style>
