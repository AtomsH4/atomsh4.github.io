# 关于页作品节点更新

删除 `music-door`（Leave the Door Open）、`music-black`（Back in Black）及其独立预览配置、布局锚点，保留 R&B 和 Rock 分类。Anime 下新增 `anime-deep-sea`，显示电影英文名 Deep Sea。完整图谱 32 个节点，桌面默认 24 个。

## 图片来源

- 电影资料与来源页：[Deep Sea / SLASH Filmfestival 2023](https://2023.slashfilmfestival.com/en/films-2023/deep-sea/)。
- [原始图片](https://2023.slashfilmfestival.com/uploads/2023/09/deep-sea.jpg)：海上落日、彩色海浪与航行的船，1920×1200px，628273 字节。按用户后续要求替换原先的海底餐厅剧照，突出海洋场景。
- 本地资源：`public/media/about-graph/deep-sea-ocean.jpg`，保留原始 JPEG；来源页与说明记录在节点图片元数据中。原先的 `deep-sea.png` 已移除。
- 延续名称默认可见、图片仅在展开时显示的交互。

## 验证

- 5 个图谱单元测试文件、79 项测试通过。
- 6 项浏览器场景通过，覆盖移除节点、Deep Sea 本地图片解码、桌面展开与复位、320px/390px 手机图片展开及边界、无 Canvas、无 JavaScript 回退。
- 截图：`test-results/about-deep-sea/expanded-deep-sea.png`、`mobile-deep-sea-320.png`、`mobile-deep-sea-390.png`。
- 日志：`/tmp/about-deep-sea-unit.log`、`/tmp/about-deep-sea-browser.log`。
- 更换为海上落日配图后，复测桌面和 320px 手机两项浏览器场景通过，确认新 JPEG 可解码、展开图片及关闭复位正常。日志：`/tmp/about-deep-sea-ocean-browser.log`。
