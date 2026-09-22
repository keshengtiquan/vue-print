<template>
  <div class="h-full w-full">
    <img
      v-if="src && !failed"
      class="h-full w-full"
      :src="src"
      :style="{ objectFit: element.objectFit }"
      draggable="false"
      alt=""
      @error="failed = true"
    />
    <div
      v-else
      class="text-muted-foreground flex h-full w-full items-center justify-center overflow-hidden p-2 text-center text-[11px] break-all"
    >
      暂无图片
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 图片元素的纯渲染组件。
 *
 * ## 与设计态的两个差别，都是"渲染态"才成立的
 *
 * 1. **`src` 真的会被交出去。** 设计态刻意不渲染字段值（`src` 含占位符时返回空串，
 *    否则浏览器会把它当相对路径发 404 + 裂图）；预览态反过来 —— 这一句
 *    `renderTemplate(element.src, ctx)` 就是"字段值当图片地址用"的落点。
 * 2. **必须兜住加载失败。** 真 URL 也可能 404 / 跨域 / 超时，
 *    而"裂图"在打印预览里是最难解释的视觉噪音。所以 `@error` 一律回落到占位文案。
 *    注意 `failed` 要跟着 `src` 复位 —— 换了一条数据之后不能永远停在占位态。
 */
import { computed, ref, watch } from "vue";
import { renderTemplate, type TemplateContext } from "@/lib/template";
import type { ImageElement } from "@/components/design/types";

const props = defineProps<{
  element: ImageElement;
  ctx: TemplateContext;
  pxPerMm: number;
}>();

const failed = ref(false);

/** 渲染后的图片地址。取不到值 → 空串 → 走"暂无图片"分支（不裂图、不发 404） */
const src = computed(() => renderTemplate(props.element.src, props.ctx).trim());

// 换了一行数据 / 换了一次取数结果之后，上一次的加载失败不能继续生效
watch(src, () => {
  failed.value = false;
});
</script>
