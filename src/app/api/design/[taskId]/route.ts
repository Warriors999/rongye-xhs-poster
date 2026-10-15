import { getDesignTaskService } from '@/server/async/design-task';
import { isTaskId } from '@/server/async/task-types';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ taskId: string }> }): Promise<Response> {
  const { taskId } = await context.params;
  if (!isTaskId(taskId)) return Response.json({ error: '任务不存在或已过期' }, { status: 404 });
  const task = getDesignTaskService().get(taskId);
  if (!task) return Response.json({ error: '任务不存在或已过期' }, { status: 404 });
  return Response.json(task, { headers: { 'cache-control': 'no-store' } });
}
