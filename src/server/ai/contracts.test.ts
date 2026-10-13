import { describe, expect, it } from 'vitest';
import {
  approvedPlanSchema,
  generationRequestSchema,
  generateResponseSchema,
  imageAssetSchema,
  imageDataUrlSchema,
  posterDirectionSchema,
  posterStyleSchema,
  researchSummarySchema
} from '@/server/ai/contracts';
import { formatDesignedImagePrompt } from '@/lib/image-prompt-spec';

const imageDataUrl = 'data:image/png;base64,AAAA';

const research = {
  query: '针织玩偶生活方式海报',
  sources: [{ title: '手作生活方式海报参考', url: 'https://example.com/reference' }],
  composition: '主体偏下，保留清晰留白和单一视觉重心。',
  palette: '奶油白、低饱和珊瑚和暖灰绿。',
  material: '针织、布料和柔和纸张纹理。',
  typography: '短标题配一行辅助文字，字号层级清晰。',
  density: '低密度，装饰少而有秩序。',
  fallback: false
};

const design = {
  direction: 'lifestyle',
  concept: '把针织玩偶放进温柔的日常场景。',
  layout: '主体清晰，文字位于留白区。',
  scene: '温暖的手作桌面与自然光。',
  elements: ['布料', '纸张'],
  palette: ['奶油白', '珊瑚粉'],
  typography: '短标题和简洁辅助文字。',
  hierarchy: '主体优先，其次是标题和标签。',
  mood: '温柔、轻快。',
  negative: ['不要遮挡主体']
};

const response = {
  analysis: { subject: '针织玩偶', colors: ['奶油白'], material: '针织', details: ['纽扣'] },
  research,
  warnings: ['部分方向生成失败时仍保留已成功的海报。'],
  posters: [{
    style: 'lifestyle',
    image: { id: 'upload', dataUrl: imageDataUrl, width: 768, height: 1024, source: 'upload' },
    copy: { title: '软乎乎的一天', description: '针织小伙伴的日常。', tags: ['#针织玩偶'] },
    background: '#f8e5df',
    designNote: '用自然光和针织纹理强调玩偶的陪伴感。',
    design,
    layers: {
      title: { type: 'text', id: 'title', text: '软乎乎的一天', x: 24, y: 40, width: 402, fontFamily: 'system-ui', fontSize: 32, fill: '#222', align: 'left' },
      description: { type: 'text', id: 'description', text: '针织小伙伴的日常。', x: 24, y: 108, width: 402, fontFamily: 'system-ui', fontSize: 18, fill: '#555', align: 'left' },
      tag: { type: 'text', id: 'tag', text: '#针织玩偶', x: 24, y: 870, width: 402, fontFamily: 'system-ui', fontSize: 16, fill: '#d87568', align: 'left' },
      stickers: { 'sticker-1': { type: 'sticker', id: 'sticker-1', emoji: '✨', x: 360, y: 620, scale: 1 } }
    }
  }]
};

describe('AI contracts', () => {
  it('accepts only ordered GPT Image 2.5 prompt sections for reviewed submissions', () => {
    const poster = response.posters[0];
    const finalPrompt = formatDesignedImagePrompt({
      subject: '原图中的针织玩偶，保留原有脸部和配件',
      composition: '主体靠左，右侧保留标题位置',
      visualLanguage: '真实针织质感的摄影海报',
      colorLighting: '深蓝背景，柔和侧光',
      preserve: '保留原图主体身份、姿态和针织纹理'
    }, poster.copy)!;
    const plan = { analysis: response.analysis, research, posters: [{ ...poster, finalPrompt }] };
    expect(approvedPlanSchema.safeParse(plan).success).toBe(true);
    expect(approvedPlanSchema.safeParse({ ...plan, posters: [{ ...poster, finalPrompt: '随意拼接的长段落' }] }).success).toBe(false);
  });
  it('rejects an empty or non-image data URL', () => {
    expect(generationRequestSchema.safeParse({ imageDataUrl: '' }).success).toBe(false);
    expect(generationRequestSchema.safeParse({ imageDataUrl: 'https://example.com/a.png' }).success).toBe(false);
  });

  it('requires complete image data URLs without over-restricting image payloads', () => {
    const malformed = ['data:image/png', 'data:image/', 'data:text/html,<p>bad</p>', 'javascript:alert(1)', 'data:image/png;base64,'];
    for (const dataUrl of malformed) {
      expect(imageDataUrlSchema.safeParse(dataUrl).success).toBe(false);
      expect(imageAssetSchema.safeParse({ ...response.posters[0].image, dataUrl }).success).toBe(false);
      expect(generationRequestSchema.safeParse({ imageDataUrl: dataUrl, width: 768, height: 1024 }).success).toBe(false);
    }

    expect(imageDataUrlSchema.safeParse('data:image/png;base64,AAAA+/==').success).toBe(true);
    expect(imageDataUrlSchema.safeParse('data:image/svg+xml;charset=utf-8,%3Csvg%20%2F%3E').success).toBe(true);
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

  it('accepts all supported poster directions', () => {
    expect(['lifestyle', 'story', 'editorial'].map((direction) => posterDirectionSchema.safeParse(direction).success)).toEqual([true, true, true]);
    expect(['lifestyle', 'story', 'editorial'].map((direction) => posterStyleSchema.safeParse(direction).success)).toEqual([true, true, true]);
    expect(['cute', 'daily', 'series'].map((style) => posterStyleSchema.safeParse(style).success)).toEqual([true, true, true]);
    expect(posterDirectionSchema.safeParse('cute').success).toBe(false);
  });

  it('keeps legacy poster styles parseable with safe metadata defaults', () => {
    const { designNote: _designNote, design: _design, ...legacyDraft } = response.posters[0];
    const { direction: _direction, ...legacyDesign } = design;
    const legacyPoster = {
      ...legacyDraft,
      style: 'cute',
      design: { ...legacyDesign, direction: 'lifestyle' },
      designNote: '以主体保真为前提，保留清晰留白。'
    };
    const parsed = generateResponseSchema.safeParse({
      analysis: response.analysis,
      research: response.research,
      posters: [
        legacyPoster,
        { ...legacyPoster, style: 'daily' },
        { ...legacyPoster, style: 'series' }
      ]
    });

    expect(parsed.success).toBe(true);
  });

  it('requires dynamic metadata on new generation responses', () => {
    const posters = [
      response.posters[0],
      { ...response.posters[0], style: 'story', design: { ...design, direction: 'story' }, designNote: '用前中后景组织轻量故事。' },
      { ...response.posters[0], style: 'editorial', design: { ...design, direction: 'editorial' }, designNote: '用留白和层级建立秩序。' }
    ];
    const complete = { ...response, posters };

    expect(generateResponseSchema.safeParse({ ...complete, research: undefined }).success).toBe(false);
    expect(generateResponseSchema.safeParse({
      ...complete,
      posters: [{ ...posters[0], designNote: undefined }, posters[1], posters[2]]
    }).success).toBe(false);
    expect(generateResponseSchema.safeParse({
      ...complete,
      posters: [{ ...posters[0], design: { ...design, direction: undefined } }, posters[1], posters[2]]
    }).success).toBe(false);
  });

  it('accepts a legal research summary', () => {
    expect(researchSummarySchema.safeParse(research).success).toBe(true);
    expect(researchSummarySchema.safeParse({ ...research, query: 'a'.repeat(201) }).success).toBe(false);
    expect(researchSummarySchema.safeParse({ ...research, sources: Array(9).fill({ title: '参考' }) }).success).toBe(false);
    expect(researchSummarySchema.safeParse({ ...research, sources: [{ title: 'a'.repeat(201) }] }).success).toBe(false);
  });

  it('accepts research and three unique dynamic directions', () => {
    const parsed = generateResponseSchema.safeParse({
      ...response,
      posters: [
        response.posters[0],
        { ...response.posters[0], style: 'story', design: { ...design, direction: 'story' }, designNote: '用前中后景组织一段轻量故事。' },
        { ...response.posters[0], style: 'editorial', design: { ...design, direction: 'editorial' }, designNote: '用留白和字体层级建立编辑秩序。' }
      ]
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.research).toEqual(research);
      expect(parsed.data.posters.map((poster) => poster.style)).toEqual(['lifestyle', 'story', 'editorial']);
      expect(parsed.data.posters.map((poster) => poster.designNote)).toEqual([
        '用自然光和针织纹理强调玩偶的陪伴感。',
        '用前中后景组织一段轻量故事。',
        '用留白和字体层级建立编辑秩序。'
      ]);
    }
  });

  it('rejects duplicate poster directions', () => {
    expect(generateResponseSchema.safeParse({
      ...response,
      posters: [
        response.posters[0],
        { ...response.posters[0], style: 'lifestyle', design: { ...design, direction: 'lifestyle' } },
        { ...response.posters[0], style: 'editorial', design: { ...design, direction: 'editorial' } }
      ]
    }).success).toBe(false);
  });

  it('accepts one or two successful posters as a partial result', () => {
    const posters = [
      response.posters[0],
      { ...response.posters[0], style: 'story', design: { ...design, direction: 'story' } },
      { ...response.posters[0], style: 'editorial', design: { ...design, direction: 'editorial' } }
    ];

    expect(generateResponseSchema.safeParse({ ...response, posters: posters.slice(0, 1) }).success).toBe(true);
    expect(generateResponseSchema.safeParse({ ...response, posters: posters.slice(0, 2) }).success).toBe(true);
    expect(generateResponseSchema.safeParse({ ...response, posters: [] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...response, posters: [...posters, { ...posters[0], style: 'lifestyle' }] }).success).toBe(false);
  });

  it('accepts any valid resize-image dimensions in a response', () => {
    const parsed = generateResponseSchema.safeParse({ ...response, posters: [response.posters[0], { ...response.posters[0], style: 'story', design: { ...design, direction: 'story' } }, { ...response.posters[0], style: 'editorial', design: { ...design, direction: 'editorial' } }] });
    expect(parsed.success).toBe(true);
    expect(generateResponseSchema.safeParse({ ...response, posters: [{ ...response.posters[0], image: { ...response.posters[0].image, width: 1600, height: 900 } }, { ...response.posters[0], style: 'story', design: { ...design, direction: 'story' }, image: { ...response.posters[0].image, width: 1600, height: 900 } }, { ...response.posters[0], style: 'editorial', design: { ...design, direction: 'editorial' }, image: { ...response.posters[0].image, width: 1600, height: 900 } }] }).success).toBe(true);
    expect(generateResponseSchema.safeParse({ ...response, posters: [{ ...response.posters[0], image: { ...response.posters[0].image, width: 1601 } }, { ...response.posters[0], style: 'story', design: { ...design, direction: 'story' } }, { ...response.posters[0], style: 'editorial', design: { ...design, direction: 'editorial' } }] }).success).toBe(false);
  });

  it('requires image dimensions to be finite positive integers', () => {
    const valid = [response.posters[0], { ...response.posters[0], style: 'story', design: { ...design, direction: 'story' } }, { ...response.posters[0], style: 'editorial', design: { ...design, direction: 'editorial' } }];
    for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(generateResponseSchema.safeParse({ ...response, posters: [{ ...response.posters[0], image: { ...response.posters[0].image, width: value } }, valid[1], valid[2]] }).success).toBe(false);
    }
  });

  it('rejects duplicate poster styles', () => {
    expect(generateResponseSchema.safeParse({ ...response, posters: [response.posters[0], { ...response.posters[0], style: 'lifestyle' }, { ...response.posters[0], style: 'editorial', design: { ...design, direction: 'editorial' } }] }).success).toBe(false);
  });

  it('accepts drafts with optional fixed text layers', () => {
    const draft = { ...response.posters[0], layers: { stickers: {} } };
    const parsed = generateResponseSchema.safeParse({ ...response, posters: [draft, { ...draft, style: 'story', design: { ...design, direction: 'story' } }, { ...draft, style: 'editorial', design: { ...design, direction: 'editorial' } }] });
    expect(parsed.success).toBe(true);
  });

  it('rejects oversized text, tags, analysis arrays and stickers', () => {
    const draft = { ...response.posters[0], layers: { stickers: {} } };
    const valid = { ...response, posters: [draft, { ...draft, style: 'story', design: { ...design, direction: 'story' } }, { ...draft, style: 'editorial', design: { ...design, direction: 'editorial' } }] };
    expect(generateResponseSchema.safeParse({ ...valid, analysis: { ...valid.analysis, colors: Array(13).fill('颜色') } }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, analysis: { ...valid.analysis, details: Array(13).fill('细节') } }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, copy: { ...draft.copy, title: 'a'.repeat(201) } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, copy: { ...draft.copy, tags: Array(9).fill('#标签') } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { stickers: Object.fromEntries(Array.from({ length: 13 }, (_, index) => [`sticker-${index}`, { type: 'sticker', id: `sticker-${index}`, emoji: '✨', x: 1, y: 1, scale: 1 }])) } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
  });

  it('rejects empty trimmed copy, layer text, tags, colors and details', () => {
    const draft = { ...response.posters[0], layers: { stickers: {} } };
    const valid = { ...response, posters: [draft, { ...draft, style: 'story', design: { ...design, direction: 'story' } }, { ...draft, style: 'editorial', design: { ...design, direction: 'editorial' } }] };
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, copy: { ...draft.copy, title: '   ' } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { title: { ...response.posters[0].layers.title, text: '   ' }, stickers: {} } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, copy: { ...draft.copy, tags: ['#有效', '  '] } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, analysis: { ...valid.analysis, colors: ['  '] } }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, analysis: { ...valid.analysis, details: ['  '] } }).success).toBe(false);
  });

  it('requires sticker keys and ids to match unique sticker identifiers', () => {
    const draft = { ...response.posters[0], layers: { stickers: {} } };
    const valid = { ...response, posters: [draft, { ...draft, style: 'story', design: { ...design, direction: 'story' } }, { ...draft, style: 'editorial', design: { ...design, direction: 'editorial' } }] };
    const sticker = { type: 'sticker' as const, id: 'sticker-1' as const, emoji: '✨', x: 1, y: 1, scale: 1 };
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { stickers: { invalid: sticker } } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { stickers: { 'sticker-1': { ...sticker, id: 'sticker-2' } } } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { stickers: { 'sticker-1': sticker, 'sticker-2': { ...sticker } } } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
  });

  it('rejects out-of-bounds geometry, font sizes, scales, backgrounds and data URLs', () => {
    const draft = { ...response.posters[0], layers: { stickers: {} } };
    const valid = { ...response, posters: [draft, { ...draft, style: 'story', design: { ...design, direction: 'story' } }, { ...draft, style: 'editorial', design: { ...design, direction: 'editorial' } }] };
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
    const valid = { ...response, posters: [draft, { ...draft, style: 'story', design: { ...design, direction: 'story' } }, { ...draft, style: 'editorial', design: { ...design, direction: 'editorial' } }] };
    const sticker = { type: 'sticker' as const, id: 'sticker-1' as const, emoji: '✨', x: 768, y: 1024, scale: 1 };
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { stickers: { 'sticker-1': { ...sticker, x: 769 } } } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ ...valid, posters: [{ ...draft, layers: { stickers: { 'sticker-1': { ...sticker, y: 1025 } } } }, valid.posters[1], valid.posters[2]] }).success).toBe(false);
  });
});


it('accepts a complete optional reference and revision but rejects incomplete dimensions', () => {
  const base = { imageDataUrl: 'data:image/png;base64,AAAA', width: 600, height: 800 };
  expect(generationRequestSchema.safeParse({ ...base, referenceImageDataUrl: 'data:image/png;base64,BBBB', referenceWidth: 500, referenceHeight: 700, targetStyle: 'story', revisionPrompt: '深蓝背景' }).success).toBe(true);
  expect(generationRequestSchema.safeParse({ ...base, referenceImageDataUrl: 'data:image/png;base64,BBBB' }).success).toBe(false);
  expect(generationRequestSchema.safeParse({ ...base, referenceWidth: 500, referenceHeight: 700 }).success).toBe(false);
  const result = generationRequestSchema.parse({ ...base, targetStyle: 'story', revisionPrompt: '深蓝背景' });
  expect(result.targetStyle).toBe('story');
});
