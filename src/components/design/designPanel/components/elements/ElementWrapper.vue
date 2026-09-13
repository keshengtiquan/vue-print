<template>
  <div
    ref="elRef"
    class="absolute"
    :style="wrapperStyle"
    @pointerdown.stop="onBodyPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <component :is="component" :element="element" />

    <template v-if="selected">
      <div class="selection-box"></div>
      <div
        v-for="h in HANDLES"
        :key="h"
        class="handle"
        :class="handleClass[h]"
        @pointerdown.stop="onHandlePointerDown(h, $event)"
      ></div>
      <div class="rotate-handle" @pointerdown.stop="onRotatePointerDown"></div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { designState } from "@/components/design/designState";
import { mmToPx } from "@/lib/utils";
import { elementComponents } from "./index";
import { selectElement, updateElement } from "@/components/design/useElements";
import type { Element, ResizeHandle } from "@/components/design/types";

const props = defineProps<{ element: Element }>();

const elRef = ref<HTMLElement | null>(null);
const pxPerMm = computed(() => mmToPx(1) * designState.scale);
const selected = computed(() => designState.selectedId === props.element.id);
const component = computed(() => elementComponents[props.element.type]);

const wrapperStyle = computed(() => ({
  left: `${props.element.x * pxPerMm.value}px`,
  top: `${props.element.y * pxPerMm.value}px`,
  width: `${props.element.width * pxPerMm.value}px`,
  height: `${props.element.height * pxPerMm.value}px`,
  transform: `rotate(${props.element.rotation ?? 0}deg)`,
  transformOrigin: "center",
  zIndex: props.element.zIndex ?? 0,
}));

const HANDLES: ResizeHandle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const handleClass: Record<ResizeHandle, string> = {
  n: "handle-n",
  s: "handle-s",
  e: "handle-e",
  w: "handle-w",
  ne: "handle-ne",
  nw: "handle-nw",
  se: "handle-se",
  sw: "handle-sw",
};

type DragMode = "none" | "move" | "resize" | "rotate";
const mode = ref<DragMode>("none");
const activeHandle = ref<ResizeHandle>("se");
const startEl = {
  clientX: 0,
  clientY: 0,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  rotation: 0,
  start: { x: 0, y: 0 },
  end: { x: 0, y: 0 },
};
const startAngle = ref(0);
const center = { x: 0, y: 0 };

function begin(e: PointerEvent) {
  elRef.value?.setPointerCapture(e.pointerId);
  startEl.clientX = e.clientX;
  startEl.clientY = e.clientY;
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

function onBodyPointerDown(e: PointerEvent) {
  selectElement(props.element.id);
  mode.value = "move";
  begin(e);
}

function onHandlePointerDown(h: ResizeHandle, e: PointerEvent) {
  selectElement(props.element.id);
  mode.value = "resize";
  activeHandle.value = h;
  begin(e);
}

function onRotatePointerDown(e: PointerEvent) {
  selectElement(props.element.id);
  mode.value = "rotate";
  const rect = elRef.value!.getBoundingClientRect();
  center.x = rect.left + rect.width / 2;
  center.y = rect.top + rect.height / 2;
  startAngle.value = (Math.atan2(e.clientY - center.y, e.clientX - center.x) * 180) / Math.PI;
  startEl.rotation = props.element.rotation ?? 0;
  begin(e);
}

function onPointerMove(e: PointerEvent) {
  if (mode.value === "none") return;
  const dx = (e.clientX - startEl.clientX) / pxPerMm.value;
  const dy = (e.clientY - startEl.clientY) / pxPerMm.value;

  if (mode.value === "move") {
    updateElement(props.element.id, { x: startEl.x + dx, y: startEl.y + dy });
  } else if (mode.value === "resize") {
    const rad = (startEl.rotation * Math.PI) / 180;
    const dxLocal = dx * Math.cos(rad) + dy * Math.sin(rad);
    const dyLocal = -dx * Math.sin(rad) + dy * Math.cos(rad);
    applyResize(dxLocal, dyLocal);
  } else if (mode.value === "rotate") {
    const angle = (Math.atan2(e.clientY - center.y, e.clientX - center.x) * 180) / Math.PI;
    updateElement(props.element.id, { rotation: startEl.rotation + (angle - startAngle.value) });
  }
}

function applyResize(dxLocal: number, dyLocal: number) {
  const h = activeHandle.value;
  let { x, y, width, height } = startEl;
  if (h.includes("e")) width += dxLocal;
  if (h.includes("w")) {
    x += dxLocal;
    width -= dxLocal;
  }
  if (h.includes("s")) height += dyLocal;
  if (h.includes("n")) {
    y += dyLocal;
    height -= dyLocal;
  }

  const min = 1; // mm
  if (width < min) {
    if (h.includes("w")) x = startEl.x + startEl.width - min;
    width = min;
  }
  if (height < min) {
    if (h.includes("n")) y = startEl.y + startEl.height - min;
    height = min;
  }

  const patch: Record<string, unknown> = { x, y, width, height };
  if (props.element.type === "line") {
    const sx = startEl.width ? width / startEl.width : 1;
    const sy = startEl.height ? height / startEl.height : 1;
    patch.start = { x: startEl.start.x * sx, y: startEl.start.y * sy };
    patch.end = { x: startEl.end.x * sx, y: startEl.end.y * sy };
  }
  updateElement(props.element.id, patch);
}

function onPointerUp() {
  mode.value = "none";
}
</script>

<style scoped>
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
}
</style>
