# 关于页作品图片替换验证

预览：[关于页](http://127.0.0.1:4322/about/)。

按用户提供顺序接入四张原始 JPEG，复制后的 SHA-256 与原文件一致：

| 图片 | 节点 | 本地资源 |
| --- | --- | --- |
| 图 1 | 极乐迪斯科，替换肉鸽 | `public/media/about-graph/disco-elysium.jpg` |
| 图 2 | 荒野大镖客2 | `public/media/about-graph/red-dead-redemption-2.jpg` |
| 图 3 | 轻音少女 | `public/media/about-graph/k-on.jpg` |
| 图 4 | EVA | `public/media/about-graph/eva.jpg` |

其余节点移除手绘 SVG 及默认插画回退，Cherry Studio 改为普通文字节点。无图节点展开为 82px 文字卡片，已有真实音乐封面保留，失败后收起图片区域。补齐图片在 React 水合前已加载成功或失败的状态检测，避免出现透明图片和空白大卡片。

原卡牌与肉鸽的关系替换为“极乐迪斯科—解谜：线索与推理”；完整节点总数仍为 30，桌面默认仍为 22。

验证结果：

- `npm test -- src/features/about-graph --maxWorkers=1`：5 个文件、109 项通过。首次并行构建时有一项几何测试触发默认 5 秒超时，单独重跑全部图谱测试通过，未调整超时或测试断言。
- `npm run build`：0 errors、0 warnings、36 项既有提示；44 页构建完成。产物包含新的图片加载状态处理。
- 浏览器回归：6 项通过，逐一检查四张本地图片的 URL 与实际解码宽度；验证远程封面失败后图片收起、320px/390px 下无图预览为 82px、无 Canvas 与无 JavaScript 回退。
- 应用内浏览器：正常动画下查看游戏分支，两张游戏图片和名称正确，游戏类别为文字预览。
- 图谱数据、呈现与图片组件中不再引用手绘 SVG；`git diff --check` 通过。

截图保存在 `test-results/about-node-images/`，包括 `desktop.png`、`related.png`、`mobile-320.png`、`mobile-390.png` 和 `expanded-music.png`。本轮未发布。
