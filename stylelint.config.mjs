/** @type {import('stylelint').Config} */
export default {
  extends: [
    // 标准 CSS 规则
    "stylelint-config-standard",
    // 支持 Vue 单文件组件中的 <style> 块（自动处理 vue/html 解析）
    "stylelint-config-standard-vue"
  ],
  rules: {
    // Tailwind v4 要求 @import 使用字符串形式而非 url()，关闭该规则
    "import-notation": null,
    // 兼容 Tailwind CSS v4 的自定义 at-rules
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: [
          "tailwind",
          "apply",
          "variants",
          "responsive",
          "screen",
          "layer",
          "theme",
          "utility",
          "variant",
          "custom-variant",
          "source",
          "reference",
          "config",
          "plugin"
        ]
      }
    ],
    // Tailwind 项目里允许空源码（如仅引入 tailwind 的 css）
    "no-empty-source": null,
    // 允许 :deep / :global 等 Vue 伪类
    "selector-pseudo-class-no-unknown": [
      true,
      { ignorePseudoClasses: ["deep", "global", "slotted"] }
    ]
  },
  ignoreFiles: ["dist/**", "node_modules/**", "public/**"]
};
