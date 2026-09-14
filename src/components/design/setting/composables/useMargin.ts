import { computed, ref, watch } from "vue";
import { useDesignStore } from "@/store/modules/design";

/**
 * useMargin — 页边距状态机。
 * - uniformLocked：四向相同开关
 * - marginAdvanced：是否展开"单独设置上下左右"区域
 * - marginX / marginY：横向/纵向的代表值（X = (left+right)/2，Y = (top+bottom)/2）
 * - onXYInput / onDirectionInput / resetMargins：输入入口
 *
 * 设计要点：
 * - 锁定态 ON → 关闭会自动收起 advanced 区域，避免"锁定但还显示四个灰 input"。
 * - clampMargin 钳到 [0, 100]，非法输入（NaN、负数）忽略，不弹错误。
 */
export function useMargin() {
  const store = useDesignStore();

  const uniformLocked = ref(
    store.marginMm.top === store.marginMm.bottom &&
      store.marginMm.bottom === store.marginMm.left &&
      store.marginMm.left === store.marginMm.right
  );

  const marginAdvanced = ref(false);

  watch(uniformLocked, (on) => {
    if (on) marginAdvanced.value = false;
  });

  const marginX = computed(() => {
    if (uniformLocked.value) return store.marginMm.left;
    return +((store.marginMm.left + store.marginMm.right) / 2).toFixed(1);
  });
  const marginY = computed(() => {
    if (uniformLocked.value) return store.marginMm.top;
    return +((store.marginMm.top + store.marginMm.bottom) / 2).toFixed(1);
  });

  function clampMargin(raw: string): number | null {
    const v = Number(raw);
    if (Number.isNaN(v) || v < 0) return null;
    return Math.min(v, 100);
  }

  function onXYInput(axis: "x" | "y", raw: string) {
    const v = clampMargin(raw);
    if (v === null) return;
    if (uniformLocked.value) {
      store.marginMm = { top: v, right: v, bottom: v, left: v };
    } else if (axis === "x") {
      store.marginMm.left = v;
      store.marginMm.right = v;
    } else {
      store.marginMm.top = v;
      store.marginMm.bottom = v;
    }
  }

  function onDirectionInput(
    dir: "top" | "right" | "bottom" | "left",
    raw: string
  ) {
    if (uniformLocked.value) return;
    const v = clampMargin(raw);
    if (v === null) return;
    store.marginMm[dir] = v;
  }

  function resetMargins() {
    store.marginMm = { top: 10, right: 10, bottom: 10, left: 10 };
    uniformLocked.value = true;
    marginAdvanced.value = false;
  }

  return {
    store,
    uniformLocked,
    marginAdvanced,
    marginX,
    marginY,
    onXYInput,
    onDirectionInput,
    resetMargins
  };
}