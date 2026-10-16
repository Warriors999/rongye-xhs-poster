import { expect, it } from 'vitest';
import { parseModelJson } from './model-json';

it('extracts final JSON after completed gateway thinking blocks and markdown fences', () => {
  const text = '<think>Internal draft {"posters":[]} and reasoning.</think>\n```json\n{"analysis":{"subject":"针织兔子"},"posters":[{"title":"柔软的一天"}]}\n```';
  expect(parseModelJson(text)).toEqual({ analysis: { subject: '针织兔子' }, posters: [{ title: '柔软的一天' }] });
});

it('does not use an unfinished thought or repair truncated JSON', () => {
  expect(() => parseModelJson('<think>{"posters":[]}')).toThrow();
  expect(() => parseModelJson('<think>done</think>{"posters":[')).toThrow();
});

it('preserves strings and rejects trailing prose instead of selecting an arbitrary object', () => {
  expect(parseModelJson('{"text":"literal <think>preserve this</think>"}')).toEqual({ text: 'literal <think>preserve this</think>' });
  expect(() => parseModelJson('draft {"a":1} final {"a":2}')).toThrow();
});
