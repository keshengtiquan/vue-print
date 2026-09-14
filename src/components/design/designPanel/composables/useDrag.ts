/**
 * 通用指针拖拽状态机
 *
 * 设计要点：
 * - move/up 事件挂在 window 上，不挂在被拖元素自身上（避免元素移动/缩放时
 *   事件目标不稳定、与响应式更新形成正反馈振荡导致主线程卡死）。
 * - 不使用 Pointer Capture：既然全局 window 已经能收到所有 pointermove，
 *   capture 是冗余的，省一层状态机、消除快速连击时的捕获竞态。
 * - 调用方只需关心三件事：开始（onStart）、移动（onMove 拿到 dx/dy）、结束（onEnd）。
 * - activePointerId 校验：忽略跨手势的残留事件。
 */
export interface DragHandlers {
  /** pointerdown 触发后立即调用；可用于记录起始快照、设置 mode 等 */
  onStart?: (e: PointerEvent) => void;
  /** 每次 pointermove 调用；dx/dy 是相对 pointerdown 的累计位移（屏幕 px） */
  onMove: (e: PointerEvent, dx: number, dy: number) => void;
  /** pointerup / pointercancel 时调用 */
  onEnd?: (e: PointerEvent) => void;
  /** 是否响应 pointerdown；返回 false 则不启动手势 */
  enabled?: (e: PointerEvent) => boolean;
}

export function useDrag(handlers: DragHandlers) {
  let activePointerId: number | null = null;
  let startClientX = 0;
  let startClientY = 0;
  let active = false;

  const onPointerMove = (e: PointerEvent) => {
    if (!active || e.pointerId !== activePointerId) return;
    const dx = e.clientX - startClientX;
    const dy = e.clientY - startClientY;
    handlers.onMove(e, dx, dy);
  };

  const finish = (e: PointerEvent) => {
    if (!active || e.pointerId !== activePointerId) return;
    active = false;
    activePointerId = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    handlers.onEnd?.(e);
  };
  // onPointerUp 与 onPointerCancel 都用同一个清理逻辑
  const onPointerUp = (e: PointerEvent) => finish(e);
  const onPointerCancel = (e: PointerEvent) => finish(e);

  /** 在需要接收 pointerdown 的元素上调用 */
  function start(e: PointerEvent) {
    if (handlers.enabled && !handlers.enabled(e)) return;
    // 如果已有进行中的手势（异常情况），先结束旧的
    if (active) finish(e);
    active = true;
    activePointerId = e.pointerId;
    startClientX = e.clientX;
    startClientY = e.clientY;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    handlers.onStart?.(e);
  }

  /** 组件卸载时强制清理（防止 window 监听泄漏） */
  function dispose() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    active = false;
    activePointerId = null;
  }

  return { start, dispose };
}