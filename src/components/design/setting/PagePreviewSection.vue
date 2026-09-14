<template>
  <section class="page-preview" aria-label="纸张预览">
    <div class="page-preview__canvas">
      <svg
        :viewBox="`-6 -6 ${store.paper.widthMm + 12} ${store.paper.heightMm + 12}`"
        preserveAspectRatio="xMidYMid meet"
        class="page-preview__svg"
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
            :d="
              cornerPath(
                store.paper.widthMm - store.marginMm.right,
                store.marginMm.top,
                -1,
                1
              )
            "
          />
          <path
            :d="
              cornerPath(
                store.marginMm.left,
                store.paper.heightMm - store.marginMm.bottom,
                1,
                -1
              )
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
    <dl class="page-preview__meta">
      <dt class="page-preview__dt">规格</dt>
      <dd class="page-preview__dd">{{ currentPreset?.label ?? "自定义" }}</dd>
      <dt class="page-preview__dt">宽 × 高</dt>
      <dd class="page-preview__dd page-preview__dd--mono">
        {{ store.paper.widthMm }} × {{ store.paper.heightMm }}
        <span class="page-preview__unit">mm</span>
      </dd>
      <dt class="page-preview__dt">面积</dt>
      <dd class="page-preview__dd page-preview__dd--mono">
        {{ ((store.paper.widthMm * store.paper.heightMm) / 100).toFixed(1) }}
        <span class="page-preview__unit">cm²</span>
      </dd>
      <dt class="page-preview__dt">内容区</dt>
      <dd class="page-preview__dd page-preview__dd--mono">
        {{ contentW }} × {{ contentH }} <span class="page-preview__unit">mm</span>
      </dd>
    </dl>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { usePaper } from "./composables/usePaper";

/** store 由 usePaper 统一返回，避免同组件内多处调用 useDesignStore */
const { store, currentPreset } = usePaper();

/** 内容区尺寸（mm） */
const contentW = computed(() =>
  Math.max(
    0,
    +(store.paper.widthMm - store.marginMm.left - store.marginMm.right).toFixed(1)
  )
);
const contentH = computed(() =>
  Math.max(
    0,
    +(store.paper.heightMm - store.marginMm.top - store.marginMm.bottom).toFixed(1)
  )
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

<style scoped>
.page-preview {
  --page-preview-paper: #fff;

  display: grid;
  grid-template-columns: 84px 1fr;
  gap: 12px;
  padding: 12px;
  border: var(--hair);
  border-radius: 6px;
  background: linear-gradient(
    180deg,
    transparent 0,
    color-mix(in oklab, var(--primary) 4%, transparent) 100%
  );
  color: color-mix(in oklab, currentcolor 55%, transparent);
}

.page-preview__canvas {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 92px;
}

.page-preview__svg {
  display: block;
  height: 92px;
  width: 84px;
  overflow: visible;
}

.page-preview__meta {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 8px;
  margin: 0;
  font-size: 11px;
  align-self: center;
}

.page-preview__dt {
  color: var(--color-muted-foreground, #6b7280);
  font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.page-preview__dd {
  margin: 0;
  color: var(--color-foreground, #111);
  font-weight: 600;
  white-space: nowrap;
}

.page-preview__dd--mono {
  font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace;
  font-variant-numeric: tabular-nums;
}

.page-preview__unit {
  color: var(--color-muted-foreground, #9ca3af);
  font-weight: 400;
  font-size: 10px;
  margin-left: 1px;
}
</style>