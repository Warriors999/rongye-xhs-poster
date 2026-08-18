import type { PosterDraft, TextLayer } from '@/domain/project';

export const POSTER_EXPORT_WIDTH = 1200;
export const POSTER_EXPORT_HEIGHT = 1600;

type CanvasContext = CanvasRenderingContext2D;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('海报图片无法读取'));
    image.src = dataUrl;
  });
}

function wrapText(context: CanvasContext, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const character of Array.from(text)) {
    const next = current + character;
    if (current && context.measureText(next).width > maxWidth) {
      lines.push(current);
      current = character;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function drawTextLayer(context: CanvasContext, layer: TextLayer, scale: number) {
  const fontWeight = layer.id === 'title' ? 800 : layer.id === 'tag' ? 600 : 500;
  const fontSize = layer.fontSize * scale;
  context.font = `${fontWeight} ${fontSize}px ${layer.fontFamily}`;
  context.fillStyle = layer.fill;
  context.textAlign = layer.align;
  context.textBaseline = 'top';
  const x = layer.x * scale + (layer.align === 'left' ? 0 : layer.width * scale / (layer.align === 'center' ? 2 : 1));
  const lines = wrapText(context, layer.text, layer.width * scale);
  const lineHeight = fontSize * 1.3;
  lines.slice(0, 4).forEach((line, index) => context.fillText(line, x, layer.y * scale + index * lineHeight));
}

function drawDecorativeBackground(context: CanvasContext) {
  const glow = context.createRadialGradient(1010, 150, 30, 1010, 150, 520);
  glow.addColorStop(0, 'rgba(255,255,255,.72)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, POSTER_EXPORT_WIDTH, POSTER_EXPORT_HEIGHT);

  context.strokeStyle = 'rgba(82, 62, 54, .12)';
  context.lineWidth = 2;
  context.strokeRect(28, 28, POSTER_EXPORT_WIDTH - 56, POSTER_EXPORT_HEIGHT - 56);
}

function drawContainedImage(context: CanvasContext, image: HTMLImageElement, scale: number) {
  const box = {
    x: POSTER_EXPORT_WIDTH * 0.14,
    y: POSTER_EXPORT_HEIGHT * 0.23,
    width: POSTER_EXPORT_WIDTH * 0.72,
    height: POSTER_EXPORT_HEIGHT * 0.45
  };
  const imageScale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
  const width = image.naturalWidth * imageScale;
  const height = image.naturalHeight * imageScale;
  const x = box.x + (box.width - width) / 2;
  const y = box.y + (box.height - height) / 2;
  context.save();
  context.shadowColor = 'rgba(72, 49, 42, .14)';
  context.shadowBlur = 18 * scale;
  context.shadowOffsetY = 14 * scale;
  context.drawImage(image, x, y, width, height);
  context.restore();
}

export async function renderPosterToDataUrl(draft: PosterDraft): Promise<string> {
  if (typeof document === 'undefined') throw new Error('当前环境不支持导出');
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_EXPORT_WIDTH;
  canvas.height = POSTER_EXPORT_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器不支持导出');

  const scale = POSTER_EXPORT_WIDTH / 768;
  context.fillStyle = draft.background;
  context.fillRect(0, 0, POSTER_EXPORT_WIDTH, POSTER_EXPORT_HEIGHT);
  drawDecorativeBackground(context);

  if (draft.image.dataUrl) {
    try {
      const image = await loadImage(draft.image.dataUrl);
      if (image.naturalWidth && image.naturalHeight) drawContainedImage(context, image, scale);
    } catch {
      // Keep the designed background and text available when an image cannot load.
    }
  }

  const textLayers = [draft.layers.title, draft.layers.description, draft.layers.tag].filter(
    (layer): layer is TextLayer => Boolean(layer && layer.type === 'text')
  );
  textLayers.forEach((layer) => drawTextLayer(context, layer, scale));

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  Object.values(draft.layers.stickers).forEach((sticker) => {
    context.font = `${Math.round(38 * sticker.scale * scale)}px system-ui, sans-serif`;
    context.fillText(sticker.emoji, sticker.x * scale, sticker.y * scale);
  });

  return canvas.toDataURL('image/png');
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

export function posterFilename(style: PosterDraft['style'], index?: number): string {
  const suffix = index === undefined ? '' : `-${index + 1}`;
  return `绒页-${style}${suffix}.png`;
}
