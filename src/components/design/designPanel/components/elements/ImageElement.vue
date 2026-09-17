<template>
  <img
    v-if="element.src"
    class="h-full w-full"
    :src="element.src"
    :style="{ objectFit: element.objectFit }"
    draggable="false"
    alt=""
  />
  <div v-else class="text-muted-foreground p-2">暂无图片</div>
</template>

<script setup lang="ts">
import type { ImageElement } from "@/components/design/types";

defineProps<{ element: ImageElement }>();
</script>
