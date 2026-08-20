# Image Async Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move image generation from the Next.js request lifecycle to a secure task, queue, worker, and object-storage flow while preserving the existing mock experience and poster output contract.

**Architecture:** The browser submits the existing multipart form to `/api/generate`; the route validates input, stores the original bytes under a task-scoped key, records a queued task, and returns `202`. A mock in-process queue/worker is used when no `REDIS_URL` is configured; production uses Redis queue consumption and R2-compatible storage. The worker loads the original image into memory, reuses `generatePosters`, stores result assets in object storage, and exposes only safe task metadata and task-scoped asset bytes through `/api/tasks/[taskId]`.

**Tech Stack:** Next.js Node runtime, TypeScript, Vitest, Zustand, `ioredis`, `@aws-sdk/client-s3`, pnpm, R2/S3-compatible storage.

---

### Task 1: Define the safe task, queue, and storage contracts with failing tests

**Files:**
- Create: `src/server/async/task-store.test.ts`
- Create: `src/server/async/image-generation-queue.test.ts`
- Create: `src/server/storage/r2.test.ts`
- Create: `src/server/async/task-types.ts`
- Create: `src/server/async/task-store.ts`
- Create: `src/server/async/image-generation-queue.ts`
- Create: `src/server/storage/r2.ts`

- [ ] Write tests for queued/running/succeeded/failed transitions, expiry, safe serialization, memory queue ordering/ack, and memory object put/get/delete/exists.
- [ ] Run the new tests and confirm they fail because the contracts and implementations do not exist.
- [ ] Implement the minimal typed interfaces and mock implementations; Redis/S3 adapters may initially throw a clear configuration error until their tests are added.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Implement Redis and R2 adapters and sensitive-field boundaries

**Files:**
- Modify: `src/server/async/task-store.ts`
- Modify: `src/server/async/image-generation-queue.ts`
- Modify: `src/server/storage/r2.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Test: `src/server/async/task-store.test.ts`
- Test: `src/server/async/image-generation-queue.test.ts`
- Test: `src/server/storage/r2.test.ts`

- [ ] Add red tests proving Redis queue/task serialization contains no image data, API key, provider response, or secret fields, and that R2 uses only task asset keys.
- [ ] Run the focused tests to verify the expected failures.
- [ ] Add only the required runtime dependencies and implement Redis-backed stores/queues plus the AWS SDK S3-compatible adapter with `Uint8Array`/`Buffer` APIs.
- [ ] Run focused tests and verify mock implementations remain independent of external services.

### Task 3: Convert POST /api/generate to safe 202 task submission

**Files:**
- Modify: `src/app/api/generate/route.ts`
- Modify: `src/app/api/generate/route.test.ts`
- Create: `src/server/async/task-submission.ts`

- [ ] Add failing tests for `202 { taskId, status: "queued" }`, original bytes stored outside the queue, existing body/parameter limits, and safe errors.
- [ ] Run route tests and confirm the old synchronous response fails the new contract.
- [ ] Decode the validated image Data URL in memory, create a task-scoped original key, write it to selected storage, create queued state, and enqueue only `{ taskId, originalKey, keywords, forbiddenWords, creativeIdea, safeConfig }`.
- [ ] Use mock in-process worker triggering when Redis is absent; use Redis-only enqueue when `REDIS_URL` exists.
- [ ] Run route tests and existing route tests.

### Task 4: Implement worker processing, idempotency, retries, and result assets

**Files:**
- Create: `src/server/async/image-generation-worker.ts`
- Create: `src/server/async/image-generation-worker.test.ts`
- Modify: `src/server/generation/generate-posters.ts` only if a narrow worker integration seam is needed

- [ ] Add failing tests for running phases/progress, successful poster asset writes, partial warnings, all-failed status, duplicate success idempotency, and retry limit.
- [ ] Run worker tests and confirm red.
- [ ] Implement `processTask`, `runOnce`, and `workerMain`; load original bytes into a data URL, call `generatePosters`, decode result images to storage, update safe metadata, and never write disk or include secrets in task state.
- [ ] Add a bounded task timeout and per-task attempt count; acknowledge only after terminal state is persisted.
- [ ] Run worker tests with injected providers/stores/queues and verify mock mode consumes without external calls.

### Task 5: Add safe task status and asset routes

**Files:**
- Create: `src/app/api/tasks/[taskId]/route.ts`
- Create: `src/app/api/tasks/[taskId]/route.test.ts`
- Modify: `src/server/async/task-store.ts` only for route-facing safe projection

- [ ] Add failing tests for queued/running/succeeded/failed JSON, missing/expired 404, secret omission, taskId/style validation, and correct asset MIME bytes.
- [ ] Run route tests and confirm red.
- [ ] Implement safe status projection and a task-scoped asset proxy that accepts only the current task ID and known result asset key/style.
- [ ] Ensure arbitrary URLs, arbitrary Data URLs, R2 credentials, provider names, raw responses, and stack traces never enter responses.
- [ ] Run task route tests.

### Task 6: Convert the front end to 202 submission and polling

**Files:**
- Modify: `src/components/generation/GenerationScreen.tsx`
- Modify: `src/components/generation/GenerationScreen.test.tsx`
- Modify: `src/components/choose/ChooseScreen.tsx`
- Modify: `src/components/choose/ChooseScreen.test.tsx`
- Modify: `src/lib/export/render-poster.ts` only for same-origin asset loading

- [ ] Add failing tests for 202 handling, two-second polling, succeeded conversion, failed input retention, abort on unmount, and same-origin asset download conversion.
- [ ] Run focused component tests and confirm red.
- [ ] Implement task polling with one AbortController and timer cleanup; keep six phase copy without fake percentages; build the existing `GenerationResult` from safe task metadata on success.
- [ ] Make ChooseScreen fetch same-origin asset URLs into validated image Data URLs before download while preserving mock Data URLs.
- [ ] Run focused tests and mobile E2E.

### Task 7: Add worker command, environment documentation, and final verification

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `README.md`
- Test: all relevant tests and `tests/e2e/mobile-poster.spec.ts`

- [ ] Add a production worker command without changing deployment/Task 11 files; document mock Web+worker versus Redis/R2 production startup and no-disk behavior.
- [ ] Run, in order: `pnpm test`, `pnpm typecheck`, `pnpm build`, `node scripts/verify-production-start.mjs`, and `pnpm exec playwright test tests/e2e/mobile-poster.spec.ts` using bundled Node/PATH.
- [ ] Run `git diff --check`, inspect only Task 10 changes, ensure `pnpm-workspace.yaml` and `CLAUDE.md` are untouched, and commit with a clear message.
