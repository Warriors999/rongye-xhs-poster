# 绒页 Pinterest 与 iOS UI 修订计划

**Goal:** 在保留原品牌的前提下，把图片优先、分组表单、浮动工具和最近作品结构落到真实网页。

**Architecture:** 沿用 Next.js、React、现有 IndexedDB 和生成流程。只改 UI 组件与专用 CSS；作品库切换通过 hidden 保持创作流程挂载。原进入页与加载内容固定。

**Tech Stack:** React 19、Next.js 15、CSS、Vitest、Playwright。

- [x] 调整 UploadScreen 与 ImagePicker：移除额外横幅、放大上传主卡、图片叠层、分组输入与可横滑灵感。
- [x] 新增 RecentProjects：读取真实最近 3 个本地项目，可恢复；读取失败显示轻量说明，不伪造数据。
- [x] 调整 Wizard：紧凑浮动双导航；导航到作品库时保留创作挂载，避免取消在途生成。
- [x] 重写 rongye.css：一致字级、间距、内容圆角、材料层、独立生成动作、focus 状态和 reduced-motion/reduced-transparency。
- [x] 沿用上传、作品库与手机 E2E；新增导航过程不取消生成的有意义测试；修正因展示文案变化的现有断言。
- [x] 生产构建后浏览器截取进入、首屏、输入、结果、库截图，视觉检查，生成新对照板，重启本机预览并交付。
