<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent
      class="min-w-45"
      @contextmenu="selectElement"
      @close-auto-focus="onCloseAutoFocus"
    >
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
import { computed, ref, type Component } from "vue";
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
  // 锁定元素不给编辑内容。这里选**灰掉**而不是隐藏 —— 菜单项还在，用户能看出是"锁定"挡住的。
  if (command === "edit-text") return !!props.element.locked;
  return false;
}

function isShow(item: ElementMenuItemConfig) {
  if (item.command === "lock") {
    return !props.element.locked;
  }
  if (item.command === "unlock") return props.element.locked;
  // 正在编辑这个元素时不再显示「编辑文本」—— 重复进入没有意义。
  if (item.command === "edit-text") return store.editingId !== props.element.id;
  return true;
}

/**
 * 本次菜单关闭是为了进入编辑 —— 必须拦掉 reka 的焦点回填。
 *
 * reka 关闭菜单时会把焦点还给 trigger，而 trigger 是 ElementWrapper 那个不可聚焦的 div，
 * 焦点于是掉到 body，会把 TextElement 刚 focus() 的 textarea 顶掉。
 * 在 closeAutoFocus 里 preventDefault 是唯一确定有效的时机：FocusScope 正是拿
 * defaultPrevented 来决定要不要回填的，而 emits 是同步的，我们这个处理函数一定先跑完。
 */
const keepFocus = ref(false);

function onCloseAutoFocus(e: Event) {
  if (!keepFocus.value) return;
  keepFocus.value = false;
  e.preventDefault();
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
      // 进入画布内联编辑。焦点由 TextElement 自己在 watch 里落地，
      // 这里只负责把"别回填焦点"的信号交给 onCloseAutoFocus。
      store.startEditing(props.element.id);
      keepFocus.value = store.editingId === props.element.id;
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
