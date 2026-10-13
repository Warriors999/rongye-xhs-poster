import { generateResponseSchema, type GenerateResponse } from './contracts';
import { defaultResearchSummary } from '@/domain/project';
import type { GenerationInput, Provider } from './provider';
import { formatDesignedImagePrompt } from '@/lib/image-prompt-spec';

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
      const copy = { title, description, tags: ['#针织玩偶', index === 1 ? '#手作日常' : '#可爱种草'] };
      return {
        style: config.style,
        image: input.image,
        copy,
        finalPrompt: formatDesignedImagePrompt({
          subject: '原图中的真实针织玩偶，保留轮廓和针织细节',
          composition: ['主体靠左，右侧留白放标题', '主体靠右，左侧放短标题', '主体靠下，顶部留白放文字'][index],
          visualLanguage: ['轻盈的真实摄影海报', '温暖的手作场景摄影', '克制的编辑式摄影海报'][index],
          colorLighting: ['浅粉与米白，自然柔光', '暖灰与淡绿，窗边侧光', '深蓝与暖白，柔和轮廓光'][index],
          preserve: '保留玩偶原有外形、姿态、颜色和关键配件'
        }, copy) ?? undefined,
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
