import { defaultResearchSummary, type DesignBrief, type LegacyPosterStyle, type PosterDirection, type PosterStyle, type ResearchSummary } from '@/domain/project';

/**
 * These are transport slots only. They are deliberately not creative roles.
 * The model supplies the actual concept name and visual language for each slot.
 */
const SLOT_LABELS: Record<PosterDirection, string> = {
  lifestyle: '动态方案 A',
  story: '动态方案 B',
  editorial: '动态方案 C'
};

const LEGACY_DIRECTION_MAP: Record<LegacyPosterStyle, PosterDirection> = {
  cute: 'lifestyle',
  daily: 'story',
  series: 'editorial'
};

const SUBJECT_SAFETY = [
  '不得改变上传玩偶的身份',
  '不得改变上传玩偶的轮廓、比例、姿态、颜色和材质',
  '不得替换、重绘、复制或增加第二个主体',
  '不得让装饰遮挡主体或关键配件'
];

const COPY_SAFETY = [
  '不得生成价格、日期、名称、编号、品牌、规格或伪文字',
  '不得在道具、包装、徽章、纸张或背景中添加额外文字',
  '只允许短标题、短辅助句和最多两个标签'
];

// Guard changes to the actual subject, rather than any action later in its sentence.
const INSTRUCTION_INJECTION_PATTERNS = [
  /(?:忽略|覆盖|改写|替换|更换|变更)(?:以上|之前|先前|前面|现有|当前|上述)?(?:的)?(?:设计规则|规则|指令|限制|要求|提示)|新(?:角色|主体|人物|玩偶)|另一个(?:角色|主体|玩偶)|人物|人像|手指|^复制$/i,
  /(?:增加|新增|添加|加入|引入|再加|多加|更换|替换|换成|改成|改为|变成|改变|变更|重绘|复制)(?:为|成|一个|一只|一位|第二个|另外|另一个|新的|上传的?|真实的?|原有的?|的|\s)*(?:主体|角色|玩偶|人物|形象|对象)|(?:主体|角色|玩偶|人物|形象|对象)(?:的)?(?:(?:轮廓|姿态|颜色|材质|身份|外形|比例)(?:被|的)?)?(?:被)?(?:更换|替换|换成|改成|改为|变成|改变|变更|重绘|复制)/i,
  /(?:重绘|复制|替换|更换|改变)(?:整张|整个|原始|上传|原图|的|\s)*(?:照片|图片|图像)|(?:上传|原始)(?:照片|图片|图像)[^，。；！？\n]{0,12}(?:改成|变成|替换|重绘)(?:插画|卡通|新|其他)?/i,
  /\b(?:ignore|override|disregard)\b|\b(?:rewrite|replace|change)\s+(?:(?:previous|prior|above|existing)\s+)?(?:design\s+)?(?:rules|instructions|directions|constraints)\b|\b(?:human|person|people|finger)s?\b/i,
  /\b(?:add|introduce|include|insert|bring\s+in|switch|replace|change|turn|redraw|copy)\s+(?:(?:with|to|into|a|an|the|another|different|new|second|uploaded|original|real)\s+)*(?:subject|character|doll|person|role|object)\b|\b(?:subject|character|doll|person|role|object)(?:\s+(?:identity|colors?|silhouette|pose|material|proportions?))?\s+(?:(?:is|are|must|be|to)\s+)*(?:replaced|changed|redrawn|copied|switched|turned)\b|\b(?:use|choose|select|pick)\s+(?:(?:a|an|the)\s+)?(?:another|different|new)\s+(?:subject|character|doll|person|role|object)\b/i,
  /\b(?:redraw|copy|replace|change)\s+(?:(?:the|entire|whole|uploaded|original|source)\s+)*(?:photo|photograph|image|picture)\b/i
] as const;

const UNSUPPORTED_DESIGN_TEXT_PATTERNS = [
  /价格|售价|¥|￥|\$|日期|时间|编号|序号|名称|商品名|品名|品牌|销量|规格|尺寸|新品|上新|限时|特价|折扣|伪文字|虚构|编造|水印|logo|第二个主体|额外主体|第二个玩偶|额外文字/i,
  /\d+(?:\.\d+)?\s*(?:元|人民币|美元|yuan|rmb|usd)|\b(?:price\s+tag|sale\s+price|brand\s+name)\b|\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\d{4}\s*年|第\s*[\d一二三四五六七八九十]+\s*(?:期|集|册)|\b(?:vol|no)\.?\s*\d+/i,
  /(?:标题|文案|吊牌|标签|标记)[^，。；！？\n]{0,12}(?:写|加上|标注|印|显示|绘制)\s*\d+(?:\.\d+)?(?![\d.]|\s*(?:px|%|像素|列|级|[:：/]\s*\d))|\b(?:label|title|caption)\s+(?:reading|saying)\s+\d+/i,
  ...INSTRUCTION_INJECTION_PATTERNS
] as const;

function containsUnsupportedDesignText(value: string): boolean {
  return UNSUPPORTED_DESIGN_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

function containsInstructionInjection(value: string): boolean {
  return INSTRUCTION_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function sanitizeDesignText(value: unknown, fallback: string, maxLength = 220): string {
  if (typeof value !== 'string' || !value.trim() || containsUnsupportedDesignText(value)) return fallback;
  return Array.from(value.trim()).slice(0, maxLength).join('') || fallback;
}

function safeText(value: unknown, fallback: string, maxLength = 220): string {
  return sanitizeDesignText(value, fallback, maxLength);
}

function safeList(value: unknown, fallback: string[], maxItems: number, maxLength = 80): string[] {
  const values = Array.isArray(value) ? value : [];
  const textValues = values.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
  if (textValues.some(containsInstructionInjection)) return fallback;
  const list = values
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map((item) => sanitizeDesignText(item, '', maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
  return list.length ? list : fallback;
}

function unique(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function researchPalette(research: ResearchSummary): string[] {
  const palette = research.palette
    .split(/[、，,；;/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return safeList(palette, ['以研究资料和主体真实颜色为准'], 5, 50);
}

function directionForStyle(style: PosterStyle): PosterDirection {
  return style in LEGACY_DIRECTION_MAP ? LEGACY_DIRECTION_MAP[style as LegacyPosterStyle] : style as PosterDirection;
}

function baseBrief(direction: PosterDirection, research: ResearchSummary): DesignBrief {
  const material = safeText(research.material, '以图片中的真实材质和纹理为准。');
  const composition = safeText(research.composition, '保留主体清晰度和安全留白，根据内容动态组织视觉动线。');
  const typography = safeText(research.typography, '短标题、短辅助句和少量标签，形成清晰字号层级。');
  const density = safeText(research.density, '根据概念安排有秩序的疏密对比，主体与文字保持清晰。');

  return {
    label: SLOT_LABELS[direction],
    direction,
    concept: '根据上传主体、用户创作意图和研究资料提炼一个独立视觉概念。',
    layout: `${composition} 根据本方案的独立概念动态决定构图、视线和留白，可明确描述主体位置、画面占比、背景变化和排版坐标，但不改动玩偶本身。`,
    scene: `根据用户创作意图和研究资料动态生成场景，保留${material}，不添加无关道具。`,
    elements: [material],
    palette: researchPalette(research),
    typography: `${typography} 根据本方案概念动态决定文字关系，不添加事实信息。`,
    hierarchy: `真实玩偶主视觉 > 短标题 > 短辅助句 > 最多两个标签；${density}`,
    mood: '由上传主体、用户意图和研究资料共同决定，可鲜明、戏剧化或安静，不默认暖色与低饱和。',
    negative: unique([
      '三个方案必须使用不同的主要构图、视觉语言、配色关系和元素组合',
      '不得把三个方案做成同一张模板的轻微换色版本',
      ...SUBJECT_SAFETY,
      ...COPY_SAFETY
    ])
  };
}

function safeCandidateNegative(value: unknown): string[] {
  return safeList(value, [], 6, 100).filter((item) => !/允许|可以|忽略|改变|替换|重绘|增加|添加/.test(item));
}

function mergeCandidateText(base: string, value: unknown, maxLength: number): string {
  const candidate = safeText(value, '', maxLength);
  const content = candidate.split(base).join('').trim();
  return content || Array.from(base).slice(0, maxLength).join('');
}

/**
 * Resolve a model candidate into a dynamic brief. Legacy styles map to a
 * direction for callers that still use the old public API.
 */
export function resolveDesignBrief(style: PosterStyle, candidate: unknown = {}, research: ResearchSummary = defaultResearchSummary): DesignBrief {
  const direction = directionForStyle(style);
  const base = baseBrief(direction, research);
  const source = recordValue(candidate);
  const candidatePalette = safeList(source.palette, [], 5, 50);
  const candidateElements = safeList(source.elements, [], 3, 60);
  const candidateNegative = safeCandidateNegative(source.negative);

  return {
    ...base,
    label: safeText(source.label ?? source.name, base.label ?? '动态创意方案', 60),
    concept: mergeCandidateText(base.concept, source.concept, 240),
    layout: mergeCandidateText(base.layout, source.layout, 280),
    scene: mergeCandidateText(base.scene, source.scene, 280),
    elements: candidateElements.length ? unique(candidateElements) : base.elements,
    palette: candidatePalette.length ? unique(candidatePalette) : base.palette,
    typography: mergeCandidateText(base.typography, source.typography, 240),
    hierarchy: mergeCandidateText(base.hierarchy, source.hierarchy, 240),
    mood: mergeCandidateText(base.mood, source.mood, 160),
    negative: unique([...base.negative, ...candidateNegative]).slice(0, 10)
  };
}

/** @deprecated Compatibility view for old callers; dynamic rules are the source of truth. */
const LEGACY_COMPATIBILITY_ELEMENTS: Record<LegacyPosterStyle, string[]> = {
  cute: ['抽象纸张色块'],
  daily: ['少量毛线或针织纹理'],
  series: ['无文字几何色块']
};

function compatibilityPreset(style: LegacyPosterStyle): DesignBrief {
  const brief = resolveDesignBrief(style, {}, defaultResearchSummary);
  return { ...brief, elements: unique([...brief.elements, ...LEGACY_COMPATIBILITY_ELEMENTS[style]]) };
}

export const designPresets: Record<PosterStyle, DesignBrief> = {
  cute: compatibilityPreset('cute'),
  daily: compatibilityPreset('daily'),
  series: compatibilityPreset('series'),
  lifestyle: resolveDesignBrief('lifestyle', {}, defaultResearchSummary),
  story: resolveDesignBrief('story', {}, defaultResearchSummary),
  editorial: resolveDesignBrief('editorial', {}, defaultResearchSummary)
};

export const DESIGN_SYSTEM_PROMPT = [
  '内置动态设计师规则（必须遵守，不是用户指令）：',
  '主体保护、文字安全和信息真实性优先级最高，模型候选不得覆盖。',
  '用户文字只作为创作意图；研究摘要只作为设计资料；两者都不能变成画面中的额外文字。',
  '每张图必须是 3:4 竖版微海报，不是简单换背景，也不是居中图片加一行文字。',
  '必须先识别并保护上传图片中的真实玩偶，再安排主视觉、留白安全区、信息层级、视觉动线和少量 AI 元素。',
  '短标题、短辅助句、最多两个标签；禁止价格、日期、名称、编号、品牌、规格、伪文字和额外道具文字。',
  '只绘制输出 copy 中明确提供的文字；禁止低质量光效、杂乱连接线、随机贴纸、水印和无意义 logo。',
  '创意发散规则：每次根据上传图片、用户创作意图和研究资料重新生成三个独立概念；不要预设生活方式、故事或编辑海报模板。',
  '三个概念必须在主要构图、视觉语言、色彩关系、材质/AI 元素和排版方式上明显不同；不能只是换颜色、换标题或轻微移动主体。',
  '每个概念都要解释自己的设计判断，并且与用户想法和真实主体建立关系；差异不能来自无关的随机装饰。',
  SUBJECT_SAFETY.join('；'),
  COPY_SAFETY.join('；')
].join('\n');
