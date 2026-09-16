import type { ElementType } from "@/components/design/types";

/**
 * 画布右键菜单的声明式配置。
 *
 * 配置只保留可序列化的数据；图标组件和命令实现由渲染层分别映射，
 * 因此菜单可以安全地从 JSON 配置扩展，而不与 Vue 组件耦合。
 */
export type ElementMenuCommand =
  | "delete"
  | "cut"
  | "copy"
  | "paste"
  | "lock"
  | "unlock"
  | "edit-text"
  | "add-table-row"
  | "add-table-column"
  | "reverse-line"
  | "reset-image-fit";

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

export const commonElementMenuConfig: readonly ElementMenuConfig[] = [
  { command: "delete", label: "删除", icon: "trash-2", shortcut: "Del", destructive: true },
  { command: "cut", label: "剪切", icon: "scissors", shortcut: "Ctrl+X" },
  { command: "copy", label: "复制", icon: "copy", shortcut: "Ctrl+C" },
  { command: "paste", label: "粘贴", icon: "clipboard", shortcut: "Ctrl+V" },
  { command: "lock", label: "锁定", icon: "lock" },
  { command: "unlock", label: "解锁", icon: "lock-keyhole-open" },
  { type: "separator" }
];

export const elementMenuConfig: Record<ElementType, readonly ElementMenuConfig[]> = {
  text: [{ command: "edit-text", label: "编辑文本", icon: "text-cursor-input" }],
  table: [
    { command: "add-table-row", label: "增加一行", icon: "rows-3" },
    { command: "add-table-column", label: "增加一列", icon: "columns-3" }
  ],
  line: [{ command: "reverse-line", label: "反转线条方向", icon: "arrow-left-right" }],
  image: [{ command: "reset-image-fit", label: "重置图片适配", icon: "maximize" }]
};

export function getElementContextMenuConfig(type: ElementType): readonly ElementMenuConfig[] {
  return [...commonElementMenuConfig, ...elementMenuConfig[type]];
}
