export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp|gif);base64,([a-z0-9+/=]+)$/i;
const TASK_ASSET_URL = /^\/api\/tasks\/[A-Za-z0-9_-]{8,100}\?asset=(?:lifestyle|story|editorial|cute|daily|series)$/;
const SVG_DATA_URL = /^data:image\/svg\+xml(?:;charset=utf-8)?(;base64)?,([\s\S]+)$/i;

async function rasterizeSvg(svg: string): Promise<string> {
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) throw new Error('海报图片格式异常，请重试');
  const documentSvg = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (documentSvg.querySelector('parsererror') || documentSvg.documentElement.localName !== 'svg' || documentSvg.documentElement.namespaceURI !== 'http://www.w3.org/2000/svg') throw new Error('海报图片格式异常，请重试');
  for (const element of Array.from(documentSvg.querySelectorAll('*'))) {
    if (['script', 'foreignobject', 'iframe', 'object', 'embed', 'animate', 'animatetransform', 'set', 'style'].includes(element.localName.toLowerCase())) throw new Error('海报图片格式异常，请重试');
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name)) throw new Error('海报图片格式异常，请重试');
      if (attribute.localName === 'href' && !/^#[\w-]+$/.test(attribute.value) && !IMAGE_DATA_URL.test(attribute.value)) throw new Error('海报图片格式异常，请重试');
      if (/url\s*\(/i.test(attribute.value) && !/^url\(\s*#[\w-]+\s*\)$/i.test(attribute.value)) throw new Error('海报图片格式异常，请重试');
    }
  }
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      const timer = window.setTimeout(() => reject(new Error('海报图片读取超时，请重试')), 15_000);
      image.onload = () => { window.clearTimeout(timer); resolve(image); };
      image.onerror = () => { window.clearTimeout(timer); reject(new Error('海报图片无法读取，请重试')); };
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 4096 || image.naturalHeight > 4096) throw new Error('海报图片尺寸异常，请重试');
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器不支持图片保存');
    context.drawImage(image, 0, 0);
    return imageSourceToDataUrl(canvas.toDataURL('image/png'));
  } finally { URL.revokeObjectURL(url); }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export async function imageSourceToDataUrl(source: string, options: { signal?: AbortSignal } = {}): Promise<string> {
  if (source.startsWith('data:')) {
    const svgMatch = SVG_DATA_URL.exec(source);
    if (svgMatch) {
      if (source.length > MAX_IMAGE_BYTES * 4) throw new Error('海报图片过大，请压缩后重试');
      let svg: string;
      try {
        svg = svgMatch[1] ? new TextDecoder().decode(Uint8Array.from(atob(svgMatch[2]), (character) => character.charCodeAt(0))) : decodeURIComponent(svgMatch[2]);
      } catch { throw new Error('海报图片格式异常，请重试'); }
      if (new TextEncoder().encode(svg).length > MAX_IMAGE_BYTES) throw new Error('海报图片过大，请压缩后重试');
      return rasterizeSvg(svg);
    }
    const match = IMAGE_DATA_URL.exec(source);
    if (!match) throw new Error('海报图片格式异常，请重试');
    if (match[2].length * 0.75 > MAX_IMAGE_BYTES) throw new Error('海报图片过大，请压缩后重试');
    return source;
  }
  if (!TASK_ASSET_URL.test(source)) throw new Error('海报图片地址异常，请重试');
  const response = await fetch(source, { credentials: 'same-origin', ...(options.signal ? { signal: options.signal } : {}) });
  if (!response.ok) throw new Error('海报图片暂时无法读取，请重试');
  const contentType = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
  if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(contentType)) throw new Error('海报图片格式异常，请重试');
  if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) throw new Error('海报图片过大，请压缩后重试');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error('海报图片格式异常，请重试');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('海报图片过大，请压缩后重试');
  if (contentType === 'image/svg+xml') return rasterizeSvg(new TextDecoder().decode(bytes));
  return `data:${contentType};base64,${bytesToBase64(bytes)}`;
}
