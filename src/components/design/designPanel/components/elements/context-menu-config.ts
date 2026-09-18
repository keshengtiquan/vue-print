import type { ElementType } from "@/components/design/types";

/**
 * 画布右键菜单的声明式配置。
 *
 * 配置只保留可序列化的数据；图标组件和命令实现由渲染层分别映射，
 * 因此菜单可以安全地从 JSON 配置扩展，而不与 Vue 组件耦合。
 *
 * ## 表格带来的第二个维度
 *
 * 原来的 key 只有 `ElementType` 一个维度。表格不一样：**表格体的右键 ≠ 单元格右键
 * ≠ 行头右键 ≠ 列头右键**（需求 ④）。所以表格在"类型"之外还有一层"选中上下文"。
 *
 * 上下文不做成额外状态，而是**从选区形状推断**：
 * - 整行选区（c1 === 0 && c2 === cols-1）→ 行上下文
 * - 整列选区（r1 === 0 && r2 === rows-1）→ 列上下文
 * - 其余 → 单元格上下文
 *
 * 这样"右键行头"和"右键单元格"天然分流，不需要菜单组件再接收一个 context 参数，
 * 也不会出现"选区被改了但上下文没同步"的状态错位。
 */
export type ElementMenuCommand =
  | "delete"
  | "cut"
  | "copy"
  | "paste"
  | "lock"
  | "unlock"
  | "edit-text"
  | "flip-line"
  | "reset-image-fit"
  // 表格（第 1 层：尚未进入表格内编辑态）
  | "edit-table"
  // 表格（第 2 层：表格内编辑态）
  | "table-insert-row-before"
  | "table-insert-row-after"
  | "table-insert-col-before"
  | "table-insert-col-after"
  | "table-delete-row"
  | "table-delete-col"
  | "table-merge"
  | "table-split"
  | "table-insert-image"
  | "table-clear-content"
  | "table-distribute-rows"
  | "table-distribute-cols";

export interface ElementMenuItemConfig {
  type?: "item";
  command: ElementMenuCommand;
  label: string;
  icon: string;
  shortcut?: string;
  destructive?: boolean;
}

export interface ElementMenuSeparatorConfig {
  type: "separator";
}

export type ElementMenuConfig = ElementMenuItemConfig | ElementMenuSeparatorConfig;

/**
 * 所有元素共有的菜单项。
 * 末尾**刻意不带分隔符** —— 它在两种组合里出现的位置不同：
 * 要么被夹在中间（通用 + 类型专属），要么排在最后（表格内菜单是"表格操作在前"）。
 * 把分隔符留给组合方去加，末尾就不会出现光秃秃的一条线。
 */
export const commonElementMenuConfig: readonly ElementMenuConfig[] = [
  { command: "delete", label: "删除", icon: "trash-2", shortcut: "Del", destructive: true },
  { command: "cut", label: "剪切", icon: "scissors", shortcut: "Ctrl+X" },
  { command: "copy", label: "复制", icon: "copy", shortcut: "Ctrl+C" },
  { command: "paste", label: "粘贴", icon: "clipboard", shortcut: "Ctrl+V" },
  { command: "lock", label: "锁定", icon: "lock" },
  { command: "unlock", label: "解锁", icon: "lock-keyhole-open" }
];

/**
 * 表格内编辑态的菜单上下文。
 * `cell` 涵盖"单个单元格"与"多格选区"—— 两者的操作集合完全相同，
 * 只是"合并单元格"在单格时会被禁用，没必要为它单开一类。
 */
export type TableMenuContext = "cell" | "row" | "col";

const tableInsertRowBefore: ElementMenuConfig = {
  command: "table-insert-row-before",
  label: "在上方插入行",
  icon: "arrow-up-to-line"
};
const tableInsertRowAfter: ElementMenuConfig = {
  command: "table-insert-row-after",
  label: "在下方插入行",
  icon: "arrow-down-to-line"
};
const tableInsertColBefore: ElementMenuConfig = {
  command: "table-insert-col-before",
  label: "在左侧插入列",
  icon: "arrow-left-to-line"
};
const tableInsertColAfter: ElementMenuConfig = {
  command: "table-insert-col-after",
  label: "在右侧插入列",
  icon: "arrow-right-to-line"
};
const tableDeleteRow: ElementMenuConfig = {
  command: "table-delete-row",
  label: "删除行",
  icon: "rows-3",
  destructive: true
};
const tableDeleteCol: ElementMenuConfig = {
  command: "table-delete-col",
  label: "删除列",
  icon: "columns-3",
  destructive: true
};
const tableClearContent: ElementMenuConfig = {
  command: "table-clear-content",
  label: "清除内容",
  icon: "eraser"
};
const tableDistributeRows: ElementMenuConfig = {
  command: "table-distribute-rows",
  label: "平均分布各行",
  icon: "align-vertical-justify-center"
};
const tableDistributeCols: ElementMenuConfig = {
  command: "table-distribute-cols",
  label: "平均分布各列",
  icon: "align-horizontal-justify-center"
};

export const tableMenuConfig: Record<TableMenuContext, readonly ElementMenuConfig[]> = {
  cell: [
    tableInsertRowBefore,
    tableInsertRowAfter,
    tableInsertColBefore,
    tableInsertColAfter,
    { type: "separator" },
    tableDeleteRow,
    tableDeleteCol,
    { type: "separator" },
    { command: "table-merge", label: "合并单元格", icon: "merge" },
    { command: "table-split", label: "拆分单元格", icon: "split" },
    { type: "separator" },
    { command: "table-insert-image", label: "插入图片", icon: "image-plus" },
    tableClearContent,
    { type: "separator" },
    tableDistributeRows,
    tableDistributeCols,
    { type: "separator" }
  ],
  row: [
    tableInsertRowBefore,
    tableInsertRowAfter,
    { type: "separator" },
    tableDeleteRow,
    { type: "separator" },
    tableClearContent,
    tableDistributeRows,
    { type: "separator" }
  ],
  col: [
    tableInsertColBefore,
    tableInsertColAfter,
    { type: "separator" },
    tableDeleteCol,
    { type: "separator" },
    tableClearContent,
    tableDistributeCols,
    { type: "separator" }
  ]
};

export const elementMenuConfig: Record<ElementType, readonly ElementMenuConfig[]> = {
  text: [{ command: "edit-text", label: "编辑文本", icon: "text-cursor-input" }],
  // 表格必须先"进入"才有单元格可言 —— 插入行列、合并拆分都发生在内层，
  // 所以第 1 层只给一个入口，不做"在末尾追加"那种半吊子操作（无法指定位置）。
  table: [{ command: "edit-table", label: "编辑表格", icon: "table-2" }],
  // 「翻转」= 绕线段中点做镜像（交换两端的 x、保留各自 y）。水平/垂直的线镜像后与自身重合，
  // 因此那种情况会被禁用 —— 详见 ElementContextMenu 的 isDisabled。
  line: [{ command: "flip-line", label: "翻转线条", icon: "arrow-left-right" }],
  image: [{ command: "reset-image-fit", label: "重置图片适配", icon: "maximize" }]
};

/** 非表格元素（以及表格第 1 层）的菜单：通用项在前，类型专属在后 */
export function getElementContextMenuConfig(type: ElementType): readonly ElementMenuConfig[] {
  return [...commonElementMenuConfig, { type: "separator" }, ...elementMenuConfig[type]];
}
