<template>
  <section
    class="to-primary/4 grid grid-cols-[84px_1fr] gap-3 rounded-sm border border-current/12 bg-linear-to-b from-transparent p-3 text-current/55"
    aria-label="纸张预览"
  >
    <div class="flex h-23 items-center justify-center">
      <svg
        :viewBox="`-6 -6 ${store.paper.widthMm + 12} ${store.paper.heightMm + 12}`"
        preserveAspectRatio="xMidYMid meet"
        class="block h-23 w-21 overflow-visible"
        role="img"
        :aria-label="`${currentPreset?.label ?? '自定义'} 纸张 ${store.paper.widthMm} × ${store.paper.heightMm} 毫米`"
      >
        <defs>
          <filter id="paper-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow
              dx="0"
              :dy="paintUnit * 1.2"
              :stdDeviation="paintUnit * 1.2"
              flood-opacity="0.18"
            />
          </filter>
        </defs>
        <rect
          x="0"
          y="0"
          :width="store.paper.widthMm"
          :height="store.paper.heightMm"
          fill="#ffffff"
          stroke="currentColor"
          :stroke-width="paintUnit * 0.9"
          filter="url(#paper-shadow)"
        />
        <rect
          :x="store.marginMm.left"
          :y="store.marginMm.top"
          :width="contentW"
          :height="contentH"
          fill="none"
          stroke="var(--primary)"
          :stroke-width="paintUnit * 0.9"
          :stroke-dasharray="`${paintUnit * 2.4} ${paintUnit * 2}`"
          opacity="0.9"
        />
        <g
          stroke="var(--primary)"
          :stroke-width="paintUnit * 1.4"
          fill="none"
          stroke-linecap="square"
        >
          <path :d="cornerPath(store.marginMm.left, store.marginMm.top, 1, 1)" />
          <path
            :d="cornerPath(store.paper.widthMm - store.marginMm.right, store.marginMm.top, -1, 1)"
          />
          <path
            :d="
              cornerPath(store.marginMm.left, store.paper.heightMm - store.marginMm.bottom, 1, -1)
            "
          />
          <path
            :d="
              cornerPath(
                store.paper.widthMm - store.marginMm.right,
                store.paper.heightMm - store.marginMm.bottom,
                -1,
                -1
              )
            "
          />
        </g>
      </svg>
    </div>
    <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.75 self-center text-[11px]">
      <dt class="text-muted-foreground font-mono tracking-[0.04em] whitespace-nowrap">规格</dt>
      <dd class="text-foreground m-0 font-semibold whitespace-nowrap">
        {{ currentPreset?.label ?? "自定义" }}
      </dd>
      <dt class="text-muted-foreground font-mono tracking-[0.04em] whitespace-nowrap">宽 × 高</dt>
      <dd class="text-foreground m-0 font-mono font-semibold whitespace-nowrap tabular-nums">
        {{ store.paper.widthMm }} × {{ store.paper.heightMm }}
        <span class="text-muted-foreground ml-px text-[10px] font-normal">mm</span>
      </dd>
      <dt class="text-muted-foreground font-mono tracking-[0.04em] whitespace-nowrap">面积</dt>
      <dd class="text-foreground m-0 font-mono font-semibold whitespace-nowrap tabular-nums">
        {{ ((store.paper.widthMm * store.paper.heightMm) / 100).toFixed(1) }}
        <span class="text-muted-foreground ml-px text-[10px] font-normal">cm²</span>
      </dd>
      <dt class="text-muted-foreground font-mono tracking-[0.04em] whitespace-nowrap">内容区</dt>
      <dd class="text-foreground m-0 font-mono font-semibold whitespace-nowrap tabular-nums">
        {{ contentW }} × {{ contentH }}
        <span class="text-muted-foreground ml-px text-[10px] font-normal">mm</span>
      </dd>
    </dl>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { usePaper } from "../composables/usePaper";

/** store 由 usePaper 统一返回，避免同组件内多处调用 useDesignStore */
const { store, currentPreset } = usePaper();

/** 内容区尺寸（mm） */
const contentW = computed(() =>
  Math.max(0, +(store.paper.widthMm - store.marginMm.left - store.marginMm.right).toFixed(1))
);
const contentH = computed(() =>
  Math.max(0, +(store.paper.heightMm - store.marginMm.top - store.marginMm.bottom).toFixed(1))
);

/**
 * 描边换算系数：屏幕渲染高度 92px，让描边宽度恒为 ~1px。
 * paintUnit = (viewBox 高度 + 12) / 92 → 1px 对应的 mm 数。
 */
const PREVIEW_H = 92;
const paintUnit = computed(() => (store.paper.heightMm + 12) / PREVIEW_H);

/** 工业风角标路径 */
function cornerPath(cx: number, cy: number, sx: number, sy: number) {
  const base = Math.min(Math.abs(contentW.value), Math.abs(contentH.value));
  const l = Math.max(2, Math.min(12, base * 0.06));
  return `M ${cx} ${cy + sy * l} L ${cx} ${cy} L ${cx + sx * l} ${cy}`;
}
</script>
