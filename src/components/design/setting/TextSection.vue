<template>
  <section class="txt" aria-labelledby="txt-heading">
    <template v-if="text">
      <header class="txt__head">
        <h3 id="txt-heading" class="txt__title">文本属性</h3>
        <span class="txt__badge">TEXT</span>
      </header>

      <!-- 字号：UI 层用 pt（对齐 Excel/Word），store 里存 mm -->
      <div class="fs">
        <span class="fs__label">字号</span>
        <div class="fs__ctrl">
          <button
            type="button"
            class="fs__step"
            aria-label="减小字号"
            @click="step(-FONT_SIZE_STEP_PT)"
          >
            −
          </button>
          <input
            class="fs__input"
            type="number"
            :value="draft"
            :min="FONT_SIZE_MIN_PT"
            :max="FONT_SIZE_MAX_PT"
            :step="FONT_SIZE_STEP_PT"
            inputmode="decimal"
            aria-label="字号（磅）"
            @input="onInput(($event.target as HTMLInputElement).value)"
            @blur="onBlur"
          />
          <button
            type="button"
            class="fs__step"
            aria-label="增大字号"
            @click="step(FONT_SIZE_STEP_PT)"
          >
            +
          </button>
          <span class="fs__unit">pt</span>
        </div>
      </div>

      <!-- 物理尺寸读数：把"字号 ≠ 字高"直接摊给用户看 -->
      <div class="fs-read">
        <div class="fs-read__cell">
          <span class="fs-read__num">{{ fontSizeMm.toFixed(2) }}</span>
          <span class="fs-read__cap">字面框 mm</span>
        </div>
        <div class="fs-read__cell">
          <span class="fs-read__num">{{ hanziMm.toFixed(2) }}</span>
          <span class="fs-read__cap">汉字实际 mm</span>
        </div>
      </div>

      <div class="fs-presets">
        <button
          v-for="p in FONT_SIZE_PRESETS"
          :key="p.pt"
          type="button"
          class="fs-preset"
          :class="{ 'fs-preset--on': fontSizePt === p.pt }"
          :title="`${p.cn} · ${p.pt}pt`"
          @click="setPt(p.pt)"
        >
          {{ p.pt }}
        </button>
      </div>

      <p class="fs-note">按 Word 中文号数取值，内部以 mm 存储</p>
    </template>

    <template v-else>
      <p v-if="!selected" class="txt__empty">在画布中选择元素</p>
      <p v-else class="txt__empty">该元素暂无可编辑属性</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import {
  FONT_SIZE_MAX_PT,
  FONT_SIZE_MIN_PT,
  FONT_SIZE_PRESETS,
  FONT_SIZE_STEP_PT,
  useTextElement
} from "./composables/useTextElement";

const { text, selected, fontSizePt, fontSizeMm, hanziMm, draft, onInput, onBlur, step, setPt } =
  useTextElement();
</script>

<style scoped>
/* --hair 本由 setting/index.vue 的 .page-panel 提供（CSS 变量可跨 scoped 继承）。
   这里兜底定义一份，让本组件脱离那个父级也能直接用。 */
.txt {
  --hair: 1px solid color-mix(in oklab, currentcolor 12%, transparent);
}

.txt__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.txt__title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: #000;
}

.txt__badge {
  padding: 1px 5px;
  border: var(--hair);
  border-radius: 3px;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--color-muted-foreground, #9ca3af);
}

.fs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 9px;
  border: var(--hair);
  border-radius: 5px;
  background: color-mix(in oklab, currentcolor 3%, transparent);
  transition: background 160ms var(--ease-out, ease-out);
}

.fs:hover {
  background: color-mix(in oklab, currentcolor 5%, transparent);
}

.fs:focus-within {
  border-color: var(--primary);
  background: color-mix(in oklab, var(--primary) 8%, transparent);
}

.fs__label {
  font-size: 12px;
  color: #000;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.fs__ctrl {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.fs__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: var(--hair);
  border-radius: 3px;
  background: transparent;
  color: #000;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition:
    color 160ms var(--ease-out, ease-out),
    border-color 160ms var(--ease-out, ease-out),
    background 160ms var(--ease-out, ease-out);
}

.fs__step:hover {
  color: var(--primary);
  border-color: color-mix(in oklab, var(--primary) 50%, transparent);
  background: color-mix(in oklab, var(--primary) 8%, transparent);
}

.fs__step:focus-visible {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--primary) 22%, transparent);
}

.fs__input {
  appearance: textfield;
  width: 44px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: #000;
  outline: none;
}

.fs__input::-webkit-outer-spin-button,
.fs__input::-webkit-inner-spin-button {
  appearance: none;
  margin: 0;
}

.fs__unit {
  font-size: 12px;
  color: #000;
  letter-spacing: 0.02em;
}

.fs-read {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 8px;
}

.fs-read__cell {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px 8px;
  border: var(--hair);
  border-radius: 4px;
  background: color-mix(in oklab, currentcolor 3%, transparent);
}

.fs-read__num {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--primary);
  line-height: 1.2;
}

.fs-read__cap {
  font-size: 11px;
  color: var(--color-muted-foreground, #9ca3af);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.fs-presets {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
  margin-top: 8px;
}

.fs-preset {
  padding: 4px 0;
  border: var(--hair);
  border-radius: 4px;
  background: transparent;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: #000;
  cursor: pointer;
  transition:
    color 160ms var(--ease-out, ease-out),
    border-color 160ms var(--ease-out, ease-out),
    background 160ms var(--ease-out, ease-out);
}

.fs-preset:hover {
  color: var(--primary);
  border-color: color-mix(in oklab, var(--primary) 50%, transparent);
  background: color-mix(in oklab, var(--primary) 8%, transparent);
}

.fs-preset:focus-visible {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--primary) 22%, transparent);
}

.fs-preset--on {
  color: var(--primary);
  border-color: var(--primary);
  background: color-mix(in oklab, var(--primary) 14%, transparent);
  font-weight: 500;
}

.fs-note {
  margin: 10px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--color-muted-foreground, #9ca3af);
  letter-spacing: 0.02em;
}

.txt__empty {
  margin: 0;
  padding: 16px 0;
  font-size: 12px;
  text-align: center;
  color: var(--color-muted-foreground, #9ca3af);
  letter-spacing: 0.04em;
}
</style>
