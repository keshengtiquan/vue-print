import { ref } from "vue";

/** 可被吸附的边距线标识 */
export type SnapLine = "top" | "bottom" | "left" | "right";

/**
 * 模块级共享状态：当前拖拽命中的边距线。
 *
 * 为什么放模块级而不是 Pinia：
 * - 这是高频瞬时视图状态（每次 pointermove 都可能变），不属于文档数据；
 * - 只有一个消费方 MarginGuides，没必要惊动整个 store 的响应式图；
 * - 同一时刻只可能有一个手势在进行，共享单例不会冲突。
 */
const active = ref<SnapLine[]>([]);

export function useSnapFeedback() {
  /**
   * 更新命中线。内容相同则**不写入** —— pointermove 每秒几十次，
   * 若每次都赋新数组，MarginGuides 会被无谓重渲染几十次。
   */
  function setSnapLines(lines: SnapLine[]) {
    const cur = active.value;
    if (cur.length === lines.length && lines.every((l, i) => l === cur[i])) return;
    active.value = lines;
  }

  function clearSnapLines() {
    setSnapLines([]);
  }

  return { activeSnapLines: active, setSnapLines, clearSnapLines };
}
