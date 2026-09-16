<template>
  <div class="border-border h-full w-70 border-l">
    <div class="border-border flex h-12 items-center justify-between border-b">
      <div class="ml-2 flex items-center gap-2">
        <div class="bg-primary h-5 w-1.5 rounded-sm"></div>
        属性台
      </div>
      <ChevronsRight class="mr-2 size-4.5 cursor-pointer" />
    </div>
    <Tabs v-model="activeTab" class="h-[calc(100%-3rem)] gap-0">
      <TabsList class="w-full shrink-0">
        <TabsTrigger value="element"> 元素属性 </TabsTrigger>
        <TabsTrigger value="page"> 页面属性 </TabsTrigger>
      </TabsList>
      <TabsContent value="element" class="min-h-0 overflow-y-auto px-3 py-3">
        <ElementProperties />
      </TabsContent>
      <TabsContent value="page" class="min-h-0 overflow-y-auto px-3 pt-3">
        <PagePreviewSection />
        <Accordion type="single" collapsible>
          <AccordionItem value="item-1">
            <AccordionTrigger>纸张规格</AccordionTrigger>
            <AccordionContent> <PaperSizeSection /> </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>页边距</AccordionTrigger>
            <AccordionContent> <MarginSection /> </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div
          class="text-muted-foreground mt-3.5 flex items-center gap-1.5 px-1 pt-1.5 text-[10px] tracking-[0.04em]"
        >
          <span
            class="page-footnote__dot bg-primary ring-primary/22 size-1.5 rounded-full ring-3"
          ></span>
          实时同步到画布
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ChevronsRight } from "@lucide/vue";
import { ref, watch } from "vue";
import { useDesignStore } from "@/store/modules/design";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PagePreviewSection from "./element/PagePreviewSection.vue";
import PaperSizeSection from "./element/PaperSizeSection.vue";
import MarginSection from "./element/MarginSection.vue";
import ElementProperties from "./element/ElementProperties.vue";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";

const activeTab = ref("page");
const designStore = useDesignStore();

// 画布选中元素后主动切到属性页，用户无需再额外点一次标签。
watch(
  () => designStore.selectedId,
  (selectedId) => {
    if (selectedId) activeTab.value = "element";
  }
);
</script>

<style scoped>
/*
  呼吸提示：footnote 的圆点是"实时同步到画布"的常驻状态指示，用极轻的脉动表明它活着。
  keyframes 与 reduced-motion 降级都没有工具类等价物，保留在此（其余样式已转 Tailwind）。
*/
.page-footnote__dot {
  animation: page-footnote-pulse 1800ms ease-in-out infinite;
}

@keyframes page-footnote-pulse {
  0%,
  100% {
    opacity: 0.45;
  }

  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .page-footnote__dot {
    animation: none;
  }
}
</style>
