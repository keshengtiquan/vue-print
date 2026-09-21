<template>
  <div class="h-full w-full" @dragover="onFieldDragOver" @drop="onFieldDrop">
    <img
      v-if="displaySrc"
      class="h-full w-full"
      :src="displaySrc"
      :style="{ objectFit: element.objectFit }"
      draggable="false"
      alt=""
    />
    <div
      v-else
      class="text-muted-foreground flex h-full w-full items-center justify-center overflow-hidden p-2 text-center break-all"
    >
      {{ isFieldSource ? element.src : "暂无图片" }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { hasPlaceholder } from "@/lib/template";
import { FIELD_MIME } from "@/components/design/data/model";
import type { ImageElement } from "@/components/design/types";
import { useDataBinding } from "@/components/design/data/useDataBinding";

const props = defineProps<{ element: ImageElement }>();
const ops = useDataBinding();

/**
 * 这个元素的 `src` 是不是字段占位符（`{商品图}`）。
 * 是的话**绝不能把它交给浏览器** —— 见 displaySrc 的注释。
 */
const isFieldSource = computed(() => hasPlaceholder(props.element.src));

/**
 * 实际交给 `<img>` 的地址：**设计态不渲染字段值**，与 TextElement 同一个口径
 * （表格文档 §1.5 约束 2 / 本文档 §6.7：设计态原样显示）。
 *
 * 含占位符时**返回空串**而不是原值，这一步是必须的：
 * `<img src="{商品图}">` 会被浏览器当成一个**相对路径**去发请求 ——
 * 控制台一屏 404、图片位置显示裂图，比"什么都不显示"糟糕得多。
 * 返回空串让它走 `v-else` 分支，明确显示"这里是一个图片字段"。
 */
const displaySrc = computed(() => (isFieldSource.value ? "" : (props.element.src ?? "")));

/* ---------- 字段拖入 ---------- */

function onFieldDragOver(e: DragEvent) {
  if (!e.dataTransfer?.types.includes(FIELD_MIME)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
}

function onFieldDrop(e: DragEvent) {
  const raw = e.dataTransfer?.getData(FIELD_MIME);
  if (!raw) return;
  e.preventDefault();
  e.stopPropagation();
  try {
    const { field, dataSetId } = JSON.parse(raw) as { field?: string; dataSetId?: string };
    // 图片元素没有"文本内容"可追加，占位符直接就是 src
    if (field) ops.bindImageSource(props.element.id, field, dataSetId);
  } catch {
    // 载荷不是我们的格式，忽略
  }
}
</script>
