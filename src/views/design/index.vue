<template>
  <div>
    <Header />
    <main class="flex h-[calc(100vh-64px)]">
      <Material />
      <DesignPanel class="flex-1" />
      <Setting />
    </main>
  </div>
</template>

<script setup lang="ts">
import Header from "@/components/design/header/index.vue";
import Material from "@/components/design/material/index.vue";
import DesignPanel from "@/components/design/designPanel/index.vue";
import Setting from "@/components/design/setting/index.vue";
</script>

<style scoped></style>
