// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { getAsyncRuntime, resetAsyncRuntimeForTests, validateAsyncRuntimeConfig } from './runtime';

const emptyStorage = {
  REDIS_URL: '',
  R2_ENDPOINT: '',
  R2_ACCESS_KEY_ID: '',
  R2_SECRET_ACCESS_KEY: '',
  R2_BUCKET: ''
};

const distributedStorage = {
  REDIS_URL: 'redis://localhost:6379',
  R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
  R2_ACCESS_KEY_ID: 'access-key',
  R2_SECRET_ACCESS_KEY: 'secret-key',
  R2_BUCKET: 'knitting-posters'
};

describe('async runtime configuration', () => {
  afterEach(() => resetAsyncRuntimeForTests());

  it('uses the local mode only when Redis and every R2 value are empty', () => {
    expect(validateAsyncRuntimeConfig(emptyStorage)).toEqual({ mode: 'local' });
    expect(getAsyncRuntime(emptyStorage).store.constructor.name).toBe('InMemoryTaskStore');
  });

  it('accepts the complete distributed configuration as one atomic mode', () => {
    expect(validateAsyncRuntimeConfig(distributedStorage)).toEqual({ mode: 'distributed' });
  });

  it.each([
    { ...emptyStorage, REDIS_URL: 'redis://localhost:6379' },
    { ...emptyStorage, R2_ENDPOINT: distributedStorage.R2_ENDPOINT },
    { ...emptyStorage, R2_ENDPOINT: distributedStorage.R2_ENDPOINT, R2_BUCKET: distributedStorage.R2_BUCKET },
    { ...distributedStorage, R2_SECRET_ACCESS_KEY: '' }
  ])('rejects a partial Redis/R2 configuration at runtime creation', (env) => {
    expect(() => getAsyncRuntime(env)).toThrow(/REDIS_URL 与 R2_ENDPOINT、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY、R2_BUCKET 必须同时配置/);
  });
});
