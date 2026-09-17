<template>
  <div class="border-border bg-background flex h-full w-70 flex-col border-r">
    <div class="border-border flex h-12 items-center justify-between border-b">
      <div class="ml-2 flex items-center gap-2">
        <div class="bg-primary h-5 w-1.5 rounded-sm"></div>
        素材台
      </div>
      <ChevronsLeft class="mr-2 size-4.5 cursor-pointer" />
    </div>

    <div class="flex-1 overflow-auto p-3">
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronsLeft } from "@lucide/vue";
import { materials, MATERIAL_MIME, type MaterialDef } from "./materials";

/**
 * 只往 dataTransfer 里写素材 id，**不碰任何响应式状态**。
 *
 * 这是刻意的：dragstart 之后浏览器要为源元素生成 drag image，
 * 此时如果 Vue 立刻改源元素样式（拖拽中高亮 class 之类），
 * 两件事会打架 —— 表现为一拖就卡死。
 * 拖拽期间的视觉反馈交给浏览器自带的 drag image 快照，足够用。
 */
function onDragStart(e: DragEvent, m: MaterialDef) {
  if (!e.dataTransfer) return;
  // copy 语义：拖到画布是"复制一份"，素材台里的源不动
  e.dataTransfer.effectAllowed = "copy";
  // 只传 id（最小载荷），drop 端回查清单拿类型与默认值
  e.dataTransfer.setData(MATERIAL_MIME, m.id);
}
</script>
