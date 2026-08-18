import { z } from 'zod';
import type {
  CopyData,
  DesignBrief,
  GenerationResult,
  ImageAsset as DomainImageAsset,
  PosterDraft as DomainPosterDraft
} from '@/domain/project';

const MAX_DATA_URL_LENGTH = 10_000_000;
const MAX_BACKGROUND_LENGTH = 100;
const MAX_TEXT_LENGTH = 200;
const MAX_TAG_LENGTH = 40;
const MAX_ARRAY_ITEMS = 12;
const MAX_IMAGE_EDGE = 1600;
const POSTER_CANVAS_WIDTH = 768;
const POSTER_CANVAS_HEIGHT = 1024;

const nonNegativeCoordinate = z.number().finite().min(0);
const boundedDimension = z.number().finite().int().positive().max(MAX_IMAGE_EDGE);
const canvasX = nonNegativeCoordinate.max(POSTER_CANVAS_WIDTH);
const canvasY = nonNegativeCoordinate.max(POSTER_CANVAS_HEIGHT);
const nonEmptyText = z.string().trim().min(1).max(MAX_TEXT_LENGTH);
const nonEmptyTag = z.string().trim().min(1).max(MAX_TAG_LENGTH);
const copyTitle = z.string().trim().min(1).max(36);
const copyDescription = z.string().trim().min(1).max(60);
const designBriefSchema = z.object({
  concept: nonEmptyText,
  layout: nonEmptyText,
  scene: nonEmptyText,
  elements: z.array(nonEmptyText).max(8),
  palette: z.array(nonEmptyText).max(8),
  typography: nonEmptyText,
  hierarchy: nonEmptyText,
  mood: nonEmptyText,
  negative: z.array(nonEmptyText).max(10)
});

export const imageAssetSchema = z.object({
  id: z.string().min(1).max(100),
  dataUrl: z.string().startsWith('data:image/').max(MAX_DATA_URL_LENGTH),
  width: boundedDimension,
  height: boundedDimension,
  source: z.enum(['upload', 'beautified']),
  mode: z.enum(['original', 'craft', 'studio']).optional()
});

export const posterStyleSchema = z.enum(['cute', 'daily', 'series']);

export const copyDataSchema = z.object({
  title: copyTitle,
  description: copyDescription,
  tags: z.array(nonEmptyTag).min(1).max(2)
});

const textLayerSchema = z.object({
  type: z.literal('text'),
  id: z.enum(['title', 'description', 'tag']),
  text: nonEmptyText,
  x: nonNegativeCoordinate,
  y: canvasY,
  width: z.number().finite().positive().max(POSTER_CANVAS_WIDTH),
  fontFamily: z.string().min(1).max(200),
  fontSize: z.number().finite().min(8).max(160),
  fill: z.string().min(1).max(100),
  align: z.enum(['left', 'center', 'right'])
}).superRefine((layer, context) => {
  if (layer.x + layer.width > POSTER_CANVAS_WIDTH) {
    context.addIssue({ code: 'custom', path: ['width'], message: '文字层不能超出海报宽度' });
  }
});

const stickerLayerSchema = z.object({
  type: z.literal('sticker'),
  id: z.string().regex(/^sticker-.+/).transform((id) => id as `sticker-${string}`),
  emoji: z.string().min(1).max(40),
  x: canvasX,
  y: canvasY,
  scale: z.number().finite().min(0.25).max(4)
});
const stickerKeySchema = z.string().regex(/^sticker-.+/);

const posterLayersSchema = z.object({
  title: textLayerSchema.safeExtend({ id: z.literal('title') }).optional(),
  description: textLayerSchema.safeExtend({ id: z.literal('description') }).optional(),
  tag: textLayerSchema.safeExtend({ id: z.literal('tag') }).optional(),
  stickers: z.record(stickerKeySchema, stickerLayerSchema).superRefine((stickers, context) => {
    if (Object.keys(stickers).length > MAX_ARRAY_ITEMS) {
      context.addIssue({ code: 'too_big', maximum: MAX_ARRAY_ITEMS, origin: 'array', inclusive: true, message: '贴纸数量不能超过 12 个' });
    }
    const ids = new Set<string>();
    for (const [key, sticker] of Object.entries(stickers)) {
      if (!/^sticker-.+/.test(key)) {
        context.addIssue({ code: 'custom', path: [key], message: '贴纸 key 必须以 sticker- 开头' });
      }
      if (sticker.id !== key) {
        context.addIssue({ code: 'custom', path: [key, 'id'], message: '贴纸 id 必须与 key 一致' });
      }
      if (ids.has(sticker.id)) {
        context.addIssue({ code: 'custom', path: [key, 'id'], message: '贴纸 id 不能重复' });
      }
      ids.add(sticker.id);
    }
  })
});

export const posterDraftSchema = z.object({
  style: posterStyleSchema,
  image: imageAssetSchema,
  copy: copyDataSchema,
  background: z.string().max(MAX_BACKGROUND_LENGTH).regex(/^#[0-9a-fA-F]{6}$/),
  layers: posterLayersSchema,
  design: designBriefSchema.optional()
});

export const generationRequestSchema = z.object({
  imageDataUrl: z.string().startsWith('data:image/', '请上传图片').max(MAX_DATA_URL_LENGTH),
  width: boundedDimension,
  height: boundedDimension,
  keywords: z.string().max(500).default(''),
  forbiddenWords: z.string().max(300).default(''),
  creativeIdea: z.string().max(500).default('')
});

export const beautifyRequestSchema = z.object({
  imageDataUrl: z.string().startsWith('data:image/', '请上传图片').max(MAX_DATA_URL_LENGTH),
  width: boundedDimension,
  height: boundedDimension,
  mode: z.enum(['original', 'craft', 'studio'])
});

export const generationResultSchema = z.object({
  analysis: z.object({
    subject: nonEmptyText,
    colors: z.array(nonEmptyTag).max(MAX_ARRAY_ITEMS),
    material: nonEmptyText,
    details: z.array(nonEmptyText).max(MAX_ARRAY_ITEMS)
  }),
  posters: z.array(posterDraftSchema).length(3)
}).superRefine((result, context) => {
  const styles = result.posters.map((poster) => poster.style);
  if (new Set(styles).size !== styles.length) {
    context.addIssue({ code: 'custom', path: ['posters'], message: '海报风格必须唯一' });
  }
});

export const generateResponseSchema = generationResultSchema;

export type GenerateRequest = z.infer<typeof generationRequestSchema>;
export type BeautifyRequest = z.infer<typeof beautifyRequestSchema>;
export type GenerateResponse = GenerationResult;
export type PosterStyle = DomainPosterDraft['style'];
export type PosterDraft = DomainPosterDraft;
export type ImageAsset = DomainImageAsset;
export type { CopyData, DesignBrief, GenerationResult };
