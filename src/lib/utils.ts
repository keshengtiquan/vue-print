import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pxToMm(px: number): number {
  return px * (25.4 / 96);
}

/** mm 转 px（基于 96dpi 屏幕） */
export function mmToPx(mm: number): number {
  return mm * (96 / 25.4);
}
