<template>
  <div class="border-border h-full w-70 border-r">
    <div class="border-border flex h-12 items-center justify-between border-b">
      <div class="ml-2 flex items-center gap-2">
        <div class="bg-primary h-5 w-1.5 rounded-sm"></div>
        素材台
      </div>
      <ChevronsLeft class="mr-2 size-4.5 cursor-pointer" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronsLeft } from "@lucide/vue";
</script>

<style scoped></style>
