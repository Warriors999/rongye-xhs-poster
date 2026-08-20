import { describe, expect, it } from 'vitest';
import { isBasicAuthValid } from './middleware';

describe('access password middleware', () => {
  it('accepts the configured password from basic auth', () => {
    const header = `Basic ${btoa('guest:private-pass')}`;
    expect(isBasicAuthValid(header, 'private-pass')).toBe(true);
    expect(isBasicAuthValid(header, 'wrong-pass')).toBe(false);
  });

  it('rejects missing, malformed and empty credentials', () => {
    expect(isBasicAuthValid(null, 'private-pass')).toBe(false);
    expect(isBasicAuthValid('Bearer private-pass', 'private-pass')).toBe(false);
    expect(isBasicAuthValid(`Basic ${btoa('guest:')}`, 'private-pass')).toBe(false);
    expect(isBasicAuthValid(`Basic ${btoa('guest:private-pass')}`, '')).toBe(false);
  });
});
