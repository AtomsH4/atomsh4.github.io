# 关于页兴趣星簇验证

本地预览：[关于页](http://127.0.0.1:4322/about/)。本轮修改位于 `codex/about-interest-clusters`，未发布。

## 结果

| 检查 | 结果 |
| --- | --- |
| 完整单元测试 | `npm test -- --maxWorkers=2`：22 个文件、210 项通过 |
| Astro 检查与生产构建 | `npm run build`：0 errors、0 warnings、36 项既有弃用提示；44 页构建成功 |
| 浏览器回归 | 新增 `tests/e2e/about-graph.spec.ts`，6 项全部通过 |
| 默认桌面 1408×900 | 22 个节点；作品小配图、类别和文字细节形成不同层次；节点矩形无重叠，页面无横向溢出 |
| 内容与展开 | 完整数据 30 个节点；技术栈展开后桌面 25 个节点，重复点击折叠；Home 恢复默认 22 个及 135% 视角 |
| 跨兴趣联系 | 三条独立于树结构的弱关联；聚焦轻音少女时出现“放课后的乐队”，音乐节点同步提亮；Escape 收起 |
| 320×844 / 390×844 | 支持总览、编程、项目/技术栈的逐层浏览；项目子簇 6 个节点，展开 Cherry Studio 后全部节点仍在画布内且无重叠，可沿父节点返回 |
| 无 Canvas | SVG 与 HTML 节点仍可展开、折叠、复位 |
| 无 JavaScript | 静态回退含全部深层内容、题解链接与正确的 GitHub 站外链接 |
| 正常动画模式 | 在应用内浏览器查看编程与项目分支，以及 Cherry Studio 驻留卡片；祖先、卡片和邻居可读 |

浏览器回归复用了已有的 4322 开发服务器，通过 `/tmp/about-interest-clusters.playwright.config.mjs` 指定单 worker、60 秒任务超时和独立输出目录，避免清理工作区既有的 `test-results`。测试主动中断远程封面请求以检查本地 SVG 回退。上述手机结果来自浏览器尺寸模拟，未作真实手机性能基准。

## 修复的交互问题

更深的手机路径为祖先各分配独立位置，避免祖先和子项落在同一排。碰撞边界依据相机逆变换和 20px 安全边距计算，展开前先更新实际尺寸并处理约束，再决定是否移动相机，避免卡片在旧坐标触发平移后把邻居带出屏幕。新增专门的运行时回归测试。

桌面展开/折叠时保存现有节点位置和相机视图；尺寸、紧凑模式、当前手机层级或显式复位改变时建立新视图。拖动中的节点不被碰撞挪走，释放后恢复正常避让。关系曲线及文字随相机和端点坐标更新，不参与父子结构的物理拉力。

## 截图

- `test-results/about-interest-clusters/desktop.png`
- `test-results/about-interest-clusters/related.png`
- `test-results/about-interest-clusters/mobile-320.png`
- `test-results/about-interest-clusters/mobile-390.png`
- `test-results/about-interest-clusters/expanded-music.png`

保留了进入本轮时的现有工作区改动；未修改项目依赖或其他页面。
