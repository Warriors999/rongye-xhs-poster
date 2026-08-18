export type WizardStep = 'upload' | 'generating' | 'choose' | 'edit' | 'exported';
export type BeautifyMode = 'original' | 'craft' | 'studio';
export type PosterStyle = 'cute' | 'daily' | 'series';
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

export interface DesignBrief {
  concept: string;
  layout: string;
  scene: string;
  elements: string[];
  palette: string[];
  typography: string;
  hierarchy: string;
  mood: string;
  negative: string[];
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
  posters: PosterDraft[];
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
    style: 'cute',
    image: { ...emptyImage },
    copy: {
      title: '今天也要可可爱爱',
      description: '一只认真生活的针织小伙伴。',
      tags: ['#针织玩偶', '#手作日常']
    },
    background: '#FFFAF4',
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
    }
  };
}
