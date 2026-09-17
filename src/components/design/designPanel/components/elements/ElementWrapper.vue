<template>
  <ElementContextMenu :element="element">
    <div
      ref="elRef"
      class="absolute touch-none select-none"
      :class="element.locked ? 'cursor-default' : ''"
      :style="wrapperStyle"
      @pointerdown.stop="onPointerDown"
      @contextmenu.stop="onContextMenu"
      @dblclick.stop="onDoubleClick"
    >
      <component :is="component" :element="element" />
      <div v-show="selected" class="pointer-events-none absolute inset-0">
        <!-- 锁定元素用红色虚线框：一眼区分"能拖"和"拖不动"，避免误判成拖拽失效 -->
        <div
          class="pointer-events-none absolute inset-0 border border-dashed"
          :class="element.locked ? 'border-destructive' : 'border-[#1a73e8]'"
        ></div>
        <!--
          手柄条件里带上 editing：正在改文字时不该能缩放/旋转，那会一边改字一边改框，纯干扰。
          （锁定元素本来就不渲染手柄，两者是独立的两个"别动它"的理由。）
        -->
        <template v-if="!element.locked && !editing">
          <!--
            线条用两个端点手柄**替代** 8 个缩放手柄：
            端点必然落在包围盒的角（斜线）或边中点（水平/垂直线）上，位置与缩放手柄必然重合，
            两者只能留一个。端点手柄的表达力也更强 —— 直接决定线的走向和长度。
          -->
          <template v-if="element.type === 'line'">
            <div
              v-for="pt in lineEndpoints"
              :key="pt.key"
              class="pointer-events-auto absolute size-2.5 cursor-crosshair rounded-full border-2 border-white bg-[#1a73e8]"
              :style="{ left: `${pt.x}px`, top: `${pt.y}px`, transform: 'translate(-50%, -50%)' }"
              @pointerdown.stop="onEndpointPointerDown(pt.key, $event)"
              @dblclick.stop
            ></div>
          </template>
          <template v-else>
            <div
              v-for="h in HANDLES"
              :key="h"
              class="pointer-events-auto absolute size-2 border border-[#1a73e8] bg-white"
              :class="handleClass[h]"
              @pointerdown.stop="onHandlePointerDown(h, $event)"
              @dblclick.stop
            ></div>
          </template>
          <div
            class="pointer-events-auto absolute -top-6 left-1/2 -ml-1.5 size-3 cursor-grab rounded-full border border-[#1a73e8] transition-[background,transform] duration-120 ease-out"
            :class="isSnapped ? 'scale-125 bg-[#1a73e8]' : 'bg-white'"
            @pointerdown.stop="onRotatePointerDown"
            @dblclick.stop
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
const editing = computed(() => designState.editingId === props.element.id);
const component = computed(() => elementComponents[props.element.type]);

/**
 * 端点拖拽期间的完整几何草稿（mm，绝对值）。
 *
 * 这一路没法用「快照 + delta」表达：端点是元素框内的局部坐标，而拖端点会**同时重算框**
 * （框始终紧贴线段的包围盒），框一变所有局部坐标都变，增量会互相纠缠。
 * 所以直接存一组最终值，wrapperStyle 与端点手柄都读它。
 *
 * rotation 恒为 0：拖端点会把元素已有的旋转**烘焙**进端点坐标（见 applyTransientEndpoint），
 * 因为框中心就是旋转支点，而重算包围盒必然移动框中心 —— 不烘焙的话，没被拖的那一端会跟着漂走。
 */
interface LineDraft {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

// 拖动期间的 transient 状态（仅组件内可见，不写 store）：
// - 高频 pointermove 时只更新这里，**不污染** store 的响应式图，其他组件/watcher 不触发。
// - wrapperStyle computed 同时依赖 props.element 和 transient，只这一个组件的样式重算。
// - pointerup 时一次性 commit 到 store 并清零 transient。
const transient = ref({ x: 0, y: 0, w: 0, h: 0, rot: 0, line: null as LineDraft | null });

const wrapperStyle = computed(() => {
  const t = transient.value;
  // 端点拖拽期间框由草稿整体接管（重算包围盒），其余手势仍只用 delta 叠加。
  const box = t.line ?? {
    x: props.element.x + t.x,
    y: props.element.y + t.y,
    width: props.element.width + t.w,
    height: props.element.height + t.h
  };
  return {
    left: `${box.x * pxPerMm.value}px`,
    top: `${box.y * pxPerMm.value}px`,
    width: `${box.width * pxPerMm.value}px`,
    height: `${box.height * pxPerMm.value}px`,
    transform: `rotate(${t.line ? t.line.rotation : (props.element.rotation ?? 0) + t.rot}deg)`,
    transformOrigin: "center",
    zIndex: props.element.zIndex ?? 0
  };
});

/**
 * 两个端点手柄在元素框内的位置（px，相对框左上角）。
 * 拖动中读草稿值，保证手柄与指针严丝合缝；静止时读元素值。
 */
const lineEndpoints = computed(() => {
  const el = props.element;
  if (el.type !== "line") return [];
  const draft = transient.value.line;
  const start = draft ? draft.start : el.start;
  const end = draft ? draft.end : el.end;
  return [
    { key: "start" as const, x: start.x * pxPerMm.value, y: start.y * pxPerMm.value },
    { key: "end" as const, x: end.x * pxPerMm.value, y: end.y * pxPerMm.value }
  ];
});

/** 端点拖拽时元素框的最小厚度（mm）：水平/垂直的线包围盒会退化成 0 厚，既看不见选区也点不中 */
const ENDPOINT_MIN_THICKNESS = 4;

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

type DragMode = "none" | "move" | "resize" | "rotate" | "endpoint";
const mode = ref<DragMode>("none");
const activeHandle = ref<ResizeHandle>("se");
/** 当前正在拖的线段端点（仅 mode === "endpoint" 时有意义） */
const activeEndpoint = ref<"start" | "end">("start");

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
    } else if (mode.value === "endpoint") {
      applyTransientEndpoint(dx, dy);
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
    if (mode.value === "endpoint") {
      // 端点草稿本身就是最终值（框与 start/end 一起算好的），整组写回即可。
      const draft = transient.value.line;
      if (draft) designState.updateElement(props.element.id, { ...draft });
    } else if (mode.value !== "none") {
      // 把 transient 累积的 delta 一次性 commit 到 store。
      // 这里不再有 line 的特例：线条走上面的 endpoint 分支，它的框由端点手柄维护，
      // 缩放手柄对线条不渲染（位置必然与端点手柄重合），所以不必再按比例换算 start/end。
      const t = transient.value;
      designState.updateElement(props.element.id, {
        x: startEl.x + t.x,
        y: startEl.y + t.y,
        width: startEl.width + t.w,
        height: startEl.height + t.h,
        rotation: startEl.rotation + t.rot
      });
    }
    // 清零 transient，wrapperStyle 立刻回退到 props.element 当前值（已 commit 过）
    transient.value = { x: 0, y: 0, w: 0, h: 0, rot: 0, line: null };
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
  // 编辑中直接放行浏览器默认行为：点在字外的空白处会把 textarea 失焦，编辑态随之结束。
  // 这里刻意**不** preventDefault —— 一旦拦掉默认行为，textarea 就不会失焦，编辑态变成关不掉的。
  if (editing.value) return;
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

/**
 * 双击进入内联编辑（与右键菜单的「编辑文本」同一个动作）。
 *
 * 双击会先派发两次 pointerdown，各自起过一个 move 手势 —— 但两下都没有位移，
 * onEnd 提交的是与快照相同的值，等于白写一次，无需额外抑制。
 * 缩放/旋转手柄上挂了 @dblclick.stop：它们是叠在元素之上的控件，双击它们不该进编辑态。
 */
function onDoubleClick() {
  if (props.element.locked || props.element.type !== "text") return;
  designState.startEditing(props.element.id);
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

/**
 * 端点手柄按下：进入端点手势。
 * 礼节与缩放手柄完全一致（preventDefault + 选中 + 快照），只是 mode 不同。
 */
function onEndpointPointerDown(which: "start" | "end", e: PointerEvent) {
  if (props.element.type !== "line" || props.element.locked) return;
  // 右键只负责调出菜单，不该顺手起一个拖拽手势
  if (e.button !== 0) return;
  e.preventDefault();
  designState.selectElement(props.element.id);
  mode.value = "endpoint";
  activeEndpoint.value = which;
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
    ...transient.value,
    x: newX - startEl.x,
    y: newY - startEl.y,
    w: newW - startEl.width,
    h: newH - startEl.height,
    line: null
  };
}

/**
 * 计算端点拖拽的 transient 草稿，不写 store。
 *
 * ## 为什么先把端点换算到「纸张坐标」
 *
 * 端点存在元素框的局部坐标里，而框中心就是 transform-origin（旋转支点）。
 * 拖端点必须重算包围盒，包围盒一变框中心就变 —— 支点跟着动，而「屏幕位移 → 局部位移」
 * 这一步隐含了「支点不动」的假设，于是没被拖的那一端会诡异地漂走。
 *
 * 所以这里把元素自身的旋转先**烘焙**进两个端点的坐标（换算到纸张 mm 空间），
 * 之后全部计算都在轴对齐空间里做：位移直接叠加、包围盒直接求 min/max，支点再不参与。
 * 代价是 rotation 归零 —— 但线段的视觉位置分毫不动（是连续的），且框重新变回轴对齐，
 * 「框永远是紧贴线段的轴对齐包围盒」这条不变量得以保持，缩放分支的等比换算才不会错。
 *
 * 仍有一个自由度是特意留的：端点身份不变 —— 拖哪个端点，哪个就继续写进 start / end，
 * 「翻转线条」那类依赖首尾语义的操作才不会错位。
 *
 * @param dx 相对 pointerdown 的屏幕位移（px）
 * @param dy 相对 pointerdown 的屏幕位移（px）
 */
function applyTransientEndpoint(dx: number, dy: number) {
  if (props.element.type !== "line") return;

  // ① 元素局部坐标 → 纸张坐标（mm）：先绕框中心正旋转，再加框中心位置
  const rad = (startEl.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const centerX = startEl.x + startEl.width / 2;
  const centerY = startEl.y + startEl.height / 2;
  const toPaper = (p: { x: number; y: number }) => {
    const ox = p.x - startEl.width / 2;
    const oy = p.y - startEl.height / 2;
    return { x: ox * cos - oy * sin + centerX, y: ox * sin + oy * cos + centerY };
  };

  const byStart = activeEndpoint.value === "start";
  const localMoving = byStart ? startEl.start : startEl.end;
  const localAnchor = byStart ? startEl.end : startEl.start;

  // ② 被拖的端点在纸张空间里直接跟随指针，锚点纹丝不动
  const screenToMm = 1 / pxPerMm.value;
  const startPaper = toPaper(localMoving);
  const moved = {
    x: startPaper.x + dx * screenToMm,
    y: startPaper.y + dy * screenToMm
  };
  const anchor = toPaper(localAnchor);

  // ③ 包围盒 = 线段的最小外接矩形；两个方向各自兜一个最小厚度，
  //    否则水平/垂直的线会退化成 0 厚，选区看不见、也点不中。
  let left = Math.min(moved.x, anchor.x);
  let top = Math.min(moved.y, anchor.y);
  let width = Math.abs(moved.x - anchor.x);
  let height = Math.abs(moved.y - anchor.y);
  if (width < ENDPOINT_MIN_THICKNESS) {
    left -= (ENDPOINT_MIN_THICKNESS - width) / 2;
    width = ENDPOINT_MIN_THICKNESS;
  }
  if (height < ENDPOINT_MIN_THICKNESS) {
    top -= (ENDPOINT_MIN_THICKNESS - height) / 2;
    height = ENDPOINT_MIN_THICKNESS;
  }

  const toLocal = (pt: { x: number; y: number }) => ({ x: pt.x - left, y: pt.y - top });
  const draft: LineDraft = {
    x: left,
    y: top,
    width,
    height,
    rotation: 0,
    start: toLocal(byStart ? moved : anchor),
    end: toLocal(byStart ? anchor : moved)
  };
  transient.value = { ...transient.value, line: draft };
}
</script>
