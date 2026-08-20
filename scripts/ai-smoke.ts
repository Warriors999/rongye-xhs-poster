import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { defaultResearchSummary, type ImageAsset } from '../src/domain/project';
import { getImageProvider, getProvider } from '../src/server/ai/provider';
import { resolveAIConfig } from '../src/server/ai/config';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

function imageDataUrl(filePath: string, bytes: Buffer): string {
  const mimeType = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'image/png';
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

function diagnosticFetch(): typeof fetch | undefined {
  if (process.env.AI_SMOKE_DIAGNOSTICS !== '1') return undefined;
  return async (input, init) => {
    const response = await fetch(input, init);
    let summary: Record<string, unknown> = { status: response.status };
    try {
      const payload = await response.clone().json() as Record<string, unknown>;
      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
      const data = Array.isArray(payload.data) ? payload.data : [];
      const firstChoice = choices[0] as Record<string, unknown> | undefined;
      const firstMessage = firstChoice?.message as Record<string, unknown> | undefined;
      const firstCandidate = candidates[0] as Record<string, unknown> | undefined;
      const firstContent = firstCandidate?.content as Record<string, unknown> | undefined;
      const parts = Array.isArray(firstContent?.parts) ? firstContent.parts : [];
      const firstPart = parts[0] as Record<string, unknown> | undefined;
      const firstData = data[0] as Record<string, unknown> | undefined;
      const content = firstMessage?.content;
      summary = {
        status: response.status,
        rootKeys: Object.keys(payload).slice(0, 12),
        choices: choices.length,
        messageContentType: Array.isArray(content) ? 'array' : typeof content,
        candidates: candidates.length,
        parts: parts.length,
        firstPartKeys: firstPart ? Object.keys(firstPart).slice(0, 12) : [],
        imageItems: data.length,
        firstImageKeys: firstData ? Object.keys(firstData).slice(0, 12) : [],
        imageB64Length: typeof firstData?.b64_json === 'string' ? firstData.b64_json.length : 0,
        imageUrlProtocol: typeof firstData?.url === 'string' ? firstData.url.split(':', 1)[0] : ''
      };
    } catch {
      summary = { status: response.status, body: 'non-json-or-unreadable' };
    }
    console.error(`AI diagnostics: ${JSON.stringify(summary)}`);
    return response;
  };
}

async function main(): Promise<void> {
  const config = resolveAIConfig(process.env);
  if (config.provider === 'mock') {
    throw new Error('当前 AI_PROVIDER=mock；请先在 .env.local 中切换到真实 Provider。');
  }
  if (!config.vision.baseUrl || !config.vision.apiKey || !config.vision.model) {
    throw new Error('视觉模型配置不完整，请检查 AI_VISION_BASE_URL、AI_VISION_API_KEY、AI_VISION_MODEL。');
  }
  if (!config.image.baseUrl || !config.image.apiKey || !config.image.model) {
    throw new Error('图片模型配置不完整，请检查 AI_IMAGE_BASE_URL、AI_IMAGE_API_KEY、AI_IMAGE_MODEL。');
  }

  const filePath = resolve(process.argv[2] ?? process.env.AI_SMOKE_IMAGE ?? 'test-results/iphone-13-final.png');
  const bytes = await readFile(filePath);
  const image: ImageAsset = {
    id: 'local-ai-smoke',
    dataUrl: imageDataUrl(filePath, bytes),
    width: 390,
    height: 844,
    source: 'upload'
  };

  const fetchImpl = diagnosticFetch();
  const dependencies = fetchImpl ? { env: process.env, fetchImpl } : { env: process.env };
  const result = await getProvider(dependencies).generate({
    image,
    keywords: '针织玩偶 小红书 微海报',
    forbiddenWords: '价格 日期 品牌 商品信息',
    creativeIdea: '保持真实玩偶不变，做有设计感的生活方式微海报',
    research: { ...defaultResearchSummary, sources: defaultResearchSummary.sources.map((source) => ({ ...source })) }
  });
  const poster = result.posters[0];
  if (!poster) throw new Error('视觉模型没有返回可用的设计方向。');

  const generated = await getImageProvider(dependencies).beautify({
    image,
    mode: 'studio',
    poster: {
      style: poster.style,
      copy: poster.copy,
      design: poster.design!,
      designNote: poster.designNote
    }
  });
  if (!generated.dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('图片模型返回的不是有效 PNG 数据。');
  }

  if (process.env.AI_SMOKE_OUTPUT) {
    await writeFile(resolve(process.env.AI_SMOKE_OUTPUT), Buffer.from(generated.dataUrl.split(',', 2)[1] ?? '', 'base64'));
    console.log(`真实 AI smoke 输出已保存：${resolve(process.env.AI_SMOKE_OUTPUT)}`);
  }

  console.log(`真实 AI smoke 通过：视觉模型返回 ${result.posters.length} 个方向，图片模型返回 PNG。`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : '真实 AI smoke 失败');
  process.exitCode = 1;
});
