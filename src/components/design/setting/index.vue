<template>
  <div class="border-border h-full w-70 border-l">
    <div class="border-border flex h-12 items-center justify-between border-b">
      <div class="ml-2 flex items-center gap-2">
        <div class="bg-primary h-5 w-1.5 rounded-sm"></div>
        属性台
      </div>
      <ChevronsRight class="mr-2 size-4.5 cursor-pointer" />
    </div>
    <Tabs default-value="page">
      <TabsList class="w-full">
        <TabsTrigger value="element"> 元素属性 </TabsTrigger>
        <TabsTrigger value="page"> 页面属性 </TabsTrigger>
      </TabsList>
      <TabsContent value="element" class="px-3 py-3"> </TabsContent>
      <TabsContent value="page" class="page-panel px-3 pt-3">
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

        <div class="page-footnote">
          <span class="page-footnote__dot"></span>
          实时同步到画布
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ChevronsRight } from "@lucide/vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PagePreviewSection from "./PagePreviewSection.vue";
import PaperSizeSection from "./PaperSizeSection.vue";
import MarginSection from "./MarginSection.vue";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
</script>

<style scoped>
/* 发丝边框令牌：原本挂在 .page-section 上，改成 Accordion 折叠面板后失去宿主。
   CSS 变量可继承，所以提到面板根节点定义 —— 穿透到所有子/孙组件，
   让 margin-* / toggle-* 里的 var(--hair) 继续生效（否则边框会整片消失）。 */
.page-panel {
  --hair: 1px solid color-mix(in oklab, currentcolor 12%, transparent);
}

/* 本文件只保留 tabs 面板的 shell 样式；所有 section 子样式下沉到各自组件。
   留下的只有 footnote —— 它跨越整组 section，是面板级别的"同步提示"。 */
.page-footnote {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  padding: 6px 4px 0;
  font-size: 10px;
  color: var(--color-muted-foreground, #9ca3af);
  letter-spacing: 0.04em;
}

.page-footnote__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 22%, transparent);
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
