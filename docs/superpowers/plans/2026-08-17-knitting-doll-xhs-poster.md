# 针织玩偶小红书微海报工具实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐项执行。每一步使用复选框跟踪。

**目标：** 构建一个手机端私用 Web 工具，让用户上传一张针织玩偶照片，生成三套 3:4 小红书微海报，选择后编辑文字、表情和背景，并下载成品。

**架构：** 使用单个 Next.js App Router 应用承载手机端界面和服务端 AI 代理。前端使用 Zustand 管理单次制作流程，图片仅在当前浏览器会话和 AI 请求期间存在，不建立数据库、账号和公共存储。AI 能力通过统一 Provider 接口接入，开发环境使用 Mock Provider，配置真实 OpenAI-compatible 服务后切换到真实生成。

**技术栈：** Next.js App Router、React、TypeScript、CSS Custom Properties、Zustand、Konva、react-konva、Zod、Vitest、React Testing Library、Playwright。

---

## 实施前提

- 当前目录没有现有应用代码和 Git 仓库；执行阶段从空的 Next.js 应用开始。
- 首版采用单页面向导，不拆成多个 URL，避免手机端路由切换导致图片 Blob 丢失。
- 默认使用 Mock Provider 让上传、三套方案、编辑和导出流程可以离线验收；真实 AI 通过服务端环境变量启用。
- 不设置数据库、登录、公共作品库、分析埋点或自动发布小红书。
- 图片只在浏览器内存中保留；离开当前制作流程时由显式清理动作释放状态。
- 视觉验收尺寸固定包含 375×812 和 390×844 两个手机视口。

## 文件结构总览

### 创建

- `package.json`：依赖和脚本。
- `tsconfig.json`：TypeScript 配置。
- `next.config.mjs`：Next 配置。
- `vitest.config.ts`：单元测试配置。
- `playwright.config.ts`：移动端 E2E 配置。
- `.env.example`：AI Provider 配置说明，不含密钥。
- `src/app/layout.tsx`：全局布局、viewport 和移动端元数据。
- `src/app/page.tsx`：单页向导入口。
- `src/app/globals.css`：设计令牌、页面布局、控件和响应式样式。
- `src/app/manifest.webmanifest`：可选添加到手机主屏幕的 Web App Manifest。
- `src/domain/project.ts`：项目、海报方案、图层和向导状态类型。
- `src/domain/editor.ts`：图层编辑纯函数。
- `src/domain/editor.test.ts`：图层编辑测试。
- `src/store/use-poster-store.ts`：单次制作流程状态。
- `src/store/use-poster-store.test.ts`：向导状态测试。
- `src/lib/ids.ts`：生成稳定的短 ID。
- `src/lib/image/resize-image.ts`：图片格式、大小和尺寸处理。
- `src/lib/image/resize-image.test.ts`：图片处理测试。
- `src/lib/prompts.ts`：视觉识别、文案和三种海报风格提示词。
- `src/server/ai/contracts.ts`：AI Provider 输入输出契约。
- `src/server/ai/provider.ts`：Provider 选择器。
- `src/server/ai/mock-provider.ts`：离线开发用 Provider。
- `src/server/ai/openai-compatible-provider.ts`：真实 OpenAI-compatible Provider。
- `src/app/api/generate/route.ts`：服务端生成接口。
- `src/components/wizard/Wizard.tsx`：向导步骤分发。
- `src/components/common/ProgressDots.tsx`：步骤进度。
- `src/components/common/StatusBanner.tsx`：错误、成功和提示状态。
- `src/components/upload/UploadScreen.tsx`：上传首页。
- `src/components/upload/ImagePicker.tsx`：相册和相机入口。
- `src/components/generation/GenerationScreen.tsx`：生成状态页。
- `src/components/choose/ChooseScreen.tsx`：三套海报选择页。
- `src/components/poster/PosterPreview.tsx`：海报缩略预览。
- `src/components/editor/EditorScreen.tsx`：编辑页。
- `src/components/editor/PosterStage.tsx`：Konva 画布和图层交互。
- `src/components/editor/TextControls.tsx`：文字编辑控制。
- `src/components/editor/StickerControls.tsx`：表情编辑控制。
- `src/components/editor/BackgroundControls.tsx`：图片和背景切换控制。
- `src/components/export/ExportScreen.tsx`：导出完成页。
- `src/lib/export/export-poster.ts`：PNG／JPG 导出。
- `src/lib/privacy/clear-session.ts`：清理当前会话。
- `src/app/error.tsx`：全局错误页。
- `src/app/loading.tsx`：全局加载页。
- `tests/e2e/mobile-poster.spec.ts`：手机端完整流程测试。

### 不创建

- 数据库 schema；
- 用户认证模块；
- 公共上传目录；
- 服务器持久化图片目录；
- 社区、模板市场、支付和统计模块。

---

## Task 1：初始化 Next.js 应用和移动端设计令牌

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `.env.example`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/manifest.webmanifest`

- [ ] **Step 1: 创建依赖和脚本**

在 `package.json` 中写入以下内容：

```json
{
  "name": "knitting-doll-poster",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "konva": "^9.3.18",
    "next": "^15.4.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-konva": "^19.0.7",
    "zod": "^3.25.0",
    "zustand": "^5.0.5"
  },
  "devDependencies": {
    "@playwright/test": "^1.53.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^22.15.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "jsdom": "^26.1.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

运行：

```bash
npm install
```

预期：依赖安装成功，生成 `package-lock.json`。

- [ ] **Step 2: 配置 TypeScript、Next 和测试环境**

`tsconfig.json` 使用 Next 默认配置并开启严格模式：

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", ".next/types/**/*.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

`vitest.config.ts`：

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    css: true,
    globals: true
  }
});
```

同时创建 `tests/setup.ts`：

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: 建立全局视觉令牌**

在 `src/app/globals.css` 中定义：

```css
:root {
  --bg: #fffaF4;
  --surface: #fffdf9;
  --ink: #2c2524;
  --muted: #827572;
  --accent: #d87568;
  --pink: #f3a9a2;
  --lilac: #d9c9e8;
  --sage: #c9d8c5;
  --line: #eee2d7;
  --danger: #b94d4d;
  --success: #60856c;
  --radius-card: 20px;
  --radius-control: 14px;
  --touch-target: 44px;
}

* { box-sizing: border-box; }
html { background: var(--bg); }
body {
  margin: 0;
  min-width: 320px;
  background: var(--bg);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}
button, input, textarea, select { font: inherit; }
button { cursor: pointer; }
button:focus-visible, input:focus-visible, textarea:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--accent) 45%, white);
  outline-offset: 2px;
}
```

继续补充 `.app-shell`、`.screen-container`、`.primary-button`、`.secondary-button`、`.mobile-bottom-bar` 和 `.safe-bottom`，保证 375px 宽度下无横向滚动，并使用 `env(safe-area-inset-bottom)` 处理 iPhone 底部安全区。

- [ ] **Step 4: 创建根布局和占位入口**

`src/app/layout.tsx`：

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "针织小物｜小红书微海报",
  description: "把玩偶照片快速变成小红书微海报"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fffaF4"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx` 先渲染 `<main className="app-shell"><h1>针织小物</h1></main>`，确保首个页面可启动。

- [ ] **Step 5: 验证初始化**

运行：

```bash
npm run build
npm run test
```

预期：构建成功，测试命令显示无测试文件但退出码为 0，或显示后续任务加入前的空测试集合。

---

## Task 2：建立领域类型、向导状态和纯函数编辑模型

**Files:**

- Create: `src/domain/project.ts`
- Create: `src/domain/editor.ts`
- Create: `src/domain/editor.test.ts`
- Create: `src/store/use-poster-store.ts`
- Create: `src/store/use-poster-store.test.ts`
- Create: `src/lib/ids.ts`

- [ ] **Step 1: 先写图层编辑失败测试**

在 `src/domain/editor.test.ts` 中覆盖：

```ts
import { describe, expect, it } from "vitest";
import {
  addSticker,
  moveLayer,
  updateTextLayer,
  removeLayer,
  resetDraft
} from "./editor";
import { createEmptyDraft } from "./project";

describe("poster editor reducer functions", () => {
  it("moves a layer while keeping unrelated fields", () => {
    const draft = createEmptyDraft();
    const next = moveLayer(draft, "title", 80, 120);
    expect(next.layers.title).toMatchObject({ x: 80, y: 120 });
    expect(next.layers.title.type).toBe("text");
  });

  it("updates only the requested text properties", () => {
    const draft = createEmptyDraft();
    const next = updateTextLayer(draft, "title", { text: "今天也要可可爱爱", fill: "#d87568" });
    expect(next.layers.title).toMatchObject({
      text: "今天也要可可爱爱",
      fill: "#d87568"
    });
    expect(next.layers.title.fontSize).toBe(draft.layers.title.fontSize);
  });

  it("adds and removes a sticker", () => {
    const draft = createEmptyDraft();
    const withSticker = addSticker(draft, "♡");
    expect(Object.values(withSticker.layers)).toHaveLength(3);
    const stickerId = Object.keys(withSticker.layers).find((id) => id.startsWith("sticker-"));
    expect(stickerId).toBeDefined();
    expect(removeLayer(withSticker, stickerId!)).toEqual(draft);
  });

  it("restores the initial poster draft", () => {
    const draft = addSticker(createEmptyDraft(), "✦");
    expect(resetDraft(draft)).toEqual(createEmptyDraft());
  });
});
```

运行：

```bash
npm test -- src/domain/editor.test.ts
```

预期：FAIL，因为类型和纯函数尚未创建。

- [ ] **Step 2: 定义领域类型**

在 `src/domain/project.ts` 中定义：

```ts
export type WizardStep = "upload" | "generating" | "choose" | "edit" | "exported";
export type BeautifyMode = "original" | "craft" | "studio";
export type PosterStyle = "cute" | "daily" | "series";
export type LayerId = "title" | "description" | "tag" | `sticker-${string}`;

export type ImageAsset = {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  source: "upload" | "beautified";
  mode?: BeautifyMode;
};

export type CopyData = {
  title: string;
  description: string;
  tags: string[];
};

export type TextLayer = {
  type: "text";
  id: "title" | "description" | "tag";
  text: string;
  x: number;
  y: number;
  width: number;
  fontFamily: string;
  fontSize: number;
  fill: string;
  align: "left" | "center" | "right";
};

export type StickerLayer = {
  type: "sticker";
  id: `sticker-${string}`;
  emoji: string;
  x: number;
  y: number;
  scale: number;
};

export type PosterLayers = Record<string, TextLayer | StickerLayer>;

export type PosterDraft = {
  style: PosterStyle;
  image: ImageAsset;
  copy: CopyData;
  background: string;
  layers: PosterLayers;
};

export type GenerationInput = {
  image: ImageAsset;
  keywords: string;
  forbiddenWords: string;
};

export type GenerationResult = {
  analysis: {
    subject: string;
    colors: string[];
    material: string;
    details: string[];
  };
  posters: PosterDraft[];
};

export function createEmptyDraft(): PosterDraft {
  return {
    style: "cute",
    image: {
      id: "empty",
      dataUrl: "",
      width: 3,
      height: 4,
      source: "upload"
    },
    copy: {
      title: "今天也要可可爱爱",
      description: "软乎乎的针织小伙伴，正在认真营业。",
      tags: ["#针织玩偶", "#手作日常", "#小红书配图"]
    },
    background: "#f8e5df",
    layers: {
      title: {
        type: "text",
        id: "title",
        text: "今天也要可可爱爱",
        x: 24,
        y: 28,
        width: 312,
        fontFamily: "PingFang SC",
        fontSize: 30,
        fill: "#2c2524",
        align: "left"
      },
      description: {
        type: "text",
        id: "description",
        text: "软乎乎的针织小伙伴",
        x: 24,
        y: 72,
        width: 312,
        fontFamily: "PingFang SC",
        fontSize: 16,
        fill: "#827572",
        align: "left"
      }
    }
  };
}
```

- [ ] **Step 3: 实现纯函数编辑操作**

在 `src/domain/editor.ts` 中实现不可变函数：

```ts
import type { LayerId, PosterDraft, StickerLayer, TextLayer } from "./project";
import { createId } from "@/lib/ids";

export function moveLayer(
  draft: PosterDraft,
  layerId: LayerId,
  x: number,
  y: number
): PosterDraft {
  const layer = draft.layers[layerId];
  if (!layer) return draft;
  return {
    ...draft,
    layers: {
      ...draft.layers,
      [layerId]: { ...layer, x, y }
    }
  };
}

export function updateTextLayer(
  draft: PosterDraft,
  layerId: "title" | "description" | "tag",
  patch: Partial<Pick<TextLayer, "text" | "fontFamily" | "fontSize" | "fill" | "align">>
): PosterDraft {
  const layer = draft.layers[layerId];
  if (!layer || layer.type !== "text") return draft;
  return {
    ...draft,
    layers: { ...draft.layers, [layerId]: { ...layer, ...patch } }
  };
}

export function addSticker(draft: PosterDraft, emoji: string): PosterDraft {
  const id = `sticker-${createId()}` as `sticker-${string}`;
  const sticker: StickerLayer = {
    type: "sticker",
    id,
    emoji,
    x: 280,
    y: 420,
    scale: 1
  };
  return { ...draft, layers: { ...draft.layers, [id]: sticker } };
}

export function removeLayer(draft: PosterDraft, layerId: LayerId): PosterDraft {
  if (!draft.layers[layerId]) return draft;
  const layers = { ...draft.layers };
  delete layers[layerId];
  return { ...draft, layers };
}

export function resetDraft(draft: PosterDraft): PosterDraft {
  return createEmptyDraft();
}
```

- [ ] **Step 4: 实现 Zustand 状态**

`src/store/use-poster-store.ts` 暴露：

```ts
type PosterStore = {
  step: WizardStep;
  upload: ImageAsset | null;
  keywords: string;
  forbiddenWords: string;
  generation: GenerationResult | null;
  selectedDraft: PosterDraft | null;
  error: string | null;
  setUpload: (asset: ImageAsset) => void;
  setKeywords: (value: string) => void;
  setForbiddenWords: (value: string) => void;
  startGeneration: () => void;
  setGeneration: (result: GenerationResult) => void;
  selectDraft: (draft: PosterDraft) => void;
  updateDraft: (updater: (draft: PosterDraft) => PosterDraft) => void;
  goBack: () => void;
  clearError: () => void;
  resetSession: () => void;
};
```

状态转换必须限制为：

```text
upload → generating → choose → edit → exported
                ↘ upload（失败重试）
choose → generating（重新生成）
edit → choose（返回选方案）
exported → upload（重新制作）
```

- [ ] **Step 5: 运行领域测试**

运行：

```bash
npm test -- src/domain/editor.test.ts src/store/use-poster-store.test.ts
```

预期：PASS。测试必须证明修改标题不会改变字号，删除贴纸不会删除文本层，重置会恢复初始草稿。

---

## Task 3：实现上传、图片处理和首页

**Files:**

- Create: `src/lib/image/resize-image.ts`
- Create: `src/lib/image/resize-image.test.ts`
- Create: `src/components/upload/ImagePicker.tsx`
- Create: `src/components/upload/UploadScreen.tsx`
- Modify: `src/components/wizard/Wizard.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: 写图片处理测试**

覆盖以下行为：

```ts
it("rejects unsupported files", async () => {
  await expect(normalizeImage(new File(["x"], "note.txt", { type: "text/plain" })))
    .rejects.toThrow("请选择 JPG、PNG 或 WebP 图片");
});

it("rejects files larger than 12MB", async () => {
  const file = new File([new Uint8Array(12 * 1024 * 1024 + 1)], "large.jpg", {
    type: "image/jpeg"
  });
  await expect(normalizeImage(file)).rejects.toThrow("图片不能超过 12MB");
});
```

- [ ] **Step 2: 实现 `normalizeImage`**

`src/lib/image/resize-image.ts` 提供：

```ts
export async function normalizeImage(file: File): Promise<ImageAsset>
```

实现规则：

- 接受 `image/jpeg`、`image/png`、`image/webp`；
- 文件大于 12MB 立即拒绝；
- 使用 `createImageBitmap` 或 `Image` 解码；
- 将最长边压缩到 1600px；
- 将输出转为 JPEG quality 0.92；
- 保留宽高和 data URL；
- 返回 `source: "upload"`；
- 解码失败时抛出“图片无法读取，请换一张图片”。

- [ ] **Step 3: 实现两个上传入口**

`ImagePicker.tsx` 必须提供：

```tsx
<input
  aria-label="从相册选择照片"
  type="file"
  accept="image/jpeg,image/png,image/webp"
  onChange={handleFile}
/>
<input
  aria-label="拍照使用"
  type="file"
  accept="image/*"
  capture="environment"
  onChange={handleFile}
/>
```

将文件交给 `normalizeImage`，调用 `setUpload` 后进入 `upload` 步骤的下一步按钮。错误通过 `StatusBanner` 显示，不丢失已有状态。

- [ ] **Step 4: 实现上传首页**

首页内容必须包含：

- “针织小物”品牌名；
- “把玩偶照片，变成小红书海报。”主标题；
- “选择照片”主按钮；
- “拍照使用”次按钮；
- “默认输出 3:4”提示；
- “识别／生成／编辑”三个能力说明；
- 隐私提示“图片只用于当前制作，不建立作品库”。

主按钮最小触控尺寸为 44px，页面内容适配 375px 宽度。

- [ ] **Step 5: 运行上传测试和构建**

运行：

```bash
npm test -- src/lib/image/resize-image.test.ts
npm run build
```

预期：图片处理测试 PASS，构建无 TypeScript 错误。

---

## Task 4：建立 AI Provider、提示词和生成接口

**Files:**

- Create: `src/lib/prompts.ts`
- Create: `src/server/ai/contracts.ts`
- Create: `src/server/ai/provider.ts`
- Create: `src/server/ai/mock-provider.ts`
- Create: `src/server/ai/openai-compatible-provider.ts`
- Create: `src/app/api/generate/route.ts`
- Create: `src/server/ai/contracts.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: 定义生成契约并先写校验测试**

`src/server/ai/contracts.ts` 定义：

```ts
export const generationRequestSchema = z.object({
  imageDataUrl: z.string().startsWith("data:image/"),
  keywords: z.string().max(500).default(""),
  forbiddenWords: z.string().max(300).default("")
});

export const posterStyleSchema = z.enum(["cute", "daily", "series"]);

export type GenerateRequest = z.infer<typeof generationRequestSchema>;
export type GenerateResponse = {
  analysis: {
    subject: string;
    colors: string[];
    material: string;
    details: string[];
  };
  posters: PosterDraft[];
};
```

测试必须验证：空图片被拒绝、关键词超过限制被拒绝、合法请求通过。

- [ ] **Step 2: 编写三种风格提示词**

`src/lib/prompts.ts` 输出：

```ts
export function buildGenerationPrompt(input: {
  keywords: string;
  forbiddenWords: string;
}): string
```

提示词必须明确：

- 目标是针织玩偶小红书 3:4 微海报；
- 先识别颜色、造型、材质和细节；
- 生成可爱种草卡、手作日常卡、系列账号卡；
- 文案不得虚构材料、尺寸和故事；
- 不改变玩偶身份、针织纹理和关键配件；
- 少量表情，不堆满装饰；
- 输出结构化标题、描述、标签和图层参数；
- 关键词和禁止词来自用户输入。

- [ ] **Step 3: 实现 Mock Provider**

`mock-provider.ts` 返回可重复的三套结果，图片使用上传图的 data URL，背景和图层颜色分别对应：

- `cute`：`#f8e5df`；
- `daily`：`#f3ead9`；
- `series`：`#dfe9df`。

Mock 结果必须包含三种不同标题位置、描述位置或装饰数量，确保方案不是只换颜色。

- [ ] **Step 4: 实现真实 Provider**

`openai-compatible-provider.ts`：

- 只在服务端读取 `AI_BASE_URL`、`AI_API_KEY`、`AI_VISION_MODEL`、`AI_IMAGE_MODEL`；
- 使用 `fetch` 向配置的 OpenAI-compatible API 发起请求；
- 不把 API key 发送到浏览器；
- 不记录图片 data URL、Authorization header 或完整响应；
- Provider 失败时抛出不含密钥的用户可读错误；
- 接口返回不符合 Zod schema 时抛出“生成结果格式异常，请重试”。

`.env.example`：

```bash
AI_PROVIDER=mock
AI_BASE_URL=https://api.example.com/v1
AI_API_KEY=
AI_VISION_MODEL=
AI_IMAGE_MODEL=
```

- [ ] **Step 5: 实现 `POST /api/generate`**

处理流程：

1. 读取 multipart FormData；
2. 读取 `imageDataUrl`、`keywords`、`forbiddenWords`；
3. 用 `generationRequestSchema.safeParse` 校验；
4. 根据 `AI_PROVIDER` 选择 Mock 或真实 Provider；
5. 返回 JSON；
6. 错误返回 400、413 或 502，不返回堆栈和密钥。

- [ ] **Step 6: 运行接口测试**

运行：

```bash
AI_PROVIDER=mock npm test -- src/server/ai/contracts.test.ts
AI_PROVIDER=mock npm run build
```

预期：契约测试 PASS，Mock 配置下构建成功。

---

## Task 5：实现生成状态页和三套方案选择页

**Files:**

- Create: `src/components/common/ProgressDots.tsx`
- Create: `src/components/common/StatusBanner.tsx`
- Create: `src/components/generation/GenerationScreen.tsx`
- Create: `src/components/choose/ChooseScreen.tsx`
- Create: `src/components/poster/PosterPreview.tsx`
- Create: `src/components/generation/GenerationScreen.test.tsx`
- Modify: `src/components/wizard/Wizard.tsx`

- [ ] **Step 1: 写生成状态组件测试**

测试以下状态：

- 初始显示“正在识别玩偶”；
- 随时间显示“正在生成文案”和“正在制作 3 套方案”；
- API 失败时显示“重新生成”；
- 点击重试不会清空上传图片和用户关键词。

- [ ] **Step 2: 实现生成状态页**

`GenerationScreen.tsx`：

- 接收 `upload`、`keywords` 和 `forbiddenWords`；
- 仅在进入 `generating` 步骤时调用一次 `/api/generate`；
- 使用 AbortController 在用户离开页面时取消请求；
- 按三阶段更新可见进度；
- 成功调用 `setGeneration` 并进入 `choose`；
- 失败保留上传状态并显示重试按钮；
- 不显示假的百分比，只显示真实阶段状态。

- [ ] **Step 3: 实现海报预览组件**

`PosterPreview.tsx`：

- 接收 `PosterDraft`；
- 使用 3:4 容器；
- 先渲染背景，再渲染图片，再渲染文字和表情的静态缩略图；
- 预览中隐藏不可读的小标签，保持视觉层级；
- 为图片提供描述性 `alt`。

- [ ] **Step 4: 实现方案选择页**

`ChooseScreen.tsx`：

- 显示三张 3:4 海报卡片；
- 显示“可爱种草卡”“手作日常卡”“系列账号卡”；
- 每张卡有一句用途说明；
- 点击卡片或按钮选中方案；
- “重新生成”回到 `generating`；
- 选择后进入 `edit`；
- 点击返回保留当前生成结果。

- [ ] **Step 5: 运行组件测试和移动端构建**

运行：

```bash
npm test -- src/components/generation/GenerationScreen.test.tsx
npm run build
```

预期：组件测试 PASS，构建成功。

---

## Task 6：实现手机端轻量海报编辑器

**Files:**

- Create: `src/components/editor/EditorScreen.tsx`
- Create: `src/components/editor/PosterStage.tsx`
- Create: `src/components/editor/TextControls.tsx`
- Create: `src/components/editor/StickerControls.tsx`
- Create: `src/components/editor/BackgroundControls.tsx`
- Create: `src/components/editor/EditorScreen.test.tsx`
- Modify: `src/domain/editor.ts`
- Modify: `src/app/globals.css`

- [ ] **Step 1: 写编辑页交互测试**

覆盖：

- 页面默认显示 3:4 海报；
- “文字”工具打开文字编辑面板；
- 修改标题输入框会更新画布标题；
- “表情”工具可以添加 `♡`；
- “背景”工具可以切换三种美化图片或背景色；
- 点击“恢复 AI 初始方案”会恢复选择方案时的图层；
- 返回按钮回到方案选择，不丢失草稿。

- [ ] **Step 2: 实现 Konva 画布**

`PosterStage.tsx` 使用固定逻辑尺寸 `360×480`：

- `Stage width={360} height={480}`；
- 外层 CSS 使用 `width: min(100%, 360px)` 并通过 `aspect-ratio: 3 / 4` 缩放；
- 背景使用 `Rect`；
- 图片使用 `Konva.Image`，按 contain 或 cover 规则绘制；
- 文本使用 `Konva.Text`；
- 表情使用 `Konva.Text`；
- 文本和表情设置 `draggable`；
- `onDragEnd` 调用 `moveLayer` 并将坐标限制在画布边界；
- 选中图层显示轻量边界框，不导出选择框；
- 不使用旋转、复杂蒙版和自由路径。

- [ ] **Step 3: 实现文字控制面板**

`TextControls.tsx` 提供：

- 标题／描述／标签三种图层切换；
- 文本输入；
- 字号选择：16、20、24、30、36；
- 颜色选择：主文字、珊瑚红、鼠尾草绿、深紫；
- 字体选择：系统圆润、PingFang SC、Microsoft YaHei；
- 对齐方式：左对齐、居中、右对齐；
- 输入控件带 `label`，触控高度不小于 44px。

- [ ] **Step 4: 实现表情和背景控制**

`StickerControls.tsx` 只提供少量风格统一的内容贴纸：

```ts
const STICKERS = ["♡", "✦", "☁", "☺", "手作日记"];
```

支持添加、删除、大小调整和拖动。

`BackgroundControls.tsx` 提供：

- 原图增强；
- 温馨手作场景；
- 奶油色／粉彩棚拍；
- 纯色背景备用。

切换背景不重置用户当前文案和图层位置。

- [ ] **Step 5: 实现编辑页布局**

`EditorScreen.tsx`：

- 顶部显示返回、标题“编辑海报”、恢复按钮；
- 中部显示可缩放但不横向溢出的画布；
- 底部使用固定工具栏；
- 工具栏包含文字、表情、图片、背景；
- 导出按钮固定在安全区上方；
- 页面滚动时工具栏不遮挡画布；
- 375px 宽度下主要按钮完整可见。

- [ ] **Step 6: 运行编辑器测试**

运行：

```bash
npm test -- src/components/editor/EditorScreen.test.tsx
npm run build
```

预期：编辑测试 PASS，构建成功。

---

## Task 7：实现导出、保存和完成页

**Files:**

- Create: `src/lib/export/export-poster.ts`
- Create: `src/components/export/ExportScreen.tsx`
- Create: `src/lib/export/export-poster.test.ts`
- Modify: `src/components/editor/EditorScreen.tsx`
- Modify: `src/components/wizard/Wizard.tsx`

- [ ] **Step 1: 写导出函数测试**

覆盖：

- PNG 导出请求使用 `image/png`；
- JPG 导出请求使用 `image/jpeg` 和 quality `0.92`；
- 导出尺寸为 `1200×1600`；
- 文件名包含 `knitting-poster`；
- 没有 Canvas 时返回“当前浏览器暂不支持导出，请尝试长按图片保存”。

- [ ] **Step 2: 实现 `exportPoster`**

函数签名：

```ts
export type ExportFormat = "png" | "jpg";

export async function exportPoster(
  stage: { toDataURL: (config: {
    mimeType: string;
    quality?: number;
    pixelRatio: number;
  }) => string },
  format: ExportFormat
): Promise<{ dataUrl: string; filename: string }>
```

实现规则：

- 逻辑画布为 360×480；
- `pixelRatio = 1200 / 360`；
- PNG 不设置 quality；
- JPG 使用 quality 0.92；
- 通过临时 `<a download>` 触发保存；
- 返回 data URL 和文件名，便于组件显示成功状态；
- 不上传导出结果。

- [ ] **Step 3: 实现完成页**

`ExportScreen.tsx` 显示：

- 导出后的 3:4 预览；
- “保存到手机”主按钮；
- “继续编辑”次按钮；
- “重新制作一张”按钮；
- 成功提示；
- 下载不支持时显示“可长按图片保存”。

- [ ] **Step 4: 运行导出测试和构建**

运行：

```bash
npm test -- src/lib/export/export-poster.test.ts
npm run build
```

预期：导出测试 PASS，构建成功。

---

## Task 8：补齐错误处理、隐私清理和 PWA 元信息

**Files:**

- Create: `src/lib/privacy/clear-session.ts`
- Create: `src/app/error.tsx`
- Create: `src/app/loading.tsx`
- Modify: `src/components/common/StatusBanner.tsx`
- Modify: `src/components/wizard/Wizard.tsx`
- Modify: `src/app/manifest.webmanifest`
- Modify: `src/app/globals.css`

- [ ] **Step 1: 实现会话清理**

`clear-session.ts`：

```ts
export function clearSession() {
  usePosterStore.getState().resetSession();
  if (typeof window !== "undefined") {
    document.querySelectorAll("input[type=file]").forEach((input) => {
      (input as HTMLInputElement).value = "";
    });
  }
}
```

不写入 localStorage、IndexedDB 或 Cookie。点击“重新制作一张”时调用清理函数。

- [ ] **Step 2: 完善错误状态**

统一错误文案：

- 格式错误：`请选择 JPG、PNG 或 WebP 图片`；
- 文件过大：`图片不能超过 12MB`；
- AI 失败：`生成没有完成，原图和填写内容已保留，请重试`；
- 网络中断：`网络连接中断，请检查网络后重试`；
- 导出失败：`当前浏览器暂不支持直接下载，可长按图片保存`。

所有错误同时包含文字，不只使用颜色或图标。

- [ ] **Step 3: 创建加载和异常页**

`loading.tsx` 显示品牌名和“正在打开创作工具”。

`error.tsx` 提供：

- “刚才没有打开成功”说明；
- “重新加载”按钮；
- 不暴露堆栈、接口地址和环境变量。

- [ ] **Step 4: 配置 Manifest**

`manifest.webmanifest`：

```json
{
  "name": "针织小物｜小红书微海报",
  "short_name": "针织小物",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#fffaF4",
  "theme_color": "#d87568",
  "lang": "zh-CN",
  "icons": []
}
```

首版不添加 Service Worker，避免为私用工具引入缓存失效问题。

- [ ] **Step 5: 运行全量测试**

运行：

```bash
npm test
npm run build
```

预期：全部单元测试 PASS，Next 构建成功。

---

## Task 9：接入向导、无障碍和响应式质量检查

**Files:**

- Modify: `src/components/wizard/Wizard.tsx`
- Modify: `src/app/globals.css`
- Create: `tests/e2e/mobile-poster.spec.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: 完成向导状态分发**

`Wizard.tsx` 根据 Zustand 的 `step` 渲染：

```tsx
switch (step) {
  case "upload":
    return <UploadScreen />;
  case "generating":
    return <GenerationScreen />;
  case "choose":
    return <ChooseScreen />;
  case "edit":
    return <EditorScreen />;
  case "exported":
    return <ExportScreen />;
}
```

每个步骤都显示 `ProgressDots`，并提供可理解的返回行为。

- [ ] **Step 2: 配置 Playwright 移动端**

`playwright.config.ts` 使用 `devices["iPhone 13"]`：

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "AI_PROVIDER=mock npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true
  },
  projects: [
    { name: "iphone-13", use: { ...devices["iPhone 13"] } }
  ]
});
```

- [ ] **Step 3: 编写完整手机流程测试**

`mobile-poster.spec.ts` 测试：

1. 首页显示“把玩偶照片，变成小红书海报”；
2. 使用测试图片触发上传；
3. 生成页进入方案选择页；
4. 三套方案均出现；
5. 选择“可爱种草卡”进入编辑页；
6. 修改标题为“我的针织小兔”；
7. 添加一个表情；
8. 点击导出；
9. 页面显示保存成功和成品预览。

测试中使用 `page.setInputFiles`，不访问真实 AI 服务。

- [ ] **Step 4: 执行视觉和规范检查**

在 375×812 和 390×844 视口分别检查：

- 没有横向滚动；
- 触控目标至少 44×44px；
- 编辑工具栏不遮挡导出按钮；
- 生成中有阶段状态；
- 方案卡片能完整展示；
- 标题和正文对比度可读；
- 图片有 alt；
- 输入框有 label；
- 键盘导航有可见 focus；
- 减少动画并尊重 `prefers-reduced-motion`。

使用已安装的 `web-design-guidelines` 做网页规范审查，使用 `design-critique` 检查页面层级、一致性、留白和移动端视觉质量。

- [ ] **Step 5: 运行最终验证**

运行：

```bash
npm test
npm run lint
npm run build
npm run test:e2e
```

预期：

- 单元测试全部 PASS；
- lint 无错误；
- production build 成功；
- iPhone 13 E2E 全部 PASS；
- 失败时保留 Playwright trace 供定位。

---

## Task 10：整理使用说明和环境配置

**Files:**

- Create: `README.md`
- Modify: `.env.example`

- [ ] **Step 1: 编写启动说明**

README 必须包含：

```text
1. npm install
2. cp .env.example .env.local
3. 默认 AI_PROVIDER=mock 时运行 npm run dev
4. 手机与电脑连接同一局域网后，使用开发机局域网地址访问
5. 配置真实 AI Provider 时只在服务端填写 AI_API_KEY
6. npm run build && npm start 用于生产构建验证
```

说明首版不保存账号、作品和公共历史。

- [ ] **Step 2: 写清真实 Provider 配置**

只说明变量名和用途：

- `AI_PROVIDER=mock|openai-compatible`
- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_VISION_MODEL`
- `AI_IMAGE_MODEL`

明确禁止把 `AI_API_KEY` 写入客户端代码、提交到 Git 或发送给浏览器。

- [ ] **Step 3: 完成交付前检查**

运行：

```bash
rg -n "AI_API_KEY|Authorization|data:image" src --glob '!**/*.test.*'
```

预期：

- `AI_API_KEY` 只出现在服务端 Provider；
- Authorization header 只在服务端请求构造处出现；
- data URL 不被写入日志；
- 没有调试输出完整图片内容。

---

## 计划自检结果

### 规格覆盖

- 目标客户和小范围自用：Task 1、Task 10；
- 单图上传和 3:4 输出：Task 3、Task 7；
- 三种 AI 美化：Task 4、Task 6；
- 三套小红书海报方案：Task 4、Task 5；
- AI 种草文案和用户关键词：Task 4、Task 5；
- 文字、字体、字号、颜色、位置和表情编辑：Task 6；
- 导出和手机保存：Task 7；
- 免登录、无公共存储、会话清理：Task 8；
- 错误恢复：Task 4、Task 5、Task 8；
- 375px 移动端和可访问性：Task 1、Task 9；
- 不做的功能：实施前提和 Task 10 明确排除。

### 完整性检查

计划中的每个功能都有明确文件、接口、测试和验证命令，没有留下未执行的功能描述。

### 类型一致性

- `PosterDraft`、`GenerationResult`、`ImageAsset` 在领域类型中定义，并由 Provider、Store、预览、编辑器和导出共同使用；
- `WizardStep` 的五个状态与 `Wizard.tsx` 的分发完全一致；
- `LayerId`、`TextLayer`、`StickerLayer` 与编辑纯函数和 Konva 组件的图层操作保持一致；
- 导出统一使用 `360×480` 逻辑画布和 `1200×1600` 成品尺寸。

## 执行方式

当前目录不是 Git 仓库，因此执行阶段不能依赖提交命令；每个 Task 以“单元测试通过、构建通过和文件检查通过”作为检查点。若你后续初始化 Git，可按 Task 建立独立提交。

