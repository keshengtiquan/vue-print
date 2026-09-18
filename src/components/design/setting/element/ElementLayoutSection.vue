<template>
  <!--
    元素框的位置 & 尺寸。抽成组件是因为它有两个宿主：非编辑态的元素属性面板，
    以及表格编辑态下的「表格」属性区 —— 两处必须完全一致，复制一份迟早会漂。
    元素直接取当前选中项（两个宿主下 selectedId 都指向目标元素），不传 props。
  -->
  <AccordionItem value="layout">
    <AccordionTrigger>位置 &amp; 尺寸</AccordionTrigger>
    <AccordionContent class="px-1">
      <div v-if="element" class="grid grid-cols-2 gap-x-2 gap-y-2.5 pt-1">
        <div class="space-y-1.5">
          <Label for="element-x">X</Label>
          <NumberField
            :model-value="element.x"
            :step="5"
            :disabled="locked"
            @update:model-value="setCommon('x', $event)"
          >
            <NumberFieldContent>
              <NumberFieldDecrement class="cursor-pointer" />
              <NumberFieldInput id="element-x" />
              <NumberFieldIncrement class="cursor-pointer" />
            </NumberFieldContent>
          </NumberField>
        </div>
        <div class="space-y-1.5">
          <Label for="element-y">Y</Label>
          <NumberField
            :model-value="element.y"
            :step="5"
            :disabled="locked"
            @update:model-value="setCommon('y', $event)"
          >
            <NumberFieldContent>
              <NumberFieldDecrement class="cursor-pointer" />
              <NumberFieldInput id="element-y" />
              <NumberFieldIncrement class="cursor-pointer" />
            </NumberFieldContent>
          </NumberField>
        </div>
        <div class="space-y-1.5">
          <Label for="element-width">宽度</Label>
          <NumberField
            :model-value="element.width"
            :min="1"
            :step="10"
            :disabled="locked"
            @update:model-value="setCommon('width', $event)"
          >
            <NumberFieldContent>
              <NumberFieldDecrement class="cursor-pointer" />
              <NumberFieldInput id="element-width" />
              <NumberFieldIncrement class="cursor-pointer" />
            </NumberFieldContent>
          </NumberField>
        </div>
        <div class="space-y-1.5">
          <Label for="element-height">高度</Label>
          <NumberField
            :model-value="element.height"
            :min="1"
            :step="10"
            :disabled="locked"
            @update:model-value="setCommon('height', $event)"
          >
            <NumberFieldContent>
              <NumberFieldDecrement class="cursor-pointer" />
              <NumberFieldInput id="element-height" />
              <NumberFieldIncrement class="cursor-pointer" />
            </NumberFieldContent>
          </NumberField>
        </div>
      </div>
      <p class="text-muted-foreground mt-2 text-[10px]">单位：毫米（mm）</p>
    </AccordionContent>
  </AccordionItem>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useDesignStore } from "@/store/modules/design";
import { Label } from "@/components/ui/label";
import {
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

const store = useDesignStore();
const element = computed(() => (store.selectedId ? store.getElement(store.selectedId) : undefined));
/** 锁定态：控件统一禁用，只能从说明条或画布右键解锁 */
const locked = computed(() => element.value?.locked ?? false);

/**
 * 改总宽 / 总高时 store.updateElement 会自动等比缩放全部列宽 / 行高（表格几何不变量），
 * 所以这里不需要区分元素类型 —— 表格走的就是同一份代码。
 */
function setCommon(key: "x" | "y" | "width" | "height", value: number) {
  if (!element.value || !Number.isFinite(value)) return;
  store.updateElement(element.value.id, { [key]: value });
}
</script>
