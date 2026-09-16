<template>
  <ElementContextMenu :element="element">
    <div
      ref="elRef"
      class="absolute touch-none select-none"
      :class="element.locked ? 'cursor-default' : ''"
      :style="wrapperStyle"
      @pointerdown.stop="onPointerDown"
      @contextmenu.stop="onContextMenu"
    >
    <component :is="component" :element="element" />
    <div v-show="selected" class="pointer-events-none absolute inset-0">
      <div class="pointer-events-none absolute inset-0 border border-dashed border-[#1a73e8]"></div>
      <template v-if="!element.locked">
      <div
        v-for="h in HANDLES"
        :key="h"
        class="pointer-events-auto absolute size-2 border border-[#1a73e8] bg-white"
        :class="handleClass[h]"
        @pointerdown.stop="onHandlePointerDown(h, $event)"
      ></div>
      <div
        class="pointer-events-auto absolute -top-6 left-1/2 -ml-1.5 size-3 cursor-grab rounded-full border border-[#1a73e8] transition-[background,transform] duration-120 ease-out"
        :class="isSnapped ? 'scale-125 bg-[#1a73e8]' : 'bg-white'"
        @pointerdown.stop="onRotatePointerDown"
      ></div>
      <div
        v-if="mode === 'rotate'"
        class="pointer-events-none absolute top-1/2 left-1/2 rounded-lg bg-[#1a73e8] px-1.75 py-0.5 font-mono text-[11px] leading-normal font-semibold whitespace-nowrap text-white tabular-nums shadow-[0_1px_4px_rgb(0_0_0/25%)]"
        :style="{ transform: `translate(-50%, -50%) rotate(${-currentRotation}deg)` }"
      >
        {{ displayAngle }}°
      </div>
      </template>
    </div>
    </div>
  </ElementContextMenu>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { useDesignStore } from "@/store/modules/design";
import { mmToPx } from "@/lib/utils";
import { elementComponents } from "./index";
import ElementContextMenu from "./ElementContextMenu.vue";
import { useDrag } from "../../composables/useDrag";
import {
  useSnapFeedback,
  marginKey,
  guideKey,
  type SnapKey
} from "../../composables/useSnapFeedback";
import type { Element, ResizeHandle } from "@/components/design/types";

const designState = useDesignStore();
const { setSnapKeys, clearSnapKeys } = useSnapFeedback();

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

/**
 * 8 个方向手柄的定位与光标。
 * 尺寸（8px）、白底、蓝描边这些共性已写在模板的公共类上，这里只给"每个方向各不相同"的
 * 部分：-4px 的贴边偏移把方块正好压在选中框线上（半个身位在外），光标指示该方向的缩放轴向。
 */
const handleClass: Record<ResizeHandle, string> = {
  n: "-top-1 left-1/2 -ml-1 cursor-ns-resize",
  s: "-bottom-1 left-1/2 -ml-1 cursor-ns-resize",
  e: "top-1/2 -right-1 -mt-1 cursor-ew-resize",
  w: "top-1/2 -left-1 -mt-1 cursor-ew-resize",
  ne: "-top-1 -right-1 cursor-nesw-resize",
  nw: "-top-1 -left-1 cursor-nwse-resize",
  se: "-bottom-1 -right-1 cursor-nwse-resize",
  sw: "-bottom-1 -left-1 cursor-nesw-resize"
};

type DragMode = "none" | "move" | "resize" | "rotate";
const mode = ref<DragMode>("none");
const activeHandle = ref<ResizeHandle>("se");

/** 按住 Shift 时的吸附步长（度）—— 与 Figma / PS / Sketch 的行业标准一致 */
const ROTATE_SNAP_STEP = 15;
/** 未按 Shift 时，接近正交角（0/90/180/270）的自动吸附阈值（度） */
const ROTATE_ORTHO_SNAP = 1.5;

/** 移动时吸附到页边距线的磁吸范围（屏幕 px；换算成 mm 后再比较） */
const MARGIN_SNAP_PX = 6;

/** 一条可吸附的目标线：key 用于命中高亮，at 是它在纸张坐标系里的位置（mm） */
type SnapTarget = { key: SnapKey; at: number };

/**
 * 把某个轴上的位置吸附到最近的边距线。
 *
 * 元素每条边（起边 / 终边）都会去够每条边距线，取**距离最近**的一组生效 ——
 * 元素宽于内容区时两条边可能同时在范围内，此时吸最近的，不会左右拉扯。
 *
 * @param pos 元素在该轴的起点（未吸附）
 * @param size 元素在该轴的尺寸
 * @param lines 该轴上的边距线
 * @param tol 容差（mm）
 * @returns 吸附后的起点，以及命中的目标线 key（未命中为 null）
 */
function snapAxis(pos: number, size: number, lines: SnapTarget[], tol: number) {
  let bestValue = pos;
  let bestKey: SnapKey | null = null;
  let bestDist = Infinity;
  for (const line of lines) {
    for (const edge of [pos, pos + size]) {
      const delta = line.at - edge;
      const dist = Math.abs(delta);
      if (dist <= tol && dist < bestDist) {
        bestValue = pos + delta;
        bestKey = line.key;
        bestDist = dist;
      }
    }
  }
  return { value: bestValue, hit: bestKey };
}

/**
 * 收集某个轴上的全部吸附目标：两条页边距线 + 该轴上的所有辅助线。
 *
 * 辅助线只在 `showGuides` 打开时才参与 —— 开关关掉就是不显示也不吸附，
 * 否则会出现"看不见的东西在拽我"。
 * 顺带过滤掉纸张外的线：它们多半是纸张尺寸改过之前的残留，拿来吸附只会让人困惑。
 */
function snapTargets(dir: "v" | "h"): SnapTarget[] {
  const m = designState.marginMm;
  const paper = designState.paper;
  const sizeMm = dir === "v" ? paper.widthMm : paper.heightMm;
  const edges: SnapTarget[] =
    dir === "v"
      ? [
          { key: marginKey("left"), at: m.left },
          { key: marginKey("right"), at: paper.widthMm - m.right }
        ]
      : [
          { key: marginKey("top"), at: m.top },
          { key: marginKey("bottom"), at: paper.heightMm - m.bottom }
        ];
  if (!designState.showGuides) return edges;
  for (const g of designState.guides) {
    if (g.dir !== dir || g.pos < 0 || g.pos > sizeMm) continue;
    edges.push({ key: guideKey(g.id), at: g.pos });
  }
  return edges;
}

/**
 * 移动吸附：让元素边缘对齐到页边距线与辅助线。
 * 按住 Alt 临时关闭 —— 精细定位时不该被磁吸拽走，这是主流工具的约定。
 *
 * 返回命中线是为了高亮：吸附如果只是"元素悄悄粘住了"，用户会以为是卡顿。
 */
function snapMove(x: number, y: number, w: number, h: number, altKey: boolean) {
  // 总开关关闭 / 按住 Alt → 自由位移。Alt 时必须返回空 hits，否则高亮会残留。
  if (!designState.snapEnabled || altKey) return { x, y, hits: [] as SnapKey[] };
  const tol = MARGIN_SNAP_PX / pxPerMm.value;
  const sx = snapAxis(x, w, snapTargets("v"), tol);
  const sy = snapAxis(y, h, snapTargets("h"), tol);
  const hits: SnapKey[] = [];
  if (sx.hit) hits.push(sx.hit);
  if (sy.hit) hits.push(sy.hit);
  return { x: sx.value, y: sy.value, hits };
}

/** 当前角度是否正吸附在整点上（用于手柄高亮，让吸附"看得见"） */
const isSnapped = ref(false);

/** 旋转中的精确总角度（含 transient 增量） */
const currentRotation = computed(() => (props.element.rotation ?? 0) + transient.value.rot);

/** 徽标显示的角度：归一化到 [0,360) 后取整，吸附时会是 0/90/15/30 这类整数 */
const displayAngle = computed(() => Math.round(((currentRotation.value % 360) + 360) % 360));

/**
 * 旋转吸附。作用于**绝对角度**而非手势 delta —— 这样吸附点固定在真实的
 * 0/90/180/270… 上，而不是相对手势起点的角度，用户转多少就是多少。
 *
 * @param deg 当前（未吸附）的绝对角度
 * @param shiftKey 是否按住 Shift
 */
function snapAngle(deg: number, shiftKey: boolean): number {
  // 总开关关闭 → 完全自由旋转（正交吸附也一并失效）
  if (!designState.snapEnabled) return deg;
  // Shift：吸附到 15° 整数倍。这是用户主动表达的意图，不会误触发。
  if (shiftKey) {
    return Math.round(deg / ROTATE_SNAP_STEP) * ROTATE_SNAP_STEP;
  }
  // 未按 Shift：只在极度接近正交角时轻微吸附。
  // 水平/垂直对齐是高频需求；1.5° 阈值足够窄，不会干扰 30°/45° 这类常规角度。
  const norm = ((deg % 360) + 360) % 360;
  for (const ortho of [0, 90, 180, 270]) {
    let diff = ortho - norm;
    // 取最短旋转方向，否则 359° 到 0° 会被算成倒转 359°（而非前进 1°）
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    if (Math.abs(diff) <= ROTATE_ORTHO_SNAP) return deg + diff;
  }
  return deg;
}

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
      // 先按位移算出自由位置，再吸附到页边距线（Alt 临时关闭）
      const free = { x: startEl.x + dx / pxPerMm.value, y: startEl.y + dy / pxPerMm.value };
      const snapped = snapMove(free.x, free.y, startEl.width, startEl.height, e.altKey);
      transient.value = {
        ...transient.value,
        x: snapped.x - startEl.x,
        y: snapped.y - startEl.y
      };
      setSnapKeys(snapped.hits);
    } else if (mode.value === "resize") {
      const rad = (startEl.rotation * Math.PI) / 180;
      const dxLocal = (dx * Math.cos(rad) + dy * Math.sin(rad)) / pxPerMm.value;
      const dyLocal = (-dx * Math.sin(rad) + dy * Math.cos(rad)) / pxPerMm.value;
      applyTransientResize(dxLocal, dyLocal);
    } else if (mode.value === "rotate") {
      // 角度差归一化到 [-180, 180]，避免跨越 ±180° 时跳变
      const angle = (Math.atan2(e.clientY - center.y, e.clientX - center.x) * 180) / Math.PI;
      const delta = ((angle - startAngle.value + 540) % 360) - 180;
      // 先算绝对角度再吸附，最后转回相对手势起点的 delta 存进 transient
      const rawAbs = startEl.rotation + delta;
      const snappedAbs = snapAngle(rawAbs, e.shiftKey);
      // 浮点容差比较，判断这一帧是否真的被吸附了
      isSnapped.value = Math.abs(snappedAbs - rawAbs) > 1e-6;
      transient.value = { ...transient.value, rot: snappedAbs - startEl.rotation };
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
    isSnapped.value = false;
    clearSnapKeys();
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
  // 右键只负责调出菜单；锁定元素仍可被选中，但不能进入移动手势。
  if (e.button !== 0) return;
  // 阻止浏览器原生拖拽/文本选择（text/image 元素默认可拖动/可选，与自定义拖动冲突）
  e.preventDefault();
  designState.selectElement(props.element.id);
  if (props.element.locked) return;
  mode.value = "move";
  snapshot();
  drag.start(e);
}

function onContextMenu() {
  designState.selectElement(props.element.id);
}

function onHandlePointerDown(h: ResizeHandle, e: PointerEvent) {
  if (props.element.locked) return;
  e.preventDefault();
  designState.selectElement(props.element.id);
  mode.value = "resize";
  activeHandle.value = h;
  snapshot();
  drag.start(e);
}

function onRotatePointerDown(e: PointerEvent) {
  if (props.element.locked) return;
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
