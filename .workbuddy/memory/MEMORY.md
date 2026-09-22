# vue-print 项目长期约定

> 详档已拆分到 `notes/`（本文件只放索引与最硬的铁律，**动手前按需读详档**）：
> - `notes/01-reka-and-inline-edit.md` —— reka-ui 事件冒泡 / 右键菜单 / 焦点回填；textarea 内联编辑范式
> - `notes/02-geometry-snap-dnd.md` —— 旋转支点、line 不变量、两套吸附语义；素材台 HTML5 拖拽
> - `notes/03-table.md` —— 表格全部几何/单位/边框/选区/编辑态不变量（**改表格必读**）
> - `notes/04-engineering.md` —— 验证方式、数据所有权、环境坑、Tailwind、TS 陷阱
> - `notes/05-data-binding.md` —— 数据绑定三层模型、四类铁律、取值语义、面板约定（**改数据层/渲染必读**）
> - **预览 / 自动分页**没有单独 note：看 **`docs/preview-design.md` v1 + §12 实现进度**（三层职责、分页引擎不变量、明细行展开规则、取数隔离、看门狗清单都在这儿）

## 仓库状态（2026-09-21 午后）

- `main` = `5b4fde8` + **未提交的「数据绑定 + 预览/自动分页」工作区改动**。`backup-data-parsing`（→ `fe8f5ca`）**仍然保留**，是数据绑定整套实现的来源，别删。
- 数据绑定的重启点：`fe8f5ca` 的**父提交就是 `5b4fde8`** → 从该分支恢复无版本漂移；`package.json` 零依赖变化（`axios` 本就在）。
- **恢复代码的既有姿势**：`git checkout backup-data-parsing -- <显式路径列表>`，**别用 `git cherry-pick`**（会连带 doc/memory 改动覆盖掉新写的计划书）。
- **预览 + 自动分页（P0+P1）已落地**：`/preview/:id` 独立路由、分页引擎、明细行扩展、两个自检脚本。交付说明与偏差见 `docs/preview-design.md` §12。

## 当前任务：数据绑定（已落地）→ 预览 / 自动分页（已落地，待老板手点）

- 数据绑定计划书 **`docs/data-binding-design.md`**（v1 + §11 实现进度）；约定详档见 **`notes/05-data-binding.md`**；表格几何配套读 **`docs/table-feature-design.md`**（v12/v13）。
- 老板拍板：**先做 api 接口的数据绑定，SQL 放一放**。
- 数据绑定**未做**：SQL、`type: "inject"`（宿主注入）、套打行数控制、字段格式化 UI、模板序列化、多数据集关联、分页。
- 预览**未做**：打印（`@media print`，P2）、模板持久化/序列化、字段格式化 UI、明细行回查接口。**行高自适应已落地**（2026-09-21 晚，测量法 + atLeast，见 `docs/row-auto-height-design.md` §8；有意留了"3 轮保险丝"没加，真机震荡再补）。
- ⚠️ **§11.16「表格的一切取数能力被砍掉」已被预览轮重新开启**：表格取数四项（明细模板行 / 表头行数 / 列映射 / 允许跨页断开）按 `preview-design.md` §10 #1/#7 放回，理由见 §12.2 第 3 条。所以"表格「数据」分组里只该有「数据集」一个下拉"**不再成立**。
- **待老板手点**：`preview-design.md` §11 那 9 条（重点第 9 条设计态回归）；数据绑定侧见 `data-binding-design.md` §11.7。

## 最硬的几条铁律（违反会返工，详档里有展开）

1. **数据所有权**：每个元素必须自持嵌套数据，绝不与别的元素或模块级常量共用引用。`createElement` 必须 `structuredClone(toRaw(v))` 深拷贝 —— 素材 `defaults` 是模块级常量，浅拷贝会"A 表删行 B 表跟着少"，更狠的是**直接污染模块级模板**。
2. **表格写入口只有两个**：几何/普通字段走 `updateElement(id, patch)`；表格结构与单元格走 `updateTable(id, mutator)` 且**必须整包替换**，**绝不用点路径 patch 写 `cells`**。
3. **父容器的清理型动作（清选区、退编辑）一律先判落点**；画布不要用 `stopPropagation` 阻止取消选中（会让 reka 的"点外面关闭"失效）。
4. **某条路径一旦 `preventDefault()`，那条路径必须自己显式收编辑态，不能指望 blur。**
5. **第 2/3 层表格状态（`cellRange`/`activeCell`/`cellEditing`）的每个消费点，第一行先问"我是那张活动表吗"**（全局单份按坐标索引，两张表会同坐标命中）。
6. **表格边框写入必须两格同写**（只写自己那半边会静默失效，CSS 更宽者胜）；**"删掉属性" ≠ "关掉这条边"**（关边要写显式 `{style:"none",width:0}`）。
7. **数据引用只有一个来源**：元素绑哪个数据集由 `element.binding.dataSetId` 唯一决定，**没有"主数据集 / 默认数据集"概念**；插入的占位符一律写成 `{数据集.字段}`。没绑定就按静态内容渲染，**绝不猜测性兜底**。详见 `notes/05-data-binding.md`。
   - **占位符字面量的唯一构造点 = `lib/template.ts` 的 `makeFieldToken(field, dataSetName?)`**（2026-09-21 从 `useDataBinding.fieldToken()` **下沉**过来 —— 读取侧（列映射规范化）也要拼花括号，而它在纯函数层不能引 composable）。`useDataBinding.fieldToken()` 现在只是"解析 dataSetId → 调它"的薄壳。自查 `grep -rn '`{\${' src` **应恰好命中 1 行**（正好是 `makeFieldToken` 那行）。`makeFieldToken` 容忍"已是整段占位符"的输入，两处读取侧**必须共用它**，否则会出现"预览渲得出值、体检却报字段不存在"。
8. **设计态画布不渲染字段值**：写 `{品名}` 就显示 `{品名}`，一个字符都不替换（老板 2026-09-20 纠正过一次实现偏离，计划书 §11.10）。`designContext` 只服务设计态的"样本预览"；真正的渲染态取值走 `useDataBinding.renderContext(el, row, sysVars)`（`onMissing:"blank"`）→ 预览 / 导出 / 打印。**看门狗** `grep -rn "renderTemplate(" src/components/design/designPanel/` **必须零调用点**（注释行不算）。也**不给占位符加任何视觉标记**（会改字宽、破坏排版测量）。⚠️ 图片元素含占位符时**不能把 `{字段}` 当 `src` 交给浏览器**（会被当相对路径发 404 + 裂图），要返回空串走"显示占位符文本"分支。**表格的数据扩展只在渲染态发生**（`preview/expand.ts` 明细行展开 + `columnFields` **只兜底空格、绝不覆盖**已写内容；画布不消费这些声明，只给一处不改字宽的行号槽色条）。详见 `docs/preview-design.md` §3.6 / §12。
9. **Vue 模板的属性值里禁止裸 ASCII 双引号，也禁止 `/* */` 块注释。** 裸 `"` 会把 `:class="..."` 提前截断，`/*` 会被 tokenizer 当标签结束，二者都会报出**一串位置全不对**的错（`stateInAttrName` / `Illegal '/' in tags`），而 vite 只回一个没有行号的 500 HTML。中文全角引号（「」“”）在属性值里没事。要写长注释就放属性元素外或 `<script>` 里。查错姿势：`node scripts/check-templates.mjs`（用 `@vue/compiler-sfc` 的 `parse()` 拿 `errors[].loc`，一次定位到行）。

## 怎么验证（老板定死，别加戏）

只有三样：`npx vite` + `curl`（取转换后模块确认编译通过）、`npx eslint`、人工静态核对。
- **不要擅自做浏览器自动化验证**，**不要用 Playwright 装浏览器**（从没成功过）。真要验证交互，**先问老板**。
- `vue-tsc` 是坏的（`runTsc` MODULE_NOT_FOUND），没有类型检查兜底 ⇒ "纯逻辑算错了不报错、只会画错"的模块（分页、占位符解析）**必须有人工核对之外的手段**。
- **两个零依赖自检脚本（2026-09-21 起，老板已批准其中分页那个）** —— 改动相关模块后**顺手跑一遍，1 秒**：
  - `node scripts/check-paginate.mjs` —— 分页引擎 51 条断言（页1≡设计态、跨界顺延、表格行内分页、表头重复、超高行/超高块、`MAX_PAGES` 夹取、幂等）。
  - `node scripts/check-templates.mjs` —— 全仓 `.vue` 模板语法扫描（属性值里的裸引号 / 块注释这一类，vite 只在被请求到才报 500，很容易漏）。
  - 两个脚本能跑起来的前提：`preview/{paginate,expand,layout,inspect,types}.ts` **保持零运行时依赖**（只 `import type` + 纯函数）。一旦往里加运行时 import，`check-paginate` 会立刻因路径别名解析失败而崩 —— 那时请把逻辑挪回纯函数层，**别加 loader**。
- **改预览层必跑 `docs/preview-design.md` §5.2 的三条看门狗 grep**：① 预览层不得读设计态**视图状态**（只许读 `elements`/`getElement`/`paper`/`marginMm`，`design.scale` 只出现在注释里）；② 分页层不得 import Vue / store；③ 设计面板零 `renderTemplate` 调用点。
- `npx vite build` 可以做额外兜底，但**必须 `--outDir` 换到临时目录**：仓库里 `dist/` 是**已提交**的，直接 build 会把它改脏。
- 没能真机验证的交互，交付说明里**逐条列出需要老板手点哪条链路**。
- 交互异常（尤其拖拽）**第一步先用 Chrome 无痕模式复现**排除扩展干扰。**已实锤**（2026-09-22）：扩展会在 dragstart 后清空 dataTransfer（types 变 `[]`，页面代码无权自救）→ 素材/字段拖拽已改**双通道**：dragstart 双写模块变量（`materials.ts` draggingMaterialId / `data/model.ts` draggingField，两通道互斥清对方标记）+ drop 优先读变量、dataTransfer 只兜底。新拖拽源照抄此模式，别裸信 dataTransfer。
