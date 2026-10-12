import { defaultResearchSummary, type ResearchSummary } from '@/domain/project';
import { createCombinedSignal, raceWithAbort, throwIfAborted, type AICallOptions } from '@/server/ai/call-options';

const QUERY_PART_LIMIT = 120;
const QUERY_LIMIT = 200;
const SUMMARY_LIMIT = 200;
const URL_LIMIT = 500;
const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_QUERY = '针织玩偶微海报设计';
const MAX_RESPONSE_BYTES = 512 * 1024;
const sensitiveUrlWords = [
  'key',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'token',
  'secret',
  'clientsecret',
  'auth',
  'authorization',
  'credential',
  'credentials',
  'signature',
  'sig',
  'password',
  'passwd'
];

type DesignSummary = Omit<ResearchSummary, 'query' | 'sources' | 'fallback'>;

export interface ResearchInput {
  keywords: string;
  creativeIdea?: string;
}

export interface ReferenceResearchDependencies {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface LocalRule {
  keywords: string[];
  summary: DesignSummary;
}

const genericSummary: DesignSummary = {
  composition: '以真实主体作为单一视觉重心，保留清晰轮廓和安全留白，按视觉动线安排少量信息。',
  palette: '以主体真实颜色为锚点，可探索高饱和互补、鲜明冷暖、深浅对比或柔和同色，由概念选择，不统一套用奶油暖色。',
  material: '保留照片中的真实材质、织物纹理和柔和光影，只补充克制的环境质感。',
  typography: '使用短标题、短辅助句和少量标签，建立清晰字号层级，文字避开主体轮廓。',
  density: '通过疏密对比建立节奏；可疏朗也可丰富，但信息有秩序，主体轮廓和文字安全区清晰。'
};

const localRules: LocalRule[] = [
  {
    keywords: ['春天'],
    summary: {
      composition: '主体置于明亮留白中，沿一侧安排轻盈的自然动线，画面重心稳定而有向上感。',
      palette: '使用嫩绿、奶油白和低饱和花色，保留柔和明度对比。',
      material: '根据主体真实纹理与春日主题选择环境质感，不预设固定装饰材料。',
      typography: '标题轻巧短促，辅助句贴近留白区，标签保持克制并与自然动线呼应。',
      density: '轻量低密度，只保留少量叶片、花影或微小色块作为秩序化点缀。'
    }
  },
  {
    keywords: ['自然'],
    summary: {
      composition: '采用偏自然的非对称构图，主体清晰放置在留白与柔和环境层次之间。',
      palette: '以米白、苔绿、浅棕等低饱和自然色构成安静层次。',
      material: '强调主体与环境的触感差异，材质由具体概念选择，不遮挡主体细节。',
      typography: '标题采用简洁平衡的层级，文字沿空白边缘排布，避免装饰化堆叠。',
      density: '中低密度，使用少量有间距的自然符号形成节奏。'
    }
  },
  {
    keywords: ['童话'],
    summary: {
      composition: '以主体为故事中心，使用前后景的柔和层次构成小型叙事舞台，保留明确视线。',
      palette: '探索森林深绿、月夜靛蓝、明亮糖果色或柔和梦幻色，以色彩关系建立不同童话氛围。',
      material: '保留针织表面的真实纤维感，根据具体故事选择环境材质与光影。',
      typography: '标题像故事章节一样简短，辅助句与主体保持距离，避免过多花体和伪文字。',
      density: '按故事重点决定叙事细节，保留清晰视线与文字安全区。'
    }
  },
  {
    keywords: ['复古'],
    summary: {
      composition: '采用稳定的留白构图和轻微的版式错位，让主体像被放入一张经过编辑的旧海报。',
      palette: '可选择砖红与钴蓝的醒目对比、墨黑与亮黄，或沉静棕色；根据具体年代感决定饱和度。',
      material: '根据用户描述的年代感选择材质与光线，避免粗糙噪点遮盖主体。',
      typography: '标题与辅助句形成明确编辑层级，少量标签作为版式锚点而非装饰填充。',
      density: '中低密度，保留整洁边距和少量几何色块，避免信息堆满画面。'
    }
  },
  {
    keywords: ['手作'],
    summary: {
      composition: '让真实玩偶保持主视觉位置，辅以桌面或工作台的局部层次，形成清楚的手作场景。',
      palette: '以奶油色、暖棕、珊瑚或柔和蓝为主，使用少量互补色突出主体。',
      material: '突出主体真实针织线圈和关键细节，光线与环境材质由概念决定。',
      typography: '标题像手作笔记一样简短，辅助句和标签分层放置，避免商品信息和长段落。',
      density: '信息密度由内容决定，环境元素要与意图相关，不增加新的主体。'
    }
  },
  {
    keywords: ['居家'],
    summary: {
      composition: '采用舒适的室内留白构图，让主体位于稳定焦点，环境只承担温度和尺度关系。',
      palette: '使用奶油白、浅木色、燕麦色和低饱和暖色，保持柔和统一。',
      material: '依据原图主体与用户想法建立生活质感，不固定使用某种背景材质。',
      typography: '标题简洁醒目，辅助句靠近安全留白，标签数量少且保持充足间距。',
      density: '低密度，用少量家居材质层次表达场景，不堆叠家具和装饰。'
    }
  },
  {
    keywords: ['治愈'],
    summary: {
      composition: '以主体为安静视觉锚点，利用大面积留白和柔和光影形成放松的观看节奏。',
      palette: '使用奶油白、雾蓝、浅杏和柔和灰绿，控制对比并保留温度。',
      material: '保留真实针织纹理，选择与本次概念相称的环境和光线。',
      typography: '标题短而有情绪，辅助句轻量排列，文字整体保持清楚、安静和可读。',
      density: '低密度，减少装饰和信息数量，只留下能强化情绪的少量形状或光点。'
    }
  }
];

function truncate(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

function buildQuery(input: ResearchInput): string {
  return [truncate(input.keywords, QUERY_PART_LIMIT), truncate(input.creativeIdea, QUERY_PART_LIMIT)]
    .filter(Boolean)
    .join(' ')
    .slice(0, QUERY_LIMIT);
}

function pickLocalSummary(query: string): DesignSummary {
  const rule = localRules.find(({ keywords }) => keywords.some((keyword) => query.includes(keyword)));
  return rule?.summary ?? genericSummary;
}

function fallbackSummary(query: string): ResearchSummary {
  return {
    query,
    sources: defaultResearchSummary.sources.map((source) => ({ ...source })),
    ...pickLocalSummary(query),
    fallback: true
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function firstRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    const record = asRecord(value);
    if (record) return record;
  }
  return null;
}

function normalizeUrlWord(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parameterTokens(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isSensitiveUrlParameter(value: string): boolean {
  const normalized = normalizeUrlWord(value);
  const tokens = parameterTokens(value);
  return sensitiveUrlWords.some((word) => {
    const isShortWord = word === 'key' || word === 'sig' || word === 'auth';
    return isShortWord
      ? normalized === word || tokens.includes(word)
      : normalized.includes(word);
  });
}

function decodeUrlPart(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function redact(value: unknown, secret: string): string {
  let text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (secret) {
    const encodedSecret = encodeURIComponent(secret);
    for (const candidate of new Set([secret, encodedSecret])) {
      text = text.split(candidate).join('');
    }
    const decodedText = decodeUrlPart(text);
    if (decodedText) text = decodedText.split(secret).join('');
  }
  return text.slice(0, SUMMARY_LIMIT);
}

function legalUrl(value: unknown, secret: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const rawUrl = value.trim();
  const decodedUrl = decodeUrlPart(rawUrl);
  if (!decodedUrl) return undefined;
  if (secret && (rawUrl.includes(secret) || decodedUrl.includes(secret))) return undefined;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    if (parsed.username || parsed.password) return undefined;
    for (const parameter of parsed.searchParams.keys()) {
      if (isSensitiveUrlParameter(parameter)) return undefined;
    }
    const fragment = parsed.hash.slice(1);
    const decodedFragment = decodeUrlPart(fragment);
    if (decodedFragment === undefined) return undefined;
    if (secret && (fragment.includes(secret) || decodedFragment.includes(secret))) return undefined;
    const normalizedFragment = normalizeUrlWord(decodedFragment);
    if (sensitiveUrlWords.some((word) => normalizedFragment.includes(word))) return undefined;
    if (secret && normalizedUrlContainsSecret(parsed.toString(), secret)) return undefined;
    const normalizedUrl = parsed.toString();
    if (normalizedUrl.length > URL_LIMIT) return undefined;
    return normalizedUrl;
  } catch {
    return undefined;
  }
}

function normalizedUrlContainsSecret(value: string, secret: string): boolean {
  if (!secret) return false;
  const decoded = decodeUrlPart(value);
  return value.includes(secret) || decoded?.includes(secret) === true;
}

async function readResponseBody(response: Response, signal: AbortSignal): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = '';
  const readChunk = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
    if (signal.aborted) throw signal.reason;
    let onAbort: (() => void) | undefined;
    const abortPromise = new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      return await Promise.race([reader.read(), abortPromise]);
    } finally {
      if (onAbort) signal.removeEventListener('abort', onAbort);
    }
  };
  try {
    while (true) {
      const { done, value } = await readChunk();
      if (done) return text + decoder.decode();
      byteLength += value.byteLength;
      if (byteLength > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (signal.aborted) throw error;
    return null;
  } finally {
    reader.releaseLock();
  }
}

function cleanSources(value: unknown, secret: string): Array<{ title: string; url: string }> {
  if (!Array.isArray(value)) return [];
  const sources: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record = asRecord(item);
    const title = redact(record?.title ?? record?.name, secret);
    const url = legalUrl(record?.url ?? record?.link, secret);
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    sources.push({ title, url });
    if (sources.length === 3) break;
  }
  return sources;
}

function normalizeRemoteSummary(payload: unknown, query: string, secret: string): ResearchSummary | null {
  const root = asRecord(payload);
  if (!root) return null;
  const data = firstRecord(root.data, root.result, root.research) ?? root;
  const insight = firstRecord(data.insight, data.insights, data.designInsight, data.designSummary, data.summary) ?? data;
  const sources = cleanSources(data.sources ?? data.references ?? data.results ?? data.items, secret);
  const summary: DesignSummary = {
    composition: redact(insight.composition, secret),
    palette: redact(insight.palette, secret),
    material: redact(insight.material, secret),
    typography: redact(insight.typography, secret),
    density: redact(insight.density, secret)
  };
  const hasInsight = Object.values(summary).some(Boolean);
  if (!hasInsight || sources.length === 0) return null;
  return {
    query,
    sources,
    composition: summary.composition || genericSummary.composition,
    palette: summary.palette || genericSummary.palette,
    material: summary.material || genericSummary.material,
    typography: summary.typography || genericSummary.typography,
    density: summary.density || genericSummary.density,
    fallback: false
  };
}

export class ReferenceResearcher {
  private readonly env: Record<string, string | undefined>;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(dependencies: ReferenceResearchDependencies = {}) {
    this.env = dependencies.env ?? process.env;
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async research(input: ResearchInput, options: AICallOptions = {}): Promise<ResearchSummary> {
    throwIfAborted(options.signal);
    const requestedQuery = buildQuery(input);
    const query = requestedQuery || DEFAULT_QUERY;
    const fallback = fallbackSummary(query);
    const url = truncate(this.env.REFERENCE_RESEARCH_URL, 500);
    if (!url || !requestedQuery) return fallback;

    const payload = await this.fetchResearch(url, query, options);
    throwIfAborted(options.signal);
    return normalizeRemoteSummary(payload, query, this.env.REFERENCE_RESEARCH_API_KEY?.trim() ?? '') ?? fallback;
  }

  private async fetchResearch(url: string, query: string, options: AICallOptions): Promise<unknown> {
    const apiKey = this.env.REFERENCE_RESEARCH_API_KEY?.trim() ?? '';
    const combined = createCombinedSignal(options.signal, this.timeoutMs, '参考研究响应超时');
    try {
      const response = await raceWithAbort(this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({ query, limit: 3, platform: 'pinterest' }),
        signal: combined.signal
      }), combined.signal);
      if (!response.ok) {
        await response.body?.cancel();
        return null;
      }
      const text = await readResponseBody(response, combined.signal);
      return text === null ? null : JSON.parse(text);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      return null;
    } finally {
      combined.cleanup();
    }
  }
}
