<template>
  <div class="bg-muted border-border flex h-6 items-center gap-4 border-t px-2 text-xs">
    <!--
      坐标读数：只给**数字本体**预留 5ch（覆盖到 999.9），前缀 "x: " 与单位 " mm" 本就是静态
      文本，于是整块宽度恒定 —— 数字从 9.0 涨到 10.0、或进出画布变成 "—"，
      后面的开关都不会被推着左右跳。
      等宽字体 + tabular-nums（与设置面板的数值读数同一套约定）：逐帧刷新时每个数字占同样
      宽度，不会细微抖动。min-width 而非 width：万一数值超长（>5 位）是撑开而不是截断。
    -->
    <span class="font-mono whitespace-nowrap tabular-nums"
      >x: <span class="inline-block min-w-[5ch]">{{ x }}</span> mm</span
    >
    <span class="font-mono whitespace-nowrap tabular-nums"
      >y: <span class="inline-block min-w-[5ch]">{{ y }}</span> mm</span
    >

    <!-- 读数与开关的分界：坐标是"看"，后面是"切"，用一条细竖线隔开职责。
         高度压到 12px，在 24px 高的状态栏里不抢戏。 -->
    <span class="bg-border h-3 w-px flex-none" aria-hidden="true"></span>

    <!--
      视图 / 编辑方式开关：属于"看与操作的方式"而非文档内容，不该埋进设置面板 ——
      用户随时想切，一步就该够到。紧跟坐标显示在左侧；
      后续加标尺、安全区之类的视图开关都往这里追加。
      组内间距收到 2px（外层 gap-4 太散），让它们读起来是一组。

      开关态与非开关态用**三元互斥**给出完整配色，不叠加同类工具类 ——
      Tailwind 的 text-primary 与 text-muted-foreground 之间按生成顺序决胜，叠加不可控。
    -->
    <div class="flex items-center gap-0.5">
      <button
        type="button"
        class="focus-visible:border-primary focus-visible:ring-primary/22 inline-flex h-4.5 cursor-pointer items-center gap-1 rounded-[3px] border px-1.5 text-[11px] leading-none transition-[color,background,border-color] duration-140 ease-out focus-visible:ring-2 focus-visible:outline-none"
        :class="
          designState.showGrid
            ? 'border-primary/30 bg-primary/12 text-primary hover:bg-primary/18 hover:text-primary'
            : 'text-muted-foreground hover:text-foreground border-transparent hover:bg-current/8'
        "
        :aria-pressed="designState.showGrid"
        title="切换设计网格（10mm）"
        @click="designState.showGrid = !designState.showGrid"
      >
        <Grid3x3 class="size-3" />
        <span>网格</span>
      </button>

      <!--
        辅助线显隐开关。关闭是彻底的：不显示、也不参与吸附 ——
        看不见的东西还在拽元素，只会让人以为是 bug。
      -->
      <button
        type="button"
        class="focus-visible:border-primary focus-visible:ring-primary/22 inline-flex h-4.5 cursor-pointer items-center gap-1 rounded-[3px] border px-1.5 text-[11px] leading-none transition-[color,background,border-color] duration-140 ease-out focus-visible:ring-2 focus-visible:outline-none"
        :class="
          designState.showGuides
            ? 'border-primary/30 bg-primary/12 text-primary hover:bg-primary/18 hover:text-primary'
            : 'text-muted-foreground hover:text-foreground border-transparent hover:bg-current/8'
        "
        :aria-pressed="designState.showGuides"
        title="显示辅助线（从标尺拖出；关闭时不显示也不吸附）"
        @click="designState.showGuides = !designState.showGuides"
      >
        <Ruler class="size-3" />
        <span>辅助线</span>
      </button>

      <!--
        吸附总开关。label 随状态在 "吸附" / "自由" 之间切换 ——
        只靠配色表达开关态在状态栏这种窄空间里不够直觉，文字直接说出当前模式更省脑。
        排在最后：前两个是"显示什么"，它是"怎么操作"，职责不同。
      -->
      <button
        type="button"
        class="focus-visible:border-primary focus-visible:ring-primary/22 inline-flex h-4.5 cursor-pointer items-center gap-1 rounded-[3px] border px-1.5 text-[11px] leading-none transition-[color,background,border-color] duration-140 ease-out focus-visible:ring-2 focus-visible:outline-none"
        :class="
          designState.snapEnabled
            ? 'border-primary/30 bg-primary/12 text-primary hover:bg-primary/18 hover:text-primary'
            : 'text-muted-foreground hover:text-foreground border-transparent hover:bg-current/8'
        "
        :aria-pressed="designState.snapEnabled"
        :title="
          designState.snapEnabled
            ? '吸附已开启：移动与缩放吸页边距线与辅助线，旋转吸正交角（旋转元素仅 0°/180° 参与缩放吸附，按住 Alt 临时关闭）'
            : '吸附已关闭：移动、缩放与旋转均为自由位移'
        "
        @click="designState.snapEnabled = !designState.snapEnabled"
      >
        <Magnet class="size-3" />
        <span>{{ designState.snapEnabled ? "吸附" : "自由" }}</span>
      </button>

      <!--
        纯图标动作位：与 view-toggle 同高，但没有标签也没有"开/关"两态 ——
        它是个一次性动作（清除），用 toggle 的语义会让人以为是开关。

        清除全部：辅助线一多，逐条双击删很折磨。
        没有辅助线时直接不渲染 —— 它是状态栏最右侧元素，显隐不会推动任何东西，
        所以不需要像坐标读数那样为它预留宽度。
      -->
      <button
        v-if="designState.guides.length"
        type="button"
        class="text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/22 inline-flex size-4.5 cursor-pointer items-center justify-center rounded-[3px] border border-transparent bg-transparent transition-[color,background] duration-140 ease-out hover:bg-red-600/12 hover:text-red-600 focus-visible:ring-2 focus-visible:outline-none"
        :title="`清除全部辅助线（${designState.guides.length} 条）`"
        @click="designState.clearGuides()"
      >
        <Trash class="size-3" />
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
