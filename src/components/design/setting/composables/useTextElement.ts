import { computed, ref, watch } from "vue";
import { useDesignStore } from "@/store/modules/design";
import type { TextElement } from "@/components/design/types";
import { mmToPt, ptToMm, roundPt } from "@/lib/utils";

/**
 * useTextElement — 选中文本元素的属性读写。
 *
 * 单位约定（重要）：
 * - store 里 fontSize 一律 **mm**（与 width/height/x/y 一致，打印时物理尺寸无损）。
 * - UI 上暴露的 fontSizePt 一律 **pt**，对齐 Excel / Word 的用户心智。
 * 换算只发生在这里，组件与 store 都不感知对方单位。
 */

/** 默认字号（mm）。必须与 materials.ts 里 mat-text 的 defaults.fontSize 保持一致 */
export const DEFAULT_FONT_SIZE_MM = 4;

/** pt 输入的下限/上限。上限取 200pt ≈ 70mm，超过就没法在同一张标签上谈排版了 */
export const FONT_SIZE_MIN_PT = 1;
export const FONT_SIZE_MAX_PT = 200;

/** 输入步进，与 Word 的半磅习惯一致（10.5 / 12 / 14 …） */
export const FONT_SIZE_STEP_PT = 0.5;

/**
 * 快捷字号（pt）。取值来自 Word 中文号数表，
 * 让用户能用"文档排版"的经验而不是"毫米折算"来挑大小。
 */
export const FONT_SIZE_PRESETS: { pt: number; cn: string }[] = [
  { pt: 8, cn: "八号" },
  { pt: 9, cn: "小五" },
  { pt: 10.5, cn: "五号" },
  { pt: 12, cn: "小四" },
  { pt: 14, cn: "四号" },
  { pt: 16, cn: "三号" },
  { pt: 18, cn: "小二" },
  { pt: 24, cn: "小一" }
];

/**
 * 汉字墨迹高度与 font-size 的经验比。
 * font-size 设定的是 em box（字面框），汉字几乎填满它但不完全 —— 约 0.95。
 * 拉丁大写只有约 0.70，差三成，这是"字号调到一样大但看着不一样"的根因。
 */
export const HANZI_INK_RATIO = 0.95;

export function useTextElement() {
  const store = useDesignStore();

  /** 当前选中元素（未选中为 null） */
  const selected = computed(() =>
    store.selectedId ? (store.getElement(store.selectedId) ?? null) : null
  );

  /** 选中的是文本元素时才非 null */
  const text = computed<TextElement | null>(() =>
    selected.value && selected.value.type === "text" ? (selected.value as TextElement) : null
  );

  /** 内部 mm —— UI 读写的基准，缺省时回落到 DEFAULT_FONT_SIZE_MM */
  const fontSizeMm = computed(() => text.value?.fontSize ?? DEFAULT_FONT_SIZE_MM);

  /** mm → pt，取整到 0.1（显示用）。存储层保持完整浮点，不被这里污染 */
  const fontSizePt = computed(() => roundPt(mmToPt(fontSizeMm.value)));

  /** 汉字实际墨迹高度（mm）——让用户看到"字号 ≠ 字高" */
  const hanziMm = computed(() => +(fontSizeMm.value * HANZI_INK_RATIO).toFixed(2));

  /**
   * 输入框草稿：用字符串承接原始输入。
   * 直接用 number computed 绑 :value 会把 "12." 这类中间态当场抹成 "12"，
   * 光标跳到末尾，小数点再也输不进去。
   */
  const draft = ref(String(fontSizePt.value));

  // 外部值变化（切换选中元素、撤销等）时同步草稿。
  // 只有数值真的变了才覆盖，否则会把用户正在敲的内容清掉。
  watch(fontSizePt, (v) => {
    if (Number(draft.value) !== v) draft.value = String(v);
  });

  /** pt → mm → store。静默钳制到合法区间，非法输入直接忽略，不弹错 */
  function setPt(pt: number) {
    if (!text.value) return;
    if (Number.isNaN(pt)) return;
    const clamped = Math.min(Math.max(pt, FONT_SIZE_MIN_PT), FONT_SIZE_MAX_PT);
    store.updateElement(text.value.id, { fontSize: ptToMm(clamped) });
  }

  /** 每次按键都落库，画布即刻响应 */
  function onInput(raw: string) {
    draft.value = raw;
    const trimmed = raw.trim();
    if (trimmed === "") return; // 允许暂时清空以重输，但不写库
    const pt = Number(trimmed);
    if (Number.isNaN(pt)) return;
    setPt(pt);
  }

  /** 失焦时把草稿规范化：非法值 / 超界值回落到当前真实 pt */
  function onBlur() {
    draft.value = String(fontSizePt.value);
  }

  /** 步进调整 */
  function step(delta: number) {
    const next = roundPt(fontSizePt.value + delta);
    setPt(next);
    draft.value = String(fontSizePt.value);
  }

  return {
    text,
    selected,
    fontSizePt,
    fontSizeMm,
    hanziMm,
    draft,
    onInput,
    onBlur,
    step,
    setPt
  };
}
