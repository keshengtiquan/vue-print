<template>
  <div class="border-border bg-background flex h-full w-70 flex-col border-r">
    <Tabs v-model="activeTab" class="flex h-full min-h-0 flex-col gap-0">
      <div class="border-border flex h-12 shrink-0 items-center justify-between border-b px-2">
        <div class="flex items-center gap-2">
          <div class="bg-primary h-5 w-1.5 rounded-sm"></div>
          <TabsList class="h-7">
            <TabsTrigger value="material" class="cursor-pointer px-2.5 text-xs">
              <Boxes />素材
            </TabsTrigger>
            <TabsTrigger value="data" class="cursor-pointer px-2.5 text-xs">
              <Database />数据
            </TabsTrigger>
          </TabsList>
        </div>
        <ChevronsLeft class="mr-1 size-4.5 cursor-pointer" />
      </div>

      <TabsContent value="material" class="min-h-0 flex-1 overflow-auto p-3">
        <div class="grid grid-cols-2 gap-2">
          <div
            v-for="m in materials"
            :key="m.id"
            class="group/card border-border bg-muted text-foreground hover:border-primary/45 flex aspect-square cursor-grab flex-col items-center justify-center gap-1.5 rounded-sm border transition-[border-color,background-color] duration-120 ease-out select-none hover:bg-[color-mix(in_oklab,var(--color-primary)_8%,var(--color-muted))] active:cursor-grabbing"
            draggable="true"
            :title="`拖动「${m.label}」到画布`"
            @dragstart="onDragStart($event, m)"
          >
            <component
              :is="m.icon"
              class="text-muted-foreground group-hover/card:text-primary pointer-events-none size-5.5"
            />
            <span class="text-muted-foreground pointer-events-none text-xs leading-none">
              {{ m.label }}
            </span>
          </div>
        </div>
        <p
          class="text-muted-foreground mt-3.5 px-0.5 text-center text-[10px] leading-normal tracking-[0.03em]"
        >
          拖动素材到画布即可放置
        </p>
      </TabsContent>

      <!--
        「数据」页签只做容器：里面的 DataPanel 自己管滚动与空态，
        页签层不要再套一层 overflow，否则测试结果的横向表格会被裁掉。
      -->
      <TabsContent value="data" class="min-h-0 flex-1">
        <DataPanel />
      </TabsContent>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Boxes, ChevronsLeft, Database } from "@lucide/vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DataPanel from "@/components/design/data/DataPanel.vue";
import { setDraggingField } from "@/components/design/data/model";
import { materials, MATERIAL_MIME, setDraggingMaterialId, type MaterialDef } from "./materials";

/** 左侧栏页签。默认停在素材 —— 绝大多数时间用户是在排版，不是在配数据 */
const activeTab = ref("material");

/**
 * 只往 dataTransfer 里写素材 id，**不碰任何响应式状态**。
 *
 * 这是刻意的：dragstart 之后浏览器要为源元素生成 drag image，
 * 此时如果 Vue 立刻改源元素样式（拖拽中高亮 class 之类），
 * 两件事会打架 —— 表现为一拖就卡死。
 * 拖拽期间的视觉反馈交给浏览器自带的 drag image 快照，足够用。
 */
function onDragStart(e: DragEvent, m: MaterialDef) {
  // 双通道：模块变量是主通道（见 materials.ts draggingMaterialId 的说明），
  // dataTransfer 只兜底。同时清掉字段标记 —— 每次 dragstart 都重设两个通道，
  // 否则上次拖拽的残留会在这次 drop 被误读。
  setDraggingMaterialId(m.id);
  setDraggingField(null);
  if (!e.dataTransfer) return;
  // copy 语义：拖到画布是"复制一份"，素材台里的源不动
  e.dataTransfer.effectAllowed = "copy";
  // 只传 id（最小载荷），drop 端回查清单拿类型与默认值
  e.dataTransfer.setData(MATERIAL_MIME, m.id);
}
</script>
