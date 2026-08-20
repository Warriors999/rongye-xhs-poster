# 动态设计导演微海报 Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax for tracking.

Goal: 将现有固定模板式海报生成流程改造成“上传玩偶照片 + 简单想法 → 参考研究 → 动态设计 brief → 3 张完整微海报 → 质量检查和下载”的手机端工作流。

Architecture: 保留 Next.js、Zustand、AI Provider 和 /api/generate 主链路；新增参考研究适配器和质量检查 Provider。多模态模型负责主体识别、创意理解和动态 brief，gpt-image-2 负责生成完整海报；服务端规则负责主体保真、文字安全、schema 容错和失败回退。

Tech Stack: Next.js App Router、React、TypeScript、Zustand、Zod、Gemini-compatible Vision API、OpenAI-compatible Images API、Vitest、Testing Library、Playwright。

---

## 文件边界

- 领域契约：src/domain/project.ts、src/server/ai/contracts.ts。
- 设计规则和提示词：src/lib/design-system.ts、src/lib/prompts.ts。
- 参考研究：新建 src/server/research/reference-research.ts 及测试。
- 模型 Provider：src/server/ai/gemini-provider.ts、src/server/ai/image-provider.ts、新建 src/server/ai/quality-provider.ts。
- 服务编排：src/app/api/generate/route.ts、src/server/ai/provider.ts。
- 手机端：src/store/use-poster-store.ts、src/components/generation/GenerationScreen.tsx、src/components/choose/ChooseScreen.tsx、src/components/poster/PosterPreview.tsx、src/app/globals.css。
- 测试与配置：相关单元测试、tests/e2e/mobile-poster.spec.ts、README.md、.env.example。

旧编辑器文件暂时保留，但不再从 Wizard 进入，也不再作为新主流程的文字合成器。

## Task 1：更新领域类型和服务端 schema

Files:
- Modify: src/domain/project.ts
- Modify: src/server/ai/contracts.ts
- Test: src/server/ai/contracts.test.ts
- Test: src/store/use-poster-store.test.ts

- [ ] Step 1：先写失败测试，验证 generationResultSchema 接受 research、designNote 和 lifestyle/story/editorial 三个唯一方向。

测试输入必须包含 analysis、research、3 个最小合法 poster；预期当前测试失败，因为现有 schema 只接受 cute/daily/series 且要求固定 3 个旧 draft。

- [ ] Step 2：在 project.ts 增加以下领域类型：

PosterDirection = 'lifestyle' | 'story' | 'editorial'；
SubjectProtection = { identity, silhouette, pose, colors, material, mustKeep }；
ResearchSummary = { query, sources, composition, palette, material, typography, density, fallback? }。

给 DesignBrief 增加 direction；给 PosterDraft 增加 designNote；给 GenerationResult 增加 research 和可选 warnings。保留 layers 供旧编辑器兼容，但新主流程不得读取。

- [ ] Step 3：在 contracts.ts 增加 posterDirectionSchema 和 researchSummarySchema。

设计 brief 必须包含 direction、concept、layout、scene、elements、palette、typography、hierarchy、mood、negative。海报数组改为 min(1).max(3)，并用 superRefine 保证方向不重复。缺失字段由 Provider fallback 补齐。

- [ ] Step 4：运行并提交契约迁移。

运行：pnpm vitest run src/server/ai/contracts.test.ts src/store/use-poster-store.test.ts。
预期：新增契约测试和既有测试通过。提交：git add 相关领域文件 && git commit -m "feat: add dynamic poster director contracts"。

## Task 2：把固定模板改成动态设计角色

Files:
- Modify: src/lib/design-system.ts
- Modify: src/lib/prompts.ts
- Modify: src/server/ai/provider.ts
- Test: src/lib/prompts.test.ts
- Test: src/server/ai/provider.test.ts

- [ ] Step 1：先写失败测试，验证 prompt 包含 research 摘要、lifestyle/story/editorial 三个角色，并且不再包含“三套固定母版”。

- [ ] Step 2：把 designPresets 改成 directionRules。

lifestyle 只规定生活方式摄影、手作材质和陪伴感；story 只规定轻量叙事和前中后景；editorial 只规定留白、字体层级和秩序。三者只规定目标、差异维度、元素预算和禁止项，不规定固定坐标或固定背景。

让 resolveDesignBrief(direction, candidate, research) 合并方向角色、研究学习点和模型候选值；主体保护、文字安全和信息真实性不能被模型覆盖。

- [ ] Step 3：给 GenerationInput 增加 research，并改写 buildGenerationPrompt。

prompt 必须要求模型先识别并保护真实玩偶，将用户文字视为创作意图，将研究摘要视为设计资料，输出 analysis、research 和 3 个带 designNote 的 posters。固定限制为短标题、短辅助句、最多两个标签，禁止价格、日期、名称、编号、品牌、规格、伪文字和额外道具文字。用户输入与研究摘要必须放在独立资料区。

- [ ] Step 4：运行并提交。

运行：pnpm vitest run src/lib/prompts.test.ts src/server/ai/provider.test.ts。
预期：prompt injection、截断、商业信息过滤和动态角色测试全部通过。提交设计规则、prompt、Provider 和测试文件。
+
## Task 3：增加轻量参考研究适配器和本地 fallback

Files:
- Create: src/server/research/reference-research.ts
- Test: src/server/research/reference-research.test.ts
- Modify: src/server/ai/provider.ts
- Modify: README.md
- Create or Modify: .env.example

- [ ] Step 1：先写失败测试。

覆盖无配置时的本地研究、远程成功、远程超时、5xx、无效 JSON 和 API key 不泄露。测试必须验证结果只包含标题、合法 URL 和设计摘要。

- [ ] Step 2：实现 ReferenceResearcher。

导出 ResearchInput、ReferenceResearchDependencies 和 ReferenceResearcher。查询只使用截断后的关键词和创作想法；若存在 REFERENCE_RESEARCH_URL，使用 POST JSON { query, limit: 3, platform: 'pinterest' }；只保留最多 3 个来源和设计 insight；失败、超时、无效响应时返回 fallback 为 true 的本地摘要。

本地规则覆盖春天、自然、童话、复古、手作、居家、治愈，并提供通用默认值。摘要只描述构图、色彩、材质、排版和密度，不复制具体作品。

- [ ] Step 3：在 provider.ts 增加 getReferenceResearcher()，默认返回本地可用的研究器。

README.md 和 .env.example 增加 REFERENCE_RESEARCH_URL、REFERENCE_RESEARCH_API_KEY，并说明线上不能依赖本地 Codex Skill；未配置搜索服务时使用本地设计研究 fallback。

- [ ] Step 4：运行并提交。

运行：pnpm vitest run src/server/research/reference-research.test.ts src/server/ai/provider.test.ts。预期通过。提交研究器、Provider、测试、README 和环境变量示例。

## Task 4：更新多模态 Provider，生成动态 brief 并增强容错

Files:
- Modify: src/server/ai/gemini-provider.ts
- Modify: src/server/ai/contracts.ts
- Test: src/server/ai/gemini-provider.test.ts

- [ ] Step 1：先写失败测试，给 Gemini 输入增加 research，并断言返回 research、lifestyle/story/editorial、design.direction 和 designNote。

保留 Markdown 围栏、尾部多余大括号、尾逗号、超长文本、禁用商业信息和 transient retry 测试。

- [ ] Step 2：更新 normalizeResponse。

优先读取 variants，其次兼容 posters 和 plans；按固定顺序归一化三个方向；用 resolveDesignBrief 补齐 brief；缺少 designNote 时生成安全说明；继续使用现有 JSON 修复、文本截断、标签清洗和商业信息过滤；返回值中的 research 必须直接使用服务端传入的 input.research；不把模型原始响应写入 GenerationResult。

- [ ] Step 3：更新 Gemini 请求和测试。

继续使用 native Gemini endpoint、inline image 和 application/json。429、5xx 和网络错误最多重试一次；格式错误不重复调用模型，直接使用安全 fallback 或统一格式错误。

运行：pnpm vitest run src/server/ai/gemini-provider.test.ts src/server/ai/contracts.test.ts。提交 Gemini Provider、contracts 和测试文件。

## Task 5：让图片 Provider 生成完整海报并增加质量检查

Files:
- Modify: src/server/ai/image-provider.ts
- Modify: src/server/ai/mock-image-provider.ts
- Create: src/server/ai/quality-provider.ts
- Test: src/server/ai/image-provider.test.ts
- Test: src/server/ai/quality-provider.test.ts

- [ ] Step 1：先写图片 prompt 测试。

断言 prompt 包含“完整的 3:4 竖版中文微海报”、动态设计角色、主体保真、三类文字限制；不包含“固定设计母版”和“不要文字”。

- [ ] Step 2：更新 ImageBeautifyInput.poster 和 buildPosterPrompt。

poster 增加 style、copy、design、designNote 和可选 qualityIssues。prompt 必须直接生成场景、AI 元素、短标题、辅助句、标签和排版；只允许 copy 中的文字；禁止乱码、伪文字、logo、价格、日期、编号、品牌、规格、低质量连接线和额外主体。qualityIssues 放在最后作为修复重点。继续使用 images/edits、1024x1536、PNG 和一次 transient retry。

- [ ] Step 3：实现 QualityProvider。

新建 QualityReport，字段为 pass、issues、confidence、skipped；新建 QualityChecker.checkBatch，批量检查最多 3 张图片的主体身份、轮廓、比例、姿态、色彩、针织纹理、清晰度、边缘、文字数量、乱码和设计密度。上游不可用时 fail-open，返回 skipped 报告，不泄露原始响应和密钥。getQualityChecker 在 mock 环境返回全部通过。

- [ ] Step 4：让 Mock Image Provider 返回包含短标题、辅助句和装饰层的 SVG 或 PNG data URL；可读取 MOCK_IMAGE_FAIL_DIRECTION 仅用于路由测试。

- [ ] Step 5：运行并提交。

运行：pnpm vitest run src/server/ai/image-provider.test.ts src/server/ai/quality-provider.test.ts。预期通过。提交图片 Provider、Mock Provider、质量 Provider 和测试。

## Task 6：编排研究、生成、质量重试和部分成功

Files:
- Modify: src/app/api/generate/route.ts
- Modify: src/server/ai/provider.ts
- Test: src/app/api/generate/route.test.ts

- [ ] Step 1：先写路由失败测试。

覆盖正常返回 research、三张 designNote、单张失败重试后部分成功，以及研究服务超时仍返回 research.fallback true。

- [ ] Step 2：实现路由调用顺序。

解析请求后先调用 getReferenceResearcher().research({ keywords, creativeIdea })，再把 research 传给 getProvider().generate。使用 Promise.allSettled 并行生成三张图片；每张失败只重试一次。零张成功才返回 502；一至两张成功则返回 200、warnings 和成功图片。

- [ ] Step 3：接入批量质量检查和定向重试。

对成功图片调用 QualityChecker.checkBatch。对 pass false 的图片最多重新调用一次图片 Provider，将 issues 作为 qualityIssues；第二次仍不合格时保留原图并加入 warning，不再重复调用。响应只包含 analysis、research、posters、warnings，不包含 API key、上游 body、stack 或内部 Provider 名称。

- [ ] Step 4：运行并提交。

运行：pnpm vitest run src/app/api/generate/route.test.ts src/server/ai/provider.test.ts。提交 route、Provider 工厂和路由测试。

## Task 7：改造手机端状态、进度页和结果页

Files:
- Modify: src/store/use-poster-store.ts
- Modify: src/components/generation/GenerationScreen.tsx
- Modify: src/components/choose/ChooseScreen.tsx
- Modify: src/components/poster/PosterPreview.tsx
- Modify: src/components/upload/UploadScreen.tsx
- Modify: src/app/globals.css
- Test: src/components/generation/GenerationScreen.test.tsx
- Test: src/components/choose/ChooseScreen.test.tsx
- Test: src/components/poster/PosterPreview.test.tsx

- [ ] Step 1：先写 UI 失败测试。

生成阶段改为：正在识别玩偶、正在理解你的想法、正在研究视觉参考、正在形成 3 个设计方向、正在生成 3 张微海报、正在检查清晰度和主体一致性。选择页改用生活方式、故事叙事、编辑海报，并断言三条 designNote、单张保存和全部保存。

- [ ] Step 2：store 增加 research 和 warnings。

setGeneration 保存它们；cloneGeneration 深复制 sources 和 warnings；resetSession、goBack、failGeneration 清理它们；保留上传、关键词和创作想法，以便失败后重试。

- [ ] Step 3：更新 GenerationScreen。

六个阶段只作为用户体验提示，不显示伪造百分比；收到响应后立即进入结果页；失败时保留上传和想法。说明改为“会保留真实玩偶，再完成场景、设计元素、文字和排版”。

- [ ] Step 4：更新 ChooseScreen。

方向名使用 lifestyle、story、editorial 的固定中文显示名；优先显示 poster.designNote，缺失时显示方向 fallbackNote；warning 不隐藏合格海报；下载直接使用 draft.image.dataUrl，不调用 Canvas 合成。

- [ ] Step 5：更新 PosterPreview、上传说明和 CSS。

PosterPreview 只渲染 AI 返回的完整图片；空图片显示未生成成功，不读取 layers 和 stickers。上传页说明改为“AI 会先理解你的想法和玩偶，再自动设计 3 张微海报”。增加 design note、research note 和 warning 的手机样式，保证 3:4、12px 以上说明字号和 44px 触控高度。

- [ ] Step 6：运行并提交。

运行：pnpm vitest run src/components/generation/GenerationScreen.test.tsx src/components/choose/ChooseScreen.test.tsx src/components/poster/PosterPreview.test.tsx src/store/use-poster-store.test.ts。提交 store、三个页面、上传说明、CSS 和组件测试。

## Task 8：更新端到端测试、部署配置和最终验收

Files:
- Modify: tests/e2e/mobile-poster.spec.ts
- Modify: README.md
- Create or Modify: .env.example
- Modify: railway.json only if required

- [ ] Step 1：更新手机端 e2e。

保留进入、上传、输入想法、生成、单张下载和全部保存；将旧方向断言改为生活方式、故事叙事、编辑海报；文件名断言改为绒页-lifestyle、绒页-story 或绒页-editorial。mock e2e 不访问外部研究或图片 API。

- [ ] Step 2：更新环境变量说明。

在 .env.example 写入 AI_PROVIDER、AI_VISION_PROTOCOL、AI_VISION_BASE_URL、AI_VISION_API_KEY、AI_VISION_MODEL、AI_IMAGE_BASE_URL、AI_IMAGE_API_KEY、AI_IMAGE_MODEL、REFERENCE_RESEARCH_URL、REFERENCE_RESEARCH_API_KEY。说明视觉模型和图片模型可以使用同一中转站但分别配置，API key 只能放服务端。

- [ ] Step 3：运行完整自动化验证。

运行：pnpm test；pnpm typecheck；pnpm build；pnpm exec playwright test tests/e2e/mobile-poster.spec.ts。预期所有单元测试、类型检查、生产构建和手机端关键路径通过。

- [ ] Step 4：做一次真实模型验收。

使用当前服务端环境变量生成一组真实结果，检查 3 张图片真实存在、可打开、尺寸有效 3:4、主体未替换或明显变形、三个方向有明显差异、中文文字少且可读、没有价格日期编号品牌规格伪文字，并验证失败时能保留合格图片和安全 warning。不能只以 API 200 作为完成标准。

- [ ] Step 5：提交验收变更。

运行 git diff --check 和 git status --short；提交 e2e、README、.env.example 和必要的 railway 配置。

## Task 9：部署可复现性和云端 smoke test

Files:
- Create: Dockerfile
- Create: .dockerignore
- Create: .github/workflows/container-smoke.yml
- Modify: railway.json
- Modify: package.json
- Modify: README.md
- Test: scripts/verify-production-start.mjs

- [ ] Step 1：固定构建工具版本和启动契约。

在 package.json 增加 engines.node 和 packageManager，锁定 Node 22 LTS 与项目使用的 pnpm 版本；保留 pnpm-lock.yaml。Dockerfile 不依赖 Railway 自动推断 Node、pnpm 或构建命令。

- [ ] Step 2：创建多阶段 Dockerfile。

构建阶段使用固定 Node 22 slim 镜像，启用 Corepack、按锁文件安装依赖、执行 typecheck 和 next build；运行阶段只复制 standalone 或 Next 必需产物、public 和静态资源，使用非 root 用户，以 pnpm start 或 node server.js 启动。不得把 .env.local、API key、测试素材和 node_modules 从宿主机复制进镜像。

- [ ] Step 3：加入生产启动 smoke test。

新建 scripts/verify-production-start.mjs：启动生产服务，轮询 /api/health，确认 200 和预期 JSON，随后优雅终止进程；超时、错误状态和进程异常必须返回非零退出码。它不调用真实图片模型，不消耗 API 费用。

- [ ] Step 4：让 Railway 使用 Docker 并增加 CI 容器构建。

railway.json 的 builder 改为 DOCKERFILE，保留 startCommand、healthcheckPath、timeout 和 restart policy。GitHub Actions 在 push 和 pull request 时执行 Docker build，并运行 smoke test；构建失败时不能进入部署验证。

- [ ] Step 5：本地和云端分别验证，不把环境差异隐藏起来。

当前机器没有 Docker/Colima/Podman，因此不能声称本地 Docker 已验证。先运行无 Docker 的 Node/Next typecheck、build 和 smoke test；Docker 可用后再运行 docker build、docker run、health check。Railway 首次部署只验证 /api/health，再配置真实 AI Variables 做一次端到端生成。

- [ ] Step 6：运行并提交。

运行：pnpm typecheck；pnpm build；node scripts/verify-production-start.mjs；Docker 可用时再运行 docker build -t rongye-xhs-poster . 和容器 smoke test。提交 Dockerfile、.dockerignore、CI、railway.json、package.json、README 和脚本。

## Task 10：图片异步任务架构（第二阶段）

Files:
- Create: src/server/jobs/image-generation-queue.ts
- Create: src/server/jobs/image-generation-worker.ts
- Create: src/server/jobs/task-store.ts
- Create: src/server/storage/r2.ts
- Create: src/app/api/tasks/[taskId]/route.ts
- Modify: src/app/api/generate/route.ts
- Modify: src/server/ai/provider.ts
- Modify: package.json
- Modify: README.md

- [ ] Step 1：把同步生成接口改为提交接口。

POST /api/generate 只负责校验请求、把原图以内存二进制上传到 R2、创建 task_id、写入 queued 状态并投递队列，立即返回 202 和 task_id。Redis 队列中只放 task_id、原图 R2 key、创作想法和安全配置摘要，不放 base64 图片。

- [ ] Step 2：实现任务状态和 R2 存储适配器。

任务状态统一为 queued、running、succeeded、failed；记录阶段、错误文案、结果对象 key 和过期时间。R2 使用 S3-compatible SDK，所有上传、下载、删除都使用 Uint8Array/Buffer，不把图片写入容器磁盘。开发环境提供 mock storage 和 mock queue，生产环境使用 REDIS_URL、R2_ENDPOINT、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY、R2_BUCKET。

- [ ] Step 3：实现独立 worker。

worker 从 Redis 取 task_id，读取原图，执行主体分析、参考研究、3 张图片生成、质量检查和定向重试，把每张结果写入 R2，并更新任务阶段。单任务有超时、重试上限和幂等锁；重复消费不得重复计费或覆盖成功结果。worker 作为单独 Docker 进程启动，不与 Web Service 共用请求生命周期。

- [ ] Step 4：增加轮询接口和前端轮询。

GET /api/tasks/[taskId] 只返回 status、phase、progress、warnings、结果 URL 和安全错误。GenerationScreen 在提交 202 后每 2 秒轮询，页面离开时取消轮询；succeeded 后加载 R2 图片，failed 后保留原图和创作想法。不要把 R2 私钥或原始模型响应返回浏览器。

- [ ] Step 5：异步架构验证。

用 mock queue、mock R2 和 mock Provider 测试完整链路：提交任务、worker 消费、状态变化、结果写入、轮询返回、重复消费幂等、失败重试和过期清理。真实模型只在 worker 成功后做一次端到端验证。

## Task 11：异步服务部署

Files:
- Modify: Dockerfile
- Modify: railway.json or new Render deployment configuration
- Create: render.yaml
- Modify: .github/workflows/container-smoke.yml
- Modify: README.md

- [ ] Step 1：部署两个进程。

Web Service 只运行 Next.js API 和前端；Background Worker 只运行 image-generation-worker。两者使用同一个镜像、不同 start command，共享 Redis、R2 和 AI Variables。

- [ ] Step 2：先以 Render 为首发目标。

render.yaml 明确写出 web、worker、Redis 连接和 health check；不依赖平台自动猜测命令。Fly.io 只作为同一 Docker 镜像的后备部署目标，不在首版同时维护两套运行配置。

- [ ] Step 3：部署验收顺序固定为：容器构建 → Web /api/health → 提交 task_id → worker running → R2 结果 → 前端轮询 succeeded。任一步失败都停在该层定位，不直接反复部署。

## 计划自检

- 规格覆盖：上传和想法在 Task 7；参考研究和 fallback 在 Task 3；主体识别、brief 和 JSON 容错在 Task 2、4；图片生成和质量检查在 Task 5、6；手机结果页和下载在 Task 7；部署可复现在 Task 9；异步任务、worker、R2 和轮询在 Task 10、11；自动化和真实验收在 Task 8、9、11。
- 旧固定模板只作为迁移兼容数据，不再作为提示词和结果页的设计来源。
- 旧编辑器不从主流程进入，不删除文件，避免无关破坏；完整海报直接下载。
- 研究失败、本地 fallback、单张重试、质量重试和部分成功均有测试。
- 用户想法、研究摘要和模型返回均按资料处理；主体保护、文字安全和 JSON 格式由服务端固定。
- 方向统一为 lifestyle、story、editorial；PosterDraft.style、DesignBrief.direction、UI directionInfo 和文件名使用同一组值。
- 没有 TODO、TBD 或未定义的“适当处理”步骤。
