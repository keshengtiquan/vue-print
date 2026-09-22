<template>
  <div
    class="h-full w-full"
    :style="containerStyle"
    @dragover="onFieldDragOver"
    @drop="onFieldDrop"
  >
    <!--
      内联编辑用 textarea 而不是 contenteditable，三条理由（按重要性）：
      1. 中文输入法。contenteditable 必须自己写 composition 锁，漏一处就是"拼音打一半被提交"；
         textarea 的 IME 是浏览器原生行为，零代码。
      2. 纯字符串。textarea 粘贴天然是纯文本，不需要清洗 <br>/&nbsp;。
      3. 不跟 Vue 抢 DOM 所有权 —— 走 :value + @input，不会出现响应式和 DOM 互相覆盖。

      :value 绑 draft（组件内 ref）而不是 element.content：draft 恒等于 DOM 里的值，
      于是每次重渲染 Vue 比较后都跳过 patch，合成期间绝不会有外部写入打断输入。

      @pointerdown.stop 是必须的：否则在文字里拖选会冒泡到 ElementWrapper 的 onPointerDown，
      变成拖整个元素。

      select-text 也是必须的：ElementWrapper 根节点上的 select-none 会继承下来，
      不覆盖掉的话鼠标在 textarea 里根本选不中文字。
    -->
    <textarea
      v-if="isEditing"
      ref="editorRef"
      rows="1"
      spellcheck="false"
      class="block resize-none overflow-hidden border-0 bg-transparent p-0 outline-none select-text"
      :style="editorStyle"
      :value="draft"
      @input="onInput"
      @blur="onBlur"
      @keydown.esc="onEscape"
      @pointerdown.stop
      @dblclick.stop
    ></textarea>
    <div v-else :style="textStyle">{{ displayContent }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { CSSProperties } from "vue";
import { useDesignStore } from "@/store/modules/design";
import { mmToPx } from "@/lib/utils";
import { FIELD_MIME, getDraggingField } from "@/components/design/data/model";
import { textContainerStyle, textContentStyle } from "@/components/design/render/style";
import type { TextElement } from "@/components/design/types";
import { useDataBinding } from "@/components/design/data/useDataBinding";

const designState = useDesignStore();
const ops = useDataBinding();

const props = defineProps<{ element: TextElement }>();

/**
 * 渲染态的内容：**原样显示，一个字符都不替换**。
 *
 * 设计态画布是**排版视图**，不是数据预览 —— 上面写 `{品名}`，画布上就显示 `{品名}`。
 * 这是已经定死的口径，不是简化实现：
 * - 表格文档 §1.5 约束 2："`content.value` 允许含 `{品名}` 这类占位符，**设计态原样显示**"
 * - 本文档 §6.7："设计态始终显示写进去的静态文本（占位符原样保留）"
 *
 * 两条理由：
 * 1. **排版是设计态唯一要回答的问题**。字宽、换行、对齐都不该随取到什么值而抖
 *    —— 否则"照着一份数据调好的版，换份数据就错位"。
 * 2. **有占位符本身就是要看的信息**。它写着"这里引用的是哪个字段"，
 *    而这是设计态真正需要知道的；字段值属于渲染态要回答的问题。
 *
 * `renderTemplate` 因此**不在画布上被调用** —— 它只服务将来的预览 / 导出 / 打印态。
 * 保留这个 computed（而不是在模板里直接写 `{{ element.content }}`）是为了让
 * "这里将来要接渲染"有一个明确的落点：接线时只用改这一处。
 */
const displayContent = computed(() => props.element.content ?? "");

/* ============================================================
   字段拖入：把左侧字段树的字段拖到元素上
============================================================ */

/**
 * 拖拽落点的判定放在**元素自己**身上，而不是画布层做命中检测：
 * drop 事件本来就会冒泡，元素先处理并 `stopPropagation`，画布根本收不到；
 * 让画布去 `elementFromPoint` 反查"落到了哪个元素"，等于把同一件事做两遍。
 *
 * 只在自己关心的 MIME 上 preventDefault —— 无条件 prevent 会抢走素材拖拽的落点，
 * 于是"把图片素材拖到文本上"会变成"往文本里插占位符"。
 */
function onFieldDragOver(e: DragEvent) {
  // 双通道门卫：模块变量有载荷就直接放行（dataTransfer 的 types 可能被扩展清空，
  // 见 model.ts draggingField）；外部拖入的文本两者皆无，照旧不接。
  if (!getDraggingField() && !e.dataTransfer?.types.includes(FIELD_MIME)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
}

function onFieldDrop(e: DragEvent) {
  // 主通道优先，dataTransfer 兜底（跨窗口拖入字段时模块变量为空）
  const dragging = getDraggingField();
  const raw = dragging ? JSON.stringify(dragging) : e.dataTransfer?.getData(FIELD_MIME);
  if (!raw) return;
  e.preventDefault();
  e.stopPropagation();
  try {
    const { field, dataSetId } = JSON.parse(raw) as { field?: string; dataSetId?: string };
    // dataSetId 是"这个字段属于哪个数据集"。带上它，拖一下就自动绑好，
    // 不需要用户再去右侧面板选一次数据集（也就没有"没绑定的元素"这回事）。
    if (field) ops.appendFieldToElement(props.element.id, field, dataSetId);
  } catch {
    // 载荷不是我们的格式，静默忽略 —— 拖进来的可能是任意文本
  }
}

const pxPerMm = computed(() => mmToPx(1) * designState.scale);

/*
  样式计算全部走 `render/style.ts` 的共享纯函数，不再在这里就地写。

  这不是为了少几行代码，而是预览功能的**结构性要求**（`docs/preview-design.md` §5.2）：
  预览渲染组件要画的是同一个元素、同一组字号间距，只有缩放因子不同。
  两边各写一份的话，"设计态调完字号、预览里忘了再调一遍"是必然发生的，
  而它的表现就是"预览里看着对、打出来错位"—— 所有设计器项目最经典的那类 bug。
  `pxPerMm` 是这里的**唯一**输入差异（设计态带 design.scale）。
*/
const containerStyle = computed(() => textContainerStyle(props.element, pxPerMm.value));
const textStyle = computed(() => textContentStyle(props.element, pxPerMm.value));

const isEditing = computed(() => designState.editingId === props.element.id);

/** 编辑期 textarea 的文本值。见模板注释：它恒等于 DOM 里的值，是"不被外部写入打断"的关键 */
const draft = ref("");
const editorRef = ref<HTMLTextAreaElement | null>(null);

/**
 * 横排编辑态的高度 —— 撑成内容高度，才能让外层 flex 的 justifyContent
 * 把文字摆到和渲染态完全相同的位置（否则 textarea 内容恒从顶部排，middle/bottom 会跳）。
 * 竖排不做 autosize（vertical-rl 下 scrollHeight 语义翻转，铺满即可），置 null。
 */
const editorHeight = ref<number | null>(null);

/** 编辑期与渲染期的样式差异全部集中在这里 */
const editorStyle = computed<CSSProperties>(() => ({
  ...textStyle.value,
  /*
    竖排时 textStyle.width 是 undefined（让父级 alignItems 去定位），textarea 不能这样：
    它的内在宽度来自 cols（默认 20 字宽），会撑得比元素框还宽。
    所以编辑态一律把框给足 —— 代价是竖排文字的左右对齐在编辑期不精确，见交付说明。
  */
  width: "100%",
  height:
    props.element.layout === "vertical"
      ? "100%"
      : editorHeight.value == null
        ? undefined
        : `${editorHeight.value}px`
}));

function measureEditorHeight() {
  if (props.element.layout === "vertical") {
    editorHeight.value = null;
    return;
  }
  const el = editorRef.value;
  if (!el) return;
  // 先临时塌成 auto 再量，否则当前（可能过大的）高度会把 scrollHeight 顶住，框只涨不缩。
  // 量完必须还原成**原值**而不是置空：万一这次量出的高度和上一次相同，
  // editorHeight 没变化 → Vue 不会重新落样式，置空就会把框永久塌成一行。
  const prev = el.style.height;
  el.style.height = "auto";
  const next = el.scrollHeight;
  el.style.height = prev;
  editorHeight.value = next;
}

function onInput() {
  const el = editorRef.value;
  if (!el) return;
  draft.value = el.value;
  designState.updateElement(props.element.id, { content: el.value });
  measureEditorHeight();
}

/**
 * 失焦即退出编辑。但必须**先确认自己还是当前编辑者**：
 * 元素被移除时浏览器会补一次 blur，若此时用户已经切到别的元素开始编辑（editingId 是新 id），
 * 这次迟到的 blur 会把新的编辑会话一起掐掉。
 */
function onBlur() {
  if (isEditing.value) designState.stopEditing();
}

/** Esc = 提交并退出，不回滚（本项目没有撤销栈，回滚等于静默丢用户输入）。 */
function onEscape(e: KeyboardEvent) {
  // 输入法组字期间先按下 Esc 是"取消候选字"，那一刻它属于输入法，不该顺手把编辑器也关掉。
  if (e.isComposing) return;
  e.stopPropagation();
  e.preventDefault();
  designState.stopEditing();
}

watch(isEditing, (editing) => {
  if (!editing) return;
  // 以 store 当前值为起点。面板的"内容"字段与这里是同一个 path，
  // 但两者不会同时活跃 —— 点面板输入框会让画布 textarea 先失焦、编辑态先结束。
  draft.value = props.element.content ?? "";
  nextTick(() => {
    const el = editorRef.value;
    if (!el) return;
    el.focus();
    // 光标落末尾而不是全选：全选状态下下一笔输入会把内容整块替换掉，误删代价太大。
    const end = el.value.length;
    el.setSelectionRange(end, end);
    measureEditorHeight();
  });
});

// 缩放会让 fontSize 的 px 值变，字号一变内容高度就变 —— 编辑中缩放也要重新量。
watch(pxPerMm, () => {
  if (isEditing.value) nextTick(measureEditorHeight);
});
</script>
