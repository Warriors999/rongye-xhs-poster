import { describe, expect, it, vi } from 'vitest';
import { createDesignTaskService } from './design-task';

const input = {
  image: { id: 'upload', dataUrl: 'data:image/png;base64,AAAA', width: 600, height: 800, source: 'upload' as const },
  keywords: '针织玩偶', forbiddenWords: '', creativeIdea: '春日'
};

describe('design tasks', () => {
  it('returns a task immediately, deduplicates submission, and delivers the finished plan', async () => {
    let finish!: (value: never) => void;
    const result = { analysis: { subject: '兔子', colors: [], material: '毛线', details: [] }, research: { query: '', sources: [], composition: '', palette: '', material: '', typography: '', density: '' }, posters: [] };
    const generate = vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const service = createDesignTaskService(generate);

    expect(service.submit('test-design-123', input)).toEqual({ taskId: 'test-design-123', status: 'running' });
    expect(service.submit('test-design-123', input)).toEqual({ taskId: 'test-design-123', status: 'running' });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(service.get('test-design-123')).toMatchObject({ status: 'running' });
    finish(result as never);
    await vi.waitFor(() => expect(service.get('test-design-123')).toMatchObject({ status: 'succeeded', result }));
    expect(generate).toHaveBeenCalledWith(input, expect.objectContaining({ designOnly: true, timeoutMs: 600_000 }));
  });

  it('records a failure without automatically making another paid model call', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const generate = vi.fn().mockRejectedValue(new Error('生成结果格式异常，请重试'));
    const service = createDesignTaskService(generate);
    service.submit('test-design-456', input);
    await vi.waitFor(() => expect(service.get('test-design-456')).toMatchObject({ status: 'failed', error: '设计服务暂时不可用，请重试' }));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('code=format-error'));
    log.mockRestore();
  });
});
