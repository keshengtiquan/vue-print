<template>
  <!--
    --paper-x / --paper-y 是纸张原点偏移，徽标要"贴在纸的边角上、压在线上"，
    必须知道纸在内容区的什么位置。用 CSS 变量传下去，省得在 JS 里拼 style。

    辅助线层的 pointer-events 必须**分层**：
    - 容器 none：否则整层会盖住 ElementLayer，元素点不动、拖不动；
    - 单条线 auto：唯独这条 9px 的窄带能吃事件。
    这和 MarginGuides 整层 none 不同 —— 页边距线是纯参考，不可交互。

    辅助线专用色是洋红（pink-600），刻意避开 primary（选中/激活语义）与边距线的中性灰。
    辅助线是"第三类"参考物，必须有自己的颜色身份。
  -->
  <div
    class="pointer-events-none absolute inset-0 z-10000"
    :style="{ '--paper-x': `${paperX}px`, '--paper-y': `${paperY}px` }"
  >
    <!--
      每条线 = 外层命中区（9px，透明）+ 内层视觉线（1px）。
      拆两层是必要的：要能一把抓住，就得给足命中宽度；要看着是条细线，视觉就得 1px。
      若直接给 9px 的元素画边框，线会粗得完全不像辅助线。

      @dblclick 删除、@pointerdown 拖动。两者都 .stop ——
      辅助线不在元素框内，画布根那条"点空白 = 取消选中"（onRootPointerDown）
      是按 data-design-element 判落点的，拦不住它；不 .stop 的话拖辅助线会顺手把选中元素清掉。
      （元素内部则反过来：那里刻意不 stop，好让 document 上的菜单关闭能收到点击。）

      group/guide 是给子元素传"父元素 hover"用的（视觉线 hover 时加亮）。
      v 竖线：横向铺满内容区，纵向给 9px 的抓取带（负 margin 让线正好压在中心）；h 横线反之。
      尚未落定的预览线不吃事件：它跟着光标跑，接管 pointer 反而会打断标尺那边的手势。
    -->
    <div
      v-for="g in views"
      :key="g.key"
      class="group/guide absolute flex items-center justify-center"
      :class="[
        g.dir === 'v'
          ? 'inset-y-0 ml-[-4.5px] w-2.25 cursor-ew-resize'
          : 'inset-x-0 mt-[-4.5px] h-2.25 cursor-ns-resize',
        g.draft ? 'pointer-events-none' : 'pointer-events-auto'
      ]"
      :style="g.style"
      :title="
        g.draft
          ? g.discard
            ? '松开鼠标取消'
            : '松开鼠标放置辅助线'
          : '拖动调整位置，拖出纸张删除，双击删除'
      "
      @pointerdown.stop="onPointerDown(g, $event)"
      @dblclick.stop="onDoubleClick(g)"
    >
      <!--
        视觉线：1px 虚线。用空 span + 边框而非直接给外层描边，
        是为了让"命中区"和"视觉线"彻底解耦：改抓取宽度（9px）永远不会影响线的粗细。

        三段状态互斥（正常 / 吸附命中 / 拖出纸外），用三元切换而非叠加类 ——
        Tailwind 同类工具类之间按生成顺序决胜，同时挂 border-pink-600 与 border-primary
        结果不可控。hover 加亮走 group 变体：它生成的选择器特异性更高，能稳定压过上面的 opacity。
      -->
      <span
        class="flex-none transition-[opacity,border-color] duration-80 ease-linear group-hover/guide:opacity-100"
        :class="[
          g.dir === 'v' ? 'h-full w-0 border-l' : 'h-0 w-full border-t',
          g.active
            ? 'border-primary border-solid opacity-100'
            : g.discard
              ? 'border-muted-foreground border-dashed opacity-35'
              : 'border-dashed border-pink-600 opacity-75'
        ]"
      ></span>

      <!--
        位置读数徽标：只在**交互中**出现（从标尺拖出的未落定线、拖动中的已有线），
        松手即随 draft/dragging 一起清空。已落定的辅助线不带徽标 ——
        那会让画面塞满数字，而静态的位置用户看标尺刻度就能读出来。
        等宽数字 + tabular-nums：拖动时数值每帧都在变，不定宽会让徽标左右抖。

        定位基准是**纸张边角**而非内容区边角 —— 徽标要贴在纸的左上角内侧、压在线上，
        而不是飘在灰色留白里。偏移量用父层传下来的 paper-x / paper-y 两个 CSS 变量换算。
        线拖到纸外时徽标跟着灰掉，连同数字一起表达"此处松手不会生成辅助线"。
      -->
      <span
        v-if="g.badge"
        class="pointer-events-none absolute inline-flex items-baseline gap-px rounded-[3px] px-1.25 py-px font-mono text-[10px] leading-[1.6] font-semibold whitespace-nowrap text-white tabular-nums shadow-[0_1px_3px_rgb(0_0_0/25%)]"
        :class="[
          g.dir === 'v'
            ? 'top-[calc(var(--paper-y,0px)+8px)] left-1/2 -translate-x-1/2'
            : 'top-1/2 left-[calc(var(--paper-x,0px)+8px)] -translate-y-1/2',
          g.discard ? 'bg-muted-foreground opacity-60' : 'bg-pink-600'
        ]"
      >
        {{ g.pos.toFixed(1) }}<em class="text-[8px] font-normal not-italic opacity-75">mm</em>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { useDesignStore } from "@/store/modules/design";
import { mmToPx } from "@/lib/utils";
import { useDrag } from "../composables/useDrag";
import { useSnapFeedback, guideKey, type SnapKey } from "../composables/useSnapFeedback";
import type { GuideDir } from "@/components/design/types";

const props = defineProps<{
  /** 纸张左边缘相对内容区的偏移（px）。辅助线用 mm 存储，渲染时要先落回内容区坐标 */
  paperX: number;
  paperY: number;
  /** 正在从标尺拖出、尚未落定的预览线（null = 无） */
  draft: { dir: GuideDir; pos: number } | null;
}>();

const store = useDesignStore();
const { activeSnapKeys } = useSnapFeedback();

const pxPerMm = computed(() => mmToPx(1) * store.scale);

/** 该轴上的纸张尺寸（mm）—— 超出即视为"拖出纸张" */
const axisSize = (dir: GuideDir) => (dir === "v" ? store.paper.widthMm : store.paper.heightMm);

const isOutside = (dir: GuideDir, pos: number) => pos < 0 || pos > axisSize(dir);

/**
 * 正在拖动的已有辅助线（transient）。
 * 与 ElementWrapper 同一套路：pointermove 期间只改组件内的 ref，不写 store，
 * 松手才一次性 moveGuide —— 否则每帧都撞 store 的响应式图。
 *
 * startPos 是手势起点，pos 是当前值：拖动按"起点 + 累计位移"算，
 * 而不是逐帧累加，避免浮点误差漂移。
 */
interface Dragging {
  id: string;
  dir: GuideDir;
  startPos: number;
  pos: number;
}
const dragging = ref<Dragging | null>(null);

interface GuideView {
  key: SnapKey;
  id: string;
  dir: GuideDir;
  /** mm。拖动中的线取 transient 值，其余取 store 值 */
  pos: number;
  draft: boolean;
  /** 当前位置已在纸张外 —— 松手就会删除，需要给明确的视觉预警 */
  discard: boolean;
  /** 该线正被吸附命中，需要转实线 + 主题色告诉用户"这条线正在起作用" */
  active: boolean;
  /** 是否显示位置读数徽标。仅交互中为 true（正在拖出 / 正在拖动） */
  badge: boolean;
  style: Record<string, string>;
}

const views = computed<GuideView[]>(() => {
  const px = pxPerMm.value;
  const build = (
    key: SnapKey,
    id: string,
    dir: GuideDir,
    pos: number,
    draft: boolean,
    badge: boolean
  ): GuideView => {
    // v：竖线，沿内容区纵向贯穿；h：横线，沿横向贯穿。
    // 故意画满整个内容区而非只画纸张 —— 拖出纸外时线要跟着走出去，用户才看得见"我在往外拖"。
    const offset = `${(dir === "v" ? props.paperX + pos * px : props.paperY + pos * px).toFixed(2)}px`;
    return {
      key,
      id,
      dir,
      pos,
      draft,
      discard: isOutside(dir, pos),
      active: activeSnapKeys.value.includes(key),
      badge,
      style: dir === "v" ? { left: offset } : { top: offset }
    };
  };

  const list = store.guides.map((g) => {
    const cur = dragging.value;
    const isDragging = !!cur && cur.id === g.id;
    // 拖动中的线也显示读数 —— 和"拖出时显示"是同一个诉求：
    // 用户需要知道线**此刻**在哪，而不是只记得放下去那一刻在哪。
    return build(guideKey(g.id), g.id, g.dir, isDragging ? cur.pos : g.pos, false, isDragging);
  });

  if (props.draft) {
    list.push(build("draft", "", props.draft.dir, props.draft.pos, true, true));
  }
  return list;
});

/** 没超过这个位移就不算在拖动 —— 单纯点一下不该往 store 写一次相同的值 */
const DRAG_THRESHOLD_PX = 2;
let moved = false;

const drag = useDrag({
  onMove: (_e, dx, dy) => {
    const cur = dragging.value;
    if (!cur) return;
    if (!moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      moved = true;
    }
    // 拖动方向 == 该轴的屏幕移动分量，换算成 mm 后叠加到手势起点
    const delta = (cur.dir === "v" ? dx : dy) / pxPerMm.value;
    dragging.value = { ...cur, pos: cur.startPos + delta };
  },
  onEnd: () => {
    const cur = dragging.value;
    if (cur && moved) {
      if (isOutside(cur.dir, cur.pos)) store.removeGuide(cur.id);
      else store.moveGuide(cur.id, Math.round(cur.pos * 100) / 100);
    }
    dragging.value = null;
    moved = false;
  }
});
onUnmounted(drag.dispose);

function onPointerDown(view: GuideView, e: PointerEvent) {
  if (view.draft) return; // 预览线由标尺的拖拽控制，这里不接管
  e.preventDefault();
  moved = false;
  dragging.value = { id: view.id, dir: view.dir, startPos: view.pos, pos: view.pos };
  drag.start(e);
}

function onDoubleClick(view: GuideView) {
  if (view.draft) return;
  store.removeGuide(view.id); // 线若已被别处删了，这里自然是 no-op
}
</script>
