<template>
  <!--
    :modal="false" 是必要的，不是口味问题。
    ContextMenu 默认 modal，reka 会把 document.body 的 pointer-events 设成 none ——
    菜单开着的时候，画布上的元素和单元格全都点不中（事件目标退化成 <html>），
    于是"右键单元格 → 左键点另一个格"只能关掉菜单、却选不中那一格，得点两次。
    桌面软件的右键菜单本来就是非模态的：点哪儿就作用到哪儿。
  -->
  <ContextMenu :modal="false">
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

    <!-- 点别处就关的哨兵：reka 自带的关闭挂在 document 冒泡阶段，会被元素内部的 stop 掐掉 -->
    <ContextMenuAutoClose />
  </ContextMenu>

  <!-- 图片读取的失败提示。没有这个小浮层的话，用户选了超限的图会"什么都不发生" -->
  <Teleport to="body">
    <div
      v-if="imageError"
      class="bg-destructive fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-md px-3 py-1.5 text-xs text-white shadow-lg"
    >
      {{ imageError }}
    </div>
  </Teleport>

  <input
    ref="fileInputRef"
    type="file"
    accept="image/*"
    class="hidden"
    @change="onFileChange"
  />
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, type Component } from "vue";
import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowLeftToLine,
  ArrowUpToLine,
  Clipboard,
  Columns3,
  Copy,
  Eraser,
  ImagePlus,
  Lock,
  LockKeyholeOpen,
  Maximize,
  Merge,
  Rows3,
  Scissors,
  Split,
  Table2,
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
import ContextMenuAutoClose from "../ContextMenuAutoClose";
import { useDesignStore } from "@/store/modules/design";
import type { CellRange, Element, LineElement, TableElement } from "@/components/design/types";
import { ImageReadError, readImageFile } from "@/lib/image";
import {
  canMerge,
  clearRangeContent,
  distributeTracks,
  insertCol,
  insertRow,
  isMergedCell,
  mergeRange,
  refsInRange,
  removeCol,
  removeRow,
  splitCell
} from "@/components/design/table/model";
import {
  commonElementMenuConfig,
  getElementContextMenuConfig,
  tableMenuConfig,
  type ElementMenuCommand,
  type ElementMenuConfig,
  type ElementMenuItemConfig,
  type TableMenuContext
} from "./context-menu-config";

const props = defineProps<{ element: Element }>();
const store = useDesignStore();

const icons: Record<string, Component> = {
  "align-horizontal-justify-center": AlignHorizontalJustifyCenter,
  "align-vertical-justify-center": AlignVerticalJustifyCenter,
  "arrow-down-to-line": ArrowDownToLine,
  "arrow-left-right": ArrowLeftRight,
  "arrow-left-to-line": ArrowLeftToLine,
  "arrow-up-to-line": ArrowUpToLine,
  clipboard: Clipboard,
  "columns-3": Columns3,
  copy: Copy,
  eraser: Eraser,
  "image-plus": ImagePlus,
  lock: Lock,
  "lock-keyhole-open": LockKeyholeOpen,
  maximize: Maximize,
  merge: Merge,
  "rows-3": Rows3,
  scissors: Scissors,
  split: Split,
  "table-2": Table2,
  "text-cursor-input": TextCursorInput,
  "trash-2": Trash2
};

/**
 * 表格的菜单上下文。
 *
 * "已进入表格编辑态"与"没进入"是两套完全不同的菜单（需求 ④），
 * 而进入之后的行 / 列 / 单元格又靠**选区形状**推断 —— 不做额外的 context 状态，
 * 于是不会出现"选区变了但上下文没跟着变"的错位。
 */
type MenuContext = "entry" | TableMenuContext;

const menuContext = computed<MenuContext | null>(() => {
  if (props.element.type !== "table") return null;
  if (store.tableEditingId !== props.element.id) return "entry";
  const el = props.element;
  const range = store.cellRange;
  if (!range) return "cell";
  const wholeRows = range.c1 === 0 && range.c2 === el.cols - 1;
  const wholeCols = range.r1 === 0 && range.r2 === el.rows - 1;
  // 整张表都选中时按"单元格"处理：此时"删除列"会把表删空，语义上更该走删表
  if (wholeRows && !wholeCols) return "row";
  if (wholeCols && !wholeRows) return "col";
  return "cell";
});

const menuItems = computed<readonly ElementMenuConfig[]>(() => {
  const el = props.element;
  if (el.type !== "table") return getElementContextMenuConfig(el.type);
  const ctx = menuContext.value;
  if (ctx === "entry") return getElementContextMenuConfig("table");
  // 表格操作在前、元素级操作在后：用户在表格里右键，第一眼要看到的是"对表格做什么"
  return [...tableMenuConfig[ctx ?? "cell"], ...commonElementMenuConfig];
});

const itemIndex = (item: unknown) => menuItems.value.indexOf(item as never);

function selectElement() {
  store.selectElement(props.element.id);
}

/**
 * 与坐标轴平行的线段（水平或垂直）：某一轴的跨度小到可忽略。
 * 容差 0.01mm ≈ 0.04px，肉眼不可分辨，同时能吃掉缩放分支产生的浮点噪声。
 */
const AXIS_ALIGNED_EPSILON = 0.01;

function isAxisAlignedLine(element: LineElement) {
  return (
    Math.abs(element.start.x - element.end.x) < AXIS_ALIGNED_EPSILON ||
    Math.abs(element.start.y - element.end.y) < AXIS_ALIGNED_EPSILON
  );
}

function isDisabled(command: ElementMenuCommand) {
  if (command === "paste") return !store.clipboardElement;
  // 锁定元素不给编辑内容。这里选**灰掉**而不是隐藏 —— 菜单项还在，用户能看出是"锁定"挡住的。
  if (command === "edit-text") return !!props.element.locked;
  if (command === "flip-line") {
    const el = props.element;
    // 水平/垂直的线段绕中点镜像后与原线重合，点了看不出任何变化 —— 同样灰掉，别让用户空点一次。
    return el.type !== "line" || isAxisAlignedLine(el);
  }
  if (command.startsWith("table-")) return isTableCommandDisabled(command);
  return false;
}

/**
 * 表格命令的可用性。
 *
 * 灰掉而不是隐藏：用户点不到但看得见，才能理解"为什么这里不能合并"
 * （因为选区不是矩形 / 里面已经有合并格 / 会把表删空）。
 */
function isTableCommandDisabled(command: ElementMenuCommand) {
  const el = props.element;
  if (el.type !== "table") return true;
  const range = store.cellRange;
  if (!range) return true;
  if (command === "table-merge") return !canMerge(el, range);
  if (command === "table-split") {
    return !refsInRange(el, range).some((ref) => isMergedCell(ref.cell));
  }
  // 删到一行/一列都不剩的操作直接禁掉，与 model 里"最后一行不允许删"的保护对应
  if (command === "table-delete-row") return el.rows <= range.r2 - range.r1 + 1;
  if (command === "table-delete-col") return el.cols <= range.c2 - range.c1 + 1;
  return false;
}

function isShow(item: ElementMenuItemConfig) {
  if (item.command === "lock") {
    return !props.element.locked;
  }
  if (item.command === "unlock") return props.element.locked;
  // 正在编辑这个元素时不再显示「编辑文本」—— 重复进入没有意义。
  if (item.command === "edit-text") return store.editingId !== props.element.id;
  // 已经进了表格编辑态就不再显示「编辑表格」
  if (item.command === "edit-table") return store.tableEditingId !== props.element.id;
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

/** 把当前选区交给 mutator。表格命令一律走这个出口，避免每处都判一遍类型与 null */
function withTable(mutator: (el: TableElement) => void) {
  const el = props.element;
  if (el.type !== "table") return;
  store.updateTable(el.id, mutator);
}

function currentRange(): CellRange | null {
  return store.cellRange;
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
    case "edit-table":
      store.enterTable(props.element.id);
      break;
    case "flip-line":
      // 绕线段中点镜像：交换两端的 x、各自保留 y。
      // 斜线会立刻从 "/" 翻成 "\"，且端点仍落在 [0,width]×[0,height] 内，不会跑出元素框。
      // 对一条线段而言「水平镜像」与「垂直镜像」结果相同，所以不需要拆成两项。
      if (props.element.type === "line") {
        const { start, end } = props.element;
        store.updateElement(props.element.id, {
          start: { x: end.x, y: start.y },
          end: { x: start.x, y: end.y }
        });
      }
      break;
    case "reset-image-fit":
      store.updateElement(props.element.id, { objectFit: "fill" });
      break;

    /* ---------------- 表格：插入行列 ---------------- */
    case "table-insert-row-before": {
      const r = currentRange();
      if (r) withTable((t) => insertRow(t, r.r1));
      break;
    }
    case "table-insert-row-after": {
      const r = currentRange();
      if (r) withTable((t) => insertRow(t, r.r2 + 1));
      break;
    }
    case "table-insert-col-before": {
      const r = currentRange();
      if (r) withTable((t) => insertCol(t, r.c1));
      break;
    }
    case "table-insert-col-after": {
      const r = currentRange();
      if (r) withTable((t) => insertCol(t, r.c2 + 1));
      break;
    }
    /* ---------------- 表格：删除行列 ---------------- */
    case "table-delete-row": {
      const r = currentRange();
      // 从下往上删：正序删会让后面每一行的下标都往前挪一格，删出来的是错位的行
      if (r) withTable((t) => {
        for (let i = r.r2; i >= r.r1; i--) removeRow(t, i);
      });
      break;
    }
    case "table-delete-col": {
      const r = currentRange();
      if (r) withTable((t) => {
        for (let i = r.c2; i >= r.c1; i--) removeCol(t, i);
      });
      break;
    }
    /* ---------------- 表格：合并 / 拆分 ---------------- */
    case "table-merge": {
      const r = currentRange();
      if (r) withTable((t) => mergeRange(t, r));
      break;
    }
    case "table-split":
      withTable((t) => {
        const r = currentRange();
        if (!r) return;
        for (const ref of refsInRange(t, r)) {
          if (isMergedCell(ref.cell)) splitCell(t, ref.r, ref.c);
        }
      });
      break;
    /* ---------------- 表格：内容 ---------------- */
    case "table-insert-image":
      openImagePicker();
      break;
    case "table-clear-content": {
      const r = currentRange();
      if (r) withTable((t) => clearRangeContent(t, r));
      break;
    }
    /* ---------------- 表格：平均分布 ---------------- */
    case "table-distribute-rows": {
      const r = currentRange();
      if (r) withTable((t) => distributeTracks(t, "row", r));
      break;
    }
    case "table-distribute-cols": {
      const r = currentRange();
      if (r) withTable((t) => distributeTracks(t, "col", r));
      break;
    }
  }
}

/* ============================================================
   单元格插入图片
============================================================ */

const fileInputRef = ref<HTMLInputElement | null>(null);
const imageError = ref("");
let errorTimer: ReturnType<typeof setTimeout> | null = null;

function openImagePicker() {
  fileInputRef.value?.click();
}

function showImageError(message: string) {
  imageError.value = message;
  if (errorTimer) clearTimeout(errorTimer);
  errorTimer = setTimeout(() => (imageError.value = ""), 2600);
}

onUnmounted(() => {
  if (errorTimer) clearTimeout(errorTimer);
});

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  // 立刻清空，否则同一个文件连选两次不会再触发 change
  input.value = "";
  if (!file) return;
  const range = store.cellRange;
  if (!range) return;
  try {
    // 与属性面板的图片控件共用同一套上限口径（lib/image）
    const result = await readImageFile(file);
    withTable((t) => {
      for (const ref of refsInRange(t, range)) {
        ref.cell.content = { type: "image", value: result.dataUrl, objectFit: "contain" };
      }
    });
  } catch (err) {
    showImageError(err instanceof ImageReadError ? err.message : "图片读取失败，文件可能已损坏");
  }
}
</script>
