import sharp from 'sharp';

export async function normalizePosterOutput(bytes: Buffer, background = '#FFFAF4') {
  const metadata = await sharp(bytes, { limitInputPixels: 1600 * 1600 }).metadata();
  if (!metadata.width || !metadata.height || metadata.width > 1600 || metadata.height > 1600) throw new Error('图片美化结果格式异常，请重试');
  if (metadata.width * 4 === metadata.height * 3) return { bytes, width: metadata.width, height: metadata.height, padded: false };
  const color = /^#[0-9a-fA-F]{6}$/.test(background) ? background : '#FFFAF4';
  const output = await sharp(bytes).resize(1152, 1536, { fit: 'contain', background: color, withoutEnlargement: true }).png().toBuffer();
  return { bytes: output, width: 1152, height: 1536, padded: true };
}
