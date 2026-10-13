// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createEmptyDraft, type ImageAsset, type ResearchSummary } from '@/domain/project';
import { buildPosterPrompt, IMAGE_FORMAT_ERROR } from '@/server/ai/image-provider';
import { formatDesignedImagePrompt } from '@/lib/image-prompt-spec';
import type { ImageBeautifier } from '@/server/ai/image-provider';
import type { Provider } from '@/server/ai/provider';
import type { QualityChecker } from '@/server/ai/quality-provider';
import {
  generatePosters,
  type GeneratePostersDependencies,
  type GeneratePostersInput
} from '@/server/generation/generate-posters';

const uploadImage: ImageAsset = {
  id: 'upload',
  dataUrl: 'data:image/png;base64,UPLOAD',
  width: 1600,
  height: 900,
  source: 'upload'
};

const research: ResearchSummary = {
  query: '手作玩偶微海报',
  sources: [{ title: '参考设计', url: 'https://example.com/reference' }],
  composition: '主体清晰，保留安全留白。',
  palette: '奶油白和低饱和蓝紫色。',
  material: '保留真实针织纹理。',
  typography: '短标题、短辅助句和少量标签。',
  density: '低密度且有秩序。',
  fallback: false
};

function input(): GeneratePostersInput {
  return { image: uploadImage, keywords: '手作', forbiddenWords: '', creativeIdea: '温柔陪伴' };
}

function generatedResult() {
  const directions = ['lifestyle', 'story', 'editorial'] as const;
  return {
    analysis: { subject: '真实针织玩偶', colors: ['蓝紫'], material: '针织纹理', details: ['轮廓'] },
    research,
    posters: directions.map((style) => {
      const draft = createEmptyDraft();
      return { ...draft, style, image: { ...uploadImage, id: `model-${style}`, dataUrl: 'data:image/png;base64,MODEL' }, design: { ...draft.design!, direction: style }, designNote: `${style} 设计说明` };
    })
  };
}

function passingQualityChecker(): QualityChecker {
  return { checkBatch: async ({ candidates }) => (candidates ?? []).map(() => ({ pass: true, issues: [], confidence: 1, skipped: false })) };
}

function successfulImageProvider(onCall?: (image: ImageAsset, options?: unknown) => void): ImageBeautifier {
  return {
    async beautify({ image }, options) {
      onCall?.(image, options);
      return { ...image, id: `generated-${image.id}`, dataUrl: 'data:image/png;base64,GENERATED', width: 1024, height: 1536, source: 'beautified' };
    }
  };
}

function dependencies(overrides: Partial<GeneratePostersDependencies> = {}): GeneratePostersDependencies {
  return {
    getReferenceResearcher: () => ({ research: async () => research }),
    getProvider: () => ({ generate: async () => generatedResult() }) as Provider,
    getImageProvider: () => successfulImageProvider(),
    getQualityChecker: () => passingQualityChecker(),
    ...overrides
  };
}

describe('generatePosters use case', () => {
  it('limits simultaneous image requests to two while preserving three outputs', async () => {
    let active = 0;
    let maximum = 0;
    const imageProvider: ImageBeautifier = { async beautify({ image }) {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return { ...image, source: 'beautified' };
    } };
    const result = await generatePosters(input(), { dependencies: dependencies({ getImageProvider: () => imageProvider }) });
    expect(maximum).toBe(2);
    expect(result.posters).toHaveLength(3);
  });
  it('runs research, brief generation and parallel image generation without HTTP objects', async () => {
    const order: string[] = [];
    let receivedResearch: ResearchSummary | undefined;
    const provider: Provider = {
      async generate(input) {
        order.push('provider');
        receivedResearch = input.research;
        return generatedResult();
      }
    };
    const researcher = { research: async () => { order.push('research'); return research; } };
    const qualityChecker: QualityChecker = {
      async checkBatch() { order.push('quality'); return [{ pass: true, issues: [], confidence: 1, skipped: false }]; }
    };

    const result = await generatePosters(input(), {
      dependencies: dependencies({
        getReferenceResearcher: () => researcher,
        getProvider: () => provider,
        getQualityChecker: () => qualityChecker,
        getImageProvider: () => successfulImageProvider(() => order.push('image'))
      })
    });

    expect(order.slice(0, 2)).toEqual(['research', 'provider']);
    expect(order.filter((item) => item === 'image')).toHaveLength(3);
    expect(order.filter((item) => item === 'quality')).toHaveLength(0);
    expect(receivedResearch).toEqual(research);
    expect(result.posters).toHaveLength(3);
  });

  it('passes the task-scoped environment into the default provider factories', async () => {
    const scopedEnv = { AI_PROVIDER: 'openai-compatible', AI_IMAGE_MODEL: 'gpt-image-2' };
    let receivedEnv: Record<string, string | undefined> | undefined;
    const result = await generatePosters(input(), {
      dependencies: dependencies({
        env: scopedEnv,
        getProvider: (providerDependencies) => {
          receivedEnv = providerDependencies?.env;
          return { generate: async () => generatedResult() } as Provider;
        },
        getImageProvider: () => successfulImageProvider(),
        getQualityChecker: () => passingQualityChecker()
      })
    });

    expect(result.posters).toHaveLength(3);
    expect(receivedEnv).toBe(scopedEnv);
  });

  it('passes the original upload image to every image call and normalizes unsafe model poster fields', async () => {
    const seenImages: string[] = [];
    const unsafeProvider: Provider = {
      async generate() {
        const result = generatedResult();
        return {
          ...result,
          posters: result.posters.map((poster) => ({
            ...poster,
            image: { ...poster.image, dataUrl: 'data:image/png;base64,MODEL_SECRET' },
            copy: { title: '价格 99', description: 'api-key=secret', tags: ['品牌', '2026'] },
            designNote: 'token=secret; 添加第二个主体',
            qualityIssues: ['upstream secret body'],
            layers: { title: { text: 'secret layer' }, stickers: { 'sticker-evil': { emoji: '💣' } } }
          }))
        } as never;
      }
    };

    const result = await generatePosters(input(), {
      dependencies: dependencies({
        getProvider: () => unsafeProvider,
        getImageProvider: () => successfulImageProvider((image) => seenImages.push(image.dataUrl))
      })
    });
    const serialized = JSON.stringify(result);

    expect(seenImages).toEqual([uploadImage.dataUrl, uploadImage.dataUrl, uploadImage.dataUrl]);
    expect(result.posters[0].copy.title).toBe('针织日常');
    expect(result.posters[0].designNote).not.toContain('token');
    expect(result.posters[0].layers.stickers).toEqual({});
    expect(serialized).not.toContain('MODEL_SECRET');
    expect(serialized).not.toContain('secret layer');
    expect(serialized).not.toContain('upstream secret body');
  });

  it('does not expose sensitive metadata embedded in the design brief or note', async () => {
    const unsafeProvider: Provider = {
      async generate() {
        const result = generatedResult();
        return {
          ...result,
          posters: result.posters.map((poster) => ({
            ...poster,
            design: { ...poster.design, concept: 'api-key=secret' },
            designNote: 'api-key=secret'
          }))
        };
      }
    };

    const result = await generatePosters(input(), {
      dependencies: dependencies({ getProvider: () => unsafeProvider })
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('api-key');
    expect(serialized).not.toContain('secret');
  });

  it('removes exact injected secrets and provider model names from every successful response field', async () => {
    const apiKey = 'sK9xQp-7vL2/ab?z=K4';
    const researchKey = 'rR8pL3!mN6/qW';
    const accessPassword = 'A9!qZ/4r';
    const providerName = 'openai-compatible';
    const modelName = 'gemini-3.1-flash-lite';
    const encodedApiKey = encodeURIComponent(apiKey);
    const env = {
      AI_API_KEY: apiKey,
      AI_PROVIDER: providerName,
      AI_VISION_MODEL: modelName,
      REFERENCE_RESEARCH_API_KEY: researchKey,
      APP_ACCESS_PASSWORD: accessPassword
    };
    const unsafeProvider: Provider = {
      async generate() {
        const result = generatedResult();
        return {
          ...result,
          analysis: {
            ...result.analysis,
            subject: `subject ${apiKey}`,
            colors: [encodedApiKey],
            material: modelName,
            details: [providerName]
          },
          research: {
            ...result.research,
            query: researchKey,
            composition: accessPassword
          },
          posters: result.posters.map((poster) => ({
            ...poster,
            copy: { title: apiKey, description: encodedApiKey, tags: [modelName] },
            design: { ...poster.design, concept: modelName, layout: encodedApiKey },
            designNote: researchKey,
            layers: { title: { text: apiKey }, stickers: { 'sticker-secret': { emoji: accessPassword } } }
          })),
          warnings: [`${apiKey} ${researchKey} ${accessPassword} ${providerName} ${modelName}`]
        } as never;
      }
    };
    const scopedDependencies = {
      ...dependencies({ getProvider: () => unsafeProvider }),
      env
    };

    const result = await generatePosters(input(), { dependencies: scopedDependencies });
    const serialized = JSON.stringify(result);

    for (const sensitiveValue of [apiKey, encodedApiKey, researchKey, accessPassword, providerName, modelName]) {
      expect(serialized).not.toContain(sensitiveValue);
    }
    expect(result.posters[0].layers.stickers).toEqual({});
    expect(result.warnings).toEqual([]);
  });

  it('decodes encoded secret text at most twice before comparing with the raw secret', async () => {
    const secret = 'abc/def';
    const unsafeProvider: Provider = {
      async generate() {
        const result = generatedResult();
        return {
          ...result,
          analysis: { ...result.analysis, subject: 'abc%2fdef' },
          research: { ...result.research, query: 'abc%252Fdef' },
          posters: result.posters.map((poster) => ({ ...poster, designNote: 'abc%252Fdef' }))
        };
      }
    };
    const scopedDependencies = {
      ...dependencies({ getProvider: () => unsafeProvider }),
      env: { AI_API_KEY: secret }
    };

    const result = await generatePosters(input(), { dependencies: scopedDependencies });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('abc%2fdef');
    expect(serialized).not.toContain('abc%252Fdef');
  });

  it('matches encoded secret variants locally even when an earlier percent escape is invalid', async () => {
    const secret = 'abc/def';
    const unsafeProvider: Provider = {
      async generate() {
        const result = generatedResult();
        return {
          ...result,
          analysis: { ...result.analysis, subject: 'x%ZZabc%2fdef' },
          research: { ...result.research, query: 'x%ZZabc%252fdef' }
        };
      }
    };
    const scopedDependencies = {
      ...dependencies({ getProvider: () => unsafeProvider }),
      env: { AI_API_KEY: secret }
    };

    const result = await generatePosters(input(), { dependencies: scopedDependencies });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('x%ZZabc%2fdef');
    expect(serialized).not.toContain('x%ZZabc%252fdef');
  });

  it('allows one business retry for a transient image failure and never retries a format failure', async () => {
    let transientCalls = 0;
    const transientProvider: ImageBeautifier = {
      async beautify() {
        transientCalls += 1;
        if (transientCalls === 1) throw new Error('temporary network failure');
        return { ...uploadImage, id: 'generated', source: 'beautified' };
      }
    };
    const transientResult = await generatePosters(input(), {
      dependencies: dependencies({ getImageProvider: () => transientProvider })
    });
    expect(transientCalls).toBe(4);
    expect(transientResult.posters).toHaveLength(3);

    let formatCalls = 0;
    const formatProvider: ImageBeautifier = {
      async beautify() {
        formatCalls += 1;
        throw new Error(IMAGE_FORMAT_ERROR);
      }
    };
    await expect(generatePosters(input(), { dependencies: dependencies({ getImageProvider: () => formatProvider }) })).rejects.toThrow();
    expect(formatCalls).toBe(3);
  });

  it('does not retry generic authentication or client image failures', async () => {
    let calls = 0;
    const imageProvider: ImageBeautifier = {
      async beautify() {
        calls += 1;
        throw new Error('401 Unauthorized');
      }
    };

    await expect(generatePosters(input(), { dependencies: dependencies({ getImageProvider: () => imageProvider }) })).rejects.toThrow();
    expect(calls).toBe(3);
  });

  it('returns partial success when only one poster cannot be generated', async () => {
    const calls = new Map<string, number>();
    const provider: ImageBeautifier = {
      async beautify({ poster, image }) {
        const style = poster?.style ?? 'unknown';
        calls.set(style, (calls.get(style) ?? 0) + 1);
        if (style === 'story') throw new Error('temporary failure');
        return { ...image, id: style, source: 'beautified' };
      }
    };

    const result = await generatePosters(input(), { dependencies: dependencies({ getImageProvider: () => provider }) });

    expect(result.posters.map((poster) => poster.style)).toEqual(['lifestyle', 'editorial']);
    expect(calls.get('story')).toBe(2);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining('动态方案 B')]));
  });

  it('keeps the single successful poster when the other two directions fail', async () => {
    const provider: ImageBeautifier = {
      async beautify({ poster, image }) {
        if (poster?.style !== 'editorial') throw new Error('temporary failure');
        return { ...image, id: 'editorial-only', source: 'beautified' };
      }
    };

    const result = await generatePosters(input(), { dependencies: dependencies({ getImageProvider: () => provider }) });

    expect(result.posters).toHaveLength(1);
    expect(result.posters[0].style).toBe('editorial');
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('动态方案 A'),
      expect.stringContaining('动态方案 B')
    ]));
  });

  it.each([
    ['skipped', async () => [{ pass: true, issues: [], confidence: 0, skipped: true }]],
    ['empty', async () => []],
    ['throws', async () => { throw new Error('quality unavailable'); }]
  ])('does not block when quality checker is %s', async (_label, checkBatch) => {
    const result = await generatePosters(input(), {
      dependencies: dependencies({ getQualityChecker: () => ({ checkBatch }) as QualityChecker })
    });
    expect(result.posters).toHaveLength(3);
  });

  it('keeps generated images without a second quality-repair request', async () => {
    let imageCalls = 0;
    const imageProvider: ImageBeautifier = {
      async beautify({ image }) {
        imageCalls += 1;
        return { ...image, id: `image-${imageCalls}`, source: 'beautified' };
      }
    };
    const qualityChecker: QualityChecker = {
      async checkBatch({ candidates }) {
        return (candidates ?? []).map(() => ({ pass: false, issues: ['边缘模糊'], confidence: 0.8, skipped: false }));
      }
    };

    const result = await generatePosters(input(), { dependencies: dependencies({ getImageProvider: () => imageProvider, getQualityChecker: () => qualityChecker }) });

    expect(imageCalls).toBe(3);
    expect(result.posters[0].image.id).toBe('image-1');
    expect(result.warnings).toEqual([]);
  });

  it('stops before the provider when the caller aborts during research', async () => {
    const controller = new AbortController();
    let providerCalled = false;
    const researcher = {
      research: async (_input: unknown, options?: { signal?: AbortSignal }) => {
        expect(options?.signal).toBeTruthy();
        controller.abort();
        return research;
      }
    };

    await expect(generatePosters(input(), {
      signal: controller.signal,
      dependencies: dependencies({
        getReferenceResearcher: () => researcher,
        getProvider: () => ({ generate: async () => { providerCalled = true; return generatedResult(); } }) as Provider
      })
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(providerCalled).toBe(false);
  });

  it('aborts an in-flight use case at its configured total timeout', async () => {
    const researcher = {
      research: async (_input: unknown, options?: { signal?: AbortSignal }) => new Promise<ResearchSummary>((_, reject) => {
        options?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { name: 'AbortError' })), { once: true });
      })
    };

    await expect(generatePosters(input(), {
      timeoutMs: 10,
      dependencies: dependencies({ getReferenceResearcher: () => researcher })
    })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('finishes by the total deadline when the provider never resolves and skips later stages', async () => {
    let imageCalls = 0;
    let qualityCalls = 0;
    const neverResolve = new Promise<never>(() => undefined);
    const resultPromise = generatePosters(input(), {
      timeoutMs: 20,
      dependencies: dependencies({
        getProvider: () => ({ generate: async () => neverResolve }) as Provider,
        getImageProvider: () => ({
          beautify: async () => {
            imageCalls += 1;
            return uploadImage;
          }
        }),
        getQualityChecker: () => ({
          checkBatch: async () => {
            qualityCalls += 1;
            return [];
          }
        })
      })
    });
    const outcome = await Promise.race([
      resultPromise.then(() => 'resolved').catch(() => 'rejected'),
      new Promise<'guard-timeout'>((resolve) => setTimeout(() => resolve('guard-timeout'), 200))
    ]);

    expect(outcome).toBe('rejected');
    expect(imageCalls).toBe(0);
    expect(qualityCalls).toBe(0);
  });
});


describe('single poster revision and real phases', () => {
  it('keeps the text model designed prompt for review instead of rebuilding it from design JSON', async () => {
    const source = generatedResult();
    source.posters.forEach((poster, index) => { poster.finalPrompt = [
      '任务：为手作创作者制作一张 3:4 小红书微海报。',
      `主体：第${index + 1}套真实针织玩偶。`,
      '构图：主体靠左，右侧留白。',
      '视觉语言：真实摄影海报。',
      '颜色与光线：深蓝与浅金，柔和侧光。',
      `准确文字：标题「${poster.copy.title}」；短句「${poster.copy.description}」；标签「${poster.copy.tags.join(' ')}」。只出现这些文字。`,
      '保留：原图玩偶身份和关键细节。',
      '输出：3:4 竖版，主体和文字清楚完整。'
    ].join('\n'); });
    const result = await generatePosters(input(), { designOnly: true, dependencies: dependencies({ getProvider: () => ({ generate: async () => source }) }) });
    expect(result.posters.map((poster) => poster.finalPrompt)).toEqual(source.posters.map((poster) => poster.finalPrompt));
    expect(result.posters[0].finalPrompt).not.toContain('本组其他方案的设计摘要');
  });
  it('prepares prompts without creating or calling the image provider', async () => {
    const getImageProvider = vi.fn();
    const source = generatedResult();
    source.posters.forEach((poster, index) => { poster.finalPrompt = formatDesignedImagePrompt({
      subject: '原图中的真实针织兔子，保留长耳朵和开衫',
      composition: `第 ${index + 1} 套独立构图，主体与文字分开`,
      visualLanguage: '真实针织质感的摄影海报',
      colorLighting: '蓝色与暖白，柔和侧光',
      preserve: '保留原图玩偶身份、姿态和关键细节'
    }, poster.copy) ?? undefined; });
    const result = await generatePosters(input(), {designOnly:true,dependencies:dependencies({getImageProvider,getProvider:()=>({generate:async()=>source})})});
    expect(getImageProvider).not.toHaveBeenCalled();
    expect(result.posters).toHaveLength(3);
    expect(result.posters.every(poster=>poster.finalPrompt?.trim())).toBe(true);
  });

  it('renders confirmed prompts without invoking the text model again', async () => {
    const plan = generatedResult();
    plan.posters.forEach(poster=>{poster.finalPrompt='依据原图保留玩偶，清晰构图。'});
    plan.posters[0].finalPrompt = '用户编辑：背景使用宝蓝色，标题置于右侧。';
    const getProvider = vi.fn();
    const beautify = vi.fn().mockImplementation(async ({image})=>image);
    const result = await generatePosters({...input(),approvedPlan:plan},{dependencies:dependencies({getProvider,getImageProvider:()=>({beautify})})});
    expect(getProvider).not.toHaveBeenCalled();
    expect(beautify).toHaveBeenCalledTimes(3);
    expect(result.posters[0].finalPrompt).toContain('用户编辑：背景使用宝蓝色');
    expect(result.posters[0].finalPrompt).toBe(buildPosterPrompt(beautify.mock.calls[0][0].poster));
  });
  it('does not copy the other schemes into one image request', async () => {
    const source = generatedResult();
    source.posters.forEach((poster, index) => { poster.design = { ...poster.design!, concept: ['折纸建筑', '深蓝剧场', '图形拼贴'][index], layout: ['左侧小主体', '右侧中主体', '下方大主体'][index] }; });
    const beautify = vi.fn().mockImplementation(async ({ image }) => image);
    const result = await generatePosters(input(), { dependencies: dependencies({ getProvider: () => ({ generate: async () => source }), getImageProvider: () => ({ beautify }) }) });
    const first = beautify.mock.calls[0][0].poster;
    expect(first.alternatives.map((other: { concept: string }) => other.concept)).toEqual(['深蓝剧场', '图形拼贴']);
    expect(result.posters[0].finalPrompt).toBe(buildPosterPrompt(first));
    expect(result.posters[0].finalPrompt).not.toContain('右侧中主体');
    expect(result.posters[0].finalPrompt).not.toContain('下方大主体');
  });
  it('renders only the requested slot and records the actual sanitized image prompt', async () => {
    const beautify = vi.fn().mockImplementation(async ({ image }) => ({ ...image, dataUrl: 'data:image/png;base64,AAAA', source: 'beautified' }));
    const phases: string[] = [];
    const result = await generatePosters({ ...input(), targetStyle: 'story', revisionPrompt: '背景改成深蓝', referenceImage: uploadImage }, {
      dependencies: dependencies({ getImageProvider: () => ({ beautify }) }),
      onPhase: async (phase) => { phases.push(phase); }
    });
    expect(beautify).toHaveBeenCalledTimes(1);
    expect(result.posters.map((poster) => poster.style)).toEqual(['story']);
    const actual = beautify.mock.calls[0][0].poster;
    expect(result.posters[0].finalPrompt).toBe(buildPosterPrompt(actual));
    expect(phases).toEqual(['researching', 'designing', 'generating', 'checking']);
  });

  it('emits each phase at the operation boundary instead of before generation starts', async () => {
    const events: string[] = [];
    await generatePosters(input(), {
      onPhase: async (phase) => { events.push(phase); },
      dependencies: dependencies({
        getReferenceResearcher: () => ({ research: async () => { events.push('research-operation'); return research; } }),
        getProvider: () => ({ generate: async () => { events.push('design-operation'); return generatedResult(); } }),
        getImageProvider: () => successfulImageProvider(() => events.push('image-operation'))
      })
    });
    expect(events.indexOf('researching')).toBeLessThan(events.indexOf('research-operation'));
    expect(events.indexOf('designing')).toBeLessThan(events.indexOf('design-operation'));
    expect(events.indexOf('generating')).toBeLessThan(events.indexOf('image-operation'));
    expect(events.indexOf('checking')).toBeGreaterThan(events.lastIndexOf('image-operation'));
  });
});


it('retains numerical layout and background changes in the actual image prompt', async () => {
  const source = generatedResult();
  source.posters[0].design = { ...source.posters[0].design!, layout: '3:4 画布，主体占画面 60%，标题位于左上角', scene: '背景改成深蓝，增加 3 个几何色块', typography: '2 级字号，标题 40px，左上角对齐' };
  const beautify = vi.fn().mockImplementation(async ({ image }) => image);
  const result = await generatePosters(input(), { dependencies: dependencies({ getProvider: () => ({ generate: async () => source }), getImageProvider: () => ({ beautify }) }) });
  expect(result.posters[0].finalPrompt).toContain('主体占画面 60%');
  expect(result.posters[0].finalPrompt).toContain('背景改成深蓝');
  expect(result.posters[0].finalPrompt).toContain('标题 40px');
});


it('uses the selected copy for a visual revision and keeps it safe before the image call', async () => {
  const copy = { title: '柔软日常', description: '一针一线的陪伴。', tags: ['#手作'] };
  const beautify = vi.fn().mockImplementation(async ({ image }) => image);
  const result = await generatePosters({ ...input(), targetStyle: 'story', selectedPosterCopy: copy }, { dependencies: dependencies({ getImageProvider: () => ({ beautify }) }) });
  expect(result.posters[0].copy).toEqual(copy);
  expect(beautify.mock.calls[0][0].poster.copy).toEqual(copy);
});
