<template>
  <div class="preview-page relative overflow-hidden bg-white" :style="pageStyle">
    <!--
      页内元素：绝对定位，坐标是"页内绝对 mm"。

      ⚠️ 这里的元素框**不加 `overflow: hidden`**，是刻意的。
      设计态的 ElementWrapper 也没有它 —— 文本写得比框长时，两边都是"溢出但可见"。
      加上去会让预览里多出一圈裁切，而设计态看不见，于是"设计态排好的版，
      预览里看着不对"。第 1 页与设计态逐像素一致（§3.1）是这条链路的立身之本，
      宁可不裁切，也不要让两边不一致。
      真正会裁切的只有纸张本身（上面那个 `overflow-hidden`）。
    -->
    <div
      v-for="item in page.items"
      :key="itemKey(item)"
      class="absolute"
      :style="itemStyle(item)"
    >
      <PreviewLine v-if="item.element.type === 'line'" :element="item.element" :px-per-mm="pxPerMm" />
      <PreviewImage
        v-else-if="item.element.type === 'image'"
        :element="item.element"
        :ctx="item.ctx"
        :px-per-mm="pxPerMm"
      />
      <PreviewTable
        v-else-if="item.element.type === 'table'"
        :element="item.element"
        :rows="item.tableRows ?? []"
        :px-per-mm="pxPerMm"
      />
      <PreviewText v-else :element="item.element" :ctx="item.ctx" :px-per-mm="pxPerMm" />
    </div>

    <!--
      页脚页码：贴纸张物理底边（约 5mm）居中一行，不随下边距移动，
      只有下边距小到装不下页码时才往边距条带里收（见 footerStyle）。

      - 开关与模板来自 `design.pageNumber`（文档数据，页面设置面板「页码」分组）；
      - 文本用 `renderTemplate` + 只含系统变量的 ctx 渲染，`{$pageIndex}` /
        `{$pageCount}` 逐页替换成 1、2、3…（与页内元素的占位符同一套引擎）；
      - 不是"素材元素"，所以不参与分页、不进 items、打印时随纸张一起出。
    -->
    <div
      v-if="pageNumberText"
      class="pointer-events-none absolute inset-x-0 flex"
      :class="footerJustifyClass"
      :style="footerStyle"
    >
      <span :style="footerTextStyle">{{ pageNumberText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 单页渲染：一张纸（白底 + 阴影）+ 页内所有元素。
 *
 * 它只做两件事：把"页内绝对 mm"换算成 px，以及按类型派发到纯渲染组件。
 * 没有任何"数据"逻辑 —— 上下文、表格分片、页码都由 `usePreviewLayout` 提前算好了。
 */
import { computed } from "vue";
import type { CSSProperties } from "vue";
import PreviewText from "./render/PreviewText.vue";
import PreviewImage from "./render/PreviewImage.vue";
import PreviewLine from "./render/PreviewLine.vue";
import PreviewTable from "./render/PreviewTable.vue";
import { renderTemplate } from "@/lib/template";
import { buildEmptyContext } from "@/components/design/data/context";
import { useDesignStore } from "@/store/modules/design";
import type { PreviewItemView, PreviewPageView } from "./types";

const props = defineProps<{
  page: PreviewPageView;
  /** 纸张宽（mm） */
  paperWidthMm: number;
  /** 纸张高（mm） */
  paperHeightMm: number;
  /** 总页数（页脚 `{$pageCount}` 用） */
  pageCount: number;
  /** 1mm 对应多少屏幕 px（已含预览缩放） */
  pxPerMm: number;
}>();

const design = useDesignStore();

const pageStyle = computed<CSSProperties>(() => ({
  width: `${props.paperWidthMm * props.pxPerMm}px`,
  height: `${props.paperHeightMm * props.pxPerMm}px`
}));

/**
 * 页脚页码文本。
 *
 * 只在 `pageNumber.enabled` 时产出。渲染用的 ctx 是"只有系统变量"的空上下文
 * （`buildEmptyContext`），`{$pageIndex}` / `{$pageCount}` 从 `page.index` / `pageCount`
 * 现算注入 —— 与 `usePreviewLayout` 给页内元素注入的 sys 同源。
 * `onMissing: "blank"`：模板里写了取不到的系统变量，宁可空白也不显示花括号原文。
 */
const pageNumberText = computed(() => {
  if (!design.pageNumber.enabled) return "";
  const sys = {
    pageIndex: props.page.index + 1,
    pageCount: props.pageCount
  };
  return renderTemplate(design.pageNumber.template, buildEmptyContext(sys, "blank"));
});

/**
 * 页脚横向对齐。
 *
 * 奇偶页分侧（`oddEven`）优先于 `align`：奇数页靠右、偶数页靠左（书刊式，
 * 双面装订后页码贴装订线外侧）。未开分侧时用 `align`（左 / 中 / 右）。
 * 这里只负责"靠哪边"，水平留白由 footerStyle 的左右 padding 决定。
 */
const footerJustifyClass = computed(() => {
  const oddEven = design.pageNumber.oddEven;
  if (oddEven) {
    const isOdd = (props.page.index + 1) % 2 === 1;
    return isOdd ? "justify-end" : "justify-start";
  }
  const align = design.pageNumber.align;
  if (align === "left") return "justify-start";
  if (align === "right") return "justify-end";
  return "justify-center";
});

/**
 * 页脚条定位：**贴纸张物理底边**（理想偏移 5mm），不随下边距走。
 *
 * 之前写成 `bottom = 下边距`，页码底边贴着正文区底边、文字向上长进正文区 ——
 * 下边距一调大，页码跟着上移压住表格最后一行（2026-09-22 老板截图指出）。
 *
 * 现在的几何约束：页码顶边 = bottom + 行高，必须 ≤ 下边距（不进正文区）。
 * 所以理想值 5mm 优先，只有下边距小到"贴底就会顶进正文"时才往条带里收；
 * 再小到连一行字都装不下（< 5.2mm）就贴死纸底 —— 那是边距本身设太小。
 */
const FOOTER_BASELINE_MM = 5;
/** 页码行占高：3mm 字号 × 1.4 行高 */
const FOOTER_HEIGHT_MM = 4.2;

const footerStyle = computed<CSSProperties>(() => {
  const bottom = Math.max(
    0,
    Math.min(FOOTER_BASELINE_MM, design.marginMm.bottom - FOOTER_HEIGHT_MM - 1)
  );
  // 左右留出页边距量，靠左/靠右时页码不贴纸边
  const side = design.marginMm.left * props.pxPerMm;
  return { bottom: `${bottom * props.pxPerMm}px`, paddingLeft: `${side}px`, paddingRight: `${side}px` };
});

/** 页脚文字样式：固定小字号（mm 口径，与正文 4mm / 单元格 3.7mm 一致），浅灰黑 */
const footerTextStyle = computed<CSSProperties>(() => ({
  fontSize: `${3 * props.pxPerMm}px`,
  lineHeight: 1.4,
  color: "#333"
}));

/**
 * 一个元素的落位 + 绘序。
 *
 * `zIndex` 在这儿落地：分页器已经按**流序**（y ↑）决定"谁先占到空间"，
 * 而这里按**绘序**（zIndex ↑）决定"谁盖住谁"—— 两个顺序刻意分开，
 * 见 `layout.ts` 的注释。盖住关系靠的就是这个 z-index（元素是 absolute 兄弟节点）。
 */
function itemStyle(item: PreviewItemView): CSSProperties {
  const p = props.pxPerMm;
  return {
    left: `${item.x * p}px`,
    top: `${item.y * p}px`,
    width: `${item.width * p}px`,
    height: `${item.height * p}px`,
    transform: item.element.rotation ? `rotate(${item.element.rotation}deg)` : undefined,
    transformOrigin: "center",
    zIndex: item.element.zIndex ?? 0
  };
}

/**
 * v-for 的 key。
 *
 * 用 `元素 id + 页内 y` 而不是只用 id：一张表被切开时，它的各片在**不同页**
 * （所以页内不冲突），但"每页重复的元素"与"同一元素出现在两个分片里"这两种情况
 * 会让同一个 id 在**同一页**出现两次。只用 id 会让 Vue 复用错误的 DOM 节点。
 */
function itemKey(item: PreviewItemView): string {
  return `${item.element.id}@${item.y}`;
}
</script>

<style scoped>
/*
  纸张阴影用 scoped CSS 而不是 Tailwind 工具类：它是"打印时**必须消失**"的装饰，
  而本轮明确不做打印（§9）。写成独立的 class 是为了让将来加 `@media print`
  有一个明确的落点，而不是在几个工具类之间找。
*/
.preview-page {
  box-shadow:
    0 1px 3px rgb(0 0 0 / 12%),
    0 8px 24px -12px rgb(0 0 0 / 18%);
}
</style>
