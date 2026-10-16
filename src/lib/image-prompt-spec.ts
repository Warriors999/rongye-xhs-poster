import type { CopyData } from '@/domain/project';
import { sanitizeImagePromptText } from './design-system';
import { MAX_EDITABLE_PROMPT_CHARS, PROMPT_PROTECTION } from './prompt-review';

const FIELDS = [
  ['subject', 120],
  ['composition', 180],
  ['visualLanguage', 150],
  ['colorLighting', 120],
  ['preserve', 150]
] as const;

const SECTION_LABELS = ['任务：', '主体：', '构图：', '视觉语言：', '颜色与光线：', '准确文字：', '保留：', '输出：'] as const;
const TASK = '为手作创作者制作一张 3:4 小红书微海报。';
const OUTPUT = '3:4 竖版，主体和文字清楚完整。';

export const MAX_VISUAL_DESCRIPTION_CHARS = 240;
export type EditableImagePromptField = 'composition' | 'visualLanguage' | 'colorLighting';

function exactCopy(copy: CopyData): string {
  return `标题「${copy.title}」；短句「${copy.description}」；标签「${copy.tags.join(' ')}」。只出现这些文字。`;
}

function composePrompt(fields: Record<'subject' | EditableImagePromptField | 'preserve', string>, copy: CopyData): string {
  return [
    `任务：${TASK}`,
    `主体：${fields.subject}`,
    `构图：${fields.composition}`,
    `视觉语言：${fields.visualLanguage}`,
    `颜色与光线：${fields.colorLighting}`,
    `准确文字：${exactCopy(copy)}`,
    `保留：${fields.preserve}`,
    `输出：${OUTPUT}`
  ].join('\n');
}

function promptSections(value: string): string[] | null {
  const body = value.split(PROMPT_PROTECTION).join('').trim();
  const lines = body.split('\n');
  if (lines.length !== SECTION_LABELS.length || lines.some((line, index) => !line.startsWith(SECTION_LABELS[index]))) return null;
  return lines.map((line, index) => line.slice(SECTION_LABELS[index].length));
}

function isChineseDescription(value: string): boolean {
  const withoutColors = value.replace(/#[0-9a-fA-F]{3,8}\b/g, '');
  const hanCount = Array.from(withoutColors.matchAll(/\p{Script=Han}/gu)).length;
  const latinCount = Array.from(withoutColors.matchAll(/[A-Za-z]/g)).length;
  return hanCount >= 2 && hanCount >= latinCount;
}

export function getEditableImagePrompt(value: string): Record<EditableImagePromptField, string> | null {
  const sections = promptSections(value);
  if (!sections) return null;
  return { composition: sections[2], visualLanguage: sections[3], colorLighting: sections[4] };
}

export function editVisualImagePrompt(value: string, field: EditableImagePromptField, text: string): string | null {
  const sections = promptSections(value);
  if (!sections) return null;
  const index = { composition: 2, visualLanguage: 3, colorLighting: 4 }[field];
  sections[index] = Array.from(text.replace(/[\r\n]+/g, ' ')).slice(0, MAX_VISUAL_DESCRIPTION_CHARS).join('');
  return sections.map((part, sectionIndex) => `${SECTION_LABELS[sectionIndex]}${part}`).join('\n');
}

/** Rebuild the task, copy, and output from trusted application data at render time. */
export function canonicalizeApprovedImagePrompt(value: string, copy: CopyData): string | null {
  const sections = promptSections(value);
  if (!sections || !isStructuredImagePrompt(value)) return null;
  const prompt = composePrompt({
    subject: sections[1],
    composition: sections[2],
    visualLanguage: sections[3],
    colorLighting: sections[4],
    preserve: sections[6]
  }, copy);
  return isStructuredImagePrompt(prompt) ? prompt : null;
}

/** Format only the text model's visual decisions; exact copy and output rules come from verified fields. */
export function formatDesignedImagePrompt(value: unknown, copy: CopyData): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const fields: Record<(typeof FIELDS)[number][0], string> = {} as Record<(typeof FIELDS)[number][0], string>;
  for (const [name, limit] of FIELDS) {
    const text = sanitizeImagePromptText(raw[name], limit);
    if (!text || !isChineseDescription(text)) return null;
    fields[name] = text;
  }
  const prompt = composePrompt(fields, copy);
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
