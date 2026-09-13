<template>
  <div
    ref="rootRef"
    class="relative overflow-hidden bg-gray-50"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
    @pointerdown="deselect"
  >
    <Ruler
      class="absolute top-5.5 left-0"
      orientation="vertical"
      :viewport-px="rulerGeom.viewH"
      :paper-scale="designState.scale"
      :origin="originY"
      :guide="guideY"
    />
    <Ruler
      class="absolute top-0 left-5.5"
      orientation="horizontal"
      :viewport-px="rulerGeom.viewW"
      :paper-scale="designState.scale"
      :origin="originX"
      :guide="guideX"
    />
    <div
      ref="scrollRef"
      class="absolute top-5.5 left-5.5 right-0 bottom-0 overflow-auto"
      @scroll="onScroll"
      @wheel="onWheel"
    >
      <div class="relative" :style="{ width: `${contentW}px`, height: `${contentH}px` }">
        <div
          class="absolute overflow-hidden bg-white shadow"
          :style="{ left: `${paperX}px`, top: `${paperY}px`, width: `${paperW}px`, height: `${paperH}px` }"
        >
          <ElementLayer />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from "vue";
import { useResizeObserver } from "@vueuse/core";
import Ruler from "./components/ruler.vue";
import ElementLayer from "./components/elements/ElementLayer.vue";
import { designState, SCALE_MIN, SCALE_MAX } from "@/components/design/designState";
import { mmToPx, pxToMm } from "@/lib/utils";

const RULER_SIZE = 22;
const PAPER_MARGIN = 32;

const rootRef = ref<HTMLElement | null>(null);
const scrollRef = ref<HTMLElement | null>(null);
const rulerGeom = reactive({ viewW: 0, viewH: 0 });
const scroll = reactive({ x: 0, y: 0 });
const mouse = reactive({ x: 0, y: 0 }); // 相对 rootRef 的 px
const inPanel = ref(false);

// 纸张几何（px，相对内容区）
const pxPerMm = computed(() => mmToPx(1) * designState.scale);
const paperW = computed(() => designState.paper.widthMm * pxPerMm.value);
const paperH = computed(() => designState.paper.heightMm * pxPerMm.value);
const contentW = computed(() => Math.max(rulerGeom.viewW, paperW.value + PAPER_MARGIN * 2));
const contentH = computed(() => Math.max(rulerGeom.viewH, paperH.value + PAPER_MARGIN * 2));
const paperX = computed(() => (contentW.value - paperW.value) / 2); // 横向居中
const paperY = computed(() => PAPER_MARGIN); // 顶部留白

// 标尺原点偏移（0mm 落在尺条上的 px 位置，随滚动变化）
const originX = computed(() => paperX.value - scroll.x);
const originY = computed(() => paperY.value - scroll.y);

// 引导线位置（尺条局部 px）
const guideX = computed(() => (inPanel.value ? mouse.x - RULER_SIZE : null));
const guideY = computed(() => (inPanel.value ? mouse.y - RULER_SIZE : null));

function onScroll() {
  scroll.x = scrollRef.value?.scrollLeft ?? 0;
  scroll.y = scrollRef.value?.scrollTop ?? 0;
}

function onMouseMove(e: MouseEvent) {
  const rect = rootRef.value?.getBoundingClientRect();
  if (!rect) return;
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
  inPanel.value = true;
  const scale = designState.scale || 1;
  designState.mouse.x = pxToMm(mouse.x - RULER_SIZE - originX.value) / scale;
  designState.mouse.y = pxToMm(mouse.y - RULER_SIZE - originY.value) / scale;
  designState.inPanel = true;
}

function onMouseLeave() {
  inPanel.value = false;
  designState.inPanel = false;
}

const deselect = () => {
  designState.selectedId = null;
};

// Ctrl/⌘+滚轮缩放（锚定光标，普通滚轮走原生滚动）
function onWheel(e: WheelEvent) {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  const rect = scrollRef.value?.getBoundingClientRect();
  if (!rect) return;
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  zoomAt(clamp(designState.scale * factor, SCALE_MIN, SCALE_MAX), e.clientX - rect.left, e.clientY - rect.top);
}

function zoomAt(next: number, ax: number, ay: number) {
  const old = designState.scale;
  if (next === old) return;
  const pxPerMmOld = mmToPx(1) * old;
  const mmX = (scroll.x + ax - paperX.value) / pxPerMmOld; // 锚点处纸张 mm（缩放不变）
  const mmY = (scroll.y + ay - paperY.value) / pxPerMmOld;
  designState.scale = next; // 触发 paperX/paperW/contentW 重算
  const pxPerMmNew = mmToPx(1) * next;
  const targetX = clamp(paperX.value + mmX * pxPerMmNew - ax, 0, Math.max(0, contentW.value - rulerGeom.viewW));
  const targetY = clamp(paperY.value + mmY * pxPerMmNew - ay, 0, Math.max(0, contentH.value - rulerGeom.viewH));
  scroll.x = targetX;
  scroll.y = targetY;
  nextTick(() => {
    // 等内容尺寸重渲染后再落到 DOM，避免浏览器按旧尺寸钳制
    if (scrollRef.value) {
      scrollRef.value.scrollLeft = targetX;
      scrollRef.value.scrollTop = targetY;
    }
  });
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const measureRuler = () => {
  const area = rootRef.value;
  if (!area) return;

  rulerGeom.viewW = area.clientWidth - RULER_SIZE;
  rulerGeom.viewH = area.clientHeight - RULER_SIZE;
};
onMounted(measureRuler);
useResizeObserver(rootRef, measureRuler);
</script>

<style scoped></style>
