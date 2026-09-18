<template>
  <!--
    表格级属性：作用于元素框整体，与"选中的是哪些单元格"无关。
    表格进入内编辑态后，面板是「表格属性 + 单元格属性」两段并存 ——
    这两块的粒度不同（整张表 vs 选区里的格），拆分比混在一列折叠项里清楚。
  -->
  <Accordion type="multiple" :default-value="['layout', 'table-tracks']">
    <ElementLayoutSection />

    <!--
      整表尺寸：不依赖选区，永远可用。
      放这里是因为"逐行去改"这个痛点的本质是**表格级**需求 —— 原来的行高输入框
      属于单元格面板，只在"选中整行"时才渲染，混合选区下压根不出现，
      用户要么先点行把手选中整行、要么根本找不到入口，于是只能一行一行改。
    -->
    <AccordionItem value="table-tracks">
      <AccordionTrigger>整表行高 / 列宽</AccordionTrigger>
      <AccordionContent class="px-1">
        <div class="grid grid-cols-2 gap-x-2 gap-y-2.5 pt-1">
          <div class="space-y-1.5">
            <Label for="table-row-height">每行行高（mm）</Label>
            <NumberField
              :model-value="uniformRowHeight"
              :min="MIN_TRACK"
              :step="1"
              @update:model-value="setUniformRowHeight"
            >
              <NumberFieldContent>
                <NumberFieldDecrement class="cursor-pointer" />
                <NumberFieldInput id="table-row-height" />
                <NumberFieldIncrement class="cursor-pointer" />
              </NumberFieldContent>
            </NumberField>
          </div>
          <div class="space-y-1.5">
            <Label for="table-col-width">每列列宽（mm）</Label>
            <NumberField
              :model-value="uniformColWidth"
              :min="MIN_TRACK"
              :step="1"
              @update:model-value="setUniformColWidth"
            >
              <NumberFieldContent>
                <NumberFieldDecrement class="cursor-pointer" />
                <NumberFieldInput id="table-col-width" />
                <NumberFieldIncrement class="cursor-pointer" />
              </NumberFieldContent>
            </NumberField>
          </div>
        </div>
        <p class="text-muted-foreground mt-2 text-[10px] leading-normal">
          {{ uniformHint }}
        </p>
      </AccordionContent>
    </AccordionItem>
  </Accordion>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useDesignStore } from "@/store/modules/design";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import {
  NumberField,
  NumberFieldContent,
  NumberFieldInput,
  NumberFieldDecrement,
  NumberFieldIncrement
} from "@/components/ui/number-field";
import { MIN_TRACK, round2, setAllTracks } from "@/components/design/table/model";
import type { TableElement } from "@/components/design/types";
import ElementLayoutSection from "./ElementLayoutSection.vue";

const props = defineProps<{ table: TableElement }>();
const store = useDesignStore();

/**
 * 整表批量改尺寸，**不依赖选区**。
 *
 * 显示值取现有尺寸的**平均**：全部相等时它就等于那个值（多数时候走这条），
 * 手工调过几行时给一个代表值 —— 用户改一次就把整表拉平，这正是本控件的用途。
 */
function average(list: number[]): number {
  if (!list.length) return 0;
  return round2(list.reduce((a, b) => a + b, 0) / list.length);
}

const uniformRowHeight = computed(() => average(props.table.rowHeights));
const uniformColWidth = computed(() => average(props.table.colWidths));

const uniformHint = computed(() => {
  const t = props.table;
  const mixed =
    !t.rowHeights.every((h) => h === t.rowHeights[0]) ||
    !t.colWidths.every((w) => w === t.colWidths[0]);
  return (
    `输入值应用到整表的 ${t.rows} 行 / ${t.cols} 列，表格总高、总宽随之为「数量 × 尺寸」。` +
    `只想让现有总尺寸在行/列间重新平分，用右键菜单的「平均分布各行 / 各列」。` +
    (mixed ? "当前行列尺寸不一致，上面显示的是平均值。" : "")
  );
});

function setUniformRowHeight(value: number) {
  store.updateTable(props.table.id, (t) => setAllTracks(t, "row", value));
}

function setUniformColWidth(value: number) {
  store.updateTable(props.table.id, (t) => setAllTracks(t, "col", value));
}
</script>
