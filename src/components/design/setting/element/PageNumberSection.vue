<template>
  <section aria-labelledby="page-number-heading">
    <div class="mb-2 flex items-center justify-between gap-2">
      <p id="page-number-heading" class="text-sm">显示页码</p>
      <Switch
        class="cursor-pointer"
        :model-value="store.pageNumber.enabled"
        @update:model-value="setEnabled"
      />
    </div>

    <div v-if="store.pageNumber.enabled" class="space-y-1.5">
      <Label for="page-number-template">页码模板</Label>
      <Input
        id="page-number-template"
        class="h-8 text-xs"
        :model-value="store.pageNumber.template"
        placeholder="第 {$pageIndex} 页 / 共 {$pageCount} 页"
        @update:model-value="setTemplate"
      />
      <p class="text-muted-foreground text-[11px] leading-4">
        支持占位符：<code>{$pageIndex}</code>（当前页）、<code>{$pageCount}</code>（总页数）。
        预览时逐页替换为 1、2、3…
      </p>

      <div class="space-y-1.5">
        <Label>底部位置</Label>
        <ToggleGroup v-model="align" type="single" variant="outline" class="w-full">
          <ToggleGroupItem class="flex-1 cursor-pointer" value="left" @click="setAlign('left')">
            左
          </ToggleGroupItem>
          <ToggleGroupItem class="flex-1 cursor-pointer" value="center" @click="setAlign('center')">
            中
          </ToggleGroupItem>
          <ToggleGroupItem class="flex-1 cursor-pointer" value="right" @click="setAlign('right')">
            右
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-sm">奇偶页分侧</p>
          <p class="text-muted-foreground text-[11px] leading-4">
            书刊式：奇数页靠右、偶数页靠左（优先于上面的位置）
          </p>
        </div>
        <Switch
          class="cursor-pointer"
          :model-value="store.pageNumber.oddEven"
          @update:model-value="setOddEven"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDesignStore } from "@/store/modules/design";

const store = useDesignStore();

function setEnabled(value: boolean) {
  store.pageNumber = { ...store.pageNumber, enabled: value };
}

function setTemplate(value: string | number) {
  store.pageNumber = { ...store.pageNumber, template: String(value) };
}

function setAlign(value: "left" | "center" | "right") {
  store.pageNumber = { ...store.pageNumber, align: value };
}

function setOddEven(value: boolean) {
  store.pageNumber = { ...store.pageNumber, oddEven: value };
}

const align = computed({
  get: () => store.pageNumber.align,
  set: () => {
    /* 由 setAlign 走 @click 写回；这里只为 v-model 提供只读值 */
  }
});
</script>
