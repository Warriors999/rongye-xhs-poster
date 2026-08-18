import type { ImageAsset } from '@/domain/project';
import { createId } from '@/lib/ids';

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const MAX_EDGE = 1600;
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type DecodedImage = {
  width: number;
  height: number;
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void;
  close?: () => void;
};

async function decode(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (context, width, height) => context.drawImage(bitmap, 0, 0, width, height),
        close: () => bitmap.close()
      };
    } catch {
      // Some browsers expose createImageBitmap but cannot decode every image type.
    }
  }

  if (typeof Image === 'undefined' || typeof URL === 'undefined') {
    throw new Error('图片无法读取，请换一张图片');
  }

  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('图片无法读取，请换一张图片'));
      element.src = source;
    });
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      draw: (context, width, height) => context.drawImage(image, 0, 0, width, height)
    };
  } finally {
    URL.revokeObjectURL(source);
  }
}

export async function normalizeImage(file: File): Promise<ImageAsset> {
  if (file.size > MAX_FILE_SIZE) throw new Error('图片不能超过 12MB');
  if (!SUPPORTED_TYPES.has(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片');

  let decoded: DecodedImage;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error('图片无法读取，请换一张图片');
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    const context = canvas?.getContext('2d');

    if (!canvas || !context) throw new Error('canvas unavailable');

    canvas.width = width;
    canvas.height = height;
    decoded.draw(context, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    return { id: createId('upload'), dataUrl, width, height, source: 'upload' };
  } catch {
    throw new Error('图片无法读取，请换一张图片');
  } finally {
    try {
      decoded.close?.();
    } catch {
      // Resource release must not replace the user-facing decode error.
    }
  }
}
