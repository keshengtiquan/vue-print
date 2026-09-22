<template>
  <div v-if="element" class="space-y-2.5 pt-1">
    <!-- 没有数据集时给引导，而不是一个永远选不出东西的下拉 -->
    <div
      v-if="!binding.dataSets.length"
      class="border-border text-muted-foreground rounded-md border border-dashed px-2.5 py-2.5 text-[11px] leading-4"
    >
      还没有数据集。<br />
      到左侧「数据」页签建一个，绑定后这里就能插入字段。
    </div>

    <template v-else>
      <!-- 绑定哪个数据集 -->
      <div class="space-y-1.5">
        <Label>数据集</Label>
        <Select :model-value="boundValue" @update:model-value="onBind">
          <SelectTrigger class="w-full cursor-pointer">
            <SelectValue placeholder="选择数据集" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="NONE">未绑定（按静态内容渲染）</SelectItem>
            <SelectItem v-for="ds in binding.dataSets" :key="ds.id" :value="ds.id">
              {{ ds.label || ds.name }}
            </SelectItem>
          </SelectContent>
        </Select>
        <p class="text-muted-foreground text-[11px] leading-4">
          {{ bindingHint }}
        </p>
      </div>

      <!-- 生效数据集的状态 -->
      <div
        v-if="activeDataSet"
        class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px]"
        :class="sampleRows.length ? 'bg-primary/8 text-primary' : 'bg-muted text-muted-foreground'"
      >
        <CircleCheck v-if="sampleRows.length" class="size-3 shrink-0" />
        <CircleAlert v-else class="size-3 shrink-0" />
        <span class="flex-1 truncate">
          {{
            sampleRows.length
              ? `${activeDataSet.label || activeDataSet.name} · 样本 ${sampleRows.length} 行`
              : `${activeDataSet.label || activeDataSet.name} · 还没有样本，先测试一次`
          }}
        </span>
      </div>

      <!--
        ============================================================
        表格：取数声明（**渲染态**的字段）
        ============================================================

        这三个控件写的是"这张表怎么吃数据"，画布**不消费**它们（画布只显示占位符原文）。
        消费方是预览 / 导出 / 打印 —— 也就是 docs/preview-design.md §3.6 那一套展开规则。

        为什么这个地方值得放三个控件（而不是像 §11.16 那样再删一次）：
        区别在于**它服务的对象**。§11.16 推翻它时的理由是"改了画布上看不见、
        只有面板预览里看得见 ⇒ 它不属于设计态"；而现在它服务的本来就是**画布之外**
        的渲染态，本就该在画布外发生。设计态需要给的只是一处轻量可见反馈 ——
        表格处于编辑态时，明细行在**行号槽**上有一条 2px 左侧色条
        外加 `title` 说明（见 TableElement.vue），它不进单元格、不改字宽。
      -->
      <div v-if="tableEl" class="space-y-2.5 rounded-md border border-border/70 p-2">
        <p class="text-muted-foreground text-[11px] font-medium">表格取数（预览 / 打印）</p>

        <!-- 明细模板行 -->
        <div class="space-y-1.5">
          <Label>明细模板行</Label>
          <Select :model-value="detailValue" @update:model-value="onDetailRow">
            <SelectTrigger class="w-full cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="NO_DETAIL">无（整表静态，不展开）</SelectItem>
              <SelectItem v-for="r in tableEl.rows" :key="r" :value="String(r - 1)">
                第 {{ r }} 行
              </SelectItem>
            </SelectContent>
          </Select>
          <p class="text-muted-foreground text-[11px] leading-4">
            这一行会按数据行数纵向复制；非明细行取第 1 条记录的值。
          </p>
        </div>

        <!-- 表头行数 -->
        <div class="space-y-1.5">
          <Label>表头行数</Label>
          <Select
            :model-value="String(tableEl.headerRows ?? 0)"
            :disabled="!hasDetail"
            @update:model-value="onHeaderRows"
          >
            <SelectTrigger class="w-full cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="n in headerOptions" :key="n" :value="String(n)">
                {{ n === 0 ? "无表头" : `前 ${n} 行` }}
              </SelectItem>
            </SelectContent>
          </Select>
          <p class="text-muted-foreground text-[11px] leading-4">
            表头行不展开，且每页的每一片都会重复。
          </p>
        </div>

        <!-- 列映射：显示"实际生效"的映射（明细行格子的单一占位符优先，columnFields 只兜底空格） -->
        <div v-if="hasDetail" class="space-y-1.5">
          <Label>列映射</Label>
          <div
            v-for="(width, c) in tableEl.colWidths"
            :key="c"
            class="flex items-center gap-2 text-[11px]"
            :title="cellFieldOfColumn(c) !== undefined ? '该列映射来自明细行单元格里的占位符' : ''"
          >
            <span class="text-muted-foreground w-6 shrink-0 font-mono">{{ colLabel(c) }} 列</span>
            <Select
              class="flex-1"
              :model-value="columnDisplayValue(c)"
              @update:model-value="onColumnField(c, $event)"
            >
              <SelectTrigger class="w-full cursor-pointer">
                <SelectValue placeholder="（不映射）" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="NO_FIELD">（不映射）</SelectItem>
                <SelectItem v-for="f in fieldOptions" :key="f.name" :value="f.name">
                  {{ f.label || f.name }}
                </SelectItem>
                <!-- 格子里的占位符引用了已被删除的字段：选项列表里没有它，但不许显示成
                     「不映射」—— 那会把"字段失效"伪装成"没有映射" -->
                <SelectItem
                  v-if="!isKnownField(columnDisplayValue(c))"
                  :value="columnDisplayValue(c)"
                >
                  {{ columnDisplayValue(c) }}（字段已失效）
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p class="text-muted-foreground text-[11px] leading-4">
            下拉显示该列实际生效的字段：明细行格子里写了占位符时以格子为准（改动会写回格子），
            空格子才用这里选的字段兜底。
          </p>
        </div>

        <!-- 明细行高自适应 -->
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm">明细行高自适应</p>
            <p class="text-muted-foreground text-xs">文字超出声明行高时在预览 / 打印里自动撑高</p>
          </div>
          <Switch
            class="cursor-pointer"
            :model-value="detailAutoHeight"
            :disabled="!hasDetail"
            @update:model-value="setDetailAutoHeight"
          />
        </div>

        <!-- 允许跨页断开 -->
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm">允许跨页断开</p>
            <p class="text-muted-foreground text-xs">关闭后整表放不下时顺延到下一页</p>
          </div>
          <Switch
            class="cursor-pointer"
            :model-value="tableEl.allowBreakAcrossPages ?? true"
            @update:model-value="setBreakAcrossPages"
          />
        </div>
      </div>

      <!--
        元素级：字段插入器。

        只服务文本 / 图片：这两者有"一个内容"可以追加（图片是替换 src）。
        表格没有这一块 —— 字段是拖到具体单元格里去的（`appendFieldToCell`），
        面板上再放一个不知道落点的"插入字段"下拉只会制造歧义。
      -->
      <div v-if="element.type === 'text' || element.type === 'image'" class="space-y-1.5">
        <div class="flex items-center justify-between">
          <Label>插入字段</Label>
          <span class="text-muted-foreground text-[10px]">
            {{ element.type === "image" ? "替换图片地址" : "追加到内容末尾" }}
          </span>
        </div>
        <Select :model-value="insertKey" @update:model-value="onInsertField">
          <SelectTrigger class="w-full cursor-pointer">
            <SelectValue placeholder="选择一个字段插入" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="f in fieldOptions" :key="f.name" :value="f.name">
              {{ f.label || f.name }}
              <span class="text-muted-foreground">{{ f.type }}</span>
            </SelectItem>
            <p v-if="!fieldOptions.length" class="text-muted-foreground px-2 py-1.5 text-xs">
              该数据集还没有字段
            </p>
          </SelectContent>
        </Select>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { CircleAlert, CircleCheck } from "@lucide/vue";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useDesignStore } from "@/store/modules/design";
import { useDataBindingStore } from "@/store/modules/dataBinding";
import { colLabel } from "@/components/design/table/model";
import { flattenFields } from "@/components/design/data/model";
import { useDataBinding } from "@/components/design/data/useDataBinding";
import { makeFieldToken, parseTemplate, splitTokenKey } from "@/lib/template";
import type { TableElement } from "@/components/design/types";

/** 哨兵值：SelectItem 不接受空字符串，所以"未绑定"要有个非空值来表示 */
const NONE = "__none__";
/** 同上：「明细模板行 = 无」 */
const NO_DETAIL = "__none__";
/** 同上：「该列不映射字段」 */
const NO_FIELD = "__none__";

const design = useDesignStore();
const binding = useDataBindingStore();
const ops = useDataBinding();

/** 内部自取选中元素，与 ElementLayoutSection 同款 —— 面板的宿主不该再传一遍 */
const element = computed(() => (design.selectedId ? design.getElement(design.selectedId) : undefined));

/** 选中元素是表格时的那张表（面板要读它的行数 / 列数 / 明细行声明） */
const tableEl = computed<TableElement | null>(() =>
  element.value?.type === "table" ? element.value : null
);

/** 绑定值：没绑定时显示为"未绑定" */
const boundValue = computed(() => element.value?.binding?.dataSetId ?? NONE);

/** 元素自己绑的数据集。没绑就是 undefined，画布按静态内容渲染 */
const activeDataSet = computed(() => ops.effectiveDataSet(element.value));

/**
 * 下拉里的可选项 = 字段树摊平（含对象子字段）。
 *
 * 原生下拉表达不了层级，但**至少要能选到子字段** —— 否则"字段树里点得到
 * `address.city`、这个下拉里却找不到它"就是明显的不一致。
 */
const fieldOptions = computed(() => flattenFields(activeDataSet.value?.fields));
const sampleRows = computed(() =>
  activeDataSet.value ? binding.sampleOf(activeDataSet.value.id) : []
);

const bindingHint = computed(() => {
  if (!element.value?.binding?.dataSetId) {
    return "还没绑定数据集。从左侧字段树拖一个字段进来会自动绑上，也可以在上面直接选。";
  }
  return "已绑定到该数据集。绑定后画布上显示的是 {数据集.字段} 占位符本身，不是字段值。";
});

/* ============================================================
   表格取数声明
============================================================ */

/** 明细模板行当前值（哨兵化） */
const detailValue = computed(() =>
  typeof tableEl.value?.detailRowIndex === "number" ? String(tableEl.value.detailRowIndex) : NO_DETAIL
);

const hasDetail = computed(() => typeof tableEl.value?.detailRowIndex === "number");

/**
 * 表头行数的可选项：`0 .. detailRowIndex`。
 *
 * **上界是明细行号而不是行数** —— 表头只能在明细行之前。
 * 放开的话，一个 `headerRows > detailRowIndex` 会让"表头"里混进明细行本身，
 * 于是每片重复的那几行会带着第 N 条记录的值，看起来像数据错乱。
 * （`normalizeTable` 与 `expand.ts` 都会再夹一次，这里只是不给出错误选项。）
 */
const headerOptions = computed(() => {
  const max = tableEl.value?.detailRowIndex ?? 0;
  return Array.from({ length: max + 1 }, (_, i) => i);
});

/**
 * 这两个字段都走 `updateElement`（普通字段），不走 `updateTable`。
 *
 * 判据：它们**不改变网格结构** —— 不改 cells、不改行列尺寸。
 * 走 updateTable 的话会顺带触发 normalizeTable + syncTableGeometry，
 * 而 syncTableGeometry 会用 Σ colWidths 回写元素宽高 —— 一次"选个下拉"
 * 顺手改掉了元素几何，是很不体面的副作用。
 *
 * 唯一需要小心的是"表头行数 ≤ 明细行号"这条不变量，所以在 `onDetailRow` 里
 * 一起把表头夹一次（选中更靠前的明细行时，旧表头值可能就超了）。
 */
function onDetailRow(value: string | number) {
  const table = tableEl.value;
  if (!table) return;
  if (String(value) === NO_DETAIL) {
    design.updateElement(table.id, { detailRowIndex: undefined });
    return;
  }
  const d = Number(value);
  if (!Number.isFinite(d)) return;
  const headerRows = Math.min(table.headerRows ?? 0, d);
  design.updateElement(table.id, { detailRowIndex: d, headerRows });
}

function onHeaderRows(value: string | number) {
  const table = tableEl.value;
  if (!table) return;
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  design.updateElement(table.id, { headerRows: Math.max(0, Math.floor(n)) });
}

/**
 * 某列在**明细模板行**上的"单元格驱动"字段。
 *
 * 预览取数规则（preview-design.md §3.6）是"格子为准，列映射只兜底空格"，
 * 所以这列**实际生效**的映射 = 明细行格子里恰好写了单一占位符时取它，否则 `columnFields[c]`。
 * 之前下拉只读 `columnFields`，于是"拖了字段进格子、下拉却显示不映射"——
 * 显示层和取数层各说各话，这就是老板 2026-09-21 指出的不一致。
 *
 * 三种情况不算"单元格驱动"，返回 undefined（回落到 columnFields 显示）：
 * - 没声明明细行 / 格子被合并覆盖；
 * - 混排内容（"单价：{单价} 元"）—— 它表达不了"列 → 字段"这层映射；
 * - 占位符前缀指向别的数据集 —— 不能冒充本数据集的字段。
 */
function cellFieldOfColumn(c: number): string | undefined {
  const table = tableEl.value;
  const d = table?.detailRowIndex;
  if (!table || typeof d !== "number") return undefined;
  const cell = table.cells[d * table.cols + c];
  if (!cell || cell.covered) return undefined;
  const value = cell.content?.type === "text" ? (cell.content.value ?? "") : "";
  const tokens = parseTemplate(value);
  // 整格（trim 后）必须恰好就是这个占位符，多一个字符都算混排
  if (tokens.length !== 1 || tokens[0].raw !== value.trim()) return undefined;
  if (tokens[0].key.startsWith("$")) return undefined;
  const { dataSetName, field } = splitTokenKey(tokens[0].key);
  if (!field) return undefined;
  if (dataSetName && dataSetName !== activeDataSet.value?.name) return undefined;
  return field;
}

/** 列映射下拉的显示值：生效字段优先，没生效字段才看声明的兜底，都没有 = 不映射 */
function columnDisplayValue(c: number): string {
  return cellFieldOfColumn(c) ?? tableEl.value?.columnFields?.[c] ?? NO_FIELD;
}

/** 该值是否是下拉里已存在的选项（失效字段要动态补一项，不能显示成"不映射"） */
function isKnownField(v: string): boolean {
  return v === NO_FIELD || fieldOptions.value.some((f) => f.name === v);
}

/**
 * 写某一列的字段映射。
 *
 * **格子驱动的列，改动写回格子**（走 `updateTable`，整包替换铁律不变）：
 * 选字段 = 替换格子里那个占位符，选「不映射」= 清空格子的占位符
 * （此时格子 trim 后恰好只有一个占位符、没有别的可丢内容，清空不构成破坏）。
 * 否则维持原语义：写 `columnFields` 兜底声明，绝不碰格子。
 *
 * `columnFields` 必须是**整份新数组**：它是 `(string|null)[]`，
 * 而点路径写不进去（`design.updateElement` 只做 `Object.assign`，
 * 原地改数组元素会绕过响应式的引用比较 —— 长度不变时连重渲染都不会触发）。
 */
function onColumnField(c: number, value: string | number) {
  const table = tableEl.value;
  if (!table) return;
  const v = String(value);

  if (cellFieldOfColumn(c) !== undefined) {
    const d = table.detailRowIndex as number;
    design.updateTable(table.id, (el) => {
      const cell = el.cells[d * el.cols + c];
      if (!cell || cell.covered) return;
      const next = v === NO_FIELD ? "" : makeFieldToken(v, activeDataSet.value?.name);
      cell.content = { ...(cell.content ?? { type: "text" as const }), type: "text", value: next };
    });
    return;
  }

  const next = Array.from({ length: table.cols }, (_, i) => table.columnFields?.[i] ?? null);
  next[c] = v === NO_FIELD ? null : v;
  design.updateElement(table.id, { columnFields: next });
}

function setBreakAcrossPages(value: boolean) {
  const table = tableEl.value;
  if (table) design.updateElement(table.id, { allowBreakAcrossPages: value });
}

/** 明细行是否自适应行高：读明细模板行那一格的 rowHeightModes */
const detailAutoHeight = computed(() => {
  const table = tableEl.value;
  const d = table?.detailRowIndex;
  if (!table || typeof d !== "number") return false;
  return table.rowHeightModes?.[d] === "atLeast";
});

/**
 * 开关明细行的自适应行高。
 *
 * `rowHeightModes` 是数组，必须整份新数组写（与 `columnFields` 同款教训：
 * 原地改元素绕过响应式引用比较，长度不变时连重渲染都不触发）。
 * 只改明细模板行那一格，其余行保持原样。
 */
function setDetailAutoHeight(value: boolean) {
  const table = tableEl.value;
  const d = table?.detailRowIndex;
  if (!table || typeof d !== "number") return;
  const next = Array.from({ length: table.rows }, (_, i) => table.rowHeightModes?.[i] ?? "fixed");
  next[d] = value ? "atLeast" : "fixed";
  design.updateElement(table.id, { rowHeightModes: next });
}

/* ============================================================
   绑定
============================================================ */

function onBind(value: string | number) {
  const el = element.value;
  if (!el) return;
  ops.bindElement(el.id, value === NONE ? null : String(value));
}

/* ============================================================
   字段插入
============================================================ */

/** 选择即命令：插完立刻把选择清空，这个下拉不是"当前值"而是"一个动作" */
const insertKey = ref<string | undefined>(undefined);

function onInsertField(value: string | number) {
  insertKey.value = undefined;
  const el = element.value;
  const field = String(value);
  if (!el || !field) return;
  // 下拉里的可选项本来就来自 activeDataSet，把它的 id 一并带上：
  // 万一元素还没绑定（靠"插入字段"这条路起步），这一步顺手就绑好了
  const dataSetId = activeDataSet.value?.id;
  if (el.type === "text") ops.appendFieldToElement(el.id, field, dataSetId);
  else if (el.type === "image") {
    // 图片元素没有"文本内容"可追加，占位符直接替换 src（字段值应是图片地址）
    ops.bindImageSource(el.id, field, dataSetId);
  }
}
</script>
