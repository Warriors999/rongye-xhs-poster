import { buildGenerationPrompt } from '@/lib/prompts';
import { generateResponseSchema, type GenerateResponse } from './contracts';
import type { GenerationInput, Provider, ProviderDependencies } from './provider';

export const PROVIDER_UNAVAILABLE_ERROR = '生成服务暂时不可用，请重试';
export const GENERATION_FORMAT_ERROR = '生成结果格式异常，请重试';

const DEFAULT_TIMEOUT_MS = 60_000;

class ResponseBodyFormatError extends Error {}

type CompletionMessage = {
  content?: string | object;
};

type CompletionEnvelope = {
  choices?: Array<{
    message?: CompletionMessage;
  }>;
};

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export class OpenAICompatibleProvider implements Provider {
  private readonly fetchImpl: typeof fetch;
  private readonly env: Record<string, string | undefined>;
  private readonly timeoutMs: number;

  constructor(dependencies: ProviderDependencies = {}) {
    this.fetchImpl = dependencies.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.env = dependencies.env ?? process.env;
    this.timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async generate(input: GenerationInput): Promise<GenerateResponse> {
    const baseUrl = this.env.AI_BASE_URL;
    const apiKey = this.env.AI_VISION_API_KEY || this.env.AI_API_KEY;
    const visionModel = this.env.AI_VISION_MODEL;
    const imageModel = this.env.AI_IMAGE_MODEL;
    if (!baseUrl || !apiKey || !visionModel || !imageModel) throw new Error('AI 服务配置不完整，请联系管理员');
    const body = {
      model: visionModel,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [
        { type: 'text', text: buildGenerationPrompt(input) },
        { type: 'image_url', image_url: { url: input.image.dataUrl } }
      ] }]
    };
    let response: Response;
    let envelope: CompletionEnvelope | undefined;
    try {
      const result = await this.fetchWithTimeout(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body)
      });
      response = result.response;
      envelope = result.envelope as CompletionEnvelope | undefined;
    } catch (error) {
      if (error instanceof ResponseBodyFormatError) throw new Error(GENERATION_FORMAT_ERROR);
      throw new Error(PROVIDER_UNAVAILABLE_ERROR);
    }
    if (!response.ok) {
      try {
        await response.body?.cancel();
      } catch {
        // The upstream error is already mapped to a safe provider error.
      }
      throw new Error(PROVIDER_UNAVAILABLE_ERROR);
    }
    try {
      const content = envelope?.choices?.[0]?.message?.content;
      const value = typeof content === 'string' ? JSON.parse(content) : content;
      return generateResponseSchema.parse(value);
    } catch {
      throw new Error(GENERATION_FORMAT_ERROR);
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<{ response: Response; envelope?: unknown }> {
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error('request timed out'));
      }, this.timeoutMs);
    });
    const request = (async () => {
      const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
      if (!response.ok) return { response };
      try {
        return { response, envelope: await response.json() };
      } catch (error) {
        if (isAbortError(error)) throw error;
        throw new ResponseBodyFormatError();
      }
    })();

    try {
      return await Promise.race([request, timeout]);
    } catch (error) {
      if (timedOut || isAbortError(error)) throw new Error(PROVIDER_UNAVAILABLE_ERROR);
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
