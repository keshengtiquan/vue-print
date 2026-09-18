<template>
  <div class="space-y-2">
    <!-- 选区信息条：面板上所有操作都作用于它，不写清楚用户不知道在改谁 -->
    <div
      class="border-border bg-muted/40 text-muted-foreground flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs"
    >
      <Grid2x2 class="size-3.5 shrink-0" />
      <span class="flex-1">{{ rangeLabel }}</span>
      <span v-if="mergeable" class="text-primary">可合并</span>
    </div>

    <Accordion
      type="multiple"
      :default-value="['cell-text', 'cell-border', 'cell-fill', 'cell-size']"
    >
      <!-- 行高 / 列宽：只有整行、整列选中时才有唯一答案，混合选区没有"这一行"可言 -->
      <AccordionItem v-if="rowHeight !== null || colWidth !== null" value="cell-size">
        <AccordionTrigger>行高 / 列宽</AccordionTrigger>
        <AccordionContent class="px-1">
          <div class="grid grid-cols-2 gap-x-2 gap-y-2.5 pt-1">
            <div v-if="rowHeight !== null" class="space-y-1.5">
              <Label for="cell-row-height">行高（mm）</Label>
              <NumberField
                :model-value="rowHeight"
                :min="MIN_TRACK"
                :step="1"
                @update:model-value="setRowHeight"
              >
                <NumberFieldContent>
                  <NumberFieldDecrement class="cursor-pointer" />
                  <NumberFieldInput id="cell-row-height" />
                  <NumberFieldIncrement class="cursor-pointer" />
                </NumberFieldContent>
              </NumberField>
            </div>
            <div v-if="colWidth !== null" class="space-y-1.5">
              <Label for="cell-col-width">列宽（mm）</Label>
              <NumberField
                :model-value="colWidth"
                :min="MIN_TRACK"
                :step="1"
                @update:model-value="setColWidth"
              >
                <NumberFieldContent>
                  <NumberFieldDecrement class="cursor-pointer" />
                  <NumberFieldInput id="cell-col-width" />
                  <NumberFieldIncrement class="cursor-pointer" />
                </NumberFieldContent>
              </NumberField>
            </div>
          </div>
          <p class="text-muted-foreground mt-2 text-[10px] leading-normal">
            单位毫米。直接改数值会改变表格总高/总宽（与拖分隔线不同 —— 拖分隔线是相邻两行/列互相让位，表格尺寸不动）
          </p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="cell-text">
        <AccordionTrigger>文本</AccordionTrigger>
        <AccordionContent class="px-1">
          <div class="space-y-2.5 pt-1">
            <div class="space-y-1.5">
              <Label for="cell-font-size">字号（pt）</Label>
              <Select
                :model-value="fontSizePt"
                @update:model-value="setFontSizePt(String($event))"
              >
                <SelectTrigger id="cell-font-size" class="w-full"
                  ><SelectValue placeholder="请选择"
                /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="size in FONT_SIZES" :key="size" :value="String(size)">
                    {{ size }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1.5">
              <Label for="cell-font-family">字体</Label>
              <Select
                :model-value="common((c) => c.content?.fontFamily) ?? '__default_font__'"
                @update:model-value="setFontFamily(String($event))"
              >
                <SelectTrigger id="cell-font-family" class="w-full"
                  ><SelectValue placeholder="默认字体"
                /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default_font__">默认字体</SelectItem>
                  <SelectItem value="Microsoft YaHei">微软雅黑</SelectItem>
                  <SelectItem value="SimSun">宋体</SelectItem>
                  <SelectItem value="SimHei">黑体</SelectItem>
                  <SelectItem value="KaiTi">楷体</SelectItem>
                  <SelectItem value="Arial">Arial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1.5">
              <Label for="cell-color">文字颜色</Label>
              <ColorPicker
                :model-value="common((c) => c.content?.color) || undefined"
                @update:model-value="setContentValue('color', $event ?? undefined)"
              />
            </div>
            <div class="space-y-1.5">
              <Label for="cell-weight">字重</Label>
              <Select
                :model-value="common((c) => c.content?.fontWeight) ?? 'normal'"
                @update:model-value="setContentValue('fontWeight', String($event))"
              >
                <SelectTrigger id="cell-weight" class="w-full"
                  ><SelectValue placeholder="常规"
                /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">常规</SelectItem>
                  <SelectItem value="bold">粗体</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="cell-align">
        <AccordionTrigger>对齐</AccordionTrigger>
        <AccordionContent class="px-1">
          <div class="space-y-2.5 pt-1">
            <div class="space-y-1.5">
              <Label for="cell-h-align">水平对齐</Label>
              <Select
                :model-value="common((c) => c.content?.textAlign) ?? 'left'"
                @update:model-value="setContentValue('textAlign', String($event))"
              >
                <SelectTrigger id="cell-h-align" class="w-full"
                  ><SelectValue placeholder="左对齐"
                /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">左对齐</SelectItem>
                  <SelectItem value="center">居中</SelectItem>
                  <SelectItem value="right">右对齐</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1.5">
              <Label for="cell-v-align">垂直对齐</Label>
              <Select
                :model-value="common((c) => c.content?.verticalAlign) ?? 'middle'"
                @update:model-value="setContentValue('verticalAlign', String($event))"
              >
                <SelectTrigger id="cell-v-align" class="w-full"
                  ><SelectValue placeholder="中部"
                /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="top">顶部</SelectItem>
                  <SelectItem value="middle">中部</SelectItem>
                  <SelectItem value="bottom">底部</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1.5">
              <Label for="cell-layout">排布方式</Label>
              <Select
                :model-value="common((c) => c.content?.layout) ?? 'horizontal'"
                @update:model-value="setContentValue('layout', String($event))"
              >
                <SelectTrigger id="cell-layout" class="w-full"
                  ><SelectValue placeholder="水平"
                /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="horizontal">水平</SelectItem>
                  <SelectItem value="vertical">垂直（竖排）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="cell-border">
        <AccordionTrigger>边框</AccordionTrigger>
        <AccordionContent class="px-1">
          <div class="space-y-2.5 pt-1">
            <!-- 没有可见的边可涂时先把话说清楚，免得用户以为控件坏了 -->
            <p
              v-if="!hasVisibleEdge"
              class="border-border bg-muted/40 text-muted-foreground rounded-md border px-2 py-1.5 text-[10px] leading-normal"
            >
              选区里没有可见的边框。上面三项只改写<strong>已有的边</strong>，
              先点下面的边按钮或「全部框线」把线加上。
            </p>

            <div class="space-y-1.5">
              <Label for="cell-border-style">线型</Label>
              <Select
                :model-value="borderStyle"
                @update:model-value="setBorderStyle($event)"
              >
                <SelectTrigger id="cell-border-style" class="w-full"
                  ><SelectValue placeholder="实线"
                /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">实线</SelectItem>
                  <SelectItem value="dashed">虚线</SelectItem>
                  <SelectItem value="dotted">点线</SelectItem>
                  <SelectItem value="double">双线</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1.5">
              <Label for="cell-border-width">线宽（px）</Label>
              <NumberField
                :model-value="borderWidthPx"
                :min="0.5"
                :step="0.5"
                @update:model-value="setEdgeProp('width', pxToMm(Number($event)))"
              >
                <NumberFieldContent>
                  <NumberFieldDecrement class="cursor-pointer" />
                  <NumberFieldInput id="cell-border-width" />
                  <NumberFieldIncrement class="cursor-pointer" />
                </NumberFieldContent>
              </NumberField>
            </div>
            <div class="space-y-1.5">
              <Label for="cell-border-color">线条颜色</Label>
              <ColorPicker
                :model-value="borderColor"
                @update:model-value="setEdgeProp('color', String($event))"
              />
            </div>

            <div class="space-y-1.5">
              <Label>选区的哪条外缘边</Label>
              <div class="grid grid-cols-4 gap-1">
                <Button
                  v-for="side in BORDER_SIDES"
                  :key="side"
                  type="button"
                  :variant="sideActive(side) ? 'default' : 'outline'"
                  size="sm"
                  class="cursor-pointer"
                  @click="toggleSide(side)"
                >
                  {{ SIDE_LABELS[side] }}
                </Button>
              </div>
            </div>

            <div class="space-y-1.5">
              <Label>快捷</Label>
              <div class="grid grid-cols-3 gap-1">
                <Button type="button" variant="outline" size="sm" class="cursor-pointer" @click="applyPreset('all')">全部框线</Button>
                <Button type="button" variant="outline" size="sm" class="cursor-pointer" @click="applyPreset('outside')">外框线</Button>
                <Button type="button" variant="outline" size="sm" class="cursor-pointer" @click="applyPreset('none')">无框线</Button>
              </div>
            </div>
            <p class="text-muted-foreground text-[10px] leading-normal">
              上面三项<strong>改完立刻生效</strong>：作用到选区内所有可见的边；如果选区里混着不同设置，
              只改你动的那一项，其余保留。<br />
              共享边会<strong>同时写进相邻两格</strong> —— 那条线是一整条，只写自己那半边的话，
              调细 / 调没都会输给对面，看着像"只能调宽"。
            </p>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="cell-fill">
        <AccordionTrigger>填充 &amp; 边距</AccordionTrigger>
        <AccordionContent class="px-1">
          <div class="space-y-2.5 pt-1">
            <div class="space-y-1.5">
              <Label for="cell-bg">背景色</Label>
              <ColorPicker
                :model-value="common((c) => c.style?.backgroundColor) || undefined"
                @update:model-value="setStyleValue('backgroundColor', $event ?? undefined)"
              />
            </div>
            <div class="space-y-1.5">
              <Label for="cell-padding">内边距（mm）</Label>
              <NumberField
                :model-value="common((c) => c.style?.padding) ?? DEFAULT_CELL_PADDING"
                :min="0"
                :step="0.2"
                @update:model-value="setStyleValue('padding', Number($event))"
              >
                <NumberFieldContent>
                  <NumberFieldDecrement class="cursor-pointer" />
                  <NumberFieldInput id="cell-padding" />
                  <NumberFieldIncrement class="cursor-pointer" />
                </NumberFieldContent>
              </NumberField>
            </div>
            <div class="space-y-1.5">
              <Label for="cell-overflow">内容溢出</Label>
              <Select
                :model-value="common((c) => c.style?.overflow) ?? 'wrap'"
                @update:model-value="setStyleValue('overflow', String($event))"
              >
                <SelectTrigger id="cell-overflow" class="w-full"
                  ><SelectValue placeholder="自动换行"
                /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wrap">自动换行</SelectItem>
                  <SelectItem value="clip">超出裁切</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="cell-merge">
        <AccordionTrigger>合并 / 拆分</AccordionTrigger>
        <AccordionContent class="px-1">
          <div class="grid grid-cols-2 gap-1 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="cursor-pointer"
              :disabled="!mergeable"
              @click="doMerge"
            >
              <Merge />合并
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="cursor-pointer"
              :disabled="!splittable"
              @click="doSplit"
            >
              <Split />拆分
            </Button>
          </div>
          <p class="text-muted-foreground mt-2 text-[10px] leading-normal">
            合并只保留左上角单元格的内容；拆分把合并格还原成独立格，内容留在左上角
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Grid2x2, Merge, Split } from "@lucide/vue";
import { useDesignStore } from "@/store/modules/design";
import { mmToPt, mmToPx, ptToMm, pxToMm, roundPt } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NumberField,
  NumberFieldContent,
  NumberFieldInput,
  NumberFieldDecrement,
  NumberFieldIncrement
} from "@/components/ui/number-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { ColorPicker } from "@/components/color-picker";
import type {
  CellBorderEdge,
  CellBorderSide,
  CellBorderStyle,
  TableCell,
  TableCellContent,
  TableElement
} from "@/components/design/types";
import {
  BORDER_SIDES,
  borderVisible,
  buildTableMap,
  canMerge,
  colLabel,
  commonValue,
  DEFAULT_BORDER_COLOR,
  DEFAULT_CELL_PADDING,
  defaultBorderEdge,
  isMergedCell,
  MIN_TRACK,
  mergeRange,
  outlineRefsInRange,
  ownBorderEdge,
  rangeColWidth,
  rangeRowHeight,
  refsInRange,
  round2,
  splitCell,
  writeBorderEdge,
  type GridRef
} from "@/components/design/table/model";

const props = defineProps<{ table: TableElement }>();
const store = useDesignStore();

/** 与文本元素的字号档位保持一致：用户的字号直觉来自 Word/Excel 的 pt 体系 */
const FONT_SIZES = [42, 36, 26, 24, 22, 18, 16, 15, 14, 12, 10.5, 9, 7.5, 6.5, 5.5, 5, 48, 72];
const DEFAULT_CELL_FONT_PT = 10.5; // 五号

const SIDE_LABELS: Record<CellBorderSide, string> = {
  top: "上",
  right: "右",
  bottom: "下",
  left: "左"
};

const range = computed(() => store.cellRange);

const rangeLabel = computed(() => {
  const r = range.value;
  if (!r) return "未选中单元格";
  const cells = (r.r2 - r.r1 + 1) * (r.c2 - r.c1 + 1);
  if (r.r1 === r.r2 && r.c1 === r.c2) return `${colLabel(r.c1)}${r.r1 + 1}`;
  return `${colLabel(r.c1)}${r.r1 + 1} : ${colLabel(r.c2)}${r.r2 + 1}（${cells} 格）`;
});

/** 选区共有值（多格不一致时返回 undefined，面板会回落到默认值展示） */
function common<T>(pick: (cell: TableCell) => T | undefined): T | undefined {
  const r = range.value;
  if (!r) return undefined;
  return commonValue(props.table, r, pick).value;
}

/* ---------------- 写入 ---------------- */

function updateCells(patch: (cell: TableCell) => void) {
  const r = range.value;
  if (!r) return;
  store.updateTable(props.table.id, (t) => {
    for (const ref of refsInRange(t, r)) patch(ref.cell);
  });
}

function setContentValue<K extends keyof TableCellContent>(key: K, value: TableCellContent[K]) {
  updateCells((cell) => {
    cell.content = { ...(cell.content ?? { type: "text" as const }), [key]: value };
  });
}

function setStyleValue<K extends keyof NonNullable<TableCell["style"]>>(
  key: K,
  value: NonNullable<TableCell["style"]>[K]
) {
  updateCells((cell) => {
    cell.style = { ...(cell.style ?? {}), [key]: value };
  });
}

const fontSizePt = computed(() => {
  const mm = common((c) => c.content?.fontSize) ?? ptToMm(DEFAULT_CELL_FONT_PT);
  const pt = roundPt(mmToPt(mm));
  return FONT_SIZES.reduce(
    (nearest, size) => (Math.abs(size - pt) < Math.abs(nearest - pt) ? size : nearest),
    FONT_SIZES[0]
  ).toString();
});

function setFontSizePt(raw: string) {
  setContentValue("fontSize", ptToMm(Number(raw)));
}

function setFontFamily(raw: string) {
  setContentValue("fontFamily", raw === "__default_font__" ? undefined : raw);
}

/* ---------------- 行高 / 列宽 ---------------- */

const rowHeight = computed(() => (range.value ? rangeRowHeight(props.table, range.value) : null));
const colWidth = computed(() => (range.value ? rangeColWidth(props.table, range.value) : null));

/**
 * 面板改单行/单列尺寸是**直接改那一条轨道**，其余不动 —— 与拖分隔线相反
 * （那条手势是相邻两轨互相让位、表格总尺寸不变）。两种语义都保留，因为
 * "我要这一行是 8mm"和"我要这两行的分界线往下挪 3mm"确实是两件事。
 * 表格总尺寸由 store 的 syncTableGeometry 自动回算。
 */
function setRowHeight(value: number) {
  const r = range.value;
  if (!r) return;
  store.updateTable(props.table.id, (t) => {
    t.rowHeights[r.r1] = value;
  });
}

function setColWidth(value: number) {
  const r = range.value;
  if (!r) return;
  store.updateTable(props.table.id, (t) => {
    t.colWidths[r.c1] = value;
  });
}

/* ---------------- 边框 ---------------- */

/**
 * 边框这一组控件是**批改器**，不是"先配好再应用"的笔：
 * 面板显示的是选区当前的边框值，改任意一项就立刻重涂选区内**所有可见的边**。
 *
 * 为什么以"可见的边"为目标集合，而不是选区内所有格的所有边：
 * 后者会在用户只是想把外框线改个颜色时，把已经清掉的内部线一起复活（见 §9.6）。
 * 清掉的线不该被顺手加回来 —— 那是"全部框线"按钮的活。
 */
const defaultEdge = computed(() => defaultBorderEdge(props.table));

/** 关掉一条边时写的值。**必须是显式的 none** —— 删掉属性只会回落到表格默认（仍然可见） */
const HIDDEN_EDGE: CellBorderEdge = { style: "none", width: 0, color: DEFAULT_BORDER_COLOR };

/** 选区里所有可见的边（含它属于哪一格、哪一侧），面板显示与"即时改"都作用于它 */
const visibleEdges = computed(() => {
  const r = range.value;
  if (!r) return [];
  const out: { ref: GridRef; side: CellBorderSide; edge: CellBorderEdge }[] = [];
  for (const ref of refsInRange(props.table, r)) {
    for (const side of BORDER_SIDES) {
      const edge = ownBorderEdge(props.table, ref.cell, side);
      if (borderVisible(edge)) out.push({ ref, side, edge });
    }
  }
  return out;
});

const hasVisibleEdge = computed(() => visibleEdges.value.length > 0);

/** 边属性的公共值：全选区一致才有值，混选回落 undefined（面板显示表格默认） */
function commonEdge<K extends keyof CellBorderEdge>(key: K): CellBorderEdge[K] | undefined {
  const list = visibleEdges.value;
  if (!list.length) return undefined;
  const first = list[0].edge[key];
  return list.every((item) => item.edge[key] === first) ? first : undefined;
}

const borderStyle = computed<CellBorderStyle>(() => commonEdge("style") ?? defaultEdge.value.style);
const borderWidthPx = computed(() =>
  round2(mmToPx(commonEdge("width") ?? defaultEdge.value.width))
);
const borderColor = computed(() => commonEdge("color") ?? defaultEdge.value.color);

/** 面板当前显示的那套参数 —— 侧边按钮把边"打开"时用它，等价于"把看到的这套应用上去" */
function penEdge(): CellBorderEdge {
  return {
    style: borderStyle.value,
    width: pxToMm(borderWidthPx.value),
    color: borderColor.value
  };
}

/**
 * 把 `next(已有边)` 的结果重涂到选区内所有可见的边上。
 *
 * 只经由 `next` 改动的那个属性会被写下去，每条边其余的属性保持自己的值 ——
 * 混选（A 边 3px、B 边 1px）时改颜色，才不会顺手把宽度也统一掉。
 */
function paintVisibleEdges(next: (edge: CellBorderEdge) => CellBorderEdge) {
  const r = range.value;
  if (!r) return;
  store.updateTable(props.table.id, (t) => {
    const map = buildTableMap(t);
    for (const ref of refsInRange(t, r)) {
      for (const side of BORDER_SIDES) {
        const edge = ownBorderEdge(t, ref.cell, side);
        if (!borderVisible(edge)) continue;
        writeBorderEdge(t, map, ref, side, next(edge));
      }
    }
  });
}

/** 改线型 / 线宽 / 颜色：只改这一项，立刻重涂所有可见边 */
function setEdgeProp<K extends keyof CellBorderEdge>(key: K, value: CellBorderEdge[K]) {
  paintVisibleEdges((edge) => ({ ...edge, [key]: value }));
}

/** Select 抛上来的是 string，类型收口在这里做一次，模板里就不必写 as */
function setBorderStyle(value: unknown) {
  setEdgeProp("style", value as CellBorderStyle);
}

/**
 * 该侧的外缘边是否整条都在。
 *
 * 读的是 `ownBorderEdge`（显式设置 or 表格默认）而不是只看显式设置 ——
 * 否则新建的表格明明四边都有线，按钮却全是"未激活"，看着就是坏的。
 */
function sideActive(side: CellBorderSide): boolean {
  const r = range.value;
  if (!r) return false;
  const refs = outlineRefsInRange(props.table, r, side);
  if (!refs.length) return false;
  return refs.every((ref) => borderVisible(ownBorderEdge(props.table, ref.cell, side)));
}

function toggleSide(side: CellBorderSide) {
  const r = range.value;
  if (!r) return;
  const edge = sideActive(side) ? HIDDEN_EDGE : penEdge();
  store.updateTable(props.table.id, (t) => {
    const map = buildTableMap(t);
    for (const ref of outlineRefsInRange(t, r, side)) {
      writeBorderEdge(t, map, ref, side, edge);
    }
  });
}

/**
 * 三个快捷预设。都作用于**整个选区**（与外缘按钮不同）：
 * "外框线"只给选区最外圈加线 —— 这是 Word 里最高频的那一个，
 * 光有"逐边设置"的话，做一个 5×8 的表格要手动点 40 次。
 */
function applyPreset(preset: "all" | "outside" | "none") {
  const r = range.value;
  if (!r) return;
  const pen = penEdge();
  store.updateTable(props.table.id, (t) => {
    const map = buildTableMap(t);
    if (preset === "none") {
      for (const ref of refsInRange(t, r)) {
        for (const side of BORDER_SIDES) writeBorderEdge(t, map, ref, side, HIDDEN_EDGE);
      }
      return;
    }
    if (preset === "all") {
      for (const ref of refsInRange(t, r)) {
        for (const side of BORDER_SIDES) writeBorderEdge(t, map, ref, side, pen);
      }
      return;
    }
    // 外框线：只动选区外缘的四条
    for (const side of BORDER_SIDES) {
      for (const ref of outlineRefsInRange(t, r, side)) {
        writeBorderEdge(t, map, ref, side, pen);
      }
    }
  });
}

/* ---------------- 合并 / 拆分 ---------------- */

const mergeable = computed(() => !!range.value && canMerge(props.table, range.value));
const splittable = computed(
  () => !!range.value && refsInRange(props.table, range.value).some((ref) => isMergedCell(ref.cell))
);

function doMerge() {
  const r = range.value;
  if (r) store.updateTable(props.table.id, (t) => mergeRange(t, r));
}

function doSplit() {
  const r = range.value;
  if (!r) return;
  store.updateTable(props.table.id, (t) => {
    for (const ref of refsInRange(t, r)) {
      if (isMergedCell(ref.cell)) splitCell(t, ref.r, ref.c);
    }
  });
}
</script>
