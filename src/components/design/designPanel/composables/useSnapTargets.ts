import { useDesignStore } from "@/store/modules/design";
import { guideKey, marginKey, type SnapKey } from "./useSnapFeedback";

/**
 * 吸附的公共基础设施。
 *
 * 从 ElementWrapper 里抽出来的原因很实际：**表格拖行高列宽也要吸同一批参考线**。
 * 如果表格另起一套，同样是"拖到页边距线"会有两种手感（容差不同、高亮不同），
 * 而这类"看起来一样、行为不一样"的差异最容易被用户记成"这个软件不靠谱"。
 *
 * 消费者：ElementWrapper（移动 / 缩放 / 线条端点）、TableElement（行高列宽分隔线）。
 */

/** 磁吸范围（屏幕 px）。比较前除以 pxPerMm 换算成 mm，保证不同缩放下手感一致 */
export const MARGIN_SNAP_PX = 6;

/** 一条可吸附的目标线：key 用于命中高亮，at 是它在纸张坐标系里的位置（mm） */
export interface SnapTarget {
  key: SnapKey;
  at: number;
}

/**
 * 收集某个轴上的全部吸附目标：两条页边距线 + 该轴上的所有辅助线。
 *
 * 辅助线只在 `showGuides` 打开时才参与 —— 开关关掉就是不显示也不吸附，
 * 否则会出现"看不见的东西在拽我"。
 * 顺带过滤掉纸张外的线：它们多半是纸张尺寸改过之前的残留，拿来吸附只会让人困惑。
 */
export function snapTargets(dir: "v" | "h"): SnapTarget[] {
  const designState = useDesignStore();
  const m = designState.marginMm;
  const paper = designState.paper;
  const sizeMm = dir === "v" ? paper.widthMm : paper.heightMm;
  const edges: SnapTarget[] =
    dir === "v"
      ? [
          { key: marginKey("left"), at: m.left },
          { key: marginKey("right"), at: paper.widthMm - m.right }
        ]
      : [
          { key: marginKey("top"), at: m.top },
          { key: marginKey("bottom"), at: paper.heightMm - m.bottom }
        ];
  if (!designState.showGuides) return edges;
  for (const g of designState.guides) {
    if (g.dir !== dir || g.pos < 0 || g.pos > sizeMm) continue;
    edges.push({ key: guideKey(g.id), at: g.pos });
  }
  return edges;
}

/**
 * 移动吸附：让元素边缘对齐到参考线。元素每条边（起边 / 终边）都会去够每条线，
 * 取**距离最近**的一组生效 —— 元素宽于内容区时两条边可能同时在范围内，
 * 此时吸最近的，不会左右拉扯。
 *
 * @param pos 元素在该轴的起点（未吸附）
 * @param size 元素在该轴的尺寸
 * @returns 吸附后的起点，以及命中的目标线 key（未命中为 null）
 */
export function snapAxis(pos: number, size: number, lines: SnapTarget[], tol: number) {
  let bestValue = pos;
  let bestKey: SnapKey | null = null;
  let bestDist = Infinity;
  for (const line of lines) {
    for (const edge of [pos, pos + size]) {
      const delta = line.at - edge;
      const dist = Math.abs(delta);
      if (dist <= tol && dist < bestDist) {
        bestValue = pos + delta;
        bestKey = line.key;
        bestDist = dist;
      }
    }
  }
  return { value: bestValue, hit: bestKey };
}

/**
 * 缩放吸附：把**单个坐标**吸到最近的一条参考线上。
 *
 * 与 snapAxis 的分工必须分清 —— 两者都是"吸到线上"，但动的东西完全不同：
 * - snapAxis（移动用）：两条边都去够线，取最近的一组，**整个框平移**；
 * - snapEdge（缩放 / 端点 / 分隔线用）：只动**这一个坐标**，其余锁死。
 *
 * 语义不同的东西不该共用一个名字，所以是独立的函数而不是给 snapAxis 加开关。
 */
export function snapEdge(at: number, lines: SnapTarget[], tol: number) {
  let best = at;
  let hit: SnapKey | null = null;
  let bestDist = Infinity;
  for (const line of lines) {
    const dist = Math.abs(line.at - at);
    if (dist <= tol && dist < bestDist) {
      best = line.at;
      hit = line.key;
      bestDist = dist;
    }
  }
  return { value: best, hit };
}

/** 屏幕 px → mm 的吸附容差 */
export function snapTolerance(pxPerMm: number): number {
  return MARGIN_SNAP_PX / pxPerMm;
}
