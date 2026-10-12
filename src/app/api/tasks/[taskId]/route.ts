import { assetKeyFor, isTaskId } from '@/server/async/task-types';
import { posterDraftSchema } from '@/server/ai/contracts';
import { getAsyncRuntime } from '@/server/async/runtime';

export const runtime = 'nodejs';

const allowedStyles = new Set(['lifestyle', 'story', 'editorial', 'cute', 'daily', 'series']);

interface TaskRouteContext {
  params: Promise<{ taskId: string }>;
}

function notFound(): Response {
  return Response.json({ error: '任务不存在或已过期' }, { status: 404 });
}

export async function GET(request: Request, context: TaskRouteContext): Promise<Response> {
  const { taskId } = await context.params;
  if (!isTaskId(taskId)) return notFound();
  const runtimeServices = getAsyncRuntime();
  const task = await runtimeServices.store.get(taskId);
  if (!task) return notFound();

  const url = new URL(request.url);
  const assetStyle = url.searchParams.get('asset');
  if (assetStyle !== null) {
    if (!allowedStyles.has(assetStyle) || task.status !== 'succeeded' || !task.result) return notFound();
    const poster = task.result.posters.find((candidate) => candidate.style === assetStyle);
    if (!poster || poster.image.assetKey !== assetKeyFor(taskId, poster.style)) return notFound();
    const object = await runtimeServices.storage.get(poster.image.assetKey);
    if (!object || !/^image\//i.test(object.contentType)) return notFound();
    const body = new Blob([object.data.buffer as ArrayBuffer], { type: object.contentType });
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': object.contentType,
        'cache-control': 'private, no-store'
      }
    });
  }

  const result = task.result
    ? {
        analysis: task.result.analysis,
        research: task.result.research,
        posters: task.result.posters.map((poster) => ({
          style: poster.style,
          copy: poster.copy,
          background: poster.background,
          layers: poster.layers,
          design: poster.design,
          designNote: poster.designNote,
          ...(posterDraftSchema.shape.finalPrompt.safeParse(poster.finalPrompt).success && typeof poster.finalPrompt === 'string' ? { finalPrompt: poster.finalPrompt } : {}),
          image: {
            id: poster.image.id ?? `poster-${poster.style}`,
            assetKey: poster.image.assetKey,
            contentType: poster.image.contentType,
            width: poster.image.width,
            height: poster.image.height,
            source: poster.image.source ?? 'beautified',
            ...(poster.image.mode ? { mode: poster.image.mode } : {}),
            assetUrl: `/api/tasks/${taskId}?asset=${poster.style}`
          }
        })),
        ...(task.result.warnings ? { warnings: task.result.warnings } : {})
      }
    : undefined;
  return Response.json({
    status: task.status,
    phase: task.phase,
    progress: task.progress,
    warnings: task.warnings,
    ...(task.error ? { error: task.error } : {}),
    expiresAt: task.expiresAt,
    ...(result ? { result } : {})
  });
}
