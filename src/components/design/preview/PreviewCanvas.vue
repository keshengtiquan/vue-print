<template>
  <div class="flex h-full flex-col">
    <!-- ===================== 工具条 ===================== -->
    <div class="border-border bg-background flex h-12 shrink-0 items-center gap-3 border-b px-3">
      <Button variant="outline" size="sm" class="cursor-pointer" @click="backToDesign">
        <ArrowLeft />返回设计
      </Button>

      <div class="bg-border h-4 w-px" aria-hidden="true"></div>

      <!-- 取数状态 -->
      <div class="text-muted-foreground flex items-center gap-1.5 text-xs">
        <LoaderCircle v-if="preview.status === 'loading'" class="size-3.5 animate-spin" />
        <CircleCheck v-else-if="preview.status === 'ready'" class="text-primary size-3.5" />
        <CircleAlert v-else-if="preview.hasErrors" class="text-destructive size-3.5" />
        <Database v-else class="size-3.5" />
        <span>{{ statusText }}</span>
      </div>

      <Button
        variant="outline"
        size="sm"
        class="cursor-pointer"
        :disabled="preview.status === 'loading'"
        @click="refresh"
      >
        <RefreshCw />刷新数据
      </Button>

      <!-- 页码跳转 -->
      <div class="ml-auto flex items-center gap-2">
        <div class="text-muted-foreground flex items-center gap-1 text-xs">
          <span>第</span>
          <Input
            v-model="pageInput"
            class="h-7 w-12 px-1.5 text-center text-xs"
            @keydown.enter="gotoPage()"
            @blur="gotoPage()"
          />
          <span>/ {{ pageCount }} 页</span>
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          class="cursor-pointer"
          :disabled="preview.currentPage <= 1"
          @click="stepPage(-1)"
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          class="cursor-pointer"
          :disabled="preview.currentPage >= pageCount"
          @click="stepPage(1)"
        >
          <ChevronRight />
        </Button>

        <div class="bg-border h-4 w-px" aria-hidden="true"></div>

        <!-- 缩放：**预览自己的**状态，与 design.scale 无关（见 usePreviewZoom） -->
        <div class="flex items-center gap-1.5">
          <ScanSearch class="text-muted-foreground size-3.5" />
          <Select :model-value="zoomValue" @update:model-value="onZoomChange">
            <SelectTrigger class="h-7 w-28 cursor-pointer text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="step in ZOOM_STEPS" :key="String(step.value)" :value="String(step.value)">
                {{ step.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>

    <!-- ===================== 警告条 ===================== -->
    <!--
      "绝不允许页数少了、元素少了、值空着而界面上没有任何说明" —— 这条底线
      （preview-design §3.8）就落在这个条上。它默认**收起**（不占版面），
      但把"有几条"直接写在标题里，做不到静默。
    -->
    <div
      v-if="warningGroups.length || preview.hasErrors"
      class="border-border bg-muted/40 shrink-0 border-b px-3 py-1.5"
    >
      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-2 text-left text-xs"
        @click="warningsOpen = !warningsOpen"
      >
        <TriangleAlert class="text-destructive size-3.5 shrink-0" />
        <span class="flex-1">
          {{ warningSummary }}
        </span>
        <ChevronDown
          class="size-3.5 shrink-0 transition-transform duration-150"
          :class="warningsOpen ? 'rotate-180' : ''"
        />
      </button>

      <div v-if="warningsOpen" class="mt-1.5 space-y-2.5 pb-1">
        <!-- 取数失败：一句人话 + 是哪个数据集 -->
        <div v-if="preview.hasErrors" class="space-y-0.5">
          <p class="text-destructive text-[11px] font-medium">取数失败</p>
          <p
            v-for="(message, id) in preview.errorsByDataSetId"
            :key="id"
            class="text-muted-foreground pl-3 text-[11px] leading-4"
          >
            · 数据集「{{ dataSetLabel(String(id)) }}」：{{ message }}
          </p>
        </div>

        <!--
          行高自适应的测量诊断：测量层在视口外、坏了没有任何可见症状，
          只会表现为"断点奇怪 / 数据像消失"。把应测/已测直接摆出来，
          `2/500` 一眼就是测量层没工作（2026-09-22 第二页从 26 开始的排障口）。
        -->
        <div v-if="measureDiagnostics.length" class="space-y-0.5">
          <p class="text-foreground/80 text-[11px] font-medium">行高自适应测量诊断</p>
          <p
            v-for="d in measureDiagnostics"
            :key="d.elementId"
            class="text-muted-foreground pl-3 font-mono text-[11px] leading-4"
          >
            · {{ elementLabel(d.elementId) }}：已测 {{ d.measured }}/{{ d.expected }} 行
            <template v-if="d.measured < d.expected">
              —— <span class="text-destructive">测量层没量全，分页按声明高切、渲染按真实高画，数据会被"挤"出纸外</span>
            </template>
            <template v-else-if="d.sample.length">
              （样本 {{ d.sample.join(" / ") }}mm）
            </template>
          </p>
        </div>

        <div v-for="group in warningGroups" :key="group.title" class="space-y-0.5">
          <p class="text-foreground/80 text-[11px] font-medium">{{ group.title }}</p>
          <p
            v-for="(line, i) in group.lines"
            :key="i"
            class="text-muted-foreground pl-3 font-mono text-[11px] leading-4 break-all"
          >
            · {{ line }}
          </p>
        </div>
      </div>
    </div>

    <!-- ===================== 页面区 ===================== -->
    <div ref="scrollRef" class="min-h-0 flex-1 overflow-auto bg-gray-100 px-6 py-6" @wheel="zoom.onWheel">
      <!-- 空态：模板里一个元素都没有 -->
      <div
        v-if="!hasElements"
        class="text-muted-foreground flex h-full flex-col items-center justify-center gap-3"
      >
        <FileQuestion class="size-10" />
        <p class="text-sm">模板里还没有任何元素</p>
        <Button variant="outline" size="sm" class="cursor-pointer" @click="backToDesign">
          <ArrowLeft />返回设计
        </Button>
      </div>

      <template v-else>
        <!--
          多页**垂直堆叠**（像 PDF 阅读器），不做"一次只显示一页"。
          理由：分页的常见问题（页底空洞、表格被劈开、表头没重复）
          **只有连着看才发现**，一次一页会把它藏起来。
        -->
        <div
          v-for="page in view.pages"
          :key="page.index"
          :data-page-index="page.index"
          class="mx-auto mb-6 flex w-fit flex-col items-center gap-1.5"
        >
          <PreviewPage
            :page="page"
            :paper-width-mm="design.paper.widthMm"
            :paper-height-mm="design.paper.heightMm"
            :page-count="pageCount"
            :px-per-mm="pxPerMm"
          />
          <span class="text-muted-foreground text-[11px]">第 {{ page.index + 1 }} 页</span>
        </div>

        <!-- 没有数据集时的引导（不是错误，只是"还没绑"） -->
        <p
          v-if="!dataSetCount && view.pages.length"
          class="text-muted-foreground mt-2 text-center text-xs"
        >
          模板还没有绑定数据集，下面按静态内容渲染（占位符为空白）。
        </p>
      </template>
    </div>

    <!-- 行高自适应的隐藏测量层：量每行自然高，与分页解耦（见 MeasureLayer 注释） -->
    <MeasureLayer v-if="hasElements" :rows-of="expansionRowsOf" />
  </div>
</template>

<script setup lang="ts">
/**
 * 预览容器：工具条 + 警告条 + 多页垂直堆叠 + 各类状态。
 *
 * 它自己不含任何取数与排版逻辑 —— 那两件事分别在 `store/modules/preview.ts`
 * 与 `preview/usePreviewLayout.ts` 里。这里只负责"把已经算好的东西摆出来"，
 * 以及三个纯 UI 的关注点：缩放、页码跳转、警告条展开。
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Database,
  FileQuestion,
  LoaderCircle,
  RefreshCw,
  ScanSearch,
  TriangleAlert
} from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useDesignStore } from "@/store/modules/design";
import { useDataBindingStore } from "@/store/modules/dataBinding";
import { usePreviewStore } from "@/store/modules/preview";
import PreviewPage from "./PreviewPage.vue";
import MeasureLayer from "./render/MeasureLayer.vue";
import { PX_PER_MM, usePreviewLayout } from "./usePreviewLayout";
import { ZOOM_STEPS, usePreviewZoom } from "./usePreviewZoom";
import type { LayoutWarning } from "./types";

const design = useDesignStore();
const binding = useDataBindingStore();
const preview = usePreviewStore();
const route = useRoute();
const router = useRouter();

const { view, hasElements, dataSetCount, expansionRowsOf, measureDiagnostics } = usePreviewLayout();

const scrollRef = ref<HTMLElement | null>(null);
const zoom = usePreviewZoom(scrollRef, computed(() => design.paper.widthMm));
const pxPerMm = computed(() => PX_PER_MM * zoom.scale.value);

const warningsOpen = ref(false);

/* ============================================================
   页面导航
============================================================ */

const pageCount = computed(() => Math.max(1, view.value.pages.length));
const pageInput = ref("1");

// 页码输入框跟着当前页走（翻页按钮改了 currentPage 后要同步显示）
watch(
  () => preview.currentPage,
  (page) => {
    pageInput.value = String(page);
  }
);

/** 页数变化（比如刷新数据后从 1 页变成 3 页）时把当前页收回合法范围 */
watch(pageCount, (count) => {
  if (preview.currentPage > count) preview.setCurrentPage(count);
});

function gotoPage() {
  // 输入框被清空 / 敲了非数字 → 回落到当前页，而不是跳到第 1 页
  const raw = Number.parseInt(pageInput.value, 10);
  const page = Number.isFinite(raw) ? Math.min(Math.max(1, raw), pageCount.value) : preview.currentPage;
  preview.setCurrentPage(page);
  pageInput.value = String(page);
  const target = scrollRef.value?.querySelector(`[data-page-index="${page - 1}"]`);
  // `scrollIntoView` 而不是自己算 offsetTop：容器里还有 padding 与页面标签，
  // 手工算偏移迟早会算错一行
  target?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function stepPage(delta: number) {
  gotoPageTo(preview.currentPage + delta);
}

function gotoPageTo(page: number) {
  pageInput.value = String(Math.min(Math.max(1, page), pageCount.value));
  gotoPage();
}

/* ============================================================
   缩放
============================================================ */

const zoomValue = computed(() =>
  zoom.mode.value === "fit" ? "fit" : String(zoom.scale.value)
);

function onZoomChange(value: string | number) {
  const v = String(value);
  zoom.setZoom(v === "fit" ? "fit" : Number(v));
}

/* ============================================================
   取数
============================================================ */

const statusText = computed(() => {
  if (preview.status === "loading") return "正在取数…";
  if (!dataSetCount.value) return "没有绑定数据集";
  const parts = [`${dataSetCount.value} 个数据集`];
  if (preview.tookMs != null) parts.push(`取数 ${preview.tookMs}ms`);
  if (preview.hasErrors) parts.push(`${preview.errorCount} 个失败`);
  return parts.join(" · ");
});

function refresh() {
  preview.refresh();
}

onMounted(() => {
  preview.reset();
  preview.loadAll();
});

/* ============================================================
   警告条
============================================================ */

/** 元素名：元素没有 name 字段，用"类型 + 序号"代替（稳定、不歧义） */
const TYPE_LABEL: Record<string, string> = { text: "文本", table: "表格", line: "线条", image: "图片" };

function elementLabel(id: string): string {
  const index = design.elements.findIndex((el) => el.id === id);
  if (index < 0) return "（已删除的元素）";
  const el = design.elements[index];
  return `${TYPE_LABEL[el.type] ?? el.type} #${index + 1}`;
}

function dataSetLabel(id: string): string {
  const ds = binding.dataSetById(id);
  return ds?.label || ds?.name || "已删除的数据集";
}

interface WarningGroup {
  title: string;
  lines: string[];
}

/**
 * 把一长串 `LayoutWarning` 归成几组人话。
 *
 * 归组而不是逐条列：`hidden` 有 8 个元素时列 8 行纯噪音，
 * 而用户要做的事只有"知道它们被隐藏了"这一件。
 * `unresolved` 反过来，必须逐条列 —— 每一条对应模板上一处**要改的地方**。
 */
const warningGroups = computed<WarningGroup[]>(() => {
  const all: LayoutWarning[] = view.value.warnings;
  const groups: WarningGroup[] = [];

  const unresolved = all.filter((w) => w.kind === "unresolved");
  if (unresolved.length) {
    groups.push({
      title: `占位符没取到值（${unresolved.length} 处，预览里是空白）`,
      lines: unresolved.map(
        (w) => `${elementLabel(w.elementId)} ${w.token} —— ${(w as { why: string }).why}`
      )
    });
  }

  const hidden = all.filter((w) => w.kind === "hidden");
  if (hidden.length) {
    groups.push({
      title: `已隐藏 ${hidden.length} 个元素（「是否打印」关闭）`,
      lines: hidden.map((w) => elementLabel(w.elementId))
    });
  }

  const clipped = all.filter((w) => w.kind === "clipped" || w.kind === "too-tall");
  if (clipped.length) {
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const w of clipped) {
      if (seen.has(w.elementId)) continue;
      seen.add(w.elementId);
      const reason = (w as { reason?: string }).reason;
      lines.push(
        reason
          ? `${elementLabel(w.elementId)}：${reason}`
          : `${elementLabel(w.elementId)}：高 ${(w as { height: number }).height}mm，超过整页内容区，已按页裁切`
      );
    }
    groups.push({ title: `被裁切（${lines.length} 处）`, lines });
  }

  const outside = all.filter((w) => w.kind === "outside-paper");
  if (outside.length) {
    groups.push({
      title: `完全在纸张之外 ${outside.length} 个`,
      lines: outside.map((w) => elementLabel(w.elementId))
    });
  }

  const rowExpanded = all.filter((w) => w.kind === "row-expanded");
  if (rowExpanded.length) {
    groups.push({
      title: `行高自适应：${rowExpanded.length} 处被内容撑高（预览里下方元素会被推下）`,
      lines: rowExpanded.map(
        (w) =>
          `${elementLabel(w.elementId)} 第 ${(w as { row: number }).row + 1} 行：` +
          `声明 ${(w as { declared: number }).declared.toFixed(1)}mm → ` +
          `实际 ${(w as { actual: number }).actual.toFixed(1)}mm`
      )
    });
  }

  const overflow = all.find((w) => w.kind === "page-overflow");
  if (overflow) {
    groups.push({
      title: "分页被截断",
      lines: [`页数超过上限（${(overflow as { pageCount: number }).pageCount} 页），后面的内容没有渲染`]
    });
  }

  return groups;
});

const warningSummary = computed(() => {
  const parts: string[] = [];
  if (preview.hasErrors) parts.push(`${preview.errorCount} 个数据集取数失败`);
  const count = warningGroups.value.reduce((sum, g) => sum + g.lines.length, 0);
  if (count) parts.push(`${count} 条版式提示`);
  if (!parts.length) parts.push("没有问题");
  return parts.join(" · ");
});

/* ============================================================
   返回设计
============================================================ */

function backToDesign() {
  const id = route.params.id;
  router.push({ name: "Design", params: { id: typeof id === "string" ? id : "draft" } });
}
</script>
