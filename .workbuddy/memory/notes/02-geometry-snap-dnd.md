# 几何不变量、吸附、拖拽

## 几何不变量与吸附

- **元素框中心就是旋转支点**（`ElementWrapper` 写死 `transformOrigin:center`）。凡**重算包围盒**的操作都会挪走支点，而"屏幕位移→局部位移"隐含"支点不动" → 旋转态必然漂移（θ=90° 实测漂 9mm）。解法：**先把已有 rotation 烘焙进纸张 mm 坐标**，算完写回、rotation 归 0。
- **line 的不变量：框 = 线段轴对齐包围盒**（两方向各兜 `ENDPOINT_MIN_THICKNESS = 4mm`，否则水平/垂直线框退化成 0 厚）；**line 只有 2 个端点手柄 + 旋转手柄，没有缩放手柄** —— 端点必然落在角/边中点、与缩放手柄几何重合，只能二选一（几何结论，不是偏好）。拖端点保持**端点身份**。
- **两套吸附语义绝不合并**：`snapAxis`（移动）= 两边都够线、整框平移；`snapEdge`（缩放、线条端点）= 只动被拖那条边、对边锁死（缩放套 `snapAxis` 会让对边跟着跑）。
- **缩放吸附只在 rotation ∈ {0°,180°} 生效**（容差 1e-3°，因旋转吸附产出浮点角）：非正交角上边与参考线不平行，且旋转态缩放本身就会漂。90°/270° 需换轴反解，明确不做。**线条端点不受此限**（全程在纸张 mm 空间）。
- **吸附与最小尺寸（1mm）冲突时整轴退回自由值并撤销该轴高亮**，别硬夹成 min。`Alt` = 临时取消吸附（**必须返回空 hits**，否则高亮残留）；`Shift` 留给将来等比缩放，别占用。容差统一 `MARGIN_SNAP_PX = 6` 屏幕 px。
- 三条手势共用 `useSnapFeedback.setSnapKeys` 一条高亮通道，渲染层不用改；`designPanel/composables/useSnapTargets.ts` 是共用底座。

## 拖拽（素材台 → 画布）

- 用 **HTML5 DnD**（`draggable`/`dragstart`/`dataTransfer`）—— 老板明确指定；曾擅自改成 `useDrag` 指针事件被判"偏离意图"。**老板指定了方案就在方案内解决坑，不要擅自换。**
- 三条硬规矩（违反会"一拖就卡死"）：① `dragstart` 只写 dataTransfer、**绝不碰响应式状态**（浏览器正在生成 drag image，Vue 同步改源元素样式会打架）；② 源卡片**不要 transform/opacity 过渡**，hover 只改颜色，图标文字加 `pointer-events:none`；③ `dragover` 必须 `preventDefault()` 且**不写状态**（每帧高频），`dragleave` 用 `e.relatedTarget` 判真离开（null = 拖出窗口）。
- `dataTransfer` 只传**素材 id**（最小载荷），drop 端回查清单；自定义 MIME + `text/plain` 双写，非素材 id 直接忽略。
- 落点用 `getBoundingClientRect()`（已含滚动与缩放）除以 `mmToPx(1)*scale` 得 mm，**不要再手工叠加 scroll 偏移**；元素以落点为中心放置。
