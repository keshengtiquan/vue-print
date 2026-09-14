<template>
  <section class="page-section" aria-labelledby="preset-heading">
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

    <div class="preset-grid">
      <button
        v-for="p in PRESETS"
        :key="p.id"
        type="button"
        class="preset"
        :class="{ 'preset--active': p.id === currentPresetId }"
        :aria-pressed="p.id === currentPresetId"
        @click="applyPreset(p)"
      >
        <svg
          class="preset__thumb"
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
        <span class="preset_name">{{ p.id }}</span>
        <span class="preset__dim">
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
import { PRESETS, usePaper } from "./composables/usePaper";
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

<style scoped>
.orientation-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  margin-bottom: 10px;
  border: var(--hair);
  border-radius: 5px;
  overflow: hidden;
  background: color-mix(in oklab, currentcolor 3%, transparent);
}

.orientation-toggle__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 8px;
  background: transparent;
  border: 0;
  font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--color-muted-foreground, #6b7280);
  cursor: pointer;
  transition:
    color 180ms var(--ease-out, ease-out),
    background 180ms var(--ease-out, ease-out);
}

.orientation-toggle__btn + .orientation-toggle__btn {
  border-left: var(--hair);
}

.orientation-toggle__btn:hover {
  color: var(--color-foreground, #111);
  background: color-mix(in oklab, currentcolor 5%, transparent);
}

.orientation-toggle__btn:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--primary) 30%, transparent);
}

.orientation-toggle__btn--on {
  color: var(--primary);
  background: color-mix(in oklab, var(--primary) 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 40%, transparent);
}

.orientation-toggle__btn--on:hover {
  color: var(--primary);
  background: color-mix(in oklab, var(--primary) 14%, transparent);
}

.orientation-toggle__icon {
  width: 11px;
  height: 15px;
  color: currentcolor;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.preset {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 7px 4px 5px;
  background: transparent;
  border: 1px solid color-mix(in oklab, currentcolor 12%, transparent);
  border-radius: 4px;
  cursor: pointer;
  transition:
    border-color 160ms var(--ease-out, ease-out),
    background 160ms var(--ease-out, ease-out),
    transform 160ms var(--ease-out, ease-out);
}

.preset:hover {
  border-color: color-mix(in oklab, currentcolor 32%, transparent);
  background: color-mix(in oklab, currentcolor 5%, transparent);
}

.preset:active {
  transform: scale(0.96);
}

.preset--active {
  border-color: var(--primary);
  background: color-mix(in oklab, var(--primary) 10%, transparent);
  box-shadow:
    inset 0 0 0 1px var(--primary),
    0 1px 3px color-mix(in oklab, var(--primary) 22%, transparent);
}

.preset--active::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  border-top: 7px solid var(--primary);
  border-right: 7px solid transparent;
  border-top-left-radius: 3px;
}

.preset_name {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1;
  margin-top: 2px;
}

.preset--active .preset_name {
  color: var(--primary);
}

.preset__thumb {
  width: 26px;
  height: 36px;
  color: color-mix(in oklab, currentcolor 60%, transparent);
  transition: color 160ms var(--ease-out, ease-out);
}

.preset:hover .preset__thumb {
  color: currentcolor;
}

.preset__dim {
  font-size: 9px;
  color: var(--color-muted-foreground, #9ca3af);
  font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace;
  font-variant-numeric: tabular-nums;
}
</style>
