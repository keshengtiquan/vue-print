<template>
  <section aria-labelledby="preset-heading">
    <div role="radiogroup" aria-label="纸张方向">
      <ToggleGroup v-model="pagerType" type="single" variant="outline" class="mb-3 w-full">
        <ToggleGroupItem
          class="w-1/2 cursor-pointer"
          value="portrait"
          @click="setOrientation('portrait')"
        >
          纵向
        </ToggleGroupItem>
        <ToggleGroupItem
          class="w-1/2 cursor-pointer"
          value="landscape"
          @click="setOrientation('landscape')"
        >
          横向
        </ToggleGroupItem>
      </ToggleGroup>
    </div>

    <div class="grid grid-cols-4 gap-1.5">
      <!--
        group/preset 是给子元素传"父按钮 hover"用的（缩略图 hover 时由 60% 提到实色）。
        选中与非选中两态的 border/bg 走**三元互斥**，不叠加同类工具类 ——
        Tailwind 的 border-current/12 与 border-primary 之间按生成顺序决胜，叠加结果不可控。
        hover: 系列留在公共类上是有意的：它特异性更高，能稳定压过选中态的颜色，
        与原 CSS 中 .preset:hover 覆盖 .preset--active 的行为一致。
      -->
      <button
        v-for="p in PRESETS"
        :key="p.id"
        type="button"
        class="group/preset relative flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border px-1 pt-1.75 pb-1.25 transition-[border-color,background,transform] duration-160 ease-out hover:border-current/32 hover:bg-current/5 active:scale-96"
        :class="
          p.id === currentPresetId
            ? `border-primary bg-primary/10 inset-ring-primary before:border-t-primary shadow-[0_1px_3px_color-mix(in_oklab,var(--primary)_22%,transparent)] inset-ring-1 before:absolute before:top-0 before:left-0 before:size-0 before:rounded-tl-[3px] before:border-t-[7px] before:border-r-[7px] before:border-r-transparent before:content-['']`
            : 'border-current/12 bg-transparent'
        "
        :aria-pressed="p.id === currentPresetId"
        @click="applyPreset(p)"
      >
        <svg
          class="h-9 w-6.5 text-current/60 transition-colors duration-160 ease-out group-hover/preset:text-current"
          viewBox="0 0 10 14"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect
            x="0.5"
            y="0.5"
            :width="ratioTo(p.widthMm, p.heightMm).w"
            :height="ratioTo(p.widthMm, p.heightMm).h"
            fill="none"
            stroke="currentColor"
            stroke-width="0.18"
          />
        </svg>
        <span
          class="mt-0.5 text-xs leading-none font-semibold tracking-[0.02em]"
          :class="p.id === currentPresetId && 'text-primary'"
        >
          {{ p.id }}
        </span>
        <span class="text-muted-foreground font-mono text-[9px] tabular-nums">
          {{
            orientation === "landscape"
              ? `${p.heightMm}×${p.widthMm}`
              : `${p.widthMm}×${p.heightMm}`
          }}
        </span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { PRESETS, usePaper } from "../composables/usePaper";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
const { orientation, currentPresetId, applyPreset, setOrientation } = usePaper();

const pagerType = ref("portrait");
/** 把任意 (w,h) 等比缩放到 9×13 viewBox，用于迷你缩略图 */
function ratioTo(w: number, h: number) {
  const maxW = 9;
  const maxH = 13;
  const r = Math.min(maxW / w, maxH / h);
  return { w: +(w * r).toFixed(2), h: +(h * r).toFixed(2) };
}
</script>
