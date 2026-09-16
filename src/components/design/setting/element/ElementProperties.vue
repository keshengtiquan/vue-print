<template>
  <div v-if="element" class="space-y-2">
    <Accordion type="multiple" :default-value="['layout', 'behavior', 'specific']">
      <AccordionItem value="layout">
        <AccordionTrigger>位置 &amp; 尺寸</AccordionTrigger>
        <AccordionContent class="px-1">
          <div class="grid grid-cols-2 gap-x-2 gap-y-2.5 pt-1">
            <div class="space-y-1.5">
              <Label for="element-x">X</Label>
              <NumberField
                :model-value="element.x"
                :step="5"
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
                @update:model-value="setField(field, String($event))"
              />
              <Select
                v-else-if="field.type === 'select'"
                :model-value="displayValue(field)"
                @update:model-value="setField(field, String($event))"
              >
                <SelectTrigger :id="`property-${field.key}`" class="w-full"
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
                @update:model-value="setField(field, $event ?? '')"
              />
              <NumberField
                v-else-if="field.type === 'number'"
                :model-value="Number(displayValue(field)) || field.min || 0"
                :min="field.min"
                :step="field.step"
                @update:model-value="setField(field, String($event))"
                ><NumberFieldContent
                  ><NumberFieldInput :id="`property-${field.key}`" /></NumberFieldContent
              ></NumberField>
              <Input
                v-else
                :id="`property-${field.key}`"
                :placeholder="field.placeholder"
                :model-value="displayValue(field)"
                @change="setField(field, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </section>
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
import { useDesignStore } from "@/store/modules/design";
import { mmToPt, mmToPx, ptToMm, pxToMm, roundPt } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
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

const store = useDesignStore();
const element = computed(() => (store.selectedId ? store.getElement(store.selectedId) : undefined));
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
