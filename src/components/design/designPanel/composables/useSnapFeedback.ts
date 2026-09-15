import { ref } from "vue";

/**
 * 吸附命中项的 key：`${kind}:${id}`
 * - `margin:top|bottom|left|right` —— 页边距线
 * - `guide:<id>`                  —— 用户辅助线
 *
 * 带命名空间是必要的：两类线的 id 空间会撞（将来辅助线若支持命名就是活例子），
 * 而且渲染层要能只认自己那一段 —— MarginGuides 只查 `margin:*`，GuideLines 只查 `guide:*`。
 * 用扁平字符串而不是 { kind, id } 对象，是因为查找只需 includes，不值得为它引入结构。
 */
export type SnapKey = string;

export const marginKey = (id: "top" | "bottom" | "left" | "right") => `margin:${id}`;
export const guideKey = (id: string) => `guide:${id}`;

/**
 * 模块级共享状态：当前拖拽命中的吸附线。
 *
 * 为什么放模块级而不是 Pinia：
 * - 这是高频瞬时视图状态（每次 pointermove 都可能变），不属于文档数据；
 * - 消费方只有两个光纤组件（MarginGuides / GuideLines），没必要惊动整个 store 的响应式图；
 * - 同一时刻只可能有一个手势在进行，共享单例不会冲突。
 */
const active = ref<SnapKey[]>([]);

export function useSnapFeedback() {
  /**
   * 更新命中线。内容相同则**不写入** —— pointermove 每秒几十次，
   * 若每次都赋新数组，两个辅助线组件会被无谓重渲染几十次。
   */
  function setSnapKeys(keys: SnapKey[]) {
    const cur = active.value;
    if (cur.length === keys.length && keys.every((k, i) => k === cur[i])) return;
    active.value = keys;
  }

  function clearSnapKeys() {
    setSnapKeys([]);
  }

  return { activeSnapKeys: active, setSnapKeys, clearSnapKeys };
}
