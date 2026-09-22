<template>
  <header class="border-border relative flex h-16 items-center justify-between border-b px-4">
    <!-- 左侧 -->
    <div class="flex items-center">
      <Logo />
      <h1 class="ml-3 text-lg font-bold">Vue Print</h1>
      <div class="ml-5 text-sm max-lg:hidden">销售明细表 · 2026年6月</div>
      <div
        class="bg-muted text-muted-foreground ml-5 flex items-center rounded-sm px-2 py-1 text-sm max-xl:hidden"
      >
        <div class="mr-2 h-1.5 w-1.5 rounded-xl bg-red-700"></div>
        已自动保存 · 12s 前
      </div>
    </div>
    <!-- 中部 -->
    <div class="pointer-events-none absolute inset-0 flex items-center justify-center gap-2">
      <div
        class="border-input pointer-events-auto flex h-9 items-center gap-3 rounded-md border px-2 shadow"
      >
        <Undo
          class="h-5 w-5"
          :class="
            disablePrevHistory ? 'text-muted-foreground cursor-not-allowed' : 'cursor-pointer'
          "
        />
        <Redo
          class="h-5 w-5"
          :class="
            disableNextHistory ? 'text-muted-foreground cursor-not-allowed' : 'cursor-pointer'
          "
        />
      </div>
      <NumberField
        v-model="designState.scale"
        class="pointer-events-auto"
        :min="SCALE_MIN"
        :max="SCALE_MAX"
        :format-options="{ style: 'percent' }"
        :step="0.1"
      >
        <NumberFieldContent>
          <NumberFieldDecrement class="cursor-pointer" />
          <NumberFieldInput />
          <NumberFieldIncrement class="cursor-pointer" />
        </NumberFieldContent>
      </NumberField>
    </div>
    <!-- 右侧 -->
    <div class="flex flex-wrap items-center gap-2 md:flex-row">
      <Button variant="outline" size="icon">
        <Moon />
      </Button>
      <Button variant="outline" class="cursor-pointer" @click="openPreview"> 预览 </Button>
      <Button><ArrowDownToLine /> 导出 </Button>
    </div>
  </header>
</template>

<script setup lang="ts">
import Logo from "@/components/logo/index.vue";
import {
  NumberField,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput
} from "@/components/ui/number-field";
import { Button } from "@/components/ui/button";
import { Redo, Undo, Moon, ArrowDownToLine } from "@lucide/vue";
import { useDesignStore, SCALE_MIN, SCALE_MAX } from "@/store/modules/design";
import { useRoute, useRouter } from "vue-router";

import { ref } from "vue";

const designState = useDesignStore();
const route = useRoute();
const router = useRouter();

const disablePrevHistory = ref(true);
const disableNextHistory = ref(false);

/**
 * 打开预览。
 *
 * 把当前路由的 `:id` 原样带过去（而不是从 store 里读模板 id）：
 * 预览是**另一个视图**，它的入参就该来自 URL —— 于是刷新、分享链接、
 * 将来浏览器的前进后退全部自然可用，不需要额外维护一份"当前模板 id"。
 */
function openPreview() {
  const id = route.params.id;
  router.push({ name: "Preview", params: { id: typeof id === "string" ? id : "draft" } });
}
</script>

<style scoped></style>
