# 简化 AI 海报生成流程实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将手机端工具收敛为“上传图片、输入可选创作想法、AI 生成三张完整海报、单张或全部保存”的最短流程。

**Architecture:** 保留现有 Next.js 单页向导和 Zustand 会话状态，将用户创作想法从上传页传到 Gemini 文案分析；服务端生成接口在文案结果基础上并行调用三种图片美化方向。前端选择页直接完成完整海报的浏览器端合成与下载，不再进入手动编辑页。

**Tech Stack:** Next.js App Router、React、TypeScript、Zustand、Zod、Canvas、Vitest、React Testing Library、Playwright。

---

### Task 1：收敛产品数据和提示词输入

**Files:**
- Modify: `src/domain/project.ts`
- Modify: `src/lib/prompts.ts`
- Modify: `src/server/ai/provider.ts`
- Modify: `src/server/ai/contracts.ts`
- Modify: `src/app/api/generate/route.ts`
- Modify: `src/components/upload/UploadScreen.tsx`
- Modify: `src/components/generation/GenerationScreen.tsx`
- Modify: `src/store/use-poster-store.ts`

- [x] 新增 `creativeIdea` 字段并限制为 500 字；上传页提供可选输入框，空白时明确提示“留空也可以”。
- [x] 提示词把创作想法作为用户资料数据传给 Gemini，要求文案和三套方向围绕想法，但不改变真实玩偶。
- [x] 生成请求带上 `creativeIdea`，服务端 schema 和 Provider 输入同步接收。

### Task 2：服务端生成三套 AI 视觉

**Files:**
- Modify: `src/server/ai/image-provider.ts`
- Modify: `src/app/api/generate/route.ts`
- Modify: `src/server/ai/mock-image-provider.ts`

- [x] 为三套风格建立可解释的图片美化映射：可爱种草、手作日常、系列账号。
- [x] `/api/generate` 在文案生成后并行请求三张视觉图，失败时返回安全错误，不泄露上游内容。
- [x] Mock Provider 保持离线测试可用，并让每套结果的 `image.id` 可区分。

### Task 3：选择页直接保存完整海报

**Files:**
- Create: `src/lib/export/render-poster.ts`
- Modify: `src/components/choose/ChooseScreen.tsx`
- Modify: `src/components/poster/PosterPreview.tsx`
- Modify: `src/app/globals.css`

- [x] 用 Canvas 将 AI 图片、背景、清晰中文标题、描述、标签和少量装饰合成为 3:4 PNG。
- [x] 选择页提供“保存这张”和“全部保存”，并保留重新生成。
- [x] 下载失败时提示长按预览图保存，不进入编辑页。

### Task 4：移除编辑链路并更新测试

**Files:**
- Modify: `src/components/wizard/Wizard.tsx`
- Modify: `src/components/common/ProgressDots.tsx`
- Modify: `src/components/export/ExportScreen.tsx`
- Modify: `tests/e2e/mobile-poster.spec.ts`
- Modify: `src/components/choose/ChooseScreen.test.tsx`
- Modify: `src/components/upload/UploadScreen.test.tsx`
- Modify: `src/components/generation/GenerationScreen.test.tsx`
- Modify: `src/store/use-poster-store.test.ts`

- [x] 向导只呈现上传、生成、选择三个步骤，选择后不再渲染 EditorScreen。
- [x] 过渡状态保留旧 API 方法以避免无关编辑单元测试失效，但用户路径不再可达。
- [x] 覆盖创作想法传输、三张海报、单张/全部保存和移动端核心路径。

### Task 5：验收

- [x] 运行 `pnpm test`，确认单元测试无失败。
- [x] 运行 `pnpm typecheck` 和 `pnpm build`。
- [x] 按 `webapp-testing` 技能先查看 `with_server.py --help`，再用 Playwright 验证手机视口上传、填写想法、生成三张和保存按钮。
- [x] 检查页面截图、按钮可见性和控制台错误。

---

**自检：** 需求已覆盖上传、可选提示词、AI 文案、三套视觉、完整合成、单张下载、全部保存、重新生成和移动端验证；不新增登录、作品库或复杂编辑器。
