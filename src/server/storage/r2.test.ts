// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { InMemoryObjectStorage } from './r2';

describe('InMemoryObjectStorage', () => {
  it('stores and returns independent image bytes with content type', async () => {
    const storage = new InMemoryObjectStorage();
    const bytes = new Uint8Array([1, 2, 3]);
    await storage.put('tasks/task-1/assets/lifestyle', bytes, 'image/png');
    bytes[0] = 9;

    const object = await storage.get('tasks/task-1/assets/lifestyle');
    expect(object?.contentType).toBe('image/png');
    expect([...object!.data]).toEqual([1, 2, 3]);
    expect(await storage.exists('tasks/task-1/assets/lifestyle')).toBe(true);

    await storage.delete('tasks/task-1/assets/lifestyle');
    expect(await storage.get('tasks/task-1/assets/lifestyle')).toBeNull();
  });

  it('does not expose unrelated keys through a missing lookup', async () => {
    const storage = new InMemoryObjectStorage();
    await storage.put('tasks/task-1/original', new Uint8Array([7]), 'image/png');
    expect(await storage.get('tasks/task-2/original')).toBeNull();
  });
});
