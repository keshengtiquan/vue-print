<template>
  <canvas
    ref="canvasRef"
    class="block touch-none select-none"
    :class="orientation === 'vertical' ? 'cursor-ns-resize' : 'cursor-ew-resize'"
    @pointerdown="onPointerDown"
  ></canvas>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, useTemplateRef, watch } from "vue";
import { mmToPx } from "@/lib/utils";
import { useDrag } from "../composables/useDrag";

const props = defineProps<{
  orientation: "vertical" | "horizontal";
  viewportPx: number; /** 尺条可见长度（屏幕 px，不随缩放变化） */
  paperScale?: number; /** 缩放倍数，1 = 100%（96dpi），>1 放大 */
  guide?: number | null; /** 光标在尺条上的位置（px，沿测量轴，相对尺条起点）；null 表示不显示 */
  origin?: number; /** 0mm 在尺条上的 px 位置（标尺原点偏移，相对尺条起点） */
}>();

/**
 * 拖出辅助线的两个事件：
 * - preview：拖拽过程中的实时位置（mm，相对纸张原点），松手或取消时传 null
 * - create：松手落定，parent 据此真正写入 store
 *
 * 换算成 mm 是本组件的职责 —— 只有它知道自己的 origin 与 pxPerMm；
 * 而"这个位置合不合法"（是否超出纸张）交给 parent 判断，那里才有纸张尺寸。
 */
const emit = defineEmits<{
  (e: "guide-preview", pos: number | null): void;
  (e: "guide-create"): void;
}>();

const canvasRef = useTemplateRef("canvasRef");
let resizeObserver: ResizeObserver | undefined;
const horizontal = computed(() => props.orientation === "horizontal");

/** 缩放 → 每 mm 对应的屏幕 px。draw() 与拖拽换算共用同一个值 */
const pxPerMm = computed(() => mmToPx(1) * Math.max(0.01, props.paperScale ?? 1));

/** 低于这个位移不算拖拽，只是点击 —— 避免手抖凭空多出一条辅助线 */
const DRAG_THRESHOLD_PX = 2;
let dragging = false;
let draftMm = 0;

/** 屏幕 px（沿测量轴，相对尺条起点）→ 纸张 mm。可能超出纸张范围，由 parent 钳制 */
function toMm(alongPx: number) {
  return (alongPx - (props.origin ?? 0)) / pxPerMm.value;
}

const drag = useDrag({
  onMove: (e, dx, dy) => {
    const canvas = canvasRef.value;
    if (!canvas) return;
    if (!dragging) {
      // 阈值前置：没过阈值就完全不开始，避免"点一下标尺"也 emit 出一帧预览
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      dragging = true;
    }
    const rect = canvas.getBoundingClientRect();
    const along = horizontal.value ? e.clientX - rect.left : e.clientY - rect.top;
    draftMm = toMm(along);
    emit("guide-preview", draftMm);
  },
  onEnd: () => {
    if (dragging) {
      emit("guide-create");
      emit("guide-preview", null);
    }
    dragging = false;
  }
});

function onPointerDown(e: PointerEvent) {
  // 阻止原生文本选择/拖拽，否则和自绘 canvas 的拖拽打架
  e.preventDefault();
  e.stopPropagation();
  dragging = false;
  drag.start(e);
}

onUnmounted(drag.dispose);

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
  const bg = style.getPropertyValue("--ruler-bg").trim() || "#F8F9FC";
  const tick = style.getPropertyValue("--ruler-tick").trim() || "#C1C7CD";
  const tickMajor = style.getPropertyValue("--ruler-tick-major").trim() || "#5F6368";
  const label = style.getPropertyValue("--ruler-label").trim() || "#5F6368";
  const guideColor = style.getPropertyValue("--ruler-guide").trim() || "#ff4d4f";
  const fontSize = Number(style.getPropertyValue("--ruler-font-size").trim()) || 9;

  // 背景
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, horizontal.value ? length : thickness, horizontal.value ? thickness : length);

  const stepPx = pxPerMm.value; // 每 mm 对应的屏幕 px
  const origin = props.origin ?? 0; // 0mm 在尺条上的 px 位置

  // 自适应步长（mm）：放大刻度变密、缩小变疏
  const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const minorMinPx = 3; // 最小刻度间距（px）
  const minor = STEPS.find((s) => s * stepPx >= minorMinPx) ?? STEPS[STEPS.length - 1];
  const medium = minor * 5; // 中刻度
  const major = minor * 10; // 长刻度 + mm 数字

  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  const firstMm = Math.ceil(-origin / stepPx / minor) * minor; // 首个可见刻度（可能为负）
  const lastTick = Math.floor((length - origin) / stepPx / minor) * minor;
  for (let mm = firstMm; mm <= lastTick; mm += minor) {
    const pos = Math.round(origin + mm * stepPx) + 0.5; // 0.5 保证 1px 线条清晰
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
/*
  canvas 既是刻度画板，也是拖出辅助线的把手：
  - touch-action: none 阻止触控板/触屏滚动抢占 pointer 手势（已转为模板 touch-none）；
  - user-select: none 阻止拖出时把标尺区域刷蓝（已转为模板 select-none）。
  光标方向表示"能往哪个方向拖"：顶部水平尺沿 X 拖 → ew-resize，
  左侧垂直尺沿 Y 拖 → ns-resize。**拖出的线本身垂直于拖拽方向**，别混淆。
  以上三项都已转为模板上的 Tailwind 工具类，这里不再重复。

  下面这组变量是**给 JS 读的绘图配置，不是样式规则**，必须留在 CSS 里：
  draw() 用 getComputedStyle(canvas).getPropertyValue("--ruler-bg") 取值喂给 canvas 2D
  上下文，并各自带硬编码兜底色。若改写成 Tailwind 任意属性或挪到别处，取值会落到兜底
  分支，canvas 配色静默偏离设计值 —— 而且不报错，很难发现。**不要动这组变量。**
*/
canvas {
  --ruler-bg: #f8f9fc;
  --ruler-tick: #c1c7cd;
  --ruler-tick-major: #5f6368;
  --ruler-label: #5f6368;
  --ruler-guide: #2c08df;
  --ruler-font-size: 9px;
}
</style>
