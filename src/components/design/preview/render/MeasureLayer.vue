<template>
  <!--
    行高自适应的测量层：在视口外渲染**不分页的完整表**，量出每行自然高。

    为什么存在（2026-09-21 架构决策，`row-auto-height-design.md` §8.8）：
    行高自适应本该"边画边算"——但预览是先分页后渲染，把测量塞进分片渲染
    就成了"渲染→测量→重排"反馈环，真机连出三案（震荡卡死 / watch 深比较
    死循环 / 数据凭空消失）。这个层把"算"从渲染流程里拆出来：测量结果
    **与分页零耦合**，分页器吃稳定输入，环不存在，重排最多一次。

    隐藏用 `visibility:hidden` + 移出视口而**不是 display:none** ——
    后者没有布局，量不出高度。
  -->
  <div
    class="pointer-events-none fixed top-0 left-[-10000px]"
    style="visibility: hidden"
    aria-hidden="true"
  >
    <PreviewTable
      v-for="t in tables"
      :key="t.id"
      ref="tableRefs"
      measure-mode
      :element="t"
      :rows="allRows.get(t.id) ?? []"
      :px-per-mm="PX_PER_MM"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 测量层（无 UI）：每张表格元素对应一张隐藏的完整 PreviewTable。
 *
 * ## 重测时机（测量值什么时候会变）
 *
 * 行的自然高只由"列宽 + 字号 + 内容"决定，所以只有三类输入变化才需要重测：
 * 1. **取数完成**（`loadedAt`）—— 行内容整体换血；
 * 2. **表格声明变化**（deep watch 元素）—— 列宽 / 行高声明 / 自适应开关 /
 *    单元格样式 / 结构，都是元素自己的字段；
 * 3. **首次挂载**。
 *
 * 缩放**不触发**重测：测量用 1:1 的 `PX_PER_MM`，量出的 mm 与缩放无关。
 */
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useDesignStore } from "@/store/modules/design";
import { usePreviewStore } from "@/store/modules/preview";
import type { TableElement } from "@/components/design/types";
import PreviewTable from "./PreviewTable.vue";
import { PX_PER_MM } from "../usePreviewLayout";
import type { PreviewTableRow } from "../types";

const props = defineProps<{
  /** 取某表格展开后的全量行（`usePreviewLayout.expansionRowsOf`，保持同源） */
  rowsOf: (id: string) => PreviewTableRow[];
}>();

const design = useDesignStore();
const preview = usePreviewStore();

/** 参与测量的表格。隐藏元素（printable === false）不进分页流，也不必测 */
const tables = computed<TableElement[]>(() =>
  design.elements.filter(
    (el): el is TableElement => el.type === "table" && el.printable !== false
  )
);

/** 全量展开行（与分片渲染同源：同 index / templateRow / ctx 构造） */
const allRows = computed(() => {
  const map = new Map<string, PreviewTableRow[]>();
  for (const t of tables.value) map.set(t.id, props.rowsOf(t.id));
  return map;
});

const tableRefs = ref<Array<InstanceType<typeof PreviewTable> | null>>([]);

async function measureAll() {
  await nextTick();
  for (const inst of tableRefs.value) inst?.measure();
}

onMounted(measureAll);
// 取数完成 → 行内容换血 → 重测
watch(() => preview.loadedAt, measureAll);
// 列宽 / 行高声明 / 自适应开关 / 单元格样式 / 结构变化 → 重测
watch(tables, measureAll, { deep: true });

defineExpose({ measureAll });
</script>
