import { designState } from "./designState";
import type { Element } from "./types";

export function addElement(el: Element) {
  designState.elements.push(el);
}

export function removeElement(id: string) {
  const i = designState.elements.findIndex((e) => e.id === id);
  if (i !== -1) designState.elements.splice(i, 1);
  if (designState.selectedId === id) designState.selectedId = null;
}

export function selectElement(id: string | null) {
  designState.selectedId = id;
}

export function getElement(id: string): Element | undefined {
  return designState.elements.find((e) => e.id === id);
}

/** 更新元素字段（patch 可为任意字段，含类型专属字段如 start/end/content） */
export function updateElement(id: string, patch: Record<string, unknown>) {
  const el = getElement(id);
  if (!el) return;
  Object.assign(el, patch);
}
