<template>
  <PopoverRoot>
    <PopoverTrigger
      class="border-input bg-background hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full items-center gap-2 rounded-md border px-2 text-left outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background"
      :disabled="disabled"
      :aria-label="modelValue ? `当前颜色 ${modelValue}` : '未设置颜色'"
    >
      <ColorSwatch
        v-if="modelValue"
        :color="modelValue"
        class="size-5 shrink-0 rounded-sm border border-black/10"
        :style="{ backgroundColor: 'var(--reka-color-swatch-color)' }"
      />
      <span
        v-else
        class="color-picker__empty border-border size-5 shrink-0 rounded-sm border"
        aria-hidden="true"
        >/</span
      >
      <span class="text-muted-foreground font-mono text-xs">{{ modelValue || "/" }}</span>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        side="bottom"
        :side-offset="6"
        class="border-border bg-background w-60 rounded-md border p-2 shadow-lg"
      >
        <div class="space-y-2.5">
          <ColorAreaRoot
            v-slot="{ style }"
            :model-value="activeColor"
            color-space="hsl"
            x-channel="saturation"
            y-channel="lightness"
            class="relative"
            @update:color="updateColor"
          >
            <ColorAreaArea
              class="relative h-32 w-full overflow-hidden rounded-sm outline-none"
              :style="style"
              ><ColorAreaThumb
                class="block size-3.5 rounded-full border-2 border-white bg-transparent shadow-sm"
            /></ColorAreaArea>
          </ColorAreaRoot>
          <ColorSliderRoot
            :model-value="activeColor"
            channel="hue"
            color-space="hsl"
            class="relative flex h-3.5 w-full items-center"
            @update:color="updateColor"
            ><ColorSliderTrack
              class="color-picker__hue relative h-2 flex-1 rounded-full" /><ColorSliderThumb
              class="block size-3.5 rounded-full border-2 border-white bg-white shadow-sm"
          /></ColorSliderRoot>
          <div class="flex items-center gap-2">
            <ColorSliderRoot
              :model-value="activeColor"
              channel="alpha"
              color-space="hsl"
              class="relative flex h-3.5 flex-1 items-center"
              @update:color="updateColor"
              ><ColorSliderTrack
                class="color-picker__alpha relative h-2 flex-1 rounded-full" /><ColorSliderThumb
                class="block size-3.5 rounded-full border-2 border-white bg-white shadow-sm"
            /></ColorSliderRoot>
            <span class="text-muted-foreground w-8 text-right text-xs tabular-nums"
              >{{ alphaPercent }}%</span
            >
          </div>
          <div class="flex items-center gap-2">
            <ColorFieldRoot
              :model-value="hexColor"
              class="min-w-0 flex-1"
              @update:model-value="updateHex"
              ><ColorFieldInput
                class="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-md border bg-transparent px-2 font-mono text-xs outline-none focus-visible:ring-3"
                placeholder="#RRGGBB"
            /></ColorFieldRoot>
            <span class="text-muted-foreground text-xs">{{ alphaPercent }}%</span>
          </div>
          <div class="grid grid-cols-9 gap-1.5"
            ><button
              v-for="color in PRESET_COLORS"
              :key="color"
              type="button"
              class="ring-offset-background hover:ring-ring size-4 rounded-sm hover:ring-2 hover:ring-offset-1"
              :style="{ backgroundColor: color }"
              :aria-label="`选择 ${color}`"
              @click="updateHex(color)"
          /></div>
          <div class="flex items-center justify-between pt-0.5 text-xs"
            ><button type="button" class="text-destructive hover:underline" @click="clear"
              >清除</button
            ><button
              type="button"
              class="text-muted-foreground hover:text-foreground hover:underline"
              @click="clear"
              >透明</button
            ></div
          >
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup lang="ts">
import type { Color } from "reka-ui";
import {
  ColorAreaArea,
  ColorAreaRoot,
  ColorAreaThumb,
  ColorFieldInput,
  ColorFieldRoot,
  ColorSliderRoot,
  ColorSliderThumb,
  ColorSliderTrack,
  ColorSwatch,
  colorToString,
  normalizeColor,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger
} from "reka-ui";
import { computed, ref, watch } from "vue";
const props = defineProps<{ modelValue?: string | null; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: string | undefined] }>();
const PRESET_COLORS = [
  "#000000",
  "#FF0000",
  "#00B42A",
  "#0000FF",
  "#FFFF00",
  "#00D8DB",
  "#FF00FF",
  "#F04438",
  "#E91E63",
  "#9C27B0",
  "#673AB7",
  "#3F51B5",
  "#2196F3",
  "#03A9F4",
  "#00ACC1",
  "#009688",
  "#4CAF50",
  "#8BC34A",
  "#CDDC39",
  "#FFEB3B",
  "#FFC107",
  "#FF9800",
  "#FF5722",
  "#795548",
  "#9E9E9E",
  "#607D8B"
];
const activeColor = ref<Color>(normalizeColor(props.modelValue || "#000000"));
const hexColor = computed(() => colorToString(activeColor.value, "hex"));
const alphaPercent = computed(() => Math.round(activeColor.value.alpha * 100));
watch(
  () => props.modelValue,
  (value) => {
    if (value) activeColor.value = normalizeColor(value);
  }
);
function updateColor(color: Color) {
  activeColor.value = color;
  emit("update:modelValue", colorToString(color, "hex"));
}
function updateHex(value: string) {
  if (!value) return;
  try {
    activeColor.value = normalizeColor(value);
    emit("update:modelValue", colorToString(activeColor.value, "hex"));
  } catch {
    /* 保留上一个有效颜色 */
  }
}
function clear() {
  emit("update:modelValue", undefined);
}
</script>

<style scoped>
.color-picker__empty {
  display: grid;
  place-items: center;
  color: var(--muted-foreground);
  font-size: 1rem;
  line-height: 1;
}

.color-picker__hue {
  background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
}

.color-picker__alpha {
  background:
    linear-gradient(to right, transparent, var(--reka-color-slider-background, #000)),
    conic-gradient(#ddd 25%, #fff 0 50%, #ddd 0 75%, #fff 0) 0 / 8px 8px;
}
</style>
