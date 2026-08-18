# 绒页｜小红书微海报

手机端针织玩偶微海报工具：上传一张照片，生成三套 3:4 小红书方案，轻量编辑后下载。

## 启动

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

默认 `AI_PROVIDER=mock`，不需要配置密钥即可体验完整流程。手机和电脑连接同一局域网后，用开发机局域网地址访问。

生产构建验证：

```bash
pnpm build
pnpm start
```

## 发布到 GitHub + Railway

项目已包含 `railway.json`，Railway 会自动执行构建并使用 `pnpm start` 启动网站。

1. 将项目推送到 GitHub 私有仓库。
2. 在 Railway 新建项目，选择 **Deploy from GitHub repo**，连接这个仓库。
3. 在 Railway 的 Variables 中填写 `.env.local` 里的变量，不要上传 `.env.local`。
4. 为小范围使用设置 `APP_ACCESS_PASSWORD`。设置后，第一次打开网站会出现浏览器访问密码框，用户名可随便填写；不设置则不启用密码保护。
5. 部署完成后，用 Railway 生成的域名访问网站。

推荐的生产变量：

```text
AI_PROVIDER=openai-compatible
AI_VISION_PROTOCOL=google
AI_VISION_BASE_URL=https://apinebula.ai
AI_IMAGE_BASE_URL=https://apinebula.ai/v1
AI_VISION_MODEL=gemini-3.1-flash-lite
AI_IMAGE_MODEL=gpt-image-2
AI_VISION_API_KEY=你的密钥
AI_IMAGE_API_KEY=你的密钥
APP_ACCESS_PASSWORD=你设置的访问密码
```

API 密钥和访问密码只填写在 Railway Variables，不要写入仓库，也不要使用 `NEXT_PUBLIC_` 前缀。

## AI 配置

真实服务只在服务端读取以下变量：

- `AI_PROVIDER=mock|openai-compatible`
- `AI_VISION_PROTOCOL=google`：让 Gemini 使用 Google 原生协议；
- `AI_VISION_BASE_URL`：Gemini 地址，例如 `https://apinebula.ai`；
- `AI_IMAGE_BASE_URL`：OpenAI 图像模型地址，例如 `https://apinebula.ai/v1`；
- `AI_BASE_URL`：旧版 OpenAI-compatible Provider 的兼容地址；
- `AI_VISION_API_KEY`：视觉/文字模型的服务端 API key；
- `AI_IMAGE_API_KEY`：图像编辑/生图模型的服务端 API key；
- `AI_API_KEY`：兼容旧配置；两个模型共用一个 key 时可使用；
- `AI_VISION_MODEL`：图片理解模型；
- `AI_IMAGE_MODEL`：图片生成/编辑模型，例如 `gpt-image-2`。

不要把任何 API key 写入客户端代码、提交到 Git 或发送给浏览器。接入真实第三方服务时，图片会发送到该服务处理。当前代码已接入视觉/文字模型和图片编辑接口：文字生成使用 Gemini 原生协议，编辑页的“温馨手作”和“奶油棚拍”使用 OpenAI-compatible 的 `/images/edits`，并强制提示模型保留上传的真实编织玩偶。

图片美化失败时会保留原图；“原图增强”和“纯色备用”不调用图片模型。图片模型返回异常或临时网络错误时，服务端只做一次有限重试，不会无限重试。

## 数据边界

首版不保存账号、作品、历史记录或公共作品库。原图和生成图只在当前浏览器制作流程中使用；点击“重新制作一张”会清理临时状态。

## 检查

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm test:e2e
```

E2E 覆盖 iPhone 13 和 375×812 手机视口。
