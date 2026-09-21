<template>
  <div class="flex h-full flex-col">
    <!-- 顶部：新建入口 + 当前执行模式 -->
    <div class="border-border flex items-center gap-2 border-b px-2.5 py-2">
      <Button type="button" size="sm" class="h-7 flex-1 cursor-pointer text-xs" @click="onCreate">
        <Plus class="size-3.5" />
        新建数据集
      </Button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <!-- 未接入数据服务：给引导而不是空白 -->
      <div
        v-if="!binding.serviceAvailable"
        class="border-destructive/30 bg-destructive/10 text-destructive m-2 rounded-md border px-2.5 py-2 text-[11px] leading-4"
      >
        <p class="font-medium">未接入数据服务</p>
        <p class="mt-0.5 opacity-90">请在后端配置数据服务地址，或在配置里改用浏览器直连模式。</p>
      </div>

      <!-- 数据源 + 数据集 -->
      <section v-if="binding.dataSources.length" class="px-1.5 py-1.5">
        <div v-for="source in binding.dataSources" :key="source.id" class="mb-1">
          <div class="text-muted-foreground flex items-center gap-1.5 px-1.5 py-1 text-[11px]">
            <Server class="size-3" />
            <span class="truncate font-medium">{{ source.name }}</span>
            <span class="bg-muted ml-auto shrink-0 rounded-sm px-1 py-px text-[10px]">
              {{ source.type === "http" ? "接口" : "SQL" }}
            </span>
          </div>

          <div
            v-for="ds in dataSetsOf(source.id)"
            :key="ds.id"
            class="group/ds flex cursor-pointer items-center gap-1 rounded-sm px-1.5 py-1.5"
            :class="
              ds.id === binding.selectedDataSet?.id
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted/70'
            "
            @click="binding.selectDataSet(ds.id)"
            @dblclick="openEditor(ds.id)"
          >
            <span class="flex-1 truncate text-xs">{{ ds.label || ds.name }}</span>
            <span v-if="stateOf(ds.id).status === 'running'" class="text-muted-foreground shrink-0">
              <LoaderCircle class="size-3 animate-spin" />
            </span>
            <span v-else-if="stateOf(ds.id).status === 'error'" class="text-destructive shrink-0">
              <CircleAlert class="size-3" />
            </span>
            <span v-else-if="stateOf(ds.id).status === 'ok'" class="text-primary shrink-0">
              <CircleCheck class="size-3" />
            </span>

            <span class="hidden shrink-0 items-center gap-0.5 group-hover/ds:flex">
              <button
                type="button"
                class="hover:text-foreground cursor-pointer p-0.5"
                title="编辑"
                @click.stop="openEditor(ds.id)"
              >
                <Pencil class="size-3" />
              </button>
              <button
                type="button"
                class="hover:text-foreground cursor-pointer p-0.5"
                title="复制"
                @click.stop="onDuplicate(ds.id)"
              >
                <Copy class="size-3" />
              </button>
              <button
                type="button"
                class="hover:text-destructive cursor-pointer p-0.5"
                title="删除"
                @click.stop="onRemove(ds)"
              >
                <Trash class="size-3" />
              </button>
            </span>
          </div>
        </div>
      </section>

      <!-- 空态 -->
      <div v-else class="px-3 py-6 text-center">
        <Database class="text-muted-foreground/50 mx-auto size-7" />
        <p class="text-muted-foreground mt-2 text-[11px] leading-4">
          还没有数据集<br />
          建一个，把接口地址填进去
        </p>
      </div>

      <!-- 字段树 -->
      <section v-if="selected" class="border-border mt-1 border-t pt-1.5 pb-2">
        <div class="flex items-center gap-1.5 px-1.5 py-1">
          <span class="text-muted-foreground flex-1 truncate text-[11px] font-medium">
            字段 · {{ selected.label || selected.name }}
          </span>
          <span v-if="selected.fields?.length" class="text-muted-foreground text-[10px]">
            {{ selected.fields.length }}
          </span>
        </div>

        <div class="px-1.5">
          <!--
            `:key` 是刻意的：展开状态是各节点自己的本地状态，不换 key 的话
            切数据集会沿用上一棵树的展开态。换了 key 整棵树重建 = 全部回到折叠。
          -->
          <FieldTree :key="selected.id" :data-set="selected" @pick="onPickField" />
        </div>

        <div class="mt-2 flex flex-col gap-1.5 px-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="h-7 w-full cursor-pointer text-xs"
            :disabled="stateOf(selected.id).status === 'running'"
            @click="onTest(selected.id)"
          >
            <LoaderCircle
              v-if="stateOf(selected.id).status === 'running'"
              class="size-3.5 animate-spin"
            />
            <Play v-else class="size-3.5" />
            {{ stateOf(selected.id).status === "running" ? "正在取数…" : "测试并解析字段" }}
          </Button>
        </div>

        <!-- 测试结果 / 错误 -->
        <p
          v-if="stateOf(selected.id).status === 'ok'"
          class="text-muted-foreground mt-1.5 px-1.5 text-[10px]"
        >
          取数成功{{ tookText(selected.id) }}，共 {{ binding.sampleOf(selected.id).length }} 行样本
        </p>
        <p
          v-else-if="stateOf(selected.id).status === 'error'"
          class="text-destructive mt-1.5 px-1.5 text-[10px] leading-4 wrap-break-word"
        >
          {{ stateOf(selected.id).message }}
        </p>
      </section>
    </div>

    <!-- 落点提示：字段拖/点了，但画布上没有可插入的目标 -->
    <div
      v-if="notice"
      class="border-primary/30 bg-primary/10 text-primary mx-2 mb-2 rounded-md border px-2 py-1.5 text-[11px] leading-4"
    >
      {{ notice }}
    </div>

    <!-- 底部：当前执行模式 -->
    <div
      class="border-border text-muted-foreground flex shrink-0 items-center gap-1.5 border-t px-2.5 py-1.5 text-[10px]"
    >
      <span class="bg-primary size-1.5 shrink-0 rounded-full"></span>
      {{ binding.modeLabel() }}
      <span class="ml-auto">字段可拖到画布</span>
    </div>

    <!-- 数据集编辑器：由列表的「编辑」或「新建」打开 -->
    <DataSetEditorDialog v-model:open="editorOpen" :data-set-id="editorId" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  CircleAlert,
  CircleCheck,
  Copy,
  Database,
  LoaderCircle,
  Pencil,
  Play,
  Plus,
  Server,
  Trash
} from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { colLabel } from "@/components/design/table/model";
import { useDesignStore } from "@/store/modules/design";
import { useDataBindingStore } from "@/store/modules/dataBinding";
import type { DataSetField, TemplateDataSet } from "./types";
import { useDataBinding } from "./useDataBinding";
import FieldTree from "./FieldTree.vue";
import DataSetEditorDialog from "./DataSetEditorDialog.vue";

const binding = useDataBindingStore();
const design = useDesignStore();
const { appendFieldToElement, appendFieldToCell, fieldToken } = useDataBinding();

const editorOpen = ref(false);
const editorId = ref<string | null>(null);
const notice = ref("");
let noticeTimer: number | undefined;

/** 选中数据集（面板上下文），没选过时 store 会回落到第一个 */
const selected = computed(() => binding.selectedDataSet);

function dataSetsOf(sourceId: string): TemplateDataSet[] {
  return binding.dataSets.filter((d) => d.dataSourceId === sourceId);
}

function stateOf(id: string) {
  return binding.testStateOf(id);
}

function tookText(id: string) {
  const took = stateOf(id).took;
  return took ? `（${took}ms）` : "";
}

function flash(message: string) {
  notice.value = message;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (notice.value = ""), 3200);
}

function openEditor(id: string) {
  editorId.value = id;
  binding.selectDataSet(id);
  editorOpen.value = true;
}

function onCreate() {
  const ds = binding.createDataSet();
  openEditor(ds.id);
}

function onDuplicate(id: string) {
  const copy = binding.duplicateDataSet(id);
  if (copy) binding.selectDataSet(copy.id);
}

function onRemove(ds: TemplateDataSet) {
  const name = ds.label || ds.name;
  if (!window.confirm(`删除数据集「${name}」？\n引用它的元素绑定会一并清除，该操作不可撤销。`))
    return;
  binding.removeDataSet(ds.id);
}

async function onTest(id: string) {
  const ok = await binding.runTest(id);
  if (ok) flash("取数成功，字段已更新");
}

/**
 * 点字段 = 插入到"当前落点"。
 *
 * 落点判定顺序与用户的心智一致：**先在表格里，再在元素上** ——
 * 表格编辑态下 `selectedId` 就是那张表，先判表格才能让"点字段进单元格"生效。
 */
function onPickField(field: DataSetField) {
  // 点进来的字段一定属于当前面板上下文的数据集（字段树就是按它渲染的），
  // 一并把 id 传下去 —— 落在哪个元素上，哪个元素就绑上这个数据集
  const dataSetId = selected.value?.id;
  // 提示文案与实际插入的内容同源（都走 fieldToken），
  // 免得出现"提示说插了 {品名}、实际插进去的是 {数据集1.品名}"这种对不上的情况
  const token = fieldToken(field.name, dataSetId);
  const table = design.activeTable;
  if (table && design.activeCell) {
    const { r, c } = design.activeCell;
    appendFieldToCell(table.id, r, c, field.name, dataSetId);
    flash(`已插入 ${token} 到 ${colLabel(c)}${r + 1} 单元格`);
    return;
  }

  const el = design.selectedId ? design.getElement(design.selectedId) : undefined;
  if (el && el.type === "text") {
    appendFieldToElement(el.id, field.name, dataSetId);
    flash(`已插入 ${token} 到文本元素`);
    return;
  }

  if (el && el.type === "table") {
    flash("请先双击进入表格、点一个单元格，再点字段插入");
    return;
  }
  flash("请先选中一个文本元素，或在表格里点一个单元格");
}
</script>
