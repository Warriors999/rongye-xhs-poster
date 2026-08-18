import { describe, expect, it } from 'vitest';
import { generationRequestSchema, generateResponseSchema, posterStyleSchema } from '@/server/ai/contracts';

const imageDataUrl = 'data:image/png;base64,AAAA';

const response = {
  analysis: { subject: '针织玩偶', colors: ['奶油白'], material: '针织', details: ['纽扣'] },
  posters: [{
    style: 'cute',
    image: { id: 'upload', dataUrl: imageDataUrl, width: 768, height: 1024, source: 'upload' },
    copy: { title: '软乎乎的一天', description: '针织小伙伴的日常。', tags: ['#针织玩偶'] },
    background: '#f8e5df',
    layers: {
      title: { type: 'text', id: 'title', text: '软乎乎的一天', x: 24, y: 40, width: 402, fontFamily: 'system-ui', fontSize: 32, fill: '#222', align: 'left' },
      description: { type: 'text', id: 'description', text: '针织小伙伴的日常。', x: 24, y: 108, width: 402, fontFamily: 'system-ui', fontSize: 18, fill: '#555', align: 'left' },
      tag: { type: 'text', id: 'tag', text: '#针织玩偶', x: 24, y: 870, width: 402, fontFamily: 'system-ui', fontSize: 16, fill: '#d87568', align: 'left' },
      stickers: { 'sticker-1': { type: 'sticker', id: 'sticker-1', emoji: '✨', x: 360, y: 620, scale: 1 } }
    }
  }]
};

describe('AI contracts', () => {
  it('rejects an empty or non-image data URL', () => {
    expect(generationRequestSchema.safeParse({ imageDataUrl: '' }).success).toBe(false);
    expect(generationRequestSchema.safeParse({ imageDataUrl: 'https://example.com/a.png' }).success).toBe(false);
  });

  it('defaults optional text and rejects overlong keywords and forbidden words', () => {
    const parsed = generationRequestSchema.safeParse({ imageDataUrl, width: 1600, height: 900 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual({ imageDataUrl, width: 1600, height: 900, keywords: '', forbiddenWords: '', creativeIdea: '' });
    expect(generationRequestSchema.safeParse({ imageDataUrl }).success).toBe(false);
    expect(generationRequestSchema.safeParse({ imageDataUrl, keywords: 'a'.repeat(501) }).success).toBe(false);
    expect(generationRequestSchema.safeParse({ imageDataUrl, forbiddenWords: 'a'.repeat(301) }).success).toBe(false);
    expect(generationRequestSchema.safeParse({ imageDataUrl, creativeIdea: 'a'.repeat(501) }).success).toBe(false);
  });

  it('accepts all supported poster styles', () => {
    expect(['cute', 'daily', 'series'].map((style) => posterStyleSchema.safeParse(style).success)).toEqual([true, true, true]);
  });

  it('accepts any valid resize-image dimensions in a response', () => {
    const parsed = generateResponseSchema.safeParse({ ...response, posters: [response.posters[0], { ...response.posters[0], style: 'daily' }, { ...response.posters[0], style: 'series' }] });
    expect(parsed.success).toBe(true);
    expect(generateResponseSchema.safeParse({ ...response, posters: [{ ...response.posters[0], image: { ...response.posters[0].image, width: 1600, height: 900 } }, { ...response.posters[0], style: 'daily', image: { ...response.posters[0].image, width: 1600, height: 900 } }, { ...response.posters[0], style: 'series', image: { ...response.posters[0].image, width: 1600, height: 900 } }] }).success).toBe(true);
    expect(generateResponseSchema.safeParse({ ...response, posters: [{ ...response.posters[0], image: { ...response.posters[0].image, width: 1601 } }, { ...response.posters[0], style: 'daily' }, { ...response.posters[0], style: 'series' }] }).success).toBe(false);
  });

  it('requires image dimensions to be finite positive integers', () => {
    const valid = [response.posters[0], { ...response.posters[0], style: 'daily' }, { ...response.posters[0], style: 'series' }];
    for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(generateResponseSchema.safeParse({ ...response, posters: [{ ...response.posters[0], image: { ...response.posters[0].image, width: value } }, valid[1], valid[2]] }).success).toBe(false);
    }
  });

  it('rejects duplicate poster styles', () => {
    expect(generateResponseSchema.safeParse({ ...response, posters: [response.posters[0], { ...response.posters[0], style: 'cute' }, { ...response.posters[0], style: 'series' }] }).success).toBe(false);
  });

  it('accepts drafts with optional fixed text layers', () => {
    const draft = { ...response.posters[0], layers: { stickers: {} } };
    const parsed = generateResponseSchema.safeParse({ ...response, posters: [draft, { ...draft, style: 'daily' }, { ...draft, style: 'series' }] });
    expect(parsed.success).toBe(true);
  });

  it('rejects oversized text, tags, analysis arrays and stickers', () => {
    const draft = { ...response.posters[0], layers: { stickers: {} } };
    const valid = { ...response, posters: [draft, { ...draft, style: 'daily' }, { ...draft, style: 'series' }] };
    expect(generateResponseSchema.safeParse({ ...valid, analysis: { ...valid.analysis, colors: Array(13).fill('颜色') } }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, analysis: { ...valid.analysis, details: Array(13).fill('细节') } }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, copy: { ...draft.copy, title: 'a'.repeat(201) } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, copy: { ...draft.copy, tags: Array(9).fill('#标签') } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { stickers: Object.fromEntries(Array.from({ length: 13 }, (_, index) => [`sticker-${index}`, { type: 'sticker', id: `sticker-${index}`, emoji: '✨', x: 1, y: 1, scale: 1 }])) } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
  });

  it('rejects empty trimmed copy, layer text, tags, colors and details', () => {
    const draft = { ...response.posters[0], layers: { stickers: {} } };
    const valid = { ...response, posters: [draft, { ...draft, style: 'daily' }, { ...draft, style: 'series' }] };
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, copy: { ...draft.copy, title: '   ' } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { title: { ...response.posters[0].layers.title, text: '   ' }, stickers: {} } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, copy: { ...draft.copy, tags: ['#有效', '  '] } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, analysis: { ...valid.analysis, colors: ['  '] } }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, analysis: { ...valid.analysis, details: ['  '] } }).success).toBe(false);
  });

  it('requires sticker keys and ids to match unique sticker identifiers', () => {
    const draft = { ...response.posters[0], layers: { stickers: {} } };
    const valid = { ...response, posters: [draft, { ...draft, style: 'daily' }, { ...draft, style: 'series' }] };
    const sticker = { type: 'sticker' as const, id: 'sticker-1' as const, emoji: '✨', x: 1, y: 1, scale: 1 };
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { stickers: { invalid: sticker } } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { stickers: { 'sticker-1': { ...sticker, id: 'sticker-2' } } } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { stickers: { 'sticker-1': sticker, 'sticker-2': { ...sticker } } } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
  });

  it('rejects out-of-bounds geometry, font sizes, scales, backgrounds and data URLs', () => {
    const draft = { ...response.posters[0], layers: { stickers: {} } };
    const valid = { ...response, posters: [draft, { ...draft, style: 'daily' }, { ...draft, style: 'series' }] };
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { title: { ...response.posters[0].layers.title, x: 1201 }, stickers: {} } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { title: { ...response.posters[0].layers.title, x: 367, width: 402 }, stickers: {} } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { title: { ...response.posters[0].layers.title, y: 1025 }, stickers: {} } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { title: { ...response.posters[0].layers.title, width: 0 }, stickers: {} } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { title: { ...response.posters[0].layers.title, x: Number.NaN }, stickers: {} } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { title: { ...response.posters[0].layers.title, fontSize: 7 }, stickers: {} } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { stickers: { 'sticker-1': { type: 'sticker', id: 'sticker-1', emoji: '✨', x: 1, y: 1, scale: 4.1 } } } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, background: 'a'.repeat(101) }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, image: { ...draft.image, dataUrl: `data:image/png;base64,${'a'.repeat(10_000_001)}` } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
  });

  it('rejects stickers outside the poster canvas', () => {
    const draft = { ...response.posters[0], layers: { stickers: {} } };
    const valid = { ...response, posters: [draft, { ...draft, style: 'daily' }, { ...draft, style: 'series' }] };
    const sticker = { type: 'sticker' as const, id: 'sticker-1' as const, emoji: '✨', x: 768, y: 1024, scale: 1 };
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { stickers: { 'sticker-1': { ...sticker, x: 769 } } } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { stickers: { 'sticker-1': { ...sticker, y: 1025 } } } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
  });
});
