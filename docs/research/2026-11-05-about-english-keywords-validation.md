# 关于页英文关键词核对

范围：仅将关于页兴趣图谱的节点名称、静态回退内容、关联元数据、链接名称、图片替代文本及图谱辅助说明统一为英文。站点导航与其他页面继续使用原有语言。节点 ID、层级、连线和图片资源不变。

## 名称来源

- 荒野大镖客2 → **Red Dead Redemption 2**：[Rockstar Games](https://www.rockstargames.com/reddeadredemption2)。
- 极乐迪斯科 → **Disco Elysium**：[作品官网](https://discoelysium.com/)。
- 轻音少女 → **K-ON!**：[Sentai 发行目录](https://www.sentaifilmworks.com/blogs/catalog/k-on-season-1)。
- EVA → **Neon Genesis Evangelion**：[GKIDS 发行页面](https://store.gkids.com/pages/neon-genesis-evangelion)，与现有推荐链接指向的剧集一致；配图保留用户指定的 Evangelion 系列群像。
- 我表示理解 → **I Understand**：[Apple Music 艺人访谈与曲目说明](https://music.apple.com/us/album/1864543075?i=1864543213)。
- 给自己的情书 → **Love Letter to Myself**：采用[MusicBrainz 收录的英文标题](https://musicbrainz.org/release/f51d4d6c-02a5-4794-a99a-9fde9ebadc0e)。

中心关键词采用 Computer Science、Stream of Consciousness、Code、Existentialism、Philosophy。主分支采用 Music、Programming、Anime、Games。

## 验证

- 图谱 5 个单元测试文件、77 项测试通过。
- 浏览器检查覆盖桌面长标题、作品图片展开与关闭、类别展开、缩放复位、关联高亮、320px/390px 总览及项目/技术栈/游戏/动画分支、无 Canvas、无 JavaScript 回退。六项场景均通过；第一次桌面运行遇到一次类别未展开，未修改代码的单独复测通过。
- 新增到既有标签检查的断言确认文字未被横向或纵向裁切。静态回退检查确认不存在中文关键词。
- 生产构建通过，生成 44 个页面；日志为 `/tmp/about-english-keywords-build.log`。
- 截图保存在 `test-results/about-english-keywords/`，测试日志位于 `/tmp/about-english-keywords-unit.log`、`/tmp/about-english-keywords-browser.log` 和 `/tmp/about-english-keywords-desktop-recheck.log`。
