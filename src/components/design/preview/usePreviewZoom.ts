/**
 * 预览缩放。
 *
 * 设计文档：`docs/preview-design.md` §6.2。
 *
 * ## 为什么**不复用** `design.scale`
 *
 * `design.scale` 是**设计态的视图偏好**（画布放大到 150% 好对齐用）。
 * 预览用它的话会有两个后果，且都是"用户想不明白为什么"的那一类：
 * 1. 在预览里点一下放大 → 回到设计态画布，画布也跟着变了；
 * 2. 设计态缩到 30% 排版时点开预览 → 预览小得看不清字。
 *
 * 两个视图的缩放是**两件事**，所以两个状态 —— 一条铁律，不是洁癖。
 *
 * ## 「适应宽度」怎么算
 *
 * 容器宽度减掉左右留白，除以纸张宽度（mm → px）。这是 PDF 阅读器和
 * 所有设计工具的默认行为，也是唯一"打开就能看全一页"的档位。
 * 上限夹在 `MAX_FIT`：屏幕很宽、纸张很小时不该把 A4 放大到 300%（字会虚）。
 */
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import type { Ref } from "vue";
import { mmToPx } from "@/lib/utils";

/** 纸张左右至少留出的空隙（px）。与 PreviewCanvas 容器上的 `px-6` 对齐 */
export const PAGE_GUTTER = 24;

/** 适应宽度时的上限 —— 再大就是"糊"，不如让用户自己选 100% / 200% */
const MAX_FIT = 1.6;

/** 自定义缩放的上下界（与 setZoom 里的 clamp 一致，滚轮缩放也用它） */
export const PREVIEW_ZOOM_MIN = 0.1;
export const PREVIEW_ZOOM_MAX = 4;

const ZOOM_STEPS: { value: number | "fit"; label: string }[] = [
  { value: "fit", label: "适应宽度" },
  { value: 0.5, label: "50%" },
  { value: 0.75, label: "75%" },
  { value: 1, label: "100%" },
  { value: 1.5, label: "150%" },
  { value: 2, label: "200%" }
];

export { ZOOM_STEPS };

export function usePreviewZoom(container: Ref<HTMLElement | null>, paperWidthMm: Ref<number>) {
  const mode = ref<"fit" | "custom">("fit");
  const custom = ref(1);
  const containerWidth = ref(0);

  let observer: ResizeObserver | null = null;

  const measure = () => {
    const el = container.value;
    if (el) containerWidth.value = el.clientWidth;
  };

  /*
    用 ResizeObserver 而不是 window.resize 监听：
    预览页的宽度还会因为"警告条展开 / 收起""侧栏出现"这类**内部**变化而变，
    window.resize 对这些一无所知，于是"适应宽度"会在那些时刻算错。
  */
  const attach = (el: HTMLElement | null) => {
    observer?.disconnect();
    observer = null;
    if (!el) return;
    containerWidth.value = el.clientWidth;
    observer = new ResizeObserver(measure);
    observer.observe(el);
  };

  watch(container, attach, { immediate: true });
  onUnmounted(() => {
    observer?.disconnect();
    observer = null;
  });

  /** 适应宽度：纸张正好铺满容器可用宽度 */
  const fitScale = computed(() => {
    const available = containerWidth.value - PAGE_GUTTER * 2;
    const paperPx = paperWidthMm.value * mmToPx(1);
    if (available <= 0 || paperPx <= 0) return 1;
    return Math.min(MAX_FIT, available / paperPx);
  });

  /** 实际生效的缩放 */
  const scale = computed(() => (mode.value === "fit" ? fitScale.value : custom.value));

  function setMode(next: "fit" | "custom") {
    mode.value = next;
  }

  function setZoom(next: number | "fit") {
    if (next === "fit") {
      mode.value = "fit";
      return;
    }
    mode.value = "custom";
    custom.value = Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, next));
  }

  /**
   * Ctrl/⌘ + 滚轮缩放，锚定光标。
   *
   * 与设计态（`designPanel/index.vue` 的 `onWheel`）同一套手感：
   * - 缩放因子 1.1（上滚放大 / 下滚缩小）；
   * - 光标下的那一点在缩放前后保持不动 —— 用户盯哪儿，哪儿不跑。
   *
   * 预览与设计态有一处**刻意不同**：预览是"适应宽度"起步，所以滚轮缩放时
   * 要**退出 fit 模式**（否则改了 `custom` 也不生效，滚轮像坏了）。
   * 从 fit 退出时，以 `fitScale` 为基准开始放大 / 缩小，而不是从 100% 跳变。
   *
   * 锚定逻辑在纯函数 `zoomAtAnchor` 里，便于对照验证；本函数负责从事件里
   * 取出光标坐标（相对滚动容器的像素位置）。
   */
  function onWheel(e: WheelEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();

    const base = mode.value === "fit" ? fitScale.value : custom.value;
    const next = Math.min(
      PREVIEW_ZOOM_MAX,
      Math.max(PREVIEW_ZOOM_MIN, base * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
    );
    if (next === base) return;

    const el = container.value;
    if (!el) {
      // 拿不到容器就退化成"原地缩放"，滚轮仍要有效
      setZoom(next);
      return;
    }
    const rect = el.getBoundingClientRect();
    const ax = e.clientX - rect.left;
    const ay = e.clientY - rect.top;
    zoomAtAnchor(next, ax, ay);
  }

  /**
   * 以容器坐标 `(ax, ay)` 为锚点，把缩放设成 `next` 并保持锚点下的纸张位置不动。
   *
   * 原理与设计态 `zoomAt` 一致：先算出锚点在**缩放前的纸张坐标**（mm），
   * 缩放后反推该 mm 点应落在滚动容器的哪个像素，据此回写 `scrollLeft/scrollTop`。
   * 要等 `nextTick` —— 缩放改变的是内容尺寸，浏览器会在旧尺寸上钳制滚动值。
   */
  function zoomAtAnchor(next: number, ax: number, ay: number) {
    const el = container.value;
    if (!el) {
      setZoom(next);
      return;
    }

    const old = scale.value;
    const pxPerMmOld = mmToPx(1) * old;

    // 锚点相对纸张左上角的偏移（mm）。缩放前后纸张该点始终对应光标。
    const paperX = el.scrollLeft + ax - PAGE_GUTTER;
    const paperY = el.scrollTop + ay - PAGE_GUTTER;
    const mmX = paperX / pxPerMmOld;
    const mmY = paperY / pxPerMmOld;

    setZoom(next);

    const pxPerMmNew = mmToPx(1) * next;
    const targetX = Math.max(0, PAGE_GUTTER + mmX * pxPerMmNew - ax);
    const targetY = Math.max(0, PAGE_GUTTER + mmY * pxPerMmNew - ay);

    nextTick(() => {
      if (!container.value) return;
      container.value.scrollLeft = targetX;
      container.value.scrollTop = targetY;
    });
  }

  return { mode, scale, fitScale, containerWidth, setMode, setZoom, onWheel };
}
