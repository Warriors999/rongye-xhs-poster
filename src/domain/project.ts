export type WizardStep = 'upload' | 'generating' | 'choose' | 'copy' | 'edit' | 'exported';
export type BeautifyMode = 'original' | 'craft' | 'studio';
export type PosterDirection = 'lifestyle' | 'story' | 'editorial';
export type LegacyPosterStyle = 'cute' | 'daily' | 'series';
export type PosterStyle = PosterDirection | LegacyPosterStyle;
export type LayerId = 'title' | 'description' | 'tag' | `sticker-${string}`;

export interface ImageAsset {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  source: 'upload' | 'beautified';
  mode?: BeautifyMode;
}

export interface CopyData {
  title: string;
  description: string;
  tags: string[];
}

export interface CopyVariant {
  angle: string;
  title: string;
  body: string;
  tags: string[];
}

export interface CopyGenerationResult {
  variants: CopyVariant[];
}

export interface SubjectProtection {
  identity: string;
  silhouette: string;
  pose: string;
  colors: string[];
  material: string;
  mustKeep: string[];
}

export interface ResearchSummary {
  query: string;
  sources: Array<{ title: string; url?: string }>;
  composition: string;
  palette: string;
  material: string;
  typography: string;
  density: string;
  fallback?: boolean;
}

export const defaultResearchSummary: ResearchSummary = {
  query: '内置设计知识库',
  sources: [{ title: '内置设计知识库' }],
  composition: '主体清晰，保留安全留白和单一视觉重心。',
  palette: '以主体真实颜色为准，使用低饱和辅助色。',
  material: '以图片中的真实材质和纹理为准。',
  typography: '短标题、短辅助句和少量标签，层级清晰。',
  density: '低密度，装饰少而有秩序。',
  fallback: true
};

export interface DesignBrief {
  /** A model-generated concept name; the direction value remains an internal slot. */
  label?: string;
  concept: string;
  layout: string;
  scene: string;
  elements: string[];
  palette: string[];
  typography: string;
  hierarchy: string;
  mood: string;
  negative: string[];
  direction: PosterDirection;
}

export interface TextLayer {
  type: 'text';
  id: 'title' | 'description' | 'tag';
  text: string;
  x: number;
  y: number;
  width: number;
  fontFamily: string;
  fontSize: number;
  fill: string;
  align: 'left' | 'center' | 'right';
}

export interface StickerLayer {
  type: 'sticker';
  id: `sticker-${string}`;
  emoji: string;
  x: number;
  y: number;
  scale: number;
}

export interface PosterLayers {
  title?: TextLayer;
  description?: TextLayer;
  tag?: TextLayer;
  stickers: Record<string, StickerLayer>;
}

export type PosterLayer = TextLayer | StickerLayer;

export interface PosterDraft {
  style: PosterStyle;
  image: ImageAsset;
  copy: CopyData;
  background: string;
  layers: PosterLayers;
  design?: DesignBrief;
  designNote: string;
}

export interface GenerationInput {
  image: ImageAsset;
  keywords: string;
  forbiddenWords: string;
  creativeIdea?: string;
}

export interface GenerationResult {
  analysis: {
    subject: string;
    colors: string[];
    material: string;
    details: string[];
  };
  research: ResearchSummary;
  posters: PosterDraft[];
  warnings?: string[];
}

const defaultFont = 'system-ui, sans-serif';

const emptyImage: ImageAsset = {
  id: 'empty',
  dataUrl: '',
  width: 3,
  height: 4,
  source: 'upload'
};

export function createEmptyDraft(): PosterDraft {
  return {
    style: 'lifestyle',
    image: { ...emptyImage },
    copy: {
      title: '今天也要可可爱爱',
      description: '一只认真生活的针织小伙伴。',
      tags: ['#针织玩偶', '#手作日常']
    },
    background: '#FFFAF4',
    design: {
      direction: 'lifestyle',
      concept: '把针织玩偶放进温柔的日常场景。',
      layout: '主体清晰，文字位于留白区。',
      scene: '温暖的手作桌面与自然光。',
      elements: ['布料', '纸张'],
      palette: ['奶油白', '珊瑚粉'],
      typography: '短标题和简洁辅助文字。',
      hierarchy: '主体优先，其次是标题和标签。',
      mood: '温柔、轻快。',
      negative: ['不要遮挡主体']
    },
    layers: {
      title: {
        type: 'text',
        id: 'title',
        text: '今天也要可可爱爱',
        x: 24,
        y: 40,
        width: 402,
        fontFamily: defaultFont,
        fontSize: 32,
        fill: '#2C2524',
        align: 'left'
      },
      description: {
        type: 'text',
        id: 'description',
        text: '一只认真生活的针织小伙伴。',
        x: 24,
        y: 108,
        width: 402,
        fontFamily: defaultFont,
        fontSize: 18,
        fill: '#827572',
        align: 'left'
      },
      tag: {
        type: 'text',
        id: 'tag',
        text: '#针织玩偶  #手作日常',
        x: 24,
        y: 870,
        width: 402,
        fontFamily: defaultFont,
        fontSize: 16,
        fill: '#D87568',
        align: 'left'
      },
      stickers: {}
    },
    designNote: '以主体保真为前提，保留清晰留白和简洁信息层级。'
  };
}
