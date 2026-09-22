<template>
  <!--
    画布上的页码占位（示意层）—— 与 MarginGuides 同为「参考层」语义，三条硬约束：
    1. pointer-events: none —— 绝不拦截底下元素的选中/拖动/缩放，也不影响素材拖拽落点；
    2. 层级 z-30 与边距线同级（盖过元素即可），不要往上堆大数字去压全局浮层；
    3. 用中性色退到后景（muted-foreground），蓝色代表"选中/激活"，不给示意层用。

    它只回答"页码会占在纸底哪个位置"，所以：
    - 显示**模板字面**（`{$pageIndex}`/`{$pageCount}` 原样），一个字符都不替换 ——
      设计态画布不渲染真实数据是既定铁律（见 notes/05-data-binding.md §8）；
    - 横向对齐 / 奇偶分侧与预览页脚同一套语义：单页画布视作"奇数页"，
      开奇偶分侧时按奇数页靠右示意；未开则按 align 左/中/右。
  -->
  <div
    class="pointer-events-none absolute inset-x-0 z-30 flex"
    :class="justifyClass"
    :style="containerStyle"
    aria-hidden="true"
  >
    <span class="text-muted-foreground/60" :style="textStyle">{{ displayText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useDesignStore } from "@/store/modules/design";
import { mmToPx } from "@/lib/utils";

const store = useDesignStore();

/**
 * 占位文本：优先模板字面；模板被清空时退回「页码」二字，保证位置始终可见。
 * 不做 renderTemplate —— 设计态就是要让占位符原文可见，替换是预览/打印的事。
 */
const displayText = computed(() => store.pageNumber.template.trim() || "页码");

/**
 * 横向对齐。与预览页脚 footerJustifyClass 同语义：
 * 奇偶分侧优先（单页视作奇数页 → 靠右），否则按 align。
 */
const justifyClass = computed(() => {
  if (store.pageNumber.oddEven) return "justify-end";
  if (store.pageNumber.align === "left") return "justify-start";
  if (store.pageNumber.align === "right") return "justify-end";
  return "justify-center";
});

/*
 * 定位：贴纸张物理底边（理想 5mm），与预览页脚同一套几何约束（见 PreviewPage.vue
 * FOOTER_BASELINE_MM / FOOTER_HEIGHT_MM）。这是 HTML div，**不能用 CSS 的 mm 字面量**
 * （绝对单位不随画布缩放），必须 mm → px 再乘 `store.scale` 显式换算。
 */
const FOOTER_BASELINE_MM = 5;
const FOOTER_HEIGHT_MM = 4.2;

const containerStyle = computed(() => {
  const p = mmToPx(1) * store.scale;
  const bottom = Math.max(0, Math.min(FOOTER_BASELINE_MM, store.marginMm.bottom - FOOTER_HEIGHT_MM - 1));
  const side = store.marginMm.left * p;
  return {
    bottom: `${bottom * p}px`,
    paddingLeft: `${side}px`,
    paddingRight: `${side}px`
  };
});

const textStyle = computed(() => ({
  fontSize: `${3 * mmToPx(1) * store.scale}px`,
  lineHeight: 1.4
}));
</script>
