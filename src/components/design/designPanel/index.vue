<template>
  <div ref="rootRef">
    <Ruler
      orientation="vertical"
      :viewport-px="rulerGeom.viewH"
      :paper-scale="rulerGeom.paperScale"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import Ruler from "./components/ruler.vue";

const rootRef = ref<HTMLElement | null>(null);
const rulerGeom = reactive({ originX: 0, originY: 0, viewW: 0, viewH: 0, paperScale: 0.5 });
const measureRuler = () => {
  const area = rootRef.value;
  if (!area) return;

  rulerGeom.viewW = area.clientWidth - 22;
  rulerGeom.viewH = area.clientHeight - 22;
  console.log(rulerGeom);
};
onMounted(() => {
  measureRuler();
});
</script>

<style scoped></style>
