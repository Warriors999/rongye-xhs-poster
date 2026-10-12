import { defaultResearchSummary, type GenerationInput as DomainGenerationInput, type ResearchSummary } from '@/domain/project';
import type { GenerateResponse } from './contracts';
import { MockProvider } from './mock-provider';
import { OpenAICompatibleProvider } from './openai-compatible-provider';
import { GeminiProvider } from './gemini-provider';
import { ImageProvider, type ImageBeautifier } from './image-provider';
import { MockImageProvider } from './mock-image-provider';
import { ReferenceResearcher } from '@/server/research/reference-research';
import { getQualityChecker as createQualityChecker, type QualityChecker } from './quality-provider';
import type { AICallOptions } from './call-options';
import { resolveAIConfig } from './config';

export interface GenerationInput extends DomainGenerationInput {
  /** Optional during the compatibility window; the provider falls back locally. */
  research?: ResearchSummary;
}

export function cloneResearchSummary(research?: ResearchSummary): ResearchSummary {
  const source = research ?? defaultResearchSummary;
  return {
    ...source,
    sources: source.sources.map((item) => ({ ...item }))
  };
}

export interface Provider { generate(input: GenerationInput, options?: AICallOptions): Promise<GenerateResponse>; }

export interface ProviderDependencies {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function getReferenceResearcher(dependencies: ProviderDependencies = {}): ReferenceResearcher {
  return new ReferenceResearcher(dependencies);
}

export function getProvider(dependencies: ProviderDependencies = {}): Provider {
  const env = dependencies.env ?? process.env;
  const config = resolveAIConfig(env);
  if (config.provider === 'mock') return new MockProvider();
  if (config.vision.protocol === 'google') return new GeminiProvider(dependencies);
  if (config.provider === 'openai-compatible') return new OpenAICompatibleProvider(dependencies);
  throw new Error('AI_PROVIDER 配置不受支持');
}

export function getImageProvider(dependencies: ProviderDependencies = {}): ImageBeautifier {
  const env = dependencies.env ?? process.env;
  const config = resolveAIConfig(env);
  if (config.provider === 'mock') {
    if (env.AI_DEBUG_GENERATION === '1') console.info('[ai-debug] image provider=mock');
    return new MockImageProvider({ env });
  }
  if (config.provider === 'openai-compatible' || config.vision.protocol === 'google') {
    if (env.AI_DEBUG_GENERATION === '1') console.info(`[ai-debug] image provider=real protocol=${config.vision.protocol} model=${config.image.model}`);
    return new ImageProvider(dependencies);
  }
  throw new Error('AI_PROVIDER 配置不受支持');
}

export function getQualityChecker(dependencies: ProviderDependencies = {}): QualityChecker {
  return createQualityChecker(dependencies);
}
