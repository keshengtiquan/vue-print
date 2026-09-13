<template>
  <div class="bg-muted border-border flex h-6 items-center gap-4 border-t px-2 text-xs">
    <span>x: {{ x }} mm</span>
    <span>y: {{ y }} mm</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { designState } from "@/components/design/designState";

const x = computed(() => (designState.inPanel ? designState.mouse.x.toFixed(1) : "—"));
const y = computed(() => (designState.inPanel ? designState.mouse.y.toFixed(1) : "—"));
</script>

<style scoped></style>
