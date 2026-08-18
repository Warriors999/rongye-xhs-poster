import type { ImageAsset } from '@/domain/project';
import type { GenerateResponse } from './contracts';
import { MockProvider } from './mock-provider';
import { OpenAICompatibleProvider } from './openai-compatible-provider';
import { GeminiProvider } from './gemini-provider';
import { ImageProvider, type ImageBeautifier } from './image-provider';
import { MockImageProvider } from './mock-image-provider';

export interface GenerationInput {
  image: ImageAsset;
  keywords: string;
  forbiddenWords: string;
  creativeIdea?: string;
}

export interface Provider { generate(input: GenerationInput): Promise<GenerateResponse>; }

export interface ProviderDependencies {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function getProvider(dependencies: ProviderDependencies = {}): Provider {
  const env = dependencies.env ?? process.env;
  const provider = env.AI_PROVIDER?.trim() ?? '';
  if (provider === '' || provider === 'mock') return new MockProvider();
  if (env.AI_VISION_PROTOCOL === 'google') return new GeminiProvider(dependencies);
  if (provider === 'openai-compatible') return new OpenAICompatibleProvider(dependencies);
  throw new Error('AI_PROVIDER 配置不受支持');
}

export function getImageProvider(dependencies: ProviderDependencies = {}): ImageBeautifier {
  const env = dependencies.env ?? process.env;
  const provider = env.AI_PROVIDER?.trim() ?? '';
  if (provider === '' || provider === 'mock') return new MockImageProvider();
  if (provider === 'openai-compatible' || env.AI_VISION_PROTOCOL === 'google') return new ImageProvider(dependencies);
  throw new Error('AI_PROVIDER 配置不受支持');
}
