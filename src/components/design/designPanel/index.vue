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
      <div class="relative min-w-full min-h-full" :style="{ width: `${contentW}px`, height: `${contentH}px` }">
        <div
          class="absolute overflow-hidden bg-white shadow"
          :style="{ left: `${paperX}px`, top: `${paperY}px`, width: `${paperW}px`, height: `${paperH}px` }"
        >
          <!-- 网格在元素**之下**：它是纸纹背景，被元素盖住才符合直觉 -->
          <PaperGrid v-if="designState.showGrid" />
          <ElementLayer />
          <!-- 页边距辅助线：盖在元素之上（参考线语义），但 pointer-events: none 不拦截交互 -->
          <MarginGuides v-if="designState.showMarginGuides" />
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
import MarginGuides from "./components/MarginGuides.vue";
import PaperGrid from "./components/PaperGrid.vue";
import { useDesignStore, SCALE_MIN, SCALE_MAX } from "@/store/modules/design";
import { mmToPx, pxToMm } from "@/lib/utils";

const designState = useDesignStore();

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
const contentW = computed(() => paperW.value + PAPER_MARGIN * 2);
const contentH = computed(() => paperH.value + PAPER_MARGIN * 2);
// 内容层实际渲染宽度 = max(内容宽, 可视区宽)；min-w-full 会把它撑满可视区
const renderW = computed(() => Math.max(contentW.value, rulerGeom.viewW));
/**
 * 纸张左边缘相对内容区的偏移。
 * 必须用它做**显式定位**（left: paperX），不要用 `left:50% + translateX(-50%)`：
 * 后者是 CSS 按容器实际宽度居中，而标尺 origin 用的是本计算值 —— 两套基准，
 * 一旦出现滚动条（容器实际宽不含滚动条、viewW 含滚动条）就会对不齐，
 * 且偏差随缩放/滚动条有无变化，表现为"某些缩放倍率下 0 刻度不对齐纸边"。
 */
const paperX = computed(() => (renderW.value - paperW.value) / 2);
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
  const area = scrollRef.value;
  if (!area) return;

  /*
    可视尺寸取"不含滚动条、且保留小数"的值：
    - getBoundingClientRect() 保留小数，但**包含滚动条**；
    - clientWidth/clientHeight 不含滚动条，但会被**取整**。
    两者单独用都有偏差，所以组合：rect 的小数值 - (offset - client) 的滚动条宽度。
    这样既保留亚像素精度，又与内容区 min-w-full / min-h-full 的 100% 基准
    （padding box，不含滚动条）严格一致 —— 否则滚动条出现时，算出的居中基准
    会比真实可视区宽约半个滚动条，纸张就不再居中、标尺 0 刻度也对不上纸边。
  */
  const rect = area.getBoundingClientRect();
  const sbV = area.offsetWidth - area.clientWidth; // 垂直滚动条宽度（无则为 0）
  const sbH = area.offsetHeight - area.clientHeight; // 水平滚动条宽度（无则为 0）
  rulerGeom.viewW = Math.max(0, rect.width - sbV);
  rulerGeom.viewH = Math.max(0, rect.height - sbH);
};
onMounted(measureRuler);
useResizeObserver(scrollRef, measureRuler);
</script>

<style scoped></style>
