import { computed } from "vue";
import { useDesignStore } from "@/store/modules/design";

/**
 * 预置纸张规格（mm，统一按 portrait 记录；landscape 时通过 resolvePresetSize 解析）
 * 行业标准本来就只定义 portrait，横向只是旋转应用。
 */
export const PRESETS = [
  { id: "A3", label: "A3", widthMm: 297, heightMm: 420 },
  { id: "A4", label: "A4", widthMm: 210, heightMm: 297 },
  { id: "A5", label: "A5", widthMm: 148, heightMm: 210 },
  { id: "Letter", label: "Letter", widthMm: 215.9, heightMm: 279.4 }
] as const;

export type Preset = (typeof PRESETS)[number];

/** 横向 / 纵向，由 w vs h 推断（单一数据源） */
export type Orientation = "portrait" | "landscape";

/**
 * usePaper — 纸张规格的状态与操作。
 * - orientation 由 paper.widthMm vs heightMm 推断，无独立字段。
 * - square (w===h) 强制 portrait，setOrientation('landscape') 在 square 时 noop。
 * - applyPreset / currentPresetId 都走 resolvePresetSize，保证横向/纵向语义自洽。
 */
export function usePaper() {
  const store = useDesignStore();

  const orientation = computed<Orientation>(() =>
    store.paper.widthMm >= store.paper.heightMm ? "landscape" : "portrait"
  );

  function resolvePresetSize(p: Preset): { widthMm: number; heightMm: number } {
    return orientation.value === "landscape"
      ? { widthMm: p.heightMm, heightMm: p.widthMm }
      : { widthMm: p.widthMm, heightMm: p.heightMm };
  }

  /**
   * 当前匹配的预设对象；无匹配（自定义尺寸）时为 undefined。
   * 匹配时按当前 orientation 解析 preset 尺寸，因此横向 A4（297×210）也能正确命中。
   */
  const currentPreset = computed<Preset | undefined>(() =>
    PRESETS.find((p) => {
      const { widthMm, heightMm } = resolvePresetSize(p);
      return widthMm === store.paper.widthMm && heightMm === store.paper.heightMm;
    })
  );

  /** 当前预设 id；自定义尺寸时为 undefined。复用 currentPreset，避免重复 find。 */
  const currentPresetId = computed(() => currentPreset.value?.id);

  function applyPreset(p: Preset) {
    const { widthMm, heightMm } = resolvePresetSize(p);
    store.paper.widthMm = widthMm;
    store.paper.heightMm = heightMm;
  }

  function setOrientation(target: Orientation) {
    if (orientation.value === target) return;
    const { widthMm: w, heightMm: h } = store.paper;
    if (w === h) return; // square：保持正方形，不切换方向
    store.paper.widthMm = h;
    store.paper.heightMm = w;
  }

  return {
    store,
    orientation,
    currentPreset,
    currentPresetId,
    applyPreset,
    setOrientation
  };
}
