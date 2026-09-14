<template>
  <section aria-labelledby="margin-heading">
    <header class="page-section__head">
      <div class="page-section__head-right">
        <!-- 画布边距线显隐开关：图标态即状态（睁眼=显示 / 闭眼=隐藏），比文字标签省空间 -->
        <button
          type="button"
          class="icon-toggle"
          :class="{ 'icon-toggle--off': !store.showMarginGuides }"
          :aria-pressed="store.showMarginGuides"
          :title="store.showMarginGuides ? '隐藏画布边距线' : '显示画布边距线'"
          @click="store.showMarginGuides = !store.showMarginGuides"
        >
          <Eye v-if="store.showMarginGuides" class="icon-toggle__icon" />
          <EyeOff v-else class="icon-toggle__icon" />
        </button>
        <label class="toggle-lock" :class="{ 'toggle-lock--on': uniformLocked }">
          <input
            v-model="uniformLocked"
            type="checkbox"
            class="toggle-lock__input"
            aria-label="四向相同"
          />
          <span class="toggle-lock__track">
            <span class="toggle-lock__thumb"></span>
          </span>
          <span class="toggle-lock__label">四向相同</span>
        </label>
        <button type="button" class="text-sm" @click="resetMargins">重置</button>
      </div>
    </header>

    <div class="margin-xy">
      <label class="xy-field" :class="{ 'xy-field--locked': uniformLocked }">
        <span class="xy-field__label">横向 X</span>
        <input
          type="number"
          class="xy-field_input"
          :value="marginX"
          min="0"
          max="100"
          step="0.5"
          @input="onXYInput('x', ($event.target as HTMLInputElement).value)"
        />
        <span class="xy-field__unit">mm</span>
      </label>
      <span class="margin-xy__divider" aria-hidden="true"></span>
      <label class="xy-field" :class="{ 'xy-field--locked': uniformLocked }">
        <span class="xy-field__label">纵向 Y</span>
        <input
          type="number"
          class="xy-field_input"
          :value="marginY"
          min="0"
          max="100"
          step="0.5"
          @input="onXYInput('y', ($event.target as HTMLInputElement).value)"
        />
        <span class="xy-field__unit">mm</span>
      </label>
    </div>

    <button
      type="button"
      class="margin-advanced-toggle"
      :aria-expanded="marginAdvanced"
      @click="marginAdvanced = !marginAdvanced"
    >
      {{ marginAdvanced ? "收起" : "单独设置上下左右" }}
      <span class="margin-advanced-toggle__chev" aria-hidden="true">
        {{ marginAdvanced ? "▴" : "▾" }}
      </span>
    </button>

    <div v-show="marginAdvanced" class="margin-grid">
      <label class="margin-grid__cell" :class="{ 'margin-grid__cell--locked': uniformLocked }">
        <span class="margin-grid__label">上</span>
        <input
          type="number"
          class="margin-grid__input"
          :value="store.marginMm.top"
          min="0"
          max="100"
          step="0.5"
          :disabled="uniformLocked"
          @input="onDirectionInput('top', ($event.target as HTMLInputElement).value)"
        />
        <span class="margin-grid__unit">mm</span>
      </label>
      <label class="margin-grid__cell" :class="{ 'margin-grid__cell--locked': uniformLocked }">
        <span class="margin-grid__label">下</span>
        <input
          type="number"
          class="margin-grid__input"
          :value="store.marginMm.bottom"
          min="0"
          max="100"
          step="0.5"
          :disabled="uniformLocked"
          @input="onDirectionInput('bottom', ($event.target as HTMLInputElement).value)"
        />
        <span class="margin-grid__unit">mm</span>
      </label>
      <label class="margin-grid__cell" :class="{ 'margin-grid__cell--locked': uniformLocked }">
        <span class="margin-grid__label">左</span>
        <input
          type="number"
          class="margin-grid__input"
          :value="store.marginMm.left"
          min="0"
          max="100"
          step="0.5"
          :disabled="uniformLocked"
          @input="onDirectionInput('left', ($event.target as HTMLInputElement).value)"
        />
        <span class="margin-grid__unit">mm</span>
      </label>
      <label class="margin-grid__cell" :class="{ 'margin-grid__cell--locked': uniformLocked }">
        <span class="margin-grid__label">右</span>
        <input
          type="number"
          class="margin-grid__input"
          :value="store.marginMm.right"
          min="0"
          max="100"
          step="0.5"
          :disabled="uniformLocked"
          @input="onDirectionInput('right', ($event.target as HTMLInputElement).value)"
        />
        <span class="margin-grid__unit">mm</span>
      </label>
    </div>

    <div class="margin-pad">
      <button
        type="button"
        class="margin-pad__rail margin-pad__rail--top"
        :title="`顶部边距 ${store.marginMm.top}mm`"
        @click="marginAdvanced = true"
      >
        <span class="margin-pad__chip">上 {{ store.marginMm.top }}</span>
      </button>

      <button
        type="button"
        class="margin-pad__rail margin-pad__rail--left"
        :title="`左侧边距 ${store.marginMm.left}mm`"
        @click="marginAdvanced = true"
      >
        <span class="margin-pad__chip margin-pad__chip--vertical"
          >左 {{ store.marginMm.left }}</span
        >
      </button>

      <div
        class="margin-pad__preview"
        aria-hidden="true"
        :style="{
          aspectRatio: `${store.paper.widthMm} / ${store.paper.heightMm}`
        }"
      >
        <div
          class="margin-pad__inner"
          :style="{
            top: `${(store.marginMm.top / store.paper.heightMm) * 100}%`,
            right: `${(store.marginMm.right / store.paper.widthMm) * 100}%`,
            bottom: `${(store.marginMm.bottom / store.paper.heightMm) * 100}%`,
            left: `${(store.marginMm.left / store.paper.widthMm) * 100}%`
          }"
        >
          <span class="margin-pad__cross" aria-hidden="true">×</span>
        </div>
        <span class="margin-pad__arrow margin-pad__arrow--n" aria-hidden="true">▲</span>
        <span class="margin-pad__arrow margin-pad__arrow--s" aria-hidden="true">▼</span>
        <span class="margin-pad__arrow margin-pad__arrow--e" aria-hidden="true">▶</span>
        <span class="margin-pad__arrow margin-pad__arrow--w" aria-hidden="true">◀</span>
      </div>

      <button
        type="button"
        class="margin-pad__rail margin-pad__rail--right"
        :title="`右侧边距 ${store.marginMm.right}mm`"
        @click="marginAdvanced = true"
      >
        <span class="margin-pad__chip margin-pad__chip--vertical"
          >右 {{ store.marginMm.right }}</span
        >
      </button>

      <button
        type="button"
        class="margin-pad__rail margin-pad__rail--bottom"
        :title="`底部边距 ${store.marginMm.bottom}mm`"
        @click="marginAdvanced = true"
      >
        <span class="margin-pad__chip">下 {{ store.marginMm.bottom }}</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Eye, EyeOff } from "@lucide/vue";
import { useMargin } from "./composables/useMargin";

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
.page-section__head-right {
  display: flex;
  align-items: center;
  justify-content: end;
  gap: 8px;
  margin-bottom: 12px;
}

/* 图标态开关：显隐画布边距线。
   关闭态（--off）降到最低视觉权重并去掉色彩，让"已隐藏"一眼可读，
   而不是靠 hover 去猜 —— 状态必须自解释。 */
.icon-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: var(--hair);
  border-radius: 4px;
  background: color-mix(in oklab, currentcolor 4%, transparent);
  color: var(--primary);
  cursor: pointer;
  transition:
    color 160ms var(--ease-out, ease-out),
    background 160ms var(--ease-out, ease-out),
    border-color 160ms var(--ease-out, ease-out);
}

.icon-toggle:hover {
  background: color-mix(in oklab, var(--primary) 12%, transparent);
}

.icon-toggle:focus-visible {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--primary) 25%, transparent);
}

.icon-toggle--off {
  color: var(--color-muted-foreground, #9ca3af);
  opacity: 0.65;
}

.icon-toggle--off:hover {
  background: color-mix(in oklab, currentcolor 8%, transparent);
}

.icon-toggle__icon {
  width: 13px;
  height: 13px;
}

.toggle-lock {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  color: #000;
  cursor: pointer;
  user-select: none;
  letter-spacing: 0.04em;
}

.toggle-lock__input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.toggle-lock__track {
  position: relative;
  display: inline-block;
  width: 22px;
  height: 12px;
  border: var(--hair);
  border-radius: 999px;
  background: color-mix(in oklab, currentcolor 6%, transparent);
  transition:
    background 180ms var(--ease-out, ease-out),
    border-color 180ms var(--ease-out, ease-out);
}

.toggle-lock__thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: color-mix(in oklab, currentcolor 70%, transparent);
  transition: transform 180ms var(--ease-out, ease-out);
}

.toggle-lock--on .toggle-lock__track {
  background: color-mix(in oklab, var(--primary) 22%, transparent);
  border-color: var(--primary);
}

.toggle-lock--on .toggle-lock__thumb {
  background: var(--primary);
  transform: translateX(10px);
}

.toggle-lock--on .toggle-lock__label {
  color: var(--primary);
  font-size: 14px;
}

.margin-xy {
  display: flex;
  align-items: stretch;
  gap: 0;
  margin-bottom: 12px;
  border: var(--hair);
  border-radius: 5px;
  background: color-mix(in oklab, currentcolor 3%, transparent);
  overflow: hidden;
}

.xy-field {
  flex: 1;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  min-width: 0;
  cursor: text;
  transition: background 160ms var(--ease-out, ease-out);
}

.xy-field + .xy-field {
  border-left: var(--hair);
}

.xy-field:hover {
  background: color-mix(in oklab, currentcolor 5%, transparent);
}

.xy-field:focus-within {
  background: color-mix(in oklab, var(--primary) 8%, transparent);
}

.xy-field--locked {
  opacity: 0.55;
  cursor: not-allowed;
}

.xy-field__label {
  font-size: 12px;
  color: #000;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.xy-field_input {
  appearance: textfield;
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
  outline: none;
  padding: 0;
  color: #000;
}

.xy-field_input::-webkit-outer-spin-button,
.xy-field_input::-webkit-inner-spin-button {
  appearance: none;
  margin: 0;
}

.xy-field__unit {
  font-size: 12px;
  color: #000;
  letter-spacing: 0.02em;
}

.margin-advanced-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
  padding: 3px 6px;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: #000;
  background: transparent;
  border: 0;
  cursor: pointer;
  border-radius: 3px;
  transition:
    color 160ms var(--ease-out, ease-out),
    background 160ms var(--ease-out, ease-out);
}

.margin-advanced-toggle:hover {
  color: var(--primary);
  background: color-mix(in oklab, var(--primary) 8%, transparent);
}

.margin-advanced-toggle:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--primary) 22%, transparent);
}

.margin-advanced-toggle__chev {
  font-size: 12px;
  line-height: 1;
}

.margin-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 10px;
}

.margin-grid__cell {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: var(--hair);
  border-radius: 4px;
  background: color-mix(in oklab, currentcolor 3%, transparent);
  cursor: text;
  transition: background 160ms var(--ease-out, ease-out);
}

.margin-grid__cell:hover {
  background: color-mix(in oklab, currentcolor 6%, transparent);
}

.margin-grid__cell:focus-within {
  border-color: var(--primary);
  background: color-mix(in oklab, var(--primary) 6%, transparent);
}

.margin-grid__cell--locked {
  opacity: 0.5;
  cursor: not-allowed;
  background: color-mix(in oklab, currentcolor 2%, transparent);
}

.margin-grid__label {
  font-size: 12px;
  color: #000;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.margin-grid__input {
  appearance: textfield;
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
  outline: none;
  padding: 0;
  color: var(--color-foreground, #111);
}

.margin-grid__input:disabled {
  cursor: not-allowed;
}

.margin-grid__input::-webkit-outer-spin-button,
.margin-grid__input::-webkit-inner-spin-button {
  appearance: none;
  margin: 0;
}

.margin-grid__unit {
  font-size: 12px;
  color: #000;
  letter-spacing: 0.02em;
}

.margin-pad {
  display: grid;
  grid-template:
    "top    top    top   " 22px
    "left   pad    right " 96px
    "bottom bottom bottom" 22px
    / 28px 1fr 28px;
  gap: 6px 8px;
}

.margin-pad__rail {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--color-muted-foreground, #6b7280);
  background: color-mix(in oklab, currentcolor 4%, transparent);
  border: var(--hair);
  border-radius: 4px;
  padding: 0 6px;
  min-height: 22px;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 160ms var(--ease-out, ease-out),
    background 160ms var(--ease-out, ease-out),
    color 160ms var(--ease-out, ease-out);
}

.margin-pad__rail:hover {
  border-color: color-mix(in oklab, var(--primary) 50%, transparent);
  color: var(--primary);
  background: color-mix(in oklab, var(--primary) 8%, transparent);
}

.margin-pad__rail:focus-visible {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--primary) 22%, transparent);
}

.margin-pad__rail--top {
  grid-area: top;
}

.margin-pad__rail--bottom {
  grid-area: bottom;
}

.margin-pad__rail--left {
  grid-area: left;
}

.margin-pad__rail--right {
  grid-area: right;
}

.margin-pad__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  letter-spacing: 0.04em;
}

.margin-pad__chip--vertical {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  letter-spacing: 0.1em;
}

.margin-pad__preview {
  grid-area: pad;
  position: relative;
  place-self: stretch center;
  height: 100%;
  border: 1px solid color-mix(in oklab, currentcolor 16%, transparent);
  border-radius: 4px;
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
  overflow: hidden;
}

.margin-pad__inner {
  position: absolute;
  border: 1.5px dashed var(--primary);
  border-radius: 2px;
  pointer-events: none;
  box-sizing: border-box;
  transition: inset 220ms var(--ease-out, ease-out);
  background: color-mix(in oklab, var(--primary) 5%, transparent);
}

.margin-pad__cross {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -55%);
  font-size: 12px;
  font-weight: 500;
  color: var(--primary);
  opacity: 0.55;
  pointer-events: none;
  line-height: 1;
}

.margin-pad__arrow {
  position: absolute;
  font-size: 12px;
  color: #000;
  opacity: 0.65;
  pointer-events: none;
  line-height: 1;
  user-select: none;
}

.margin-pad__arrow--n {
  top: 3px;
  left: 50%;
  transform: translateX(-50%);
}

.margin-pad__arrow--s {
  bottom: 3px;
  left: 50%;
  transform: translateX(-50%);
}

.margin-pad__arrow--e {
  top: 50%;
  right: 3px;
  transform: translateY(-50%);
}

.margin-pad__arrow--w {
  top: 50%;
  left: 3px;
  transform: translateY(-50%);
}
</style>
