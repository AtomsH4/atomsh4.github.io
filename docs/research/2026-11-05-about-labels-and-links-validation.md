# 关于页节点命名、链接与技术栈

按用户要求移除节点名称左侧圆点。类别、概念与中国作品恢复中文，保留国外作品的英文名称；Eva 使用指定大小写。原有图片与只在展开时显示图片的交互保留。

编程下新增算法、深度学习。技术栈子节点更新为 React、Python、Electron、NodeJS、MySQL、C++。完整图谱 37 个节点，桌面默认 26 个。

项目右侧的独立锚点进入 `/blog/`，其中已有 Cherry Studio 的项目开发文章；算法右侧锚点进入 `/notes/`，其中已有算法题解和学习笔记。节点按钮继续负责选中与类别展开。导航锚点独立于按钮，随节点的相机变换和拖拽更新位置，支持键盘访问及站点 base path。

## 验证结果

- 图谱单元测试：5 个文件、80 项通过，包含导航入口随节点平移、缩放、拖拽的对齐检查。日志：`/tmp/about-nodes-links-unit.log`。
- 浏览器 7 项场景通过：桌面层级与配图、语义连线、320px/390px 手机、无 Canvas、无 JavaScript、博客和笔记的实际导航。日志：`/tmp/about-nodes-links-browser.log`。
- 桌面锚点调整后，严格检查新增节点和全部六项技术栈均在画布范围内，保留展开前的缩放。桌面场景复测通过，日志：`/tmp/about-nodes-links-desktop-recheck.log`。
- 最终布局回归：纯计算的图谱模型测试在 Node 环境运行，56 项通过。日志：`/tmp/about-nodes-links-layout.log`。
- 生产构建通过，生成 44 个页面；Astro 检查 0 errors、0 warnings，36 项既有 hints。日志：`/tmp/about-nodes-links-build.log`。
- 截图保存在 `test-results/about-nodes-links/`，包含 `desktop.png`、`desktop-stack.png`、`mobile-stack-320.png` 和 `mobile-stack-390.png`。
