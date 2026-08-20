import { describe, expect, it } from 'vitest';
import { geminiGenerateContentUrl, resolveAIConfig } from './config';

describe('AI configuration', () => {
  it('prefers dedicated service settings over legacy shared settings', () => {
    const config = resolveAIConfig({
      AI_PROVIDER: 'openai-compatible',
      AI_VISION_PROTOCOL: 'openai-compatible',
      AI_VISION_BASE_URL: 'https://vision.example/v1',
      AI_BASE_URL: 'https://legacy.example/v1',
      AI_VISION_API_KEY: 'vision-key',
      AI_API_KEY: 'legacy-key',
      AI_VISION_MODEL: 'vision-model',
      AI_IMAGE_BASE_URL: 'https://image.example/v1',
      AI_IMAGE_API_KEY: 'image-key',
      AI_IMAGE_MODEL: 'image-model'
    });

    expect(config.vision).toEqual({
      protocol: 'openai-compatible',
      baseUrl: 'https://vision.example/v1',
      apiKey: 'vision-key',
      model: 'vision-model'
    });
    expect(config.image).toEqual({
      baseUrl: 'https://image.example/v1',
      apiKey: 'image-key',
      model: 'image-model'
    });
  });

  it('keeps legacy shared settings as a compatibility fallback', () => {
    const config = resolveAIConfig({
      AI_BASE_URL: 'https://legacy.example/v1',
      AI_API_KEY: 'legacy-key',
      AI_VISION_MODEL: 'vision-model'
    });

    expect(config.vision.baseUrl).toBe('https://legacy.example/v1');
    expect(config.vision.apiKey).toBe('legacy-key');
    expect(config.image.baseUrl).toBe('https://legacy.example/v1');
    expect(config.image.apiKey).toBe('legacy-key');
    expect(config.image.model).toBe('gpt-image-2');
  });

  it('does not duplicate the Gemini v1 path when a relay already includes it', () => {
    expect(geminiGenerateContentUrl('https://relay.example/v1', 'gemini-model')).toBe(
      'https://relay.example/v1/models/gemini-model:generateContent'
    );
    expect(geminiGenerateContentUrl('https://relay.example', 'gemini-model')).toBe(
      'https://relay.example/v1/models/gemini-model:generateContent'
    );
  });
});
