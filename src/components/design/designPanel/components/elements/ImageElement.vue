<template>
  <img
    class="h-full w-full"
    :src="element.src"
    :style="{ objectFit: element.objectFit }"
    draggable="false"
    alt=""
  />
</template>

<script setup lang="ts">
import type { ImageElement } from "@/components/design/types";

defineProps<{ element: ImageElement }>();
</script>
