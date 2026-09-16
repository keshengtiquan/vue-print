<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent class="min-w-45" @contextmenu="selectElement">
      <template
        v-for="item in menuItems"
        :key="item.type === 'separator' ? `separator-${itemIndex(item)}` : item.command"
      >
        <ContextMenuSeparator v-if="item.type === 'separator'" />
        <ContextMenuItem
          v-else-if="isShow(item)"
          :disabled="isDisabled(item.command)"
          :variant="item.destructive ? 'destructive' : 'default'"
          @select="runCommand(item.command)"
        >
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
import {
  ArrowLeftRight,
  Clipboard,
  Columns3,
  Copy,
  Lock,
  LockKeyholeOpen,
  Maximize,
  Rows3,
  Scissors,
  TextCursorInput,
  Trash2
} from "@lucide/vue";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from "@/components/ui/context-menu";
import { useDesignStore } from "@/store/modules/design";
import type { Element } from "@/components/design/types";
import {
  getElementContextMenuConfig,
  type ElementMenuCommand,
  type ElementMenuItemConfig
} from "./context-menu-config";

const props = defineProps<{ element: Element }>();
const store = useDesignStore();

const icons: Record<string, Component> = {
  "arrow-left-right": ArrowLeftRight,
  clipboard: Clipboard,
  "columns-3": Columns3,
  copy: Copy,
  lock: Lock,
  "lock-keyhole-open": LockKeyholeOpen,
  maximize: Maximize,
  "rows-3": Rows3,
  scissors: Scissors,
  "text-cursor-input": TextCursorInput,
  "trash-2": Trash2
};

const menuItems = computed(() => getElementContextMenuConfig(props.element.type));
const itemIndex = (item: unknown) => menuItems.value.indexOf(item as never);

function selectElement() {
  store.selectElement(props.element.id);
}

function isDisabled(command: ElementMenuCommand) {
  if (command === "paste") return !store.clipboardElement;
  return false;
}

function isShow(item: ElementMenuItemConfig) {
  if (item.command === "lock") {
    return !props.element.locked;
  }
  if (item.command === "unlock") return props.element.locked;
  return true;
}

function runCommand(command: ElementMenuCommand) {
  selectElement();
  switch (command) {
    case "delete":
      store.removeElement(props.element.id);
      break;
    case "cut":
      store.copyElement(props.element.id);
      store.removeElement(props.element.id);
      break;
    case "copy":
      store.copyElement(props.element.id);
      break;
    case "paste":
      store.pasteElement();
      break;
    case "lock":
      store.updateElement(props.element.id, { locked: true });
      break;
    case "unlock":
      store.updateElement(props.element.id, { locked: false });
      break;
    case "edit-text":
      // 元素已被选中，右侧属性面板会自动切到“元素”页，供用户直接编辑内容。
      break;
    case "add-table-row":
      store.updateElement(props.element.id, {
        rows: props.element.type === "table" ? props.element.rows + 1 : 1
      });
      break;
    case "add-table-column":
      store.updateElement(props.element.id, {
        cols: props.element.type === "table" ? props.element.cols + 1 : 1
      });
      break;
    case "reverse-line":
      if (props.element.type === "line") {
        store.updateElement(props.element.id, {
          start: { ...props.element.end },
          end: { ...props.element.start }
        });
      }
      break;
    case "reset-image-fit":
      store.updateElement(props.element.id, { objectFit: "fill" });
      break;
  }
}
</script>
