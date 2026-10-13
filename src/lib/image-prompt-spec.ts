import type { CopyData } from '@/domain/project';
import { sanitizeDesignText } from './design-system';
import { MAX_EDITABLE_PROMPT_CHARS, PROMPT_PROTECTION } from './prompt-review';

const FIELDS = [
  ['subject', 120],
  ['composition', 180],
  ['visualLanguage', 150],
  ['colorLighting', 120],
  ['preserve', 150]
] as const;

const SECTION_LABELS = ['任务：', '主体：', '构图：', '视觉语言：', '颜色与光线：', '准确文字：', '保留：', '输出：'] as const;

/** Format only the text model's visual decisions; exact copy and output rules come from verified fields. */
export function formatDesignedImagePrompt(value: unknown, copy: CopyData): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const fields: Record<(typeof FIELDS)[number][0], string> = {} as Record<(typeof FIELDS)[number][0], string>;
  for (const [name, limit] of FIELDS) {
    const text = sanitizeDesignText(raw[name], '', limit);
    if (!text) return null;
    fields[name] = text;
  }
  const prompt = [
    '任务：为手作创作者制作一张 3:4 小红书微海报。',
    `主体：${fields.subject}`,
    `构图：${fields.composition}`,
    `视觉语言：${fields.visualLanguage}`,
    `颜色与光线：${fields.colorLighting}`,
    `准确文字：标题「${copy.title}」；短句「${copy.description}」；标签「${copy.tags.join(' ')}」。只出现这些文字。`,
    `保留：${fields.preserve}`,
    '输出：3:4 竖版，主体和文字清楚完整。'
  ].join('\n');
  return isStructuredImagePrompt(prompt) && prompt.length <= 1200 ? prompt : null;
}

export function isStructuredImagePrompt(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  const body = value.split(PROMPT_PROTECTION).join('').trim();
  if (body.length > MAX_EDITABLE_PROMPT_CHARS) return false;
  const lines = body.split('\n').map((line) => line.trim());
  return lines.length === SECTION_LABELS.length
    && lines.every((line, index) => line.startsWith(SECTION_LABELS[index]) && line.length > SECTION_LABELS[index].length);
}
