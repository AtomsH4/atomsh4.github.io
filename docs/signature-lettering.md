# 首页 AtomsH 花体字形

首页的 `AtomsH` 使用 Allura 字形，由 HarfBuzz 排版后转换为 SVG 轮廓；书写显现轨迹单独手工制作。相比之前的 Great Vibes，减少大回环与长尾装饰，保留清楚的大写 A、H 和完整连笔。对 o→m、s→H 补充细笔连接，使六个字母成为连续签名。s→H 接口与 H 左下回弯使用同一连续轮廓，粗细平滑过渡，避免细连接与原字形重叠形成缺口。运行时仅使用本地 SVG 路径和 CSS，不加载字体文件或第三方字体服务。

- 字体：Allura Regular，The Allura Project Authors。
- 上游：[googlefonts/allura](https://github.com/googlefonts/allura)。
- 轮廓来源：[Google Fonts Allura-Regular.ttf](https://github.com/google/fonts/blob/main/ofl/allura/Allura-Regular.ttf)，本次通过 Google Fonts 官方字体服务取得。
- 许可：SIL Open Font License 1.1，完整文本保存在 `public/media/signature/OFL.txt`。
- 字形与书写轨迹：`src/features/home/signature-artwork.ts`。
- 渲染与书写动画：`src/components/HomeSignature.astro`。

六个字母使用独立遮罩，十二条白色轨迹按手写顺序展开，显示对应的填充字形。s→H 连接与 H 左侧主笔由同一条轨迹连续书写。书写在 2.82 秒完成；完成后的遮罩完整覆盖所有字形，不需要用额外淡入补齐笔画。完整文字的实心像素属于同一个连接区域，确保字母之间没有断开的笔画。减少动态效果时移除遮罩并直接展示静态字形。

全屏 `HomeIntro` 中的签名按笔画书写，结束后停留 320ms，再用 1200ms 等比缩放并移动到首页标题的实际位置。全屏底色独立淡出，花体保持可见，到位后衔接首页中的静态字形。`HomeSignature` 的 `animated={false}` 用于首页静态标题，不生成遮罩或书写动画；开场遮罩使用单独的 ID 前缀，避免多份 SVG 相互引用。

最终字形定位在卡片左上角，以相对于自身尺寸的负位移轻微超出顶部和左侧，由卡片隐藏溢出。开场移动时同步将裁切范围从全屏收敛到卡片圆角边界，确保移动层和静态层衔接时的裁切一致；英文引语固定在卡片右下角。

点击屏幕任意位置即可跳过，保留 Esc、Tab 和滚轮；减少动态效果时直接展示最终页面。无 JavaScript 时由 CSS 自动淡出开场并展示静态标题，JavaScript 增强负责位移、遮罩清理、恢复滚动和响应跳过操作。移动中改变尺寸时立即在当前布局完成衔接，避免旧落点造成偏移。
