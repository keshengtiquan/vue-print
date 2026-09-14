<template>
  <div ref="elRef" class="absolute" :style="wrapperStyle" @pointerdown.stop="onPointerDown">
    <component :is="component" :element="element" />

    <!-- 用 v-show + 单根 div 切换手柄显隐：
         1. v-show 应用到 div 上才能真正 toggle display:none；
         2. 不能用 <template v-show>，因为 <template> 元素的浏览器默认 display 永远是 none，
            Vue 无法 toggle 它回可见，会导致 selection-box / handles 一直不可见。
         3. 用单个 div 包住所有 overlay 子元素，避免逐个 toggle display 时的状态不一致。 -->
    <div v-show="selected" class="selection-overlay">
      <div class="selection-box"></div>
      <div
        v-for="h in HANDLES"
        :key="h"
        class="handle"
        :class="handleClass[h]"
        @pointerdown.stop="onHandlePointerDown(h, $event)"
      ></div>
      <div class="rotate-handle" @pointerdown.stop="onRotatePointerDown"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { useDesignStore } from "@/store/modules/design";
import { mmToPx } from "@/lib/utils";
import { elementComponents } from "./index";
import { useDrag } from "../../composables/useDrag";
import type { Element, ResizeHandle } from "@/components/design/types";

const designState = useDesignStore();

const props = defineProps<{ element: Element }>();

const elRef = ref<HTMLElement | null>(null);
const pxPerMm = computed(() => mmToPx(1) * designState.scale);
const selected = computed(() => designState.selectedId === props.element.id);
const component = computed(() => elementComponents[props.element.type]);

// 拖动期间的 transient 状态（仅组件内可见，不写 store）：
// - 高频 pointermove 时只更新这里，**不污染** store 的响应式图，其他组件/watcher 不触发。
// - wrapperStyle computed 同时依赖 props.element 和 transient，只这一个组件的样式重算。
// - pointerup 时一次性 commit 到 store 并清零 transient。
const transient = ref({ x: 0, y: 0, w: 0, h: 0, rot: 0 });

const wrapperStyle = computed(() => {
  const t = transient.value;
  return {
    left: `${(props.element.x + t.x) * pxPerMm.value}px`,
    top: `${(props.element.y + t.y) * pxPerMm.value}px`,
    width: `${(props.element.width + t.w) * pxPerMm.value}px`,
    height: `${(props.element.height + t.h) * pxPerMm.value}px`,
    transform: `rotate(${(props.element.rotation ?? 0) + t.rot}deg)`,
    transformOrigin: "center",
    zIndex: props.element.zIndex ?? 0
  };
});

const HANDLES: ResizeHandle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const handleClass: Record<ResizeHandle, string> = {
  n: "handle-n",
  s: "handle-s",
  e: "handle-e",
  w: "handle-w",
  ne: "handle-ne",
  nw: "handle-nw",
  se: "handle-se",
  sw: "handle-sw"
};

type DragMode = "none" | "move" | "resize" | "rotate";
const mode = ref<DragMode>("none");
const activeHandle = ref<ResizeHandle>("se");

// 拖拽起点快照（在 pointerdown 时记录，pointerup 时用于 commit 最终值）
const startEl = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  rotation: 0,
  start: { x: 0, y: 0 },
  end: { x: 0, y: 0 }
};
const startAngle = ref(0);
const center = { x: 0, y: 0 };

// 单一手势状态机：move/up 挂 window，不挂在被拖元素上；
// 不使用 Pointer Capture（window 监听已能拿到所有 pointermove，省一层状态机）。
const drag = useDrag({
  onMove: (e, dx, dy) => {
    if (mode.value === "move") {
      transient.value = { ...transient.value, x: dx / pxPerMm.value, y: dy / pxPerMm.value };
    } else if (mode.value === "resize") {
      const rad = (startEl.rotation * Math.PI) / 180;
      const dxLocal = (dx * Math.cos(rad) + dy * Math.sin(rad)) / pxPerMm.value;
      const dyLocal = (-dx * Math.sin(rad) + dy * Math.cos(rad)) / pxPerMm.value;
      applyTransientResize(dxLocal, dyLocal);
    } else if (mode.value === "rotate") {
      // 角度差归一化到 [-180, 180]，避免跨越 ±180° 时跳变
      const angle = (Math.atan2(e.clientY - center.y, e.clientX - center.x) * 180) / Math.PI;
      const delta = ((angle - startAngle.value + 540) % 360) - 180;
      transient.value = { ...transient.value, rot: delta };
    }
  },
  onEnd: () => {
    // 把 transient 累积的 delta 一次性 commit 到 store。
    // 注意：line 元素的 start/end 按最终 width/height 比例缩放写入（拖动期间不实时缩放，
    // 视觉上 line 端点位置不变，是已知 trade-off）。
    if (mode.value !== "none") {
      const t = transient.value;
      const finalW = startEl.width + t.w;
      const finalH = startEl.height + t.h;
      const patch: Record<string, unknown> = {
        x: startEl.x + t.x,
        y: startEl.y + t.y,
        width: finalW,
        height: finalH,
        rotation: startEl.rotation + t.rot
      };
      if (props.element.type === "line") {
        const sx = startEl.width ? finalW / startEl.width : 1;
        const sy = startEl.height ? finalH / startEl.height : 1;
        patch.start = { x: startEl.start.x * sx, y: startEl.start.y * sy };
        patch.end = { x: startEl.end.x * sx, y: startEl.end.y * sy };
      }
      designState.updateElement(props.element.id, patch);
    }
    // 清零 transient，wrapperStyle 立刻回退到 props.element 当前值（已 commit 过）
    transient.value = { x: 0, y: 0, w: 0, h: 0, rot: 0 };
    mode.value = "none";
  }
});
onUnmounted(drag.dispose);

function snapshot() {
  startEl.x = props.element.x;
  startEl.y = props.element.y;
  startEl.width = props.element.width;
  startEl.height = props.element.height;
  startEl.rotation = props.element.rotation ?? 0;
  if (props.element.type === "line") {
    startEl.start = { ...props.element.start };
    startEl.end = { ...props.element.end };
  }
}

function onPointerDown(e: PointerEvent) {
  // 阻止浏览器原生拖拽/文本选择（text/image 元素默认可拖动/可选，与自定义拖动冲突）
  e.preventDefault();
  designState.selectElement(props.element.id);
  mode.value = "move";
  snapshot();
  drag.start(e);
}

function onHandlePointerDown(h: ResizeHandle, e: PointerEvent) {
  e.preventDefault();
  designState.selectElement(props.element.id);
  mode.value = "resize";
  activeHandle.value = h;
  snapshot();
  drag.start(e);
}

function onRotatePointerDown(e: PointerEvent) {
  e.preventDefault();
  designState.selectElement(props.element.id);
  mode.value = "rotate";
  const rect = elRef.value!.getBoundingClientRect();
  center.x = rect.left + rect.width / 2;
  center.y = rect.top + rect.height / 2;
  startAngle.value = (Math.atan2(e.clientY - center.y, e.clientX - center.x) * 180) / Math.PI;
  snapshot();
  drag.start(e);
}

/** 计算 resize 在 transient 上的最终 delta，不写 store。 */
function applyTransientResize(dxLocal: number, dyLocal: number) {
  const h = activeHandle.value;
  let newX = startEl.x;
  let newY = startEl.y;
  let newW = startEl.width;
  let newH = startEl.height;
  if (h.includes("e")) newW += dxLocal;
  if (h.includes("w")) {
    newX += dxLocal;
    newW -= dxLocal;
  }
  if (h.includes("s")) newH += dyLocal;
  if (h.includes("n")) {
    newY += dyLocal;
    newH -= dyLocal;
  }
  const min = 1; // mm
  if (newW < min) {
    if (h.includes("w")) newX = startEl.x + startEl.width - min;
    newW = min;
  }
  if (newH < min) {
    if (h.includes("n")) newY = startEl.y + startEl.height - min;
    newH = min;
  }
  transient.value = {
    x: newX - startEl.x,
    y: newY - startEl.y,
    w: newW - startEl.width,
    h: newH - startEl.height,
    rot: transient.value.rot
  };
}
</script>

<style scoped>
.absolute {
  touch-action: none;
  user-select: none;
}

.selection-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.selection-box {
  position: absolute;
  inset: 0;
  border: 1px dashed #1a73e8;
  pointer-events: none;
}

.handle {
  position: absolute;
  width: 8px;
  height: 8px;
  background: #fff;
  border: 1px solid #1a73e8;
  pointer-events: auto;
}

.handle-n {
  top: -4px;
  left: 50%;
  margin-left: -4px;
  cursor: ns-resize;
}

.handle-s {
  bottom: -4px;
  left: 50%;
  margin-left: -4px;
  cursor: ns-resize;
}

.handle-e {
  top: 50%;
  right: -4px;
  margin-top: -4px;
  cursor: ew-resize;
}

.handle-w {
  top: 50%;
  left: -4px;
  margin-top: -4px;
  cursor: ew-resize;
}

.handle-ne {
  top: -4px;
  right: -4px;
  cursor: nesw-resize;
}

.handle-nw {
  top: -4px;
  left: -4px;
  cursor: nwse-resize;
}

.handle-se {
  bottom: -4px;
  right: -4px;
  cursor: nwse-resize;
}

.handle-sw {
  bottom: -4px;
  left: -4px;
  cursor: nesw-resize;
}

.rotate-handle {
  position: absolute;
  top: -24px;
  left: 50%;
  margin-left: -6px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid #1a73e8;
  cursor: grab;
  pointer-events: auto;
}
</style>
