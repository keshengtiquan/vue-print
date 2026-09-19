import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 1px（CSS px，96dpi 基准）= 25.4/96 mm ≈ 0.264583 */
export const MM_PER_PX = 25.4 / 96;
/** 1mm = 96/25.4 px ≈ 3.779528 */
export const PX_PER_MM = 96 / 25.4;

export function pxToMm(px: number): number {
  return px * MM_PER_PX;
}

/** mm 转 px（基于 96dpi 屏幕） */
export function mmToPx(mm: number): number {
  return mm * PX_PER_MM;
}

/**
 * px 值显示用的取整。
 *
 * 与 `roundPt` 同理：UI 一律用"整数 / 半 px"表述，但**存储的 mm 不做任何 round**
 * （打印精度不能被显示层吃掉）。
 *
 * 不取整的代价是实打实的：mm↔px 来回一趟必然带小数（1px = 0.264583mm），
 * 于是默认的 1px 线会被显示成 **0.98**，看着像"默认值本身就是残缺的"。
 * 保留 1 位小数是为了还能表达 0.5px 这种发丝线。
 */
export function roundPx(px: number): number {
  return Math.round(px * 10) / 10;
}

/* ============================================================
   字号单位换算
   ------------------------------------------------------------
   全链路锚定在英寸上：1in = 25.4mm = 72pt = 96px(CSS)
   - pt（磅）是 Excel / Word / Photoshop / BarTender 的字号单位，
     用户的字数直觉来自这里，所以**字号 UI 一律用 pt**。
   - 元素内部一律存 mm（与其他几何字段一致，打印时物理尺寸无损）。
   换算只发生在「UI 读写」这一层，不污染存储。
============================================================ */

/** 1pt = 25.4/72 mm ≈ 0.352778 */
export const MM_PER_PT = 25.4 / 72;
/** 1mm = 72/25.4 pt ≈ 2.834646 */
export const PT_PER_MM = 72 / 25.4;

export function ptToMm(pt: number): number {
  return pt * MM_PER_PT;
}

export function mmToPt(mm: number): number {
  return mm * PT_PER_MM;
}

/** pt 转 CSS px（不含视图缩放，用于渲染字号） */
export function ptToPx(pt: number): number {
  return pt * (96 / 72);
}

/**
 * pt 值显示用的取整。
 * Excel/Word 存在 10.5 这类半磅字号，所以保留 1 位小数；
 * 但内部存储不做任何 round —— 打印精度不能被显示层吃掉。
 */
export function roundPt(pt: number): number {
  return Math.round(pt * 10) / 10;
}
