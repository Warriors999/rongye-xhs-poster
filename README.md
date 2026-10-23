# 绒页｜小红书微海报

**前后花了 1k $的项目，最终我决定 免费开源。**

**把真实针织玩偶照片变成可发布的 3:4 小红书微海报。** 绒页主要为手机浏览器设计。上传玩偶照片，写下可选的创作想法，审阅三套设计提示词，再选择生成、下载海报；还可以基于选中的海报生成发布文案。

> English documentation: [README.en.md](README.en.md). 数据处理说明：[PRIVACY.md](PRIVACY.md)。安全问题：[SECURITY.md](SECURITY.md)。

## 能做什么

- 以真实玩偶照片为主体，可添加一张只供风格借鉴的参考图；创作想法、特点关键词和排除内容均可填写。
- 先得到三套不同设计方向，并可修改构图、视觉风格和配色；确认后才向图片模型提交生成任务。
- 生成最多三张完整海报，支持预览、下载、对单张提供修改意见并重做；失败方向可单独补生成。
- 可选择 1–3 张海报生成三套发布文案，复制选中的方案。
- 未完成草稿和最近一次结果保存在当前浏览器；早前手动保存的作品仍在本机作品库中。

**使用边界：** AI 生成的文字和玩偶细节需要用户自行核对。项目没有自动视觉审核；浏览器本地作品不跨设备同步，清除浏览器数据会丢失。当前 Render Free 单进程配置的服务端任务也可能因休眠或重启而丢失。公开源代码不代表公开用户作品，源码仓库不包含用户上传内容或生产密钥。

## 项目背景

绒页源于针织玩偶创作者在手机上制作内容的需求：保留手工作品的真实外观，同时让构图、文案和排版更容易完成。项目从本地编辑器原型逐步转为“设计方案 → 人工确认 → 完整图片生成”的流程，并在 2026 年 10 月加入提示词审阅、单张重做、浏览器恢复和可选文案步骤。版本记录见 [CHANGELOG.md](CHANGELOG.md)。这里的产品说明基于当前代码；不宣称独立第三方认证或保证 AI 结果准确。

## 快速开始

需要 Node.js 22 与 pnpm 11.19.0。默认 Mock 模式无需密钥和付费调用。

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

打开 `http://localhost:3000`。Windows 操作可参阅 [README-WINDOWS.md](README-WINDOWS.md)。使用真实模型前，阅读下文“AI 配置”与 [PRIVACY.md](PRIVACY.md)；真实调用可能收费。

### 使用 apinebula 配置真实生成

如果你已在 apinebula 开通所需的视觉/文字模型和图片模型，可以让两类调用共用一个中转站，省去分别寻找服务商和适配接口的步骤。在本地复制 `.env.example` 为 `.env.local`，把下列变量填入该文件；示例地址和模型沿用本项目的接入配置，实际可用的模型、接口路径与费用以你的 apinebula 账户为准。

```dotenv
AI_PROVIDER=openai-compatible
AI_VISION_PROTOCOL=google
AI_VISION_BASE_URL=https://apinebula.ai
AI_VISION_MODEL=gemini-3.1-flash-lite
AI_IMAGE_BASE_URL=https://apinebula.ai/v1
AI_IMAGE_MODEL=gpt-image-2.5
AI_IMAGE_SIZE=1152x1536
AI_API_KEY=在本机填写你的密钥
```

若账户为两类模型提供不同密钥，改为分别填写 `AI_VISION_API_KEY` 和 `AI_IMAGE_API_KEY`；它们会优先于共用的 `AI_API_KEY`。不使用可选参考研究服务时，让 `REFERENCE_RESEARCH_URL` 和 `REFERENCE_RESEARCH_API_KEY` 保持空白。本地默认内存任务模式也不需要 Redis 或 R2。保存后运行 `pnpm dev`；需要付费验证真实模型时才运行 `pnpm ai:smoke`。不要将含真实密钥的 `.env.local` 提交到 Git，也不要把密钥放入 `NEXT_PUBLIC_` 变量。

## 技术结构

Next.js 15、React 19 和 TypeScript 提供手机端界面与服务端接口。设计和文案由可配置的视觉/文字模型处理，完整海报由兼容图片编辑接口的模型生成。Mock Provider 支持无密钥本地体验。浏览器用 IndexedDB 保存草稿与作品；服务器采用内存任务队列，或在同时配置 Redis 和 R2 时采用独立 Worker 与对象存储。`render.yaml` 与 `Dockerfile` 是 Render 部署入口。

本项目原创代码按 [GNU GPL v3.0（仅此版本）](LICENSE) 授权；发布修改版时须遵守该许可证的源码提供和相同许可证要求。第三方依赖仍遵循各自的许可证。

---

## 详细流程与运维说明

当前主流程是：

```text
上传真实针织玩偶 + 创作想法 + 可选风格参考
→ 文字模型识别原图，并为三个独立方向分别返回中文设计资料与 imagePrompt 字段
→ 服务端按 GPT Image 2.5 提示词规范校验并排成八个栏目，准确文案取自同一方案的 copy 字段
→ 只调整构图、视觉风格和配色三段中文描述，也可恢复模型原稿；固定要求默认隐藏
→ 主动确认提交原图与提示词给图片模型
→ 最多三张完整微海报（3:4）；失败方案可单独补生成
→ 最近一次结果自动暂存到当前浏览器，下载图片或选择 1–3 张生成三套发布文案
```

生成结果已经包含背景、视觉元素、中文文案和排版，当前主流程不进入旧编辑器，下载的就是完整成品。

提示词规范在项目代码 `src/lib/image-prompt-spec.ts` 中执行，Render 不读取开发者电脑上的 Skill 文件。文字模型返回英文占主体的描述时会重试；用户编辑页不暴露八个固定栏目，服务端提交前重新组合任务、准确文字和输出要求，再附加固定的主体保护。缺少必要字段时停在确认阶段，不调用图片模型，也不会把另外两套方案的 JSON 拼进去。

## 启动

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

默认 `AI_PROVIDER=mock`，不需要配置密钥即可体验完整流程。mock 会生成三张动态方向的演示海报，不调用外部研究或图片 API，也不会产生 API 费用。手机和电脑连接同一局域网后，用开发机局域网地址访问。

本地要验证真实 AI 时，先把真实配置写入 `.env.local`，再运行一次完整 smoke。它会调用一次视觉模型和一次图片模型，检查视觉结果能否解析、图片结果是否为有效 PNG；会产生对应的第三方 API 费用，但不会输出密钥或上游原始响应：

```bash
pnpm ai:smoke
pnpm dev
```

也可以给 smoke 指定一张本地图片：`AI_SMOKE_IMAGE=/绝对路径/玩偶.jpg pnpm ai:smoke`。视觉模型地址优先读取 `AI_VISION_BASE_URL`，图片模型地址优先读取 `AI_IMAGE_BASE_URL`；旧的 `AI_BASE_URL` 和 `AI_API_KEY` 仍作为回退，因此以后更换同协议的中转站通常只需改 `.env.local`，不需要改业务代码。

本地或 Render Free 单 Web 不配置 `REDIS_URL` 和 R2 变量时，提交接口会立即返回任务编号，任务状态、原图和结果使用内存实现，并在同一个 Web 进程里异步消费；不会把图片写入容器磁盘。需要更稳定的完整生产模式时，再配置 Redis 和 R2，由独立 worker 消费任务并保存结果。

生产构建和启动契约验证：

```bash
pnpm build
node scripts/verify-production-start.mjs
```

`scripts/verify-production-start.mjs` 会在本机临时端口启动 `pnpm start`，轮询 `/api/health`，确认返回 HTTP 200 和 `{ "ok": true }`，随后优雅终止服务。该检查强制使用 `AI_PROVIDER=mock`，不会调用真实 AI 或产生 API 费用。

## Render Free 单 Web 部署

仓库根目录的 `render.yaml` 当前只声明一个 Render Free Web Service，使用 Docker 构建并直接启动 Next.js，不创建 Background Worker、Redis 或 R2。由于没有配置 `REDIS_URL` 和 R2，任务会在 Web 进程内存中处理；这适合小范围、低并发使用，但服务休眠或重启后未完成任务和临时结果会丢失。

创建或更新 Render Web Service 时，在服务端环境变量中填写实际使用的 `AI_PROVIDER`、`AI_VISION_PROTOCOL`、`AI_VISION_BASE_URL`、`AI_VISION_MODEL`、`AI_IMAGE_BASE_URL`、`AI_IMAGE_MODEL`，以及一个共用的 `AI_API_KEY` 或分别填写 `AI_VISION_API_KEY`、`AI_IMAGE_API_KEY`。可选服务另需 `REFERENCE_RESEARCH_URL`/`REFERENCE_RESEARCH_API_KEY` 和 `APP_ACCESS_PASSWORD`；旧版 `AI_BASE_URL` 仍可作为地址回退。`render.yaml` 没有真实值；API key 和访问密码只在 Render Variables 中填写，不要上传 `.env.local`。

部署验收顺序为：Docker 构建 → Web `/api/health` → 用真实图片提交一次生成并下载结果。Free Web 会休眠，首次唤醒可能需要等待；如果需要多人并发、任务不丢失或作品持久保存，再升级到 Web + worker + Redis + R2 的完整付费架构。

## Railway（暂不作为首发目标）

项目仍保留 `railway.json` 作为历史配置，但本次部署不使用 Railway。当前发布源以 Render Free 单 Web 配置为准。

以下是 apinebula 的生产配置示例，密钥只应填入 Render 的环境变量。共用密钥时填写 `AI_API_KEY`；如果视觉和图片模型的密钥不同，分别填写 `AI_VISION_API_KEY`、`AI_IMAGE_API_KEY`：

```text
AI_PROVIDER=openai-compatible
AI_VISION_PROTOCOL=google
AI_VISION_BASE_URL=https://apinebula.ai
AI_IMAGE_BASE_URL=https://apinebula.ai/v1
AI_VISION_MODEL=gemini-3.1-flash-lite
AI_IMAGE_MODEL=gpt-image-2.5
AI_IMAGE_SIZE=1152x1536
AI_API_KEY=你的服务端密钥
```

以下变量按需配置：参考研究服务可留空；Render Free 单 Web 模式下 Redis 和 R2 必须全部留空，只有采用独立 worker 和对象存储时才同时填写。

```text
REFERENCE_RESEARCH_URL=你的参考研究服务地址
REFERENCE_RESEARCH_API_KEY=你的参考研究服务密钥
REDIS_URL=你的 Redis 连接地址
R2_ENDPOINT=你的 Cloudflare R2 S3 endpoint
R2_ACCESS_KEY_ID=你的 R2 access key
R2_SECRET_ACCESS_KEY=你的 R2 secret key
R2_BUCKET=你的 R2 bucket
# 不需要公开桶；结果默认由 /api/tasks/{taskId}?asset=... 私有代理返回
R2_PUBLIC_BASE_URL=
APP_ACCESS_PASSWORD=你设置的访问密码
```

API 密钥和访问密码只填写在 Render Variables，不要写入仓库，也不要使用 `NEXT_PUBLIC_` 前缀。

## Docker 本地验证

Dockerfile 使用 `node:22.14.0-bookworm-slim`，通过多阶段构建执行 frozen install、typecheck 和 production build，运行阶段使用 production dependencies 和非 root 用户监听 3000 端口。构建上下文会排除 `.env*`、`.worktrees`、`node_modules`、`.next`、测试结果和覆盖率目录，不会把本机密钥或宿主机依赖复制进镜像。

Docker 可用时运行：

```bash
set -euo pipefail

docker build -t knitting-doll-poster:local .
container_id=""
cleanup() {
  if [[ -n "$container_id" ]]; then
    docker stop "$container_id" >/dev/null 2>&1 || true
    docker rm "$container_id" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

container_id=$(docker run -d --name knitting-doll-poster-local -p 127.0.0.1:3000:3000 \
  -e AI_PROVIDER=mock \
  -e REFERENCE_RESEARCH_URL= \
  -e REFERENCE_RESEARCH_API_KEY= \
  knitting-doll-poster:local)

for attempt in $(seq 1 60); do
  if response=$(curl --fail --silent --show-error http://127.0.0.1:3000/api/health) \
    && printf '%s' "$response" | grep -q '"ok":true'; then
    printf '%s\n' "$response"
    exit 0
  fi

  if ! docker inspect --format '{{.State.Running}}' "$container_id" 2>/dev/null | grep -q '^true$'; then
    echo '容器提前退出，日志：' >&2
    docker logs "$container_id" >&2 || true
    exit 1
  fi
  sleep 1
done

echo '健康检查超时，日志：' >&2
docker logs "$container_id" >&2 || true
exit 1
```

应看到 `{"ok":true}`。如果本机没有 Docker、Colima 或 Podman，不能声称容器构建或容器启动已验证；只能报告非容器的 `pnpm build` 和 production-start smoke test 结果。

## AI 配置

真实服务只在服务端读取以下变量。视觉/文字模型和图片模型可以共用一个第三方中转站；地址和模型分别填写，密钥可以共用或分别填写：

- `AI_PROVIDER=mock|openai-compatible`
- `AI_VISION_PROTOCOL=google`：让 Gemini 使用 Google 原生协议；不使用 Google 原生协议时留空并使用兼容协议；
- `AI_VISION_BASE_URL`：视觉/文字模型地址，例如 `https://apinebula.ai`；
- `AI_VISION_API_KEY`：视觉/文字模型的服务端 API key；
- `AI_VISION_MODEL`：图片理解和文字设计模型，例如 `gemini-3.1-flash-lite`；
- `AI_IMAGE_BASE_URL`：图片生成模型地址，例如 `https://apinebula.ai/v1`；
- `AI_IMAGE_API_KEY`：图片生成模型的服务端 API key；
- `AI_IMAGE_MODEL`：图片生成/美化模型，例如 `gpt-image-2.5`；
- `AI_BASE_URL`：旧版 OpenAI-compatible Provider 的兼容地址；
- `AI_API_KEY`：两个模型共用一个 key 时填写；也兼容旧配置。单独填写的视觉或图片 key 优先。
- `REFERENCE_RESEARCH_URL`：可选的参考研究服务地址。服务端会发送 `POST` JSON：`{ query, limit: 3, platform: "pinterest" }`，查询只来自截断后的关键词和创作想法；服务返回的来源最多保留 3 条。
- `REFERENCE_RESEARCH_API_KEY`：可选的参考研究服务密钥，只放在服务端环境变量中，不会进入返回结果或浏览器。

不要把任何 API key 写入客户端代码、提交到 Git 或发送给浏览器。接入真实第三方服务时，上传图片会发送到对应服务处理；两个模型可以使用同一个中转站，但 key 仍只在服务端配置。

完整付费生产模式的异步任务启动方式是分别启动 Web 和 worker；Render Free 单 Web 不配置 Redis/R2 时只启动 Web：

```bash
pnpm build
pnpm start   # Web：监听 3000，POST /api/generate 只返回 202
pnpm worker  # Worker：使用 REDIS_URL 消费队列并把图片写入 R2
```

完整付费模式下，`REDIS_URL`、`R2_ENDPOINT`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` 和 `R2_BUCKET` 应在 Web 与 worker 两侧配置。Render Free 单 Web 不配置这些变量，任务和图片只存在当前 Web 进程内存中。R2 桶建议配置按 `tasks/` 前缀的生命周期清理；任务状态本身也有过期时间。Web、worker 和 R2 适配器都只在内存中处理图片字节，不把原图或结果写入容器磁盘。两个模型可以共用一个第三方中转站，但视觉/文字模型和图片模型仍分别配置地址、模型和 key。

参考研究服务是可选的。线上部署不能依赖本地 Pinterest 登录、浏览器状态或 Codex Skill；未配置 `REFERENCE_RESEARCH_URL`，或研究服务超时、返回 5xx、无效 JSON 时，网站会使用服务端内置的春天、自然、童话、复古、手作、居家和治愈设计规则作为 fallback，生成流程仍可继续。

单个方向生成失败时，已成功的海报会保留；初次生成最多同时向图片模型提交两张，失败方案可在结果页单独补生成，不重复生成其他图片。图片模型临时错误仍只做有限重试。文案页默认选中本次全部成功海报，可选择 1–3 张一起生成三套可选文案。送给文字模型的是缩小后的阅读用图片，下载和浏览器暂存仍保存完整海报；模型若返回不足三套或重复文案，会重试一次并在再次失败时提示重试。

## 数据边界

网站不保存账号或云端作品库。当前浏览器通过 IndexedDB 自动暂存最近一次生成结果与未完成方案；进行中的任务也暂存任务编号与恢复所需资料，刷新后继续查询原任务，不重新提交图片模型。以前手动保存的作品保留在本地，不会被自动暂存覆盖。异步任务会在服务端临时保存原图和结果（本地内存或线上 R2），通过任务过期和 R2 生命周期清理，不作为用户历史。

## 检查

```bash
pnpm test
pnpm exec tsc --noEmit
node scripts/verify-production-start.mjs
pnpm test:e2e
```

E2E 覆盖 iPhone 13 和 375×812 手机视口。

E2E 会显式使用 `AI_PROVIDER=mock` 并清空参考研究地址，因此不会访问外部研究或图片 API，也不会产生 API 费用。

## 提示词草稿与作品历史

待确认提示词草稿自动保存当前一份到浏览器 IndexedDB，刷新后可恢复；确认前不会调用图片模型。最近一次成品自动暂存为一个槽位，包含原图、成功图片、待补方案、提示词和参考图。它只属于当前浏览器及域名，不跨设备；清理浏览器数据后会丢失。Render Free 服务端临时任务和图片在休眠、重启或到期后会丢失，已经写入浏览器的成品与草稿仍可恢复。

UI设计与本地实测见 `升级说明.md` 和 `CHANGELOG.md`。本轮未接入自动AI视觉审核，返回图片需要用户确认主体与文字。
