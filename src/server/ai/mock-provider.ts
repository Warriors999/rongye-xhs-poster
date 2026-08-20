import { generateResponseSchema, type GenerateResponse } from './contracts';
import { defaultResearchSummary } from '@/domain/project';
import type { GenerationInput, Provider } from './provider';

const configs = [
  { style: 'cute' as const, background: '#f8e5df', titleY: 40, descriptionX: 24, stickers: ['✨'] },
  { style: 'daily' as const, background: '#f3ead9', titleY: 74, descriptionX: 46, stickers: ['☕', '🧶'] },
  { style: 'series' as const, background: '#dfe9df', titleY: 112, descriptionX: 68, stickers: ['①', '②', '③'] }
];

export class MockProvider implements Provider {
  async generate(input: GenerationInput): Promise<GenerateResponse> {
    const posters = configs.map((config, index) => {
      const title = index === 0 ? '软乎乎的一天' : index === 1 ? '手作小日常' : '针织小伙伴';
      const description = index === 0 ? '把可爱带在身边。' : index === 1 ? '把温柔放进每一针里。' : '把小小陪伴收进画面。';
      return {
        style: config.style,
        image: input.image,
        copy: { title, description, tags: ['#针织玩偶', index === 1 ? '#手作日常' : '#可爱种草'] },
        background: config.background,
        designNote: '以主体保真为前提，保留清晰留白和简洁信息层级。',
        layers: {
          title: { type: 'text' as const, id: 'title' as const, text: title, x: 24, y: config.titleY, width: 402, fontFamily: 'system-ui, sans-serif', fontSize: 32, fill: '#2C2524', align: 'left' as const },
          description: { type: 'text' as const, id: 'description' as const, text: description, x: config.descriptionX, y: 180 + index * 14, width: 402, fontFamily: 'system-ui, sans-serif', fontSize: 18, fill: '#827572', align: 'left' as const },
          tag: { type: 'text' as const, id: 'tag' as const, text: '#针织玩偶  #手作日常', x: 24, y: 870, width: 402, fontFamily: 'system-ui, sans-serif', fontSize: 16, fill: '#D87568', align: 'left' as const },
          stickers: Object.fromEntries(config.stickers.map((emoji, stickerIndex) => [`sticker-${stickerIndex + 1}`, { type: 'sticker' as const, id: `sticker-${stickerIndex + 1}` as `sticker-${string}`, emoji, x: 360 + stickerIndex * 24, y: 620 + index * 8, scale: 1 }]))
        }
      };
    });
    return generateResponseSchema.parse({
      analysis: { subject: '图片中的针织玩偶', colors: ['以图片为准'], material: '针织纹理（以图片为准）', details: ['保留主体轮廓和关键配件'] },
      research: { ...defaultResearchSummary, sources: defaultResearchSummary.sources.map((source) => ({ ...source })) },
      posters
    });
  }
}
