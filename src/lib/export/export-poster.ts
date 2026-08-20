export type ExportFormat = 'png' | 'jpg';

type ExportStage = {
  toDataURL: (config: { mimeType: string; quality?: number; pixelRatio: number }) => string;
};

export const EXPORT_UNSUPPORTED_MESSAGE = '当前浏览器暂不支持导出，请尝试长按图片保存';

export async function exportPoster(
  stage: ExportStage | null | undefined,
  format: ExportFormat
): Promise<{ dataUrl: string; filename: string }> {
  if (!stage || typeof stage.toDataURL !== 'function') throw new Error(EXPORT_UNSUPPORTED_MESSAGE);

  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const dataUrl = stage.toDataURL({
    mimeType,
    ...(format === 'jpg' ? { quality: 0.92 } : {}),
    pixelRatio: 1200 / 360
  });
  if (!dataUrl) throw new Error(EXPORT_UNSUPPORTED_MESSAGE);

  const filename = `knitting-poster-${Date.now()}.${format}`;
  if (typeof document !== 'undefined') {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  }
  return { dataUrl, filename };
}
