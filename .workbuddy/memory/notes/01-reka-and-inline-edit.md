# reka-ui 事件冒泡 + 内联编辑

## reka-ui 与事件冒泡（架构级，改动前必读）

- reka 的"点外面关闭"挂在 **document 冒泡阶段**（`DismissableLayer` → `usePointerDownOutside`，无 capture）→ **元素内任何一处 `stopPropagation` 都会让它彻底失效**。所以**不要用 `@pointerdown.stop` 实现"别让画布根取消选中"**，改用**打标记 + 判落点**：元素根带 `data-design-element`，画布根 `closest()` 命中即放行。
  - **仍要保留 stop**：`GuideLines`、文本 textarea、各手势手柄 —— 它们拦的是**同一元素内的其它手势**，不是 document。
- **去掉 stop 的连带代价：父容器不能假设"事件到达我 = 落点在我身上"**。子元素的 pointerdown 会冒泡上来，父容器里"清理型"动作（清选区、退编辑）若无条件执行，就会在子元素刚设好状态后**下一行把它抹掉**（踩过：`onRootPointerDown` 无条件清选区 → "点单元格不出现蓝框"）。**规矩：父容器的清理动作一律先判落点**（表格用 `e.target === rootRef.value`，画布用 `closest("[data-design-element]")`）。
- `ContextMenu` 默认 `modal: true` → reka 给 body 设 `pointer-events:none`，菜单开着时下面元素全点不中 → **右键菜单必须 `:modal="false"`**。
- 关闭兜底 `ContextMenuAutoClose.ts` 哨兵（放进 `<ContextMenu>` 内）：公开导出 `injectContextMenuRootContext` 拿 `onOpenChange`，在 document **capture** 阶段监听左键；落点在 `[data-dismissable-layer]` 内就不关（保护菜单项自己的 click）。关闭只写状态 —— Vue 更新是异步的，不会吞掉这次点击。
- **焦点回填**：关闭 Content 类组件时 reka 走 FocusScope unmount 钩子 `emits("closeAutoFocus")`，trigger 不可聚焦则焦点掉到 body、顶掉刚聚焦的元素。解法 `@close-auto-focus` + `preventDefault()`（emits 同步，必先于回填），**不要**用 nextTick 延迟聚焦赌时序。

## 内联编辑（textarea 范式）

- 画布与单元格的文本编辑都用 **textarea 覆盖层**（老板拍板，别换回 contenteditable）：中文输入法不用自己写 composition 锁、粘贴天然纯文本、不跟 Vue 抢 DOM 所有权。编辑态放 Pinia（`editingId` 元素级 / `cellEditing` 格级），不做模块级单例。
- 三条实现约束：① `:value` 绑**组件内 draft ref**（恒等于 DOM 值 → Vue 必跳过 patch），`@input` 里同步写 store，中文合成期不被外部写入打断；② autosize 量高前临时塌 `auto`，量完**还原原值**（清空会把框永久塌成一行）；③ 容器 `select-none` 会继承进来，须补 `select-text`，并给 textarea `@pointerdown.stop`，否则拖选文字变成拖元素。
- `onBlur` 里先判"我还是当前编辑者"再退出：元素被移除时浏览器补的那次 blur 会掐掉刚开始的下一段编辑。
- **某条路径一旦 `preventDefault()`，那条路径就必须自己显式收编辑态，不能指望 blur** —— 焦点转移正是被拦掉的默认行为（同根因踩过两次：元素级文本编辑、表格 `onCellPointerDown`）。口诀：**这条交互 preventDefault 了吗？是 → 退出编辑必须显式写。**
- 不要在编辑态禁用属性面板的"内容"字段：禁用控件点不着 → textarea 不失焦 → 要点两次才生效。两条编辑路径靠"失焦即退出"天然互斥。
