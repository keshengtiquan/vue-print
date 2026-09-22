<template>
  <div>
    <div
      class="group/field hover:border-primary/45 hover:bg-muted/70 flex cursor-grab items-center gap-1.5 rounded-sm border border-transparent py-1 pr-1.5 active:cursor-grabbing"
      :style="{ paddingLeft: `${6 + depth * 14}px` }"
      draggable="true"
      :title="`拖动「${field.name}」到画布元素或表格单元格`"
      @dragstart="onDragStart"
      @click="$emit('pick', field)"
    >
      <!--
        折叠箭头只在有子字段时出现；没有的行补一个等宽占位，
        否则同级图标会参差不齐，看着像两个不同的层级。
      -->
      <button
        v-if="hasChildren"
        type="button"
        class="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer rounded-xs p-0.5"
        :aria-expanded="expanded"
        :aria-label="expanded ? '折叠' : '展开'"
        @click.stop="expanded = !expanded"
      >
        <ChevronRight class="size-3 transition-transform" :class="expanded ? 'rotate-90' : ''" />
      </button>
      <span v-else class="w-4 shrink-0"></span>

      <component
        :is="iconOf(field.type)"
        class="text-muted-foreground pointer-events-none size-3.5 shrink-0"
      />
      <span class="pointer-events-none flex-1 truncate text-xs">{{ displayName }}</span>
      <span class="text-muted-foreground pointer-events-none shrink-0 text-[10px] tracking-tight">
        {{ typeLabel(field.type) }}
      </span>
      <GripVertical
        class="text-muted-foreground/50 pointer-events-none size-3 shrink-0 opacity-0 group-hover/field:opacity-100"
      />
    </div>

    <div v-if="hasChildren && expanded" class="space-y-0.5">
      <!-- 组件按文件名自引用，递归渲染子字段 -->
      <FieldNode
        v-for="child in field.children"
        :key="child.name"
        :field="child"
        :data-set-id="dataSetId"
        :depth="depth + 1"
        @pick="$emit('pick', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { Component } from "vue";
import { Braces, Calendar, ChevronRight, Clock, GripVertical, Hash, ToggleLeft, Type } from "@lucide/vue";
import { FIELD_MIME, setDraggingField } from "./model";
import { setDraggingMaterialId } from "@/components/design/material/materials";
import { useDataBinding } from "./useDataBinding";
import type { DataSetField, DataSetFieldType } from "./types";

const ops = useDataBinding();

const props = defineProps<{
  field: DataSetField;
  /** 拖拽载荷要带数据集 id，落点端要靠它回查数据集 */
  dataSetId: string;
  /** 0 = 顶层。只用来算缩进与显示名，不参与取值 */
  depth: number;
}>();

defineEmits<{ pick: [field: DataSetField] }>();

/**
 * 展开状态是**每个节点自己的本地状态**，不进 store：
 * 它是纯展示状态，扔进全局 store 只会多一份要同步的东西；
 * 默认 `false` 也就自然实现了"默认折叠"。换数据集时由宿主 `:key` 重建整棵树复位。
 */
const expanded = ref(false);

const hasChildren = computed(() => !!props.field.children?.length);

/**
 * 行内显示名。子字段的 `name` 是完整路径（`address.city`），
 * 但父节点就在上一行、还有缩进，再写一遍前缀纯属噪音 —— 行里只显示最后一段，
 * 完整路径放进 `title`。
 */
const displayName = computed(() => {
  if (props.field.label) return props.field.label;
  if (props.depth === 0) return props.field.name;
  const i = props.field.name.lastIndexOf(".");
  return i >= 0 ? props.field.name.slice(i + 1) : props.field.name;
});

const TYPE_ICONS: Record<DataSetFieldType, Component> = {
  string: Type,
  number: Hash,
  boolean: ToggleLeft,
  date: Calendar,
  datetime: Clock,
  json: Braces
};

const TYPE_LABELS: Record<DataSetFieldType, string> = {
  string: "文本",
  number: "数字",
  boolean: "布尔",
  date: "日期",
  datetime: "日期时间",
  json: "对象"
};

const iconOf = (type: DataSetFieldType) => TYPE_ICONS[type] ?? Type;
const typeLabel = (type: DataSetFieldType) => TYPE_LABELS[type] ?? type;

/**
 * 只往 dataTransfer 写载荷，**绝不碰响应式状态** ——
 * dragstart 之后浏览器要为源元素生成 drag image，此时改状态会与它打架
 * （素材台那条"一拖就卡死"的坑，同一个根因）。
 */
function onDragStart(e: DragEvent) {
  // 双通道：模块变量是主通道（见 model.ts draggingField 的说明），dataTransfer 兜底。
  // 同时清掉素材标记 —— 每次 dragstart 都重设两个通道，防止上次残留被误读。
  setDraggingField({ dataSetId: props.dataSetId, field: props.field.name });
  setDraggingMaterialId(null);
  if (!e.dataTransfer) return;
  e.dataTransfer.effectAllowed = "copy";
  const payload = JSON.stringify({ dataSetId: props.dataSetId, field: props.field.name });
  e.dataTransfer.setData(FIELD_MIME, payload);
  /*
    text/plain 兜底：拖到浏览器外部时（比如记事本）得到的就是它。
    这里用 `ops.fieldToken` 而不是手拼 `{字段名}`，是为了让**兜底文本与真正插进画布的内容
    形态完全一致**（都是 `{数据集.字段}`）—— 否则用户照着这段文本手敲进内容里，
    就会得到一个没有数据集标识的占位符，正是这次要消灭的那个形态。
  */
  e.dataTransfer.setData("text/plain", ops.fieldToken(props.field.name, props.dataSetId));
}
</script>
