<template>
  <ElementWrapper v-for="el in designState.sortedElements" :key="el.id" :element="el" />
</template>

<script setup lang="ts">
import { useDesignStore } from "@/store/modules/design";
import ElementWrapper from "./ElementWrapper.vue";

const designState = useDesignStore();
</script>
