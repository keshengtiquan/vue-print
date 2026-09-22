<template>
  <div class="h-screen">
    <PreviewCanvas />
  </div>
</template>

<script setup lang="ts">
/**
 * 预览页（路由 `/preview/:id`）。
 *
 * 设计文档：`docs/preview-design.md` §6.1。
 *
 * ## 为什么是独立路由而不是设计页里的弹窗 / 覆盖层
 *
 * - 预览是"另一种视图"，不是"一个对话框"：独立路由天然有返回、可刷新、URL 可分享；
 * - 覆盖层要处理 z-index / 焦点陷阱 / 滚动锁定，而画布已经为层级问题付出过一次代价
 *   （`designPanel/index.vue` 的 `isolate` 修复），没必要再造一个；
 * - 组件可以在真正挂载时才取数 —— 覆盖层方案里"什么时候取"是个额外的时序问题。
 *
 * ## ⚠️ 项目当前没有模板持久化，store 是唯一数据源
 *
 * 所以直接访问（或在预览里刷新页面）会得到一个空模板 → 渲染"还没有任何元素"空态 +
 * 一个「返回设计」按钮。**不白屏、不报错** —— 这是刻意的，因为"刷新丢了"在未来
 * 接入持久化之后会变成正常行为，那时这段提示自然就消失了。
 */
import { onUnmounted } from "vue";
import PreviewCanvas from "@/components/design/preview/PreviewCanvas.vue";
import { usePreviewStore } from "@/store/modules/preview";

const preview = usePreviewStore();

/*
  离开预览就清空运行数据。

  不清的话，下次进预览会先看到上一次的数据（然后被新数据替换）——
  中间那一帧是"错的但看起来正常"的样子，正是最难发现的一类问题。
  （`loadAll` 里还有一道 generation 闸，负责丢弃"迟到的响应"。）
*/
onUnmounted(() => preview.reset());
</script>
