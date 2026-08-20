import { z } from 'zod';
import { generationResultSchema, posterDraftSchema } from '@/server/ai/contracts';

const taskImageAssetSchema = z.object({
  id: z.string().min(1).max(100),
  assetKey: z.string().regex(/^tasks\/[A-Za-z0-9_-]{8,100}\/assets\/[a-z]+$/),
  assetUrl: z.string().regex(/^\/api\/tasks\/[A-Za-z0-9_-]{8,100}\?asset=(?:lifestyle|story|editorial|cute|daily|series)$/),
  contentType: z.string().regex(/^image\/[a-z0-9.+-]+$/i),
  width: z.number().int().positive().max(1600),
  height: z.number().int().positive().max(1600),
  source: z.enum(['upload', 'beautified']),
  mode: z.enum(['original', 'craft', 'studio']).optional()
});

export const taskPosterMetadataSchema = z.object({
  style: posterDraftSchema.shape.style,
  image: taskImageAssetSchema,
  copy: posterDraftSchema.shape.copy,
  background: posterDraftSchema.shape.background,
  layers: posterDraftSchema.shape.layers,
  design: posterDraftSchema.shape.design.unwrap(),
  designNote: posterDraftSchema.shape.designNote
});
export const taskResultSchema = z.object({
  analysis: generationResultSchema.shape.analysis,
  research: generationResultSchema.shape.research,
  posters: z.array(taskPosterMetadataSchema).min(1).max(3),
  warnings: generationResultSchema.shape.warnings
});
export const taskStatusResponseSchema = z.object({
  status: z.enum(['queued', 'running', 'succeeded', 'failed']),
  phase: z.enum(['queued', 'recognizing', 'understanding', 'researching', 'designing', 'generating', 'checking', 'completed', 'failed']),
  progress: z.number().int().min(0).max(100),
  warnings: z.array(z.string().min(1).max(200)).max(12),
  error: z.string().min(1).max(200).optional(),
  expiresAt: z.number().int().positive(),
  result: taskResultSchema.optional()
});
