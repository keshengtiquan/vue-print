<template>
  <div class="bg-muted border-border flex h-6 items-center gap-4 border-t px-2 text-xs">
    <!--
      坐标读数：数字部分单独定宽，位数变化时（9.0 → 10.0）或进出画布（12.3 ↔ —）
      整块宽度都不变，后面的开关不会被推着左右跳。
    -->
    <span class="readout">x: <span class="readout__num">{{ x }}</span> mm</span>
    <span class="readout">y: <span class="readout__num">{{ y }}</span> mm</span>

    <!-- 读数与开关的分界：坐标是"看"，后面是"切"，用一条细竖线隔开职责 -->
    <span class="status-divider" aria-hidden="true"></span>

    <!--
      视图 / 编辑方式开关：属于"看与操作的方式"而非文档内容，不该埋进设置面板 ——
      用户随时想切，一步就该够到。紧跟坐标显示在左侧；
      后续加标尺、安全区之类的视图开关都往这里追加。
      组内间距收到 2px（外层 gap-4 太散），让它们读起来是一组。
    -->
    <div class="toggle-group">
      <button
        type="button"
        class="view-toggle"
        :class="{ 'view-toggle--on': designState.showGrid }"
        :aria-pressed="designState.showGrid"
        title="切换设计网格（10mm）"
        @click="designState.showGrid = !designState.showGrid"
      >
        <Grid3x3 class="view-toggle__icon" />
        <span>网格</span>
      </button>

      <!--
        辅助线显隐开关。关闭是彻底的：不显示、也不参与吸附 ——
        看不见的东西还在拽元素，只会让人以为是 bug。
      -->
      <button
        type="button"
        class="view-toggle"
        :class="{ 'view-toggle--on': designState.showGuides }"
        :aria-pressed="designState.showGuides"
        title="显示辅助线（从标尺拖出；关闭时不显示也不吸附）"
        @click="designState.showGuides = !designState.showGuides"
      >
        <Ruler class="view-toggle__icon" />
        <span>辅助线</span>
      </button>

      <!--
        吸附总开关。label 随状态在 "吸附" / "自由" 之间切换 ——
        只靠配色表达开关态在状态栏这种窄空间里不够直觉，文字直接说出当前模式更省脑。
        排在最后：前两个是"显示什么"，它是"怎么操作"，职责不同。
      -->
      <button
        type="button"
        class="view-toggle"
        :class="{ 'view-toggle--on': designState.snapEnabled }"
        :aria-pressed="designState.snapEnabled"
        :title="
          designState.snapEnabled
            ? '吸附已开启：移动吸页边距线与辅助线，旋转吸正交角（按住 Alt / Shift 可临时反向）'
            : '吸附已关闭：移动与旋转均为自由位移'
        "
        @click="designState.snapEnabled = !designState.snapEnabled"
      >
        <Magnet class="view-toggle__icon" />
        <span>{{ designState.snapEnabled ? "吸附" : "自由" }}</span>
      </button>

      <!--
        清除全部：辅助线一多，逐条双击删很折磨。
        没有辅助线时直接不渲染 —— 它是状态栏最右侧元素，显隐不会推动任何东西，
        所以不需要像坐标读数那样为它预留宽度。
      -->
      <button
        v-if="designState.guides.length"
        type="button"
        class="view-action"
        :title="`清除全部辅助线（${designState.guides.length} 条）`"
        @click="designState.clearGuides()"
      >
        <Trash class="view-action__icon" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Grid3x3, Magnet, Ruler, Trash } from "@lucide/vue";
import { useDesignStore } from "@/store/modules/design";

const designState = useDesignStore();

const x = computed(() => (designState.inPanel ? designState.mouse.x.toFixed(1) : "—"));
const y = computed(() => (designState.inPanel ? designState.mouse.y.toFixed(1) : "—"));
</script>

<style scoped>
/*
  坐标读数定宽：只给**数字本体**预留 5ch（覆盖到 999.9），
  前缀 "x: " 和单位 " mm" 本就是静态文本，于是整块宽度恒定 ——
  数字从 9.0 涨到 10.0、或进出画布变成 "—"，后面的开关都不会被推着左右跳。
  - 等宽字体 + tabular-nums（与设置面板 `__dd--mono` 同一套约定）：
    逐帧刷新时每个数字占同样宽度，不会细微抖动。
  - min-width 而非 width：万一数值超长（>5 位）是撑开而不是截断。
*/
.readout {
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace;
  font-variant-numeric: tabular-nums;
}

.readout__num {
  display: inline-block;
  min-width: 5ch;
}

/* 读数与开关组之间的细竖线：高度压到 12px，在 24px 高的状态栏里不抢戏 */
.status-divider {
  width: 1px;
  height: 12px;
  background: var(--border, #e5e7eb);
  flex: none;
}

.toggle-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* 状态栏只有 24px 高，开关必须紧凑：图标 + 短标签，靠色彩与底色表达开关态 */
.view-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 18px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: var(--color-muted-foreground, #6b7280);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  transition:
    color 140ms var(--ease-out, ease-out),
    background 140ms var(--ease-out, ease-out),
    border-color 140ms var(--ease-out, ease-out);
}

.view-toggle:hover {
  background: color-mix(in oklab, currentcolor 8%, transparent);
  color: var(--color-foreground, #111);
}

.view-toggle:focus-visible {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--primary) 22%, transparent);
}

.view-toggle--on {
  color: var(--primary);
  background: color-mix(in oklab, var(--primary) 12%, transparent);
  border-color: color-mix(in oklab, var(--primary) 30%, transparent);
}

.view-toggle--on:hover {
  color: var(--primary);
  background: color-mix(in oklab, var(--primary) 18%, transparent);
}

.view-toggle__icon {
  width: 12px;
  height: 12px;
}

/*
  纯图标动作位：与 view-toggle 同高，但没有标签也没有"开/关"两态 ——
  它是个一次性动作（清除），用 toggle 的语义会让人以为是开关。
*/
.view-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: var(--color-muted-foreground, #6b7280);
  cursor: pointer;
  transition:
    color 140ms var(--ease-out, ease-out),
    background 140ms var(--ease-out, ease-out);
}

.view-action:hover {
  color: #dc2626;
  background: color-mix(in oklab, #dc2626 12%, transparent);
}

.view-action:focus-visible {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--primary) 22%, transparent);
}

.view-action__icon {
  width: 12px;
  height: 12px;
}
</style>