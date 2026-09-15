<template>
  <section aria-labelledby="margin-heading">
    <header>
      <div class="mb-3 flex items-center justify-end gap-2">
        <!--
          画布边距线显隐开关：图标态即状态（睁眼=显示 / 闭眼=隐藏），比文字标签省空间。
          关闭态降到最低视觉权重并去掉色彩，让"已隐藏"一眼可读，而不是靠 hover 去猜 ——
          状态必须自解释。
          开/关两态用**三元互斥**给出完整配色，不叠加同类工具类：Tailwind 的
          text-primary 与 text-muted-foreground 之间按生成顺序决胜，叠加结果不可控。
        -->
        <button
          type="button"
          class="focus-visible:border-primary focus-visible:ring-primary/25 inline-flex size-5.5 cursor-pointer items-center justify-center rounded-lg border border-current/12 bg-current/4 p-0 transition-[color,background,border-color] duration-160 ease-out focus-visible:ring-2 focus-visible:outline-none"
          :class="
            store.showMarginGuides
              ? 'text-primary hover:bg-primary/12'
              : 'text-muted-foreground opacity-65 hover:bg-current/8'
          "
          :aria-pressed="store.showMarginGuides"
          :title="store.showMarginGuides ? '隐藏画布边距线' : '显示画布边距线'"
          @click="store.showMarginGuides = !store.showMarginGuides"
        >
          <Eye v-if="store.showMarginGuides" class="size-3.25" />
          <EyeOff v-else class="size-3.25" />
        </button>
        <label
          class="inline-flex cursor-pointer items-center gap-1.25 text-sm tracking-[0.04em] text-black select-none"
        >
          <input
            v-model="uniformLocked"
            type="checkbox"
            class="pointer-events-none absolute opacity-0"
            aria-label="四向相同"
          />
          <span
            class="relative inline-block h-3 w-5.5 rounded-full border transition-[background,border-color] duration-180 ease-out"
            :class="
              uniformLocked ? 'border-primary bg-primary/22' : 'border-current/12 bg-current/6'
            "
          >
            <span
              class="absolute top-px left-px size-2 rounded-full transition-transform duration-180 ease-out"
              :class="uniformLocked ? 'bg-primary translate-x-2.5' : 'bg-current/70'"
            ></span>
          </span>
          <span class="text-sm" :class="uniformLocked && 'text-primary'">四向相同</span>
        </label>
        <button type="button" class="text-sm" @click="resetMargins">重置</button>
      </div>
    </header>

    <div
      class="mb-3 flex items-stretch overflow-hidden rounded-[5px] border border-current/12 bg-current/3"
    >
      <label
        class="focus-within:bg-primary/8 grid min-w-0 flex-1 grid-cols-[auto_1fr_auto] items-center gap-1.5 px-2.25 py-1.75 transition-[background] duration-160 ease-out hover:bg-current/5"
        :class="uniformLocked ? 'cursor-not-allowed opacity-55' : 'cursor-text'"
      >
        <span class="text-xs tracking-[0.04em] whitespace-nowrap text-black">横向 X</span>
        <input
          type="number"
          class="w-full min-w-0 [appearance:textfield] border-0 bg-transparent p-0 text-right text-xs font-semibold text-black tabular-nums outline-none"
          :value="marginX"
          min="0"
          max="100"
          step="0.5"
          @input="onXYInput('x', ($event.target as HTMLInputElement).value)"
        />
        <span class="text-xs tracking-[0.02em] text-black">mm</span>
      </label>
      <!--
        分隔符占位：原 .margin-xy__divider 没有对应样式，而 .xy-field + .xy-field
        也从未生效 —— 两个 label 之间隔着这个 span，相邻兄弟选择器根本不匹配，
        所以这里本来就没有竖线。本次转换**刻意保持原视觉**，不"顺手修复"。
      -->
      <span aria-hidden="true"></span>
      <label
        class="focus-within:bg-primary/8 grid min-w-0 flex-1 grid-cols-[auto_1fr_auto] items-center gap-1.5 px-2.25 py-1.75 transition-[background] duration-160 ease-out hover:bg-current/5"
        :class="uniformLocked ? 'cursor-not-allowed opacity-55' : 'cursor-text'"
      >
        <span class="text-xs tracking-[0.04em] whitespace-nowrap text-black">纵向 Y</span>
        <input
          type="number"
          class="w-full min-w-0 [appearance:textfield] border-0 bg-transparent p-0 text-right text-xs font-semibold text-black tabular-nums outline-none"
          :value="marginY"
          min="0"
          max="100"
          step="0.5"
          @input="onXYInput('y', ($event.target as HTMLInputElement).value)"
        />
        <span class="text-xs tracking-[0.02em] text-black">mm</span>
      </label>
    </div>

    <button
      type="button"
      class="hover:bg-primary/8 hover:text-primary focus-visible:ring-primary/22 mb-2 inline-flex cursor-pointer items-center gap-1 rounded-[3px] border-0 bg-transparent px-1.5 py-0.75 text-xs tracking-[0.04em] text-black transition-[color,background] duration-160 ease-out focus-visible:ring-2 focus-visible:outline-none"
      :aria-expanded="marginAdvanced"
      @click="marginAdvanced = !marginAdvanced"
    >
      {{ marginAdvanced ? "收起" : "单独设置上下左右" }}
      <span class="text-xs leading-none" aria-hidden="true">
        {{ marginAdvanced ? "▴" : "▾" }}
      </span>
    </button>

    <div v-show="marginAdvanced" class="mb-2.5 grid grid-cols-2 gap-1.5">
      <label
        class="focus-within:border-primary focus-within:bg-primary/6 grid grid-cols-[auto_1fr_auto] items-center gap-1.5 rounded-lg border border-current/12 px-2 py-1.5 transition-[background] duration-160 ease-out hover:bg-current/6"
        :class="
          uniformLocked ? 'cursor-not-allowed bg-current/2 opacity-50' : 'cursor-text bg-current/3'
        "
      >
        <span class="text-xs tracking-[0.04em] whitespace-nowrap text-black">上</span>
        <input
          type="number"
          class="text-foreground w-full min-w-0 [appearance:textfield] border-0 bg-transparent p-0 text-right text-xs font-semibold tabular-nums outline-none disabled:cursor-not-allowed"
          :value="store.marginMm.top"
          min="0"
          max="100"
          step="0.5"
          :disabled="uniformLocked"
          @input="onDirectionInput('top', ($event.target as HTMLInputElement).value)"
        />
        <span class="text-xs tracking-[0.02em] text-black">mm</span>
      </label>
      <label
        class="focus-within:border-primary focus-within:bg-primary/6 grid grid-cols-[auto_1fr_auto] items-center gap-1.5 rounded-lg border border-current/12 px-2 py-1.5 transition-[background] duration-160 ease-out hover:bg-current/6"
        :class="
          uniformLocked ? 'cursor-not-allowed bg-current/2 opacity-50' : 'cursor-text bg-current/3'
        "
      >
        <span class="text-xs tracking-[0.04em] whitespace-nowrap text-black">下</span>
        <input
          type="number"
          class="text-foreground w-full min-w-0 [appearance:textfield] border-0 bg-transparent p-0 text-right text-xs font-semibold tabular-nums outline-none disabled:cursor-not-allowed"
          :value="store.marginMm.bottom"
          min="0"
          max="100"
          step="0.5"
          :disabled="uniformLocked"
          @input="onDirectionInput('bottom', ($event.target as HTMLInputElement).value)"
        />
        <span class="text-xs tracking-[0.02em] text-black">mm</span>
      </label>
      <label
        class="focus-within:border-primary focus-within:bg-primary/6 grid grid-cols-[auto_1fr_auto] items-center gap-1.5 rounded-lg border border-current/12 px-2 py-1.5 transition-[background] duration-160 ease-out hover:bg-current/6"
        :class="
          uniformLocked ? 'cursor-not-allowed bg-current/2 opacity-50' : 'cursor-text bg-current/3'
        "
      >
        <span class="text-xs tracking-[0.04em] whitespace-nowrap text-black">左</span>
        <input
          type="number"
          class="text-foreground w-full min-w-0 [appearance:textfield] border-0 bg-transparent p-0 text-right text-xs font-semibold tabular-nums outline-none disabled:cursor-not-allowed"
          :value="store.marginMm.left"
          min="0"
          max="100"
          step="0.5"
          :disabled="uniformLocked"
          @input="onDirectionInput('left', ($event.target as HTMLInputElement).value)"
        />
        <span class="text-xs tracking-[0.02em] text-black">mm</span>
      </label>
      <label
        class="focus-within:border-primary focus-within:bg-primary/6 grid grid-cols-[auto_1fr_auto] items-center gap-1.5 rounded-lg border border-current/12 px-2 py-1.5 transition-[background] duration-160 ease-out hover:bg-current/6"
        :class="
          uniformLocked ? 'cursor-not-allowed bg-current/2 opacity-50' : 'cursor-text bg-current/3'
        "
      >
        <span class="text-xs tracking-[0.04em] whitespace-nowrap text-black">右</span>
        <input
          type="number"
          class="text-foreground w-full min-w-0 [appearance:textfield] border-0 bg-transparent p-0 text-right text-xs font-semibold tabular-nums outline-none disabled:cursor-not-allowed"
          :value="store.marginMm.right"
          min="0"
          max="100"
          step="0.5"
          :disabled="uniformLocked"
          @input="onDirectionInput('right', ($event.target as HTMLInputElement).value)"
        />
        <span class="text-xs tracking-[0.02em] text-black">mm</span>
      </label>
    </div>

    <div
      class="grid grid-cols-[28px_1fr_28px] grid-rows-[22px_96px_22px] gap-x-2 gap-y-1.5 [grid-template-areas:'top_top_top'_'left_pad_right'_'bottom_bottom_bottom']"
    >
      <button
        type="button"
        class="text-muted-foreground hover:border-primary/50 hover:bg-primary/8 hover:text-primary focus-visible:border-primary focus-visible:ring-primary/22 flex min-h-5.5 cursor-pointer items-center justify-center rounded-lg border border-current/12 bg-current/4 px-1.5 text-xs whitespace-nowrap tabular-nums transition-[border-color,background,color] duration-160 ease-out [grid-area:top] focus-visible:ring-2 focus-visible:outline-none"
        :title="`顶部边距 ${store.marginMm.top}mm`"
        @click="marginAdvanced = true"
      >
        <span class="inline-flex items-center gap-1 tracking-[0.04em]"
          >上 {{ store.marginMm.top }}</span
        >
      </button>

      <button
        type="button"
        class="text-muted-foreground hover:border-primary/50 hover:bg-primary/8 hover:text-primary focus-visible:border-primary focus-visible:ring-primary/22 flex min-h-5.5 cursor-pointer items-center justify-center rounded-lg border border-current/12 bg-current/4 px-1.5 text-xs whitespace-nowrap tabular-nums transition-[border-color,background,color] duration-160 ease-out [grid-area:left] focus-visible:ring-2 focus-visible:outline-none"
        :title="`左侧边距 ${store.marginMm.left}mm`"
        @click="marginAdvanced = true"
      >
        <span
          class="inline-flex items-center gap-1 tracking-widest [text-orientation:mixed] [writing-mode:vertical-rl]"
          >左 {{ store.marginMm.left }}</span
        >
      </button>

      <!--
        稿纸底纹：两层 repeating-linear-gradient 正交叠出 8px 见方的细格。
        这不是"能用任意值硬塞"的东西 —— 展开成 bg-[repeating-linear-gradient(...)]
        约 400 字符且完全不可读，故保留在 <style> 的 .paper-lines 里。
      -->
      <div
        class="paper-lines relative h-full self-stretch justify-self-center overflow-hidden rounded-lg border border-current/16 [grid-area:pad]"
        aria-hidden="true"
        :style="{
          aspectRatio: `${store.paper.widthMm} / ${store.paper.heightMm}`
        }"
      >
        <div
          class="border-primary bg-primary/5 pointer-events-none absolute box-border rounded-xs border-[1.5px] border-dashed transition-[inset] duration-220 ease-out"
          :style="{
            top: `${(store.marginMm.top / store.paper.heightMm) * 100}%`,
            right: `${(store.marginMm.right / store.paper.widthMm) * 100}%`,
            bottom: `${(store.marginMm.bottom / store.paper.heightMm) * 100}%`,
            left: `${(store.marginMm.left / store.paper.widthMm) * 100}%`
          }"
        >
          <span
            class="text-primary pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-[-55%] text-xs leading-none font-medium opacity-55"
            aria-hidden="true"
            >×</span
          >
        </div>
        <span
          class="pointer-events-none absolute top-0.75 left-1/2 -translate-x-1/2 text-xs leading-none text-black opacity-65 select-none"
          aria-hidden="true"
          >▲</span
        >
        <span
          class="pointer-events-none absolute bottom-0.75 left-1/2 -translate-x-1/2 text-xs leading-none text-black opacity-65 select-none"
          aria-hidden="true"
          >▼</span
        >
        <span
          class="pointer-events-none absolute top-1/2 right-0.75 -translate-y-1/2 text-xs leading-none text-black opacity-65 select-none"
          aria-hidden="true"
          >▶</span
        >
        <span
          class="pointer-events-none absolute top-1/2 left-0.75 -translate-y-1/2 text-xs leading-none text-black opacity-65 select-none"
          aria-hidden="true"
          >◀</span
        >
      </div>

      <button
        type="button"
        class="text-muted-foreground hover:border-primary/50 hover:bg-primary/8 hover:text-primary focus-visible:border-primary focus-visible:ring-primary/22 flex min-h-5.5 cursor-pointer items-center justify-center rounded-lg border border-current/12 bg-current/4 px-1.5 text-xs whitespace-nowrap tabular-nums transition-[border-color,background,color] duration-160 ease-out [grid-area:right] focus-visible:ring-2 focus-visible:outline-none"
        :title="`右侧边距 ${store.marginMm.right}mm`"
        @click="marginAdvanced = true"
      >
        <span
          class="inline-flex items-center gap-1 tracking-widest [text-orientation:mixed] [writing-mode:vertical-rl]"
          >右 {{ store.marginMm.right }}</span
        >
      </button>

      <button
        type="button"
        class="text-muted-foreground hover:border-primary/50 hover:bg-primary/8 hover:text-primary focus-visible:border-primary focus-visible:ring-primary/22 flex min-h-5.5 cursor-pointer items-center justify-center rounded-lg border border-current/12 bg-current/4 px-1.5 text-xs whitespace-nowrap tabular-nums transition-[border-color,background,color] duration-160 ease-out [grid-area:bottom] focus-visible:ring-2 focus-visible:outline-none"
        :title="`底部边距 ${store.marginMm.bottom}mm`"
        @click="marginAdvanced = true"
      >
        <span class="inline-flex items-center gap-1 tracking-[0.04em]"
          >下 {{ store.marginMm.bottom }}</span
        >
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Eye, EyeOff } from "@lucide/vue";
import { useMargin } from "../composables/useMargin";

const {
  store,
  uniformLocked,
  marginAdvanced,
  marginX,
  marginY,
  onXYInput,
  onDirectionInput,
  resetMargins
} = useMargin();
</script>

<style scoped>
/*
  稿纸底纹：两层 repeating-linear-gradient 正交叠加，画出 8px 见方的浅格 + 1px 格线，
  最后一层是极淡的底色。属于"能用任意值表达但会彻底牺牲可读性"的情况
  （展开成 bg-[...] 约 400 字符），因此保留在此。
*/
.paper-lines {
  background:
    repeating-linear-gradient(
      0deg,
      transparent 0,
      transparent 7px,
      color-mix(in oklab, currentcolor 6%, transparent) 7px,
      color-mix(in oklab, currentcolor 6%, transparent) 8px
    ),
    repeating-linear-gradient(
      90deg,
      transparent 0,
      transparent 7px,
      color-mix(in oklab, currentcolor 6%, transparent) 7px,
      color-mix(in oklab, currentcolor 6%, transparent) 8px
    ),
    color-mix(in oklab, currentcolor 2%, transparent);
}

/*
  数字输入框的 spinner 在这么窄的字段里会把数字挤变形，需要隐藏。
  ::-webkit-outer-spin-button / ::-webkit-inner-spin-button 是浏览器伪元素，
  没有工具类等价物（Firefox 侧由模板上的 [appearance:textfield] 负责）。
*/
input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button {
  appearance: none;
  margin: 0;
}
</style>
