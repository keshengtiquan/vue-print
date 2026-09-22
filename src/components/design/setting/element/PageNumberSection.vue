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
    </div>
  </section>
</template>

<script setup lang="ts">
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDesignStore } from "@/store/modules/design";

const store = useDesignStore();

function setEnabled(value: boolean) {
  store.pageNumber = { ...store.pageNumber, enabled: value };
}

function setTemplate(value: string | number) {
  store.pageNumber = { ...store.pageNumber, template: String(value) };
}
</script>
