<template>
  <div class="space-y-0.5">
    <FieldNode
      v-for="field in dataSet.fields"
      :key="field.name"
      :field="field"
      :data-set-id="dataSet.id"
      :depth="0"
      @pick="$emit('pick', $event)"
    />

    <p v-if="!dataSet.fields?.length" class="text-muted-foreground px-1.5 py-2 text-[11px] leading-4">
      还没有字段。<br />
      点上方「测试并解析」从接口取一次数据，字段会自动列出来。
    </p>
  </div>
</template>

<script setup lang="ts">
import FieldNode from "./FieldNode.vue";
import type { DataSetField, TemplateDataSet } from "./types";

/**
 * 字段树只是"逐个字段交给 FieldNode 渲染"。
 *
 * 递归、缩进、折叠、拖拽全在 `FieldNode.vue` 里 —— 一行字段所需的全部信息
 * （子字段、展开态、拖拽载荷）本来就是它自己的，摊在树这一层反而要来回传。
 */
defineProps<{ dataSet: TemplateDataSet }>();

defineEmits<{ pick: [field: DataSetField] }>();
</script>
