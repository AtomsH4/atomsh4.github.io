# 推荐图片直链与来源审计

更新日期：2026-11-15。11 件作品均已逐项重新检索、核对作品与版本，并在实际浏览器中通过 `crossorigin="anonymous"` 图片加载检查。这个检查同时验证浏览器能解码图片和跨域引用，覆盖普通页面图片与 Three.js 纹理所需的基础条件。

下面都是 HTTPS 图片资源地址，无需登录、API 密钥或带过期时间的签名。页面直接引用上游资源，保留来源署名；不把第三方位图保存进仓库。

| 作品 | 图片直链 | 实测像素 | 来源页 | 核对结果 |
| --- | --- | --- | --- | --- |
| 我表示理解 | [打开图片](https://p1.music.126.net/V34GxyIJdz7vcdptDI_g-g==/109951172495731859.jpg) | 3000 × 3000 | [网易云音乐](https://music.163.com/album?id=356292038) | 目标歌曲收录于《纯妹妹》；使用对应专辑封面。 |
| Leave the Door Open | [打开图片](https://p2.music.126.net/Rhm3ri2G5IUnQdXJuPY7fw==/109951167091309142.jpg) | 1425 × 1425 | [网易云音乐](https://music.163.com/album?id=135905816) | 使用收录目标歌曲的《An Evening With Silk Sonic》专辑封面。 |
| 给自己的情书 | [打开图片](https://p1.music.126.net/E0ynLFbtqou5cu1iJrvUEQ==/109951163081327547.jpg) | 768 × 768 | [网易云音乐](https://music.163.com/album?id=29698) | 使用原收录专辑《寓言》封面。 |
| Back in Black | [打开图片](https://upload.wikimedia.org/wikipedia/commons/9/92/ACDC_Back_in_Black.png) | 1428 × 1428 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:ACDC_Back_in_Black.png) | 使用明确对应 AC/DC 专辑的 PNG 原图。 |
| 月亮与六便士 | [打开图片](https://cdn.jsdelivr.net/gh/standardebooks/w-somerset-maugham_the-moon-and-sixpence@master/images/cover.jpg) | 1400 × 2100 | [Standard Ebooks](https://standardebooks.org/ebooks/w-somerset-maugham/the-moon-and-sixpence) | 保留 Standard Ebooks 原版封面，改用 jsDelivr 图片直链。 |
| 献给阿尔吉侬的花束 | [打开图片](https://covers.openlibrary.org/b/id/10331950-L.jpg) | 315 × 500 | [Open Library](https://openlibrary.org/books/OL28677690M) | 使用经书名和作者核对的 Harcourt 英文小说版封面。 |
| 活着 | [打开图片](https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1670922347i/66093249.jpg) | 814 × 1100 | [Goodreads](https://www.goodreads.com/book/show/66093249) | 使用可辨识中文书名和余华署名的书籍封面。 |
| 机智的医生生活 | [打开图片](https://media.themoviedb.org/t/p/w780/9JM1O5N8wYLgtROBXjvganJUn0p.jpg) | 780 × 1170 | [TMDB](https://www.themoviedb.org/tv/96102) | 2020 年剧集海报。 |
| 给阿嬷的情书 | [打开图片](https://media.themoviedb.org/t/p/w780/s0sC3hPPX4OobLNfdl2iSs2vtvI.jpg) | 780 × 1170 | [TMDB](https://www.themoviedb.org/movie/1671548) | 2026 年电影海报，替换旧预告片缩略图。 |
| 新世纪福音战士 | [打开图片](https://media.themoviedb.org/t/p/w780/63ln23NAtdXdAh41HwpibxgJElM.jpg) | 780 × 1170 | [TMDB](https://www.themoviedb.org/tv/890) | 1995 年原版动画海报。 |
| 怦然心动 | [打开图片](https://media.themoviedb.org/t/p/w780/tOp4DkdonY1a1AS5ESWDia8JP63.jpg) | 780 × 1170 | [TMDB](https://www.themoviedb.org/movie/43949) | 2010 年电影海报。 |

## 验证记录

- 11/11 张图片在浏览器中以匿名跨域方式成功加载，均返回有效宽高；不存在 1 像素占位图。
- 选定链接无需在页面运行时调用检索 API，也不依赖 Netflix 区域图片地址或 Cover Art Archive 发行组封面跳转。
- 部分候选地址在普通 HTTP 工具中可用、在浏览器中失败；最终以实际浏览器的匿名跨域加载结果为准。
- 音乐使用收录目标歌曲的专辑封面；书籍与影视分别核对小说版本、剧集年份和电影年份。
- 上游 CDN 与 CORS 策略仍可能变化；原有生成封面降级保留。

## 来源与使用边界

图片用于作品识别，公开直链不等于获得原作再分发许可。Wikimedia 的具体文件说明、Standard Ebooks 的项目声明与其他平台图片各自的来源信息分别保留，不把某一来源的许可解释扩展到其他图片。
