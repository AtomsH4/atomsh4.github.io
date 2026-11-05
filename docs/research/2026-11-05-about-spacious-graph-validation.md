# 关于页节点精简与布局留白

R&B、摇滚、流行保留为没有图片、没有子项展开的文字节点。删除意识流、计算机、代码及其四条相关语义连线。我表示理解、给自己的情书保留为音乐的直接子节点，继续支持各自的歌曲配图。

完整图谱 34 个节点，桌面默认 25 个，手机总览 7 个。四个主分支向四个方向分散，桌面初始缩放调整为 1.2；实际矩形碰撞留白由 8 增至桌面 20、手机 12 世界坐标像素。手机总览重新排列两个概念与四个分支；分支子项行距根据可用高度调整。

## 验证

- 5 个图谱单元测试文件、74 项测试通过。覆盖三个风格节点在停留、键盘聚焦、点击保留时均不触发预览，删除节点和关系无残留，以及不同尺寸的布局与运动。
- 7 项浏览器场景通过。桌面默认所有节点位于画布范围内，六项技术栈展开后完整可见；320px/390px 总览、音乐风格静态点击、作品配图、博客/笔记跳转、无 Canvas 与无 JavaScript 回退均通过。
- 生产构建通过，生成 44 个页面。
- 日志：`/tmp/about-spacious-graph-unit.log`、`/tmp/about-spacious-graph-browser.log`、`/tmp/about-spacious-graph-build.log`。
- 截图：`test-results/about-spacious-graph/desktop.png`、`desktop-stack.png`、`mobile-overview-320.png`、`mobile-overview-390.png`。
