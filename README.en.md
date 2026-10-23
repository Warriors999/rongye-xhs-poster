# Rongye | Knitted Doll Posters for Xiaohongshu

Rongye is a mobile-first web app that turns a photo of a real knitted doll into complete 3:4 posters for Xiaohongshu. It helps makers explore visual ideas while keeping their own doll at the center of the image.

[中文说明](README.md) · [Privacy and data handling](PRIVACY.md) · [Security policy](SECURITY.md) · [Changelog](CHANGELOG.md)

## What you can do

1. Upload a doll photo. Optionally add a separate style reference, a creative idea, descriptive keywords, or things to avoid.
2. Review three visual directions. Edit each direction's composition, visual language, and color or lighting before submitting it to the image model.
3. Preview and download up to three complete posters. Revise one poster or retry a failed direction without rerunning the others.
4. Optionally select one to three posters and generate three sets of Chinese posting copy.

Drafts and the latest generated result are stored in the current browser. Previously saved local projects remain in the browser's project library. The app does not provide cross-device sync or a cloud account.

AI output needs human review, especially lettering and details of the doll. The current app has no automated visual quality gate. Browser data disappears when that browser's storage is cleared. In the single-process Render Free setup, pending server tasks can be lost when the service sleeps or restarts.

## Run locally

Requirements: Node.js 22 and pnpm 11.19.0. Mock mode requires no API key and makes no paid AI calls.

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`. The example environment selects `AI_PROVIDER=mock`. For real generation, set server-side provider URLs, model names, and keys in `.env.local`; see the [Chinese configuration reference](README.md#ai-配置). Real AI requests may incur provider charges. Never commit `.env.local` or use the `NEXT_PUBLIC_` prefix for secrets.

To check the application without paid calls:

```bash
pnpm test
pnpm typecheck
pnpm build
node scripts/verify-production-start.mjs
```

The production-start check launches a temporary local server with the Mock provider and verifies `/api/health`.

## Architecture and deployment

The UI and API run on Next.js 15, React 19, and TypeScript. A configurable text/vision provider plans the poster directions and copy; an image provider generates the posters. IndexedDB stores browser-local drafts and results. Server tasks use an in-memory queue by default. Redis, Cloudflare R2, and a separate worker form the optional distributed setup; the required Redis and R2 variables must be configured together.

`render.yaml` describes the single Web Service deployment. `Dockerfile` builds the production container. Keep production API keys and optional access password in the hosting provider's server-side environment variables. See [README.md](README.md) for the detailed Chinese Render instructions and the limits of its Free single-process mode.

The repository contains source code and demonstration assets, not users' uploaded images or production credentials. Uploaded images are processed by the configured AI provider when real generation is enabled; read [PRIVACY.md](PRIVACY.md) before deploying for other users.

## License and contributions

No open-source license has been granted for this repository. Public visibility allows reading the code, but does not grant permission to reuse, modify, or redistribute it. Please open an issue for a bug report or feature request without attaching private images, credentials, or personal information. Report security concerns as described in [SECURITY.md](SECURITY.md).
