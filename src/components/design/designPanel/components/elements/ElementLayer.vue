<template>
  <ElementWrapper v-for="el in sorted" :key="el.id" :element="el" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { designState } from "@/components/design/designState";
import ElementWrapper from "./ElementWrapper.vue";

const sorted = computed(() =>
  [...designState.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
);
</script>
