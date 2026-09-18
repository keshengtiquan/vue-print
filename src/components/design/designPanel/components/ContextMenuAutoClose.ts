import { injectContextMenuRootContext } from "reka-ui";
import { defineComponent, onBeforeUnmount, onMounted, watch, type Ref } from "vue";

/**
 * 右键菜单"点别处就关"的哨兵：不渲染任何 DOM（渲染函数返回 null），只为拿到所在
 * ContextMenu 的上下文，并在菜单打开期间往 document 上挂一个 capture 监听。
 *
 * 为什么写成 .ts 而不是 .vue：它真的不需要渲染任何东西，模板里塞一个占位元素是多余的
 * （eslint 又要求模板必须有根节点），渲染函数返回 null 才是这个组件的本意。
 *
 * 用法：放进对应 <ContextMenu> 内部，与 Trigger / Content 并列。
 * 不能放在外面 —— reka 的上下文是 provide 给子树的，外部 inject 不到（会静默失效并给出警告）。
 *
 * 为什么不能只靠 reka 自带的关闭：
 * 1. 它的判定发生在 **document 的冒泡阶段**（DismissableLayer 的 usePointerDownOutside，
 *    `addEventListener("pointerdown", handler)` 没有 capture），任何一处 stopPropagation
 *    都能把它掐掉 —— 而这个项目里元素内部到处是 stop（挡的是画布根的"取消选中"）。
 * 2. ContextMenu 默认 modal，reka 会把 document.body 的 pointer-events 设成 none，
 *    于是"点下面那个元素"和"关掉菜单"变成互相打架的两件事（调用处已改成 :modal="false"）。
 *
 * 这里改走 **capture 阶段**：document 是捕获路径的第一站，早于任何元素上的监听，
 * 也早于任何 stopPropagation —— 事件只要真的发生就一定看得到，不需要任何人的配合。
 *
 * 关闭只写状态，而 Vue 的 DOM 更新是异步的（nextTick），所以本次事件仍会完整传播到
 * 底下的元素上："点一下既关菜单、又切到那个单元格"是成立的，不会吞掉这次点击。
 */
export default defineComponent({
  name: "ContextMenuAutoClose",
  setup() {
    // 传 null 作 fallback：万一注入不到（例如哨兵被挪到 <ContextMenu> 外面），
    // 静默失效也远好过在渲染期抛错把整个编辑器炸掉。敢用 reka 的这份上下文，是因为
    // injectContextMenuRootContext 是它对外导出的公开 API，不是从 dist 深链扒的私有实现。
    const ctx = injectContextMenuRootContext(null as never) as {
      open: Ref<boolean>;
      onOpenChange: (value: boolean) => void;
    } | null;

    /**
     * 点在菜单自己身上（含子菜单）时不关 —— 菜单项的选中在 click 阶段发生，
     * 提前卸载会让所有菜单命令失效。
     * 这个 selector 是 reka 自己写在 layer 根节点上的（DismissableLayer 的
     * data-dismissable-layer），它内部的 isLayerExist 用的也是同一个标记，
     * 所以这条判断与库自身的行为是一致的。
     */
    function onDocumentPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      const target = e.target;
      if (target instanceof Element && target.closest("[data-dismissable-layer]")) return;
      ctx?.onOpenChange(false);
    }

    if (import.meta.env.DEV && !ctx) {
      console.warn(
        "[ContextMenuAutoClose] 没拿到 ContextMenu 上下文，「点别处关闭」不会生效。" +
          "它必须放在 <ContextMenu> 内部（与 Trigger / Content 并列）。"
      );
    }

    let attached = false;

    function attach() {
      if (attached) return;
      attached = true;
      document.addEventListener("pointerdown", onDocumentPointerDown, true);
    }

    function detach() {
      if (!attached) return;
      attached = false;
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    }

    // 只在菜单打开的这段时间挂监听：关着的时候没必要让每个元素都往 document 上挂一个。
    // immediate 是为了兼容"哨兵本身也只在 open 时被渲染"的情况。
    watch(() => ctx?.open.value ?? false, (open) => (open ? attach() : detach()), {
      immediate: true
    });

    onMounted(() => {
      if (ctx?.open.value) attach();
    });
    onBeforeUnmount(detach);

    return () => null;
  }
});
