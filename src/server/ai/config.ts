export type AIProtocol = 'google' | 'openai-compatible';

export interface AIConfig {
  provider: string;
  vision: {
    protocol: AIProtocol;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
  image: {
    baseUrl?: string;
    apiKey?: string;
    model: string;
    size: string;
  };
  quality: {
    protocol: AIProtocol;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
}

type Env = Record<string, string | undefined>;

function firstValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function protocolValue(value: string | undefined, fallback: AIProtocol): AIProtocol {
  return value?.trim().toLowerCase() === 'google' ? 'google' : fallback;
}

export function resolveAIConfig(env: Env = process.env): AIConfig {
  const visionProtocol = protocolValue(env.AI_VISION_PROTOCOL, 'openai-compatible');
  const visionBaseUrl = firstValue(env.AI_VISION_BASE_URL, env.AI_BASE_URL);
  const visionApiKey = firstValue(env.AI_VISION_API_KEY, env.AI_API_KEY);
  const imageBaseUrl = firstValue(env.AI_IMAGE_BASE_URL, env.AI_BASE_URL);
  const imageApiKey = firstValue(env.AI_IMAGE_API_KEY, env.AI_API_KEY);
  const qualityProtocol = protocolValue(env.AI_QUALITY_PROTOCOL, visionProtocol);

  return {
    provider: firstValue(env.AI_PROVIDER) ?? 'mock',
    vision: {
      protocol: visionProtocol,
      baseUrl: visionBaseUrl,
      apiKey: visionApiKey,
      model: firstValue(env.AI_VISION_MODEL)
    },
    image: {
      baseUrl: imageBaseUrl,
      apiKey: imageApiKey,
      model: firstValue(env.AI_IMAGE_MODEL) ?? 'gpt-image-2',
      size: firstValue(env.AI_IMAGE_SIZE) ?? '1152x1536'
    },
    quality: {
      protocol: qualityProtocol,
      baseUrl: firstValue(env.AI_QUALITY_BASE_URL, visionBaseUrl, env.AI_BASE_URL),
      apiKey: firstValue(env.AI_QUALITY_API_KEY, visionApiKey, env.AI_API_KEY),
      model: firstValue(env.AI_QUALITY_MODEL, env.AI_VISION_MODEL)
    }
  };
}

export function geminiGenerateContentUrl(baseUrl: string, model: string): string {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, '');
  const versionedBase = /\/v1$/i.test(normalizedBase) ? normalizedBase : `${normalizedBase}/v1`;
  return `${versionedBase}/models/${encodeURIComponent(model)}:generateContent`;
}
