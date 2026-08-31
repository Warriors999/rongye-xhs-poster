import { z } from 'zod';
import type {
  CopyData,
  DesignBrief,
  GenerationResult,
  ImageAsset as DomainImageAsset,
  PosterDraft as DomainPosterDraft,
  ResearchSummary
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
const designLabel = z.string().trim().min(1).max(80);
const designConcept = z.string().trim().min(1).max(240);
const designLayout = z.string().trim().min(1).max(280);
const designScene = z.string().trim().min(1).max(280);
const designElement = z.string().trim().min(1).max(100);
const designPalette = z.string().trim().min(1).max(60);
const designTypography = z.string().trim().min(1).max(240);
const designHierarchy = z.string().trim().min(1).max(240);
const designMood = z.string().trim().min(1).max(160);
const designNegative = z.string().trim().min(1).max(140);
const nonEmptyTag = z.string().trim().min(1).max(MAX_TAG_LENGTH);
const copyTitle = z.string().trim().min(1).max(36);
const copyDescription = z.string().trim().min(1).max(60);
const copyBody = z.string().trim().min(1).max(280);
const copyAngle = z.string().trim().min(1).max(80);
export const posterDirectionSchema = z.enum(['lifestyle', 'story', 'editorial']);
export const legacyPosterStyleSchema = z.enum(['cute', 'daily', 'series']);
export const posterStyleSchema = z.union([posterDirectionSchema, legacyPosterStyleSchema]);

const researchSourceSchema = z.object({
  title: nonEmptyText,
  url: z.string().trim().min(1).max(500).optional()
});

export const researchSummarySchema = z.object({
  query: nonEmptyText,
  sources: z.array(researchSourceSchema).max(8),
  composition: nonEmptyText,
  palette: nonEmptyText,
  material: nonEmptyText,
  typography: nonEmptyText,
  density: nonEmptyText,
  fallback: z.boolean().optional()
});

const designBriefSchema = z.object({
  label: designLabel.optional(),
  direction: posterDirectionSchema,
  concept: designConcept,
  layout: designLayout,
  scene: designScene,
  elements: z.array(designElement).max(8),
  palette: z.array(designPalette).max(8),
  typography: designTypography,
  hierarchy: designHierarchy,
  mood: designMood,
  negative: z.array(designNegative).max(10)
});

const IMAGE_DATA_URL_PATTERN = /^data:image\/[a-z0-9!#$%&'*+.^_`|~-]+(?:;[a-z0-9!#$%&'*+.^_`|~-]+(?:=(?:"[^"]*"|[a-z0-9!#$%&'*+.^_`|~:%/+~-]+))?)*,[\s\S]+$/i;

export const imageDataUrlSchema = z.string()
  .regex(IMAGE_DATA_URL_PATTERN, '请上传有效的图片')
  .max(MAX_DATA_URL_LENGTH);

export const imageAssetSchema = z.object({
  id: z.string().min(1).max(100),
  dataUrl: imageDataUrlSchema,
  width: boundedDimension,
  height: boundedDimension,
  source: z.enum(['upload', 'beautified']),
  mode: z.enum(['original', 'craft', 'studio']).optional()
});

export const copyDataSchema = z.object({
  title: copyTitle,
  description: copyDescription,
  tags: z.array(nonEmptyTag).min(1).max(2)
});

export const copyVariantSchema = z.object({
  angle: copyAngle,
  title: copyTitle,
  body: copyBody,
  tags: z.array(nonEmptyTag).min(1).max(5)
});

export const copyGenerationResponseSchema = z.object({
  variants: z.array(copyVariantSchema).min(1).max(3)
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
  design: designBriefSchema.optional(),
  designNote: nonEmptyText
});

export const generationRequestSchema = z.object({
  imageDataUrl: imageDataUrlSchema,
  width: boundedDimension,
  height: boundedDimension,
  keywords: z.string().max(500).default(''),
  forbiddenWords: z.string().max(300).default(''),
  creativeIdea: z.string().max(500).default('')
});

export const beautifyRequestSchema = z.object({
  imageDataUrl: imageDataUrlSchema,
  width: boundedDimension,
  height: boundedDimension,
  mode: z.enum(['original', 'craft', 'studio'])
});

export const copyGenerationRequestSchema = z.object({
  originalImageDataUrl: imageDataUrlSchema,
  originalWidth: boundedDimension,
  originalHeight: boundedDimension,
  posterImageDataUrl: imageDataUrlSchema,
  posterWidth: boundedDimension,
  posterHeight: boundedDimension,
  selectedStyle: posterStyleSchema,
  selectedPosterCopy: copyDataSchema,
  keywords: z.string().max(500).default(''),
  creativeIdea: z.string().max(500).default(''),
  prompt: z.string().max(500).default('')
});

export const generationResultSchema = z.object({
  analysis: z.object({
    subject: nonEmptyText,
    colors: z.array(nonEmptyTag).max(MAX_ARRAY_ITEMS),
    material: nonEmptyText,
    details: z.array(nonEmptyText).max(MAX_ARRAY_ITEMS)
  }),
  research: researchSummarySchema,
  posters: z.array(posterDraftSchema).min(1).max(3),
  warnings: z.array(nonEmptyText).max(MAX_ARRAY_ITEMS).optional()
}).superRefine((result, context) => {
  const styles = result.posters.map((poster) => poster.style);
  if (new Set(styles).size !== styles.length) {
    context.addIssue({ code: 'custom', path: ['posters'], message: '海报方向必须唯一' });
  }
});

export const generateResponseSchema = generationResultSchema;

export type GenerateRequest = z.infer<typeof generationRequestSchema>;
export type BeautifyRequest = z.infer<typeof beautifyRequestSchema>;
export type CopyGenerationRequest = z.infer<typeof copyGenerationRequestSchema>;
export type GenerateResponse = GenerationResult;
export type PosterDirection = z.infer<typeof posterDirectionSchema>;
export type PosterStyle = DomainPosterDraft['style'];
export type PosterDraft = DomainPosterDraft;
export type ImageAsset = DomainImageAsset;
export type { CopyData, DesignBrief, GenerationResult, ResearchSummary };
