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
        :class="
          sampleRows.length
            ? 'bg-primary/8 text-primary'
            : 'bg-muted text-muted-foreground'
        "
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
import { useDesignStore } from "@/store/modules/design";
import { useDataBindingStore } from "@/store/modules/dataBinding";
import { flattenFields } from "@/components/design/data/model";
import { useDataBinding } from "@/components/design/data/useDataBinding";

/** 哨兵值：SelectItem 不接受空字符串，所以"未绑定"要有个非空值来表示 */
const NONE = "__none__";

const design = useDesignStore();
const binding = useDataBindingStore();
const ops = useDataBinding();

/** 内部自取选中元素，与 ElementLayoutSection 同款 —— 面板的宿主不该再传一遍 */
const element = computed(() => (design.selectedId ? design.getElement(design.selectedId) : undefined));

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

/* ---------- 绑定 ---------- */

function onBind(value: string | number) {
  const el = element.value;
  if (!el) return;
  ops.bindElement(el.id, value === NONE ? null : String(value));
}

/* ---------- 字段插入 ---------- */

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
