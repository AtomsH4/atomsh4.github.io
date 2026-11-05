# 关于页粒子图谱原型与验证记录

后续版本：用户已选择 Capacities 布局与 Cosmograph 粒子氛围，最新的[图文粒子星图验证记录](2026-11-03-about-graph-atlas-validation.md)包括持续漂移、鼠标局部放大和悬停图文卡片。以下记录保留为初版基线。

本地入口：[兴趣图谱原型](http://127.0.0.1:4322/lab/about-graph/)。运行 `npm run dev -- --host 127.0.0.1 --port 4322` 后可访问。

原型使用 d3-force 3.0.0、HTML 按钮、SVG 关系与 Canvas 2D 粒子，包含全部 17 个真实节点和两级关系。桌面可展开收起、拖动回归、聚焦路径、选择节点和重置；手机提供总览与四个分支的独立编排。项目、算法、EVA 和联系入口使用现有站内外地址。

`src/pages/lab/[preview].astro` 只在开发模式返回路径。生产构建仍为 44 页，不生成原型 HTML 或站点地图入口。Astro 会输出一个未被正式页面引用的图谱客户端 chunk；正式页面不会因此初始化图谱。正式 `/about/` 保留原有经历与联系内容，没有发布操作。

## 验证结果

| 范围 | 结果 |
| --- | --- |
| 完整单元/组件测试 | 19 个文件、121 项通过，其中新增图谱状态、布局和生命周期共 20 项 |
| Astro 检查与生产构建 | 0 errors、0 warnings；36 条既有 schema hints；44 页构建成功 |
| 桌面浏览器 1280px / 默认 1408px | 全部 17 节点；真实按钮包围盒无重叠、无越界；无页面横向溢出 |
| 手机浏览器尺寸 390px / 320px | 总览和四个分支均无按钮包围盒重叠或越界；节点点击区域宽高均至少 44px |
| 交互 | 类别展开/收起、全局收起至 5 节点、重置至 17 节点、键盘 Enter、叶节点选择和详情更新通过 |
| 实际鼠标拖动 | 拖动 R&B 后没有误触选择；音乐仍展开，AtomsH 仍为当前节点；中心保持固定 |
| 实际离屏暂停 | 将图谱滚出视口后状态为 paused；两次读取帧计数均为 7284；恢复视口后状态为 running，帧计数继续增加 |
| 静态服务端内容 | HTTP 返回四个分组、全部 12 个子项及联系链接；原型设置 noindex |
| 生命周期自动测试 | 初始/实时减少动态效果、主题事件、后台暂停恢复、离屏暂停恢复、Canvas 抛错后的 HTML/SVG 回退、空闲物理停止、卸载清理通过 |

桌面 rAF 采样约 **60fps**，运行时每帧 JavaScript / Canvas 指令提交平均约 **0.26–0.37ms**；320px 浏览器总览采样也约 **60fps**。该耗时不包含浏览器后续绘制、合成和 GPU 执行。它们是在本机桌面 Chrome 开发模式中的观测，不能作为真实手机硬件性能结论。

浏览器仅提供视口模拟能力，没有媒体偏好模拟接口。深色配色视觉检查、浏览器级减少动态效果切换、真正关闭 JavaScript 的浏览器检查及真实手机触控仍应在正式整合前复核；本轮不把运行时自动测试或服务端 HTML 检查等同于这些实机结果。一次浏览器连接中断后已恢复，最终保留可交互预览。

## 证据与文件

- 桌面截图：`test-results/about-graph-feasibility/desktop.png`。
- 320px 游戏分支截图：`test-results/about-graph-feasibility/mobile-320.png`。
- 浏览器采样：`test-results/about-graph-feasibility/browser-results.json`。包含恢复连接后保存的 320px 五种状态和默认桌面状态；390px 的结果记录于本次对话工具输出。
- 模型与交互状态：`src/features/about-graph/graph-data.ts`。
- 布局：`src/features/about-graph/graph-layout.ts`。
- 绘制和生命周期：`src/features/about-graph/graph-runtime.ts`。
- 页面状态、节点与详情：`src/features/about-graph/AboutGraphExperience.tsx`。

`test-results` 中的截图和观测文件按仓库现有规则忽略，不作为生产资源发布。继续正式重构时可复用这些功能模块，再决定最终版式、兴趣详情及是否增加第三级真实内容。
