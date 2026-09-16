<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent class="min-w-45">
      <template v-for="item in menuItems" :key="item.command">
        <ContextMenuItem :disabled="item.command !== 'paste' || !store.clipboardElement" @select="paste">
          <component :is="icons[item.icon]" />
          <span>{{ item.label }}</span>
          <ContextMenuShortcut v-if="item.shortcut">{{ item.shortcut }}</ContextMenuShortcut>
        </ContextMenuItem>
      </template>
    </ContextMenuContent>
  </ContextMenu>
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";
import { Clipboard, Copy, Lock, LockKeyholeOpen, Scissors, Trash2 } from "@lucide/vue";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger
} from "@/components/ui/context-menu";
import { useDesignStore } from "@/store/modules/design";
import { commonElementMenuConfig, type ElementMenuItemConfig } from "./elements/context-menu-config";

const store = useDesignStore();

// 画布空白处复用元素的公共菜单配置；过滤掉仅用于元素专有项前的分割线。
const menuItems = computed(() =>
  commonElementMenuConfig.filter((item): item is ElementMenuItemConfig => item.type !== "separator")
);

const icons: Record<string, Component> = {
  clipboard: Clipboard,
  copy: Copy,
  lock: Lock,
  "lock-keyhole-open": LockKeyholeOpen,
  scissors: Scissors,
  "trash-2": Trash2
};

function paste() {
  if (store.clipboardElement) store.pasteElement();
}
</script>
