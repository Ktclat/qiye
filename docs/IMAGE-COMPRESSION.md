# 图片压缩与壁纸本地优化

适用范围：桌面「图片压缩」原生组件，以及壁纸中心「选择本地图片或视频」上传入口。

## 产品行为

- **图片压缩组件**：在「添加 → 小组件 → 工具」添加「图片压缩」，点击卡片打开独立窗口。选择或拖入静态 PNG、JPEG、WebP（上限 32 MiB），通过 70%–98% 的画质滑块选择 WebP 有损编码强度，然后查看图片尺寸、原始/输出字节数、节省比例和前后滑块对比。结果通过浏览器下载；**不写入桌面 JSON、历史或 WebDAV**。
- **壁纸自动压缩**：选择本地静态 PNG、JPEG、WebP 后，在读取为 Data URL 前先尝试 WebP 画质 94%、90%、86%、82%、78%（降序）。选择第一张符合 4 MiB 及节省空间门槛的高画质结果。已符合上限但压缩后未明显变小的图片保留原始文件。超过上限且无法压缩至合格体积时，报错且不修改已选壁纸。
- GIF、AVIF、MP4、WebM 保留现有上传方式，只允许不超过 4 MiB 的文件；动画 PNG 和动画 WebP 不被静默展平。已符合上限的动画 PNG/WebP 会直接保存原文件，超过上限的动画文件需由用户另行处理。
- 不变更图片像素宽高、不在后台上传、不请求其他浏览器权限。使用 Blob 处理，只有最终选用的壁纸才转换为 Base64 Data URL 并保存。
- 图像解码可能修正 EXIF 方向并更改 ICC/EXIF 等元数据；WebP 有损编码会改变像素，不是严格无损。用户如需原始字节完整保留，使用未压缩的原始文件。

## 技术决策

1. 使用浏览器标准 API：`createImageBitmap` 解码、Canvas `toBlob('image/webp', quality)` 编码、Blob URL 本机预览。Qiye 的 Chrome/Edge MV3 和单文件预览都不需要增加二进制依赖或服务端。
2. 所有图片临时状态保存在工作台的闭包中；窗口关闭撤销 Object URL、取消未完成的逻辑提交。压缩失败不删除原文件。
3. 编码只能在结果至少减少 2%（工具）或 3%（壁纸）时被采用；不会把压缩后更大的文件写入存储。
4. 动画 GIF、AVIF 与视频不在当前压缩范围；APNG/WebP 动画的关键帧不由静态 Canvas 决定。首次实现先确保不会在未告知时丢失动画。
5. 在真实网页预览和扩展中测试深浅色、窄屏、键盘进入、拖拽文件、连续更换文件、图片分辨率/输入字节限制、WebDAV 同步和动画保留。逻辑测试单独覆盖无收益结果、尺寸、限制与取消。

## 后续：真正无损的高级模式

首版**没有**真正像素无损的优化器。若后续添加：
- 使用 Oxipng（PNG 无损重编码）与 libwebp `lossless`/`near_lossless` 模式。PNG 优化应设置不改写透明像素信息的选项，并明确像素无损与元数据原样保留不是同一回事。
- jSquash 提供浏览器 WASM 封装。Qiye 当前 `scripts/build-preview.py` 只内联具名的相对 ES Module 和部分静态资源，不支持开箱即用的 npm 动态导入/WASM，因此必须先扩展预览构建、打包资源与 MV3 CSP 配置，再考虑多线程/Worker。
- 高分辨率、HDR、ICC 色彩空间、EXIF 方向、逐像素对照和 SSIM 等自动感知质量门槛，应作为独立测试范围，不能只看编码器的 quality 数值就宣称视觉无损。

## 技术资料与许可

- Google [WebP 压缩与 `cwebp` 选项](https://developers.google.com/speed/webp/docs/cwebp)：有损、无损与 near_lossless 模式说明。
- MDN [Canvas toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)：浏览器支持的编码格式、quality 与 Blob 行为。
- [Squoosh](https://github.com/GoogleChromeLabs/squoosh)：界面交互与对比预览参考，未复制其源代码。
- [jSquash](https://github.com/jamsinclair/jSquash)、[Oxipng](https://github.com/shssoichiro/oxipng)、[libwebp](https://github.com/webmproject/libwebp)：下一阶段编码方案，当前版本未引入或分发这些 WASM 库。

源码位置：`src/image-compression.js`、`src/image-compressor-workspace.js`、`src/widget-image-compressor.js`、`src/image-compressor.css`、`tests/image-compression.test.mjs`。
