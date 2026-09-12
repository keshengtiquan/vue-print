import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  // 忽略目录
  {
    ignores: ["dist/**", "node_modules/**", "public/**", "*.config.js"]
  },

  // 基础规则：JS + TS + Vue
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],

  // Vue 单文件中使用 TS 解析 <script lang="ts">
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      }
    }
  },

  // 全局变量环境
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },

  // 项目自定义规则
  {
    rules: {
      // 允许单单词组件名（如 App.vue）
      "vue/multi-word-component-names": "off",
      // 生产环境禁止 console / debugger
      "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
      "no-debugger": process.env.NODE_ENV === "production" ? "warn" : "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }]
    }
  },

  // 关闭与 Prettier 冲突的规则（必须放在最后）
  eslintConfigPrettier
);
