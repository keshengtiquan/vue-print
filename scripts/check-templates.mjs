/**
 * Vue 单文件组件模板语法自检（约 100 行，不装任何测试框架）。
 *
 * 用法：
 *   node scripts/check-templates.mjs          # 扫 src
 *   node scripts/check-templates.mjs src/foo  # 只扫某个目录
 *
 * ## 为什么这个脚本值得存在
 *
 * 模板语法错是**运行时才炸**的：设计态某个组件炸了，开发服务器只在
 * 「浏览器真的请求到那个模块」时才返回 500 —— 而打开哪一页、点到哪个元素
 * 是随人的操作而变的，很容易漏掉。全量扫一遍只要 1 秒，比"碰运气撞上"可靠。
 *
 * 它是被一个真实的坑换来的，值得记下来：
 * **属性值里不能出现裸的 ASCII 双引号，也不能出现 `/* *\/` 块注释。**
 * 前者会把 `:class="..."` 提前截断，后者会被 tokenizer 当成标签结束，
 * 两个都会连锁报出一堆位置全不对的错误（`stateInAttrName`、`Illegal '/' in tags`）。
 * 中文全角引号（`“` `”`）没事，写注释请用 HTML 注释或把说明挪到 `<script>` 里。
 *
 * ## 依赖怎么找
 *
 * 本项目用 pnpm，`@vue/compiler-sfc` 是 `@vitejs/plugin-vue` 的传递依赖，
 * 不在顶层 `node_modules` 里，所以不能直接 `import`。这里先试顶层，
 * 再按 `node_modules/.pnpm/@vue+compiler-sfc@*` 通配 —— 版本升级不用改脚本。
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const require = createRequire(pathToFileURL(join(ROOT, "package.json")).href);

/** 先顶层、再 pnpm store 通配地解析一个包的实际入口文件 */
function resolvePkg(pkg) {
  try {
    return require.resolve(pkg);
  } catch {
    /* 顶层没有 → 走 pnpm store */
  }
  const store = join(ROOT, "node_modules", ".pnpm");
  if (!existsSync(store)) return null;
  const prefix = pkg.replace("/", "+") + "@";
  for (const dir of readdirSync(store)) {
    if (!dir.startsWith(prefix)) continue;
    const entry = join(store, dir, "node_modules", pkg);
    if (existsSync(entry)) return require.resolve(entry);
  }
  return null;
}

const sfcEntry = resolvePkg("@vue/compiler-sfc");
if (!sfcEntry) {
  console.error("✗ 找不到 @vue/compiler-sfc，请先 pnpm install");
  process.exit(1);
}
const { parse } = require(sfcEntry);

/* ============================================================
   扫描
============================================================ */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".vue")) out.push(p);
  }
  return out;
}

const target = process.argv[2] || "src";
const files = walk(join(ROOT, target));
const bad = [];

for (const abs of files) {
  const src = readFileSync(abs, "utf8");
  const { errors } = parse(src, { filename: abs });
  if (!errors.length) continue;
  const lines = src.split(/\r?\n/);
  bad.push({
    file: relative(ROOT, abs).replace(/\\/g, "/"),
    errors: errors.map((e) => ({
      line: e.loc?.start?.line,
      col: e.loc?.start?.column,
      message: e.message,
      text: e.loc?.start?.line ? lines[e.loc.start.line - 1]?.trim() : ""
    }))
  });
}

/* ============================================================
   结果
============================================================ */

if (bad.length) {
  console.error(`\n✗ 模板自检失败：${bad.length} / ${files.length} 个文件\n`);
  for (const f of bad) {
    console.error(`  ${f.file}`);
    for (const e of f.errors.slice(0, 5)) {
      console.error(`      ${e.line}:${e.col}  ${e.message}`);
      if (e.text) console.error(`        > ${e.text}`);
    }
    if (f.errors.length > 5) console.error(`      …另有 ${f.errors.length - 5} 条`);
    console.error("");
  }
  process.exit(1);
}
console.log(`✓ 模板自检通过：${files.length} 个 .vue，零语法错误`);
