<template>
  <div class="border-border material-shell flex h-full w-70 flex-col border-r">
    <div class="border-border flex h-12 items-center justify-between border-b">
      <div class="ml-2 flex items-center gap-2">
        <div class="bg-primary h-5 w-1.5 rounded-sm"></div>
        素材台
      </div>
      <ChevronsLeft class="mr-2 size-4.5 cursor-pointer" />
    </div>

    <div class="material-body flex-1 overflow-auto p-3">
      <div class="material-grid">
        <div
          v-for="m in materials"
          :key="m.id"
          class="material-card"
          draggable="true"
          :title="`拖动「${m.label}」到画布`"
          @dragstart="onDragStart($event, m)"
        >
          <component :is="m.icon" class="material-card__icon" />
          <span class="material-card__label">{{ m.label }}</span>
        </div>
      </div>
      <p class="material-hint">拖动素材到画布即可放置</p>
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
  console.log(e, m);
  if (!e.dataTransfer) return;
  // copy 语义：拖到画布是"复制一份"，素材台里的源不动
  e.dataTransfer.effectAllowed = "copy";
  // 只传 id（最小载荷），drop 端回查清单拿类型与默认值
  e.dataTransfer.setData(MATERIAL_MIME, m.id);
}
</script>

<style scoped>
.material-shell {
  background: var(--color-background, #fff);
}

.material-body {
  --mat-gap: 8px;
}

.material-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--mat-gap);
}

/*
  卡片样式刻意保持"静态"：
  - 不用 transform（hover 位移会让 drag image 生成时的元素带变换矩阵，Chromium 下易出问题）
  - transition 只作用于颜色，不动 transform / opacity
  - user-select: none —— 否则按下拖动会先选中文字，变成"拖选"而非"拖素材"
*/
.material-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  aspect-ratio: 1 / 1;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  background: var(--color-muted, #f9fafb);
  color: var(--color-foreground, #111827);
  cursor: grab;
  user-select: none;
  transition:
    border-color 120ms ease-out,
    background-color 120ms ease-out;
}

.material-card:hover {
  border-color: color-mix(in oklab, var(--primary, #1a73e8) 45%, transparent);
  background-color: color-mix(in oklab, var(--primary, #1a73e8) 8%, var(--color-muted, #f9fafb));
}

.material-card:active {
  cursor: grabbing;
}

/*
  图标设 pointer-events: none：
  svg 也会成为 drag 的命中目标，让它透传，保证 dragstart 稳定由卡片自身发起。
*/
.material-card__icon {
  width: 22px;
  height: 22px;
  color: var(--color-muted-foreground, #6b7280);
  pointer-events: none;
}

.material-card:hover .material-card__icon {
  color: var(--primary, #1a73e8);
}

.material-card__label {
  font-size: 12px;
  line-height: 1;
  color: var(--color-muted-foreground, #6b7280);
  pointer-events: none;
}

.material-hint {
  margin-top: 14px;
  padding: 0 2px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--color-muted-foreground, #9ca3af);
  letter-spacing: 0.03em;
  text-align: center;
}
</style>
