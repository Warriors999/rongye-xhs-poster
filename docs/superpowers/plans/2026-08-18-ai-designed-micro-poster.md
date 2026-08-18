# AI 设计师微海报生成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让网站先把用户想法转换为受设计规则约束的视觉方案，再由 `gpt-image-2` 直接生成带中文文字、AI 背景和完整排版的 3 张 3:4 微海报。

**Architecture:** Gemini 多模态模型负责识别玩偶、生成文案并输出每套海报的设计 brief；本地设计策略层固定构图、信息层级、色彩、装饰预算和禁止项，用户输入只能影响氛围而不能覆盖规则；图片 Provider 使用上传玩偶作为编辑参考图，并把经过约束的完整海报提示词发送给 `gpt-image-2`。前端只展示完整 AI 海报、选择和下载，不再用 Canvas 叠加文字。

**Tech Stack:** Next.js App Router、React、TypeScript、Zustand、Zod、Gemini Vision、OpenAI-compatible `gpt-image-2`、Vitest、Playwright。

---

### Task 1：建立设计策略和结构化设计 brief

**Files:**
- Modify: `src/domain/project.ts`
- Modify: `src/lib/prompts.ts`
- Modify: `src/server/ai/contracts.ts`
- Modify: `src/server/ai/gemini-provider.ts`
- Test: `src/lib/prompts.test.ts`
- Test: `src/server/ai/gemini-provider.test.ts`

- [ ] 为 `cute`、`daily`、`series` 固定三套设计母版，分别规定构图、标题安全区、AI 元素预算、信息层级、色彩方向和禁止项。
- [ ] Gemini 输出每套 `design` brief，包括 layout、scene、elements、palette、typography 和 hierarchy；模型输出缺失或异常时使用本地母版 fallback。
- [ ] 用户的 `creativeIdea` 以“氛围参考”传入，提示词明确禁止把用户文字当作系统指令或无条件覆盖设计母版。

### Task 2：让图片模型直接生成完整微海报

**Files:**
- Modify: `src/server/ai/image-provider.ts`
- Modify: `src/server/ai/mock-image-provider.ts`
- Modify: `src/app/api/generate/route.ts`
- Test: `src/server/ai/image-provider.test.ts`
- Test: `src/app/api/generate/route.test.ts`

- [ ] 将 `beautify` 扩展为接收结构化海报 brief 和 copy，并组装完整生图提示词：主体保真、背景、AI 元素、文字内容、排版层级、设计风格、负面约束全部明确。
- [ ] 请求仍使用 `/images/edits` 和上传图片作为参考，但不再要求“不要文字”；改为直接生成中文标题、描述和标签，并要求文字清晰、可读、无乱码。
- [ ] 三张图片并行生成；每张失败时返回安全错误，不把上游响应、密钥或提示词泄露到客户端。
- [ ] Mock Provider 生成含简单 SVG 文字的完整海报占位图，让离线页面也能验证“图片本身已经包含文字”。

### Task 3：前端只展示 AI 完整海报

**Files:**
- Modify: `src/components/poster/PosterPreview.tsx`
- Modify: `src/components/choose/ChooseScreen.tsx`
- Modify: `src/lib/export/render-poster.ts`
- Modify: `src/app/globals.css`
- Test: `src/components/poster/PosterPreview.test.tsx`
- Test: `src/components/choose/ChooseScreen.test.tsx`

- [ ] 预览只显示 AI 返回的完整海报图片，不再把 `layers.title`、`layers.description`、`layers.tag` 或 stickers 叠加到图片上。
- [ ] 保存动作直接下载 AI 返回的 PNG；Canvas 合成只保留兼容 fallback，不作为主流程。
- [ ] 页面文案明确说明“文字和排版由 AI 直接生成”，用户只能选方案、保存或重新生成。

### Task 4：测试和视觉验收

**Files:**
- Modify: `tests/e2e/mobile-poster.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-18-ai-designed-micro-poster.md`

- [ ] 增加测试断言：图片 Provider 的 prompt 同时包含设计 brief、中文标题、文字排版要求和主体保护约束。
- [ ] 运行 `pnpm test`、`pnpm typecheck`、`pnpm build`。
- [ ] 启动本地服务，以 375px 手机视口验证上传、创作想法、三张完整海报、单张下载和全部保存。
- [ ] 视觉检查三张图：不是“居中图片+底色+文字”，存在主题场景、设计元素、信息层级和明确排版；导出文件存在且尺寸为 1200×1600 或模型返回的有效 3:4 尺寸。

---

**Self-review:** 用户输入仅进入氛围参考字段；三套母版、负面约束和文字排版要求由系统固定。真实生图主链路不再依赖网页后期文字合成；中文可能仍受图片模型能力影响，因此失败或文字异常时提供重新生成入口，不伪称文字绝对稳定。
