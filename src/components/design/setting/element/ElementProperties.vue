<template>
  <div v-if="element" class="space-y-2">
    <!--
      表格内编辑态（第 2 层）：面板换成「表格 + 单元格」两段并存。
      这是需求 ④ 的另一半 —— 表格的面板与非表格的面板不只是控件不同，
      连"改的是什么粒度"都不同（整张表 vs 选区里的格），所以按粒度分成两组。
      早先是整个面板被单元格面板**替换**掉，代价是编辑表格时连表宽、整表行高都改不了，
      只能先退出编辑态 —— 而"统一所有行高"恰恰是编辑表格时最想做的事。
    -->
    <template v-if="activeTable">
      <div
        class="border-primary/30 bg-primary/8 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs"
      >
        <Table2 class="size-3.5 shrink-0" />
        <span class="flex-1">正在编辑表格</span>
        <button
          type="button"
          class="text-primary flex cursor-pointer items-center gap-1 font-medium hover:underline"
          @click="exitTable"
        >
          退出
        </button>
      </div>

      <!-- 表格级：元素框 + 整表行列尺寸。与选区无关，任何时候都可用 -->
      <div class="space-y-1.5">
        <p class="text-muted-foreground text-xs font-medium">表格</p>
        <TableProperties :table="activeTable" />
      </div>

      <!-- 单元格级：全部作用于当前选区 -->
      <div class="space-y-1.5">
        <p class="text-muted-foreground text-xs font-medium">单元格</p>
        <TableCellProperties :table="activeTable" />
      </div>
    </template>

    <!-- 锁定态说明条：属性全禁用后总得有个出口，否则用户只能去画布上右键解锁 -->
    <div
      v-if="locked"
      class="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs"
    >
      <Lock class="size-3.5 shrink-0" />
      <span class="flex-1">元素已锁定，属性暂不可编辑</span>
      <button
        type="button"
        class="flex cursor-pointer items-center gap-1 font-medium hover:underline"
        @click="unlock"
      >
        <LockKeyholeOpen class="size-3.5" />解锁
      </button>
    </div>
    <!--
      元素级属性：表格进入内编辑态时整块让位给上面的「表格 + 单元格」两组
      （粒度不同，不叠加）。
    -->
    <Accordion
      v-if="!activeTable"
      type="multiple"
      :default-value="['layout', 'behavior', 'specific']"
    >
      <ElementLayoutSection />

      <AccordionItem value="specific">
        <AccordionTrigger>{{ elementTypeLabel }}属性</AccordionTrigger>
        <AccordionContent class="px-1">
          <section
            v-for="section in propertySections"
            :key="section.title"
            class="space-y-2.5 pt-1"
          >
            <p
              v-if="propertySections.length > 1"
              class="text-muted-foreground text-xs font-medium"
              >{{ section.title }}</p
            >
            <div v-for="field in section.fields" :key="field.key" class="space-y-1.5">
              <Label :for="`property-${field.key}`">{{ field.label }}</Label>
              <Textarea
                v-if="field.type === 'textarea'"
                :id="`property-${field.key}`"
                class="min-h-18"
                :placeholder="field.placeholder"
                :model-value="displayValue(field)"
                :disabled="locked"
                @update:model-value="setField(field, String($event))"
              />
              <Select
                v-else-if="field.type === 'select'"
                :model-value="displayValue(field)"
                @update:model-value="setField(field, String($event))"
              >
                <SelectTrigger :id="`property-${field.key}`" class="w-full" :disabled="locked"
                  ><SelectValue :placeholder="field.placeholder ?? '请选择'"
                /></SelectTrigger>
                <SelectContent
                  ><SelectItem
                    v-for="option in field.options"
                    :key="option.value"
                    :value="option.value"
                    >{{ option.label }}</SelectItem
                  ></SelectContent
                >
              </Select>
              <ColorPicker
                v-else-if="field.type === 'color'"
                :model-value="displayValue(field) || undefined"
                :disabled="locked"
                @update:model-value="setField(field, $event ?? '')"
              />
              <NumberField
                v-else-if="field.type === 'number'"
                :model-value="Number(displayValue(field)) || field.min || 0"
                :min="field.min"
                :step="field.step"
                :disabled="locked"
                @update:model-value="setField(field, String($event))"
              >
                <NumberFieldContent>
                  <NumberFieldDecrement class="cursor-pointer" />
                  <NumberFieldInput :id="`property-${field.key}`" />
                  <NumberFieldIncrement class="cursor-pointer" />
                </NumberFieldContent>
              </NumberField>
              <ImageSourceField
                v-else-if="field.type === 'image'"
                :key="`${field.key}-${element.id}`"
                :model-value="displayValue(field)"
                :disabled="locked"
                :max-size="field.maxSize"
                :max-dimension="field.maxDimension"
                @update:model-value="setField(field, $event)"
                @loaded="onImageLoaded"
              />
              <Input
                v-else
                :id="`property-${field.key}`"
                :placeholder="field.placeholder"
                :model-value="displayValue(field)"
                :disabled="locked"
                @change="setField(field, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </section>
          <!--
            表格的增删行列、合并拆分、逐格样式都在"表格内编辑态"里做，
            面板上留一个显式入口 —— 否则用户只能靠"双击画布上的表格"这条隐藏路径。
          -->
          <Button
            v-if="element.type === 'table'"
            type="button"
            variant="outline"
            size="sm"
            class="mt-2.5 w-full cursor-pointer"
            @click="enterTable"
          >
            <Table2 />编辑表格内容
          </Button>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="behavior">
        <AccordionTrigger>数据 &amp; 行为</AccordionTrigger>
        <AccordionContent class="px-1">
          <div class="space-y-2.5 pt-1">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm">每页重复</p>
                <p class="text-muted-foreground text-xs">在每一页都绘制此元素</p>
              </div>
              <Switch
                class="cursor-pointer"
                :model-value="element.repeatOnEachPage ?? false"
                :disabled="locked"
                @update:model-value="setCommon('repeatOnEachPage', $event)"
              />
            </div>
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm">是否打印</p>
                <p class="text-muted-foreground text-xs">关闭后仅在编辑画布中保留</p>
              </div>
              <Switch
                class="cursor-pointer"
                :model-value="element.printable ?? true"
                :disabled="locked"
                @update:model-value="setCommon('printable', $event)"
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </div>

  <div
    v-else
    class="border-border flex min-h-42 flex-col items-center justify-center rounded-lg border border-dashed px-5 text-center"
  >
    <p class="text-sm font-medium">未选择元素</p>
    <p class="text-muted-foreground mt-1 text-xs leading-5">请在画布中选择一个元素后编辑其属性</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Lock, LockKeyholeOpen, Table2 } from "@lucide/vue";
import { useDesignStore } from "@/store/modules/design";
import { mmToPt, mmToPx, ptToMm, pxToMm, roundPt } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NumberField,
  NumberFieldContent,
  NumberFieldInput,
  NumberFieldDecrement,
  NumberFieldIncrement
} from "@/components/ui/number-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ELEMENT_PROPERTY_CONFIG, type PropertyFieldConfig } from "../element-property-config";
import { ColorPicker } from "@/components/color-picker";
import ImageSourceField from "./ImageSourceField.vue";
import TableCellProperties from "./TableCellProperties.vue";
import TableProperties from "./TableProperties.vue";
import ElementLayoutSection from "./ElementLayoutSection.vue";

const store = useDesignStore();
const element = computed(() => (store.selectedId ? store.getElement(store.selectedId) : undefined));
/** 锁定态：面板内所有属性控件统一禁用，只能从说明条或画布右键解锁 */
const locked = computed(() => element.value?.locked ?? false);

/**
 * 当前选中的元素**正处在表格内编辑态**时返回该表格，否则 null。
 *
 * 用 `store.activeTable` 而不是自己判断 editingId：那个 getter 已经承担了
 * "id 还在、元素还在、类型还是 table"三重校验，面板没必要再算一遍
 * （而且漏掉任何一条都会让面板拿着一个不存在的表格去渲染）。
 */
const activeTable = computed(() => {
  const table = store.activeTable;
  return table && table.id === element.value?.id ? table : null;
});

function exitTable() {
  store.exitTable();
}

function enterTable() {
  if (element.value) store.enterTable(element.value.id);
}
const propertySections = computed(() =>
  element.value ? ELEMENT_PROPERTY_CONFIG[element.value.type] : []
);
const elementTypeLabel = computed(
  () =>
    ({ text: "文本", table: "表格", line: "线条", image: "图片" })[element.value?.type ?? "text"]
);

function setCommon(key: string, value: number | boolean) {
  if (element.value) store.updateElement(element.value.id, { [key]: value });
}

function unlock() {
  if (element.value) store.updateElement(element.value.id, { locked: false });
}

/**
 * 上传成功后按图片原始比例适配元素框：保持宽度，只重算高度。
 *
 * 素材默认是 50×100 的竖长框，与绝大多数图的比例都不匹配，不重算的话用户
 * 每次上传完都要手动拖一遍。宽度不动是为了让用户"放在哪儿、多宽"的意图不被推翻。
 *
 * 护栏：等比算出的高度若超出纸张，就反过来按纸张高度定高 —— 否则一张长图会
 * 直接竖着穿出纸面，用户还得先把它拖回来才能继续编辑。
 */
function onImageLoaded({ width, height }: { width: number; height: number }) {
  const el = element.value;
  if (!el || el.type !== "image" || width <= 0 || height <= 0) return;
  const ratio = height / width;
  let nextWidth = el.width;
  let nextHeight = nextWidth * ratio;
  if (nextHeight > store.paper.heightMm) {
    nextHeight = store.paper.heightMm;
    nextWidth = nextHeight / ratio;
  }
  const round2 = (value: number) => Math.round(value * 100) / 100;
  store.updateElement(el.id, { width: round2(nextWidth), height: round2(nextHeight) });
}

function getByPath(target: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined,
      target
    );
}

function displayValue(field: PropertyFieldConfig) {
  const value =
    element.value && getByPath(element.value as unknown as Record<string, unknown>, field.path);
  if (field.path === "dash" && Array.isArray(value)) return value.join(", ");
  if (value === undefined && field.path === "fontSize") {
    // 与画布渲染的默认 4mm 保持一致，并映射到最接近的标准 pt 档位。
    const points = roundPt(mmToPt(4));
    const sizes =
      field.options?.map((option) => Number(option.value)).filter(Number.isFinite) ?? [];
    return sizes
      .reduce(
        (nearest, size) => (Math.abs(size - points) < Math.abs(nearest - points) ? size : nearest),
        sizes[0] ?? points
      )
      .toString();
  }
  if (value !== undefined && value !== null) {
    if (field.displayUnit === "pt") {
      const points = roundPt(mmToPt(Number(value)));
      const sizes =
        field.options?.map((option) => Number(option.value)).filter(Number.isFinite) ?? [];
      const closest = sizes.reduce(
        (nearest, size) => (Math.abs(size - points) < Math.abs(nearest - points) ? size : nearest),
        sizes[0] ?? points
      );
      return closest.toString();
    }
    if (field.displayUnit === "px") return (Math.round(mmToPx(Number(value)) * 10) / 10).toString();
    return value.toString();
  }
  return (
    {
      fontFamily: "__default_font__",
      verticalAlign: "top",
      layout: "horizontal",
      fontWeight: "normal",
      borderStyle: "none"
    }[field.path] ?? ""
  );
}

function setField(field: PropertyFieldConfig, rawValue: string) {
  if (!element.value) return;
  let value: unknown = rawValue;
  if (field.type === "color" && !rawValue) value = undefined;
  if (field.path === "fontFamily" && rawValue === "__default_font__") value = undefined;
  if (field.type === "number") {
    const numberValue = Number(rawValue);
    if (!Number.isFinite(numberValue)) return;
    value = field.min !== undefined ? Math.max(field.min, numberValue) : numberValue;
  }
  if (field.displayUnit === "pt") value = ptToMm(Number(rawValue));
  if (field.displayUnit === "px") value = pxToMm(Number(rawValue));
  if (field.path === "dash") {
    const dash = rawValue
      .split(",")
      .map(Number)
      .filter((item) => Number.isFinite(item) && item > 0);
    value = dash.length ? dash : null;
  }

  const keys = field.path.split(".");
  const patch: Record<string, unknown> = {};
  let cursor = patch;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) cursor[key] = value;
    else {
      const existing = getByPath(
        element.value as unknown as Record<string, unknown>,
        keys.slice(0, index + 1).join(".")
      );
      cursor[key] = { ...(existing as Record<string, unknown> | undefined) };
      cursor = cursor[key] as Record<string, unknown>;
    }
  });
  store.updateElement(element.value.id, patch);
}
</script>
