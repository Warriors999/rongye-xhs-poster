const IMAGE_DATA_URL_PATTERN = /^data:(image\/[a-z0-9!#$%&'*+.^_`|~-]+)((?:;[a-z0-9!#$%&'*+.^_`|~-]+(?:=(?:"[^"]*"|[a-z0-9!#$%&'*+.^_`|~:%/+~-]+))?)*),([\s\S]+)$/i;

export interface DecodedImageData {
  bytes: Uint8Array;
  contentType: string;
}

export function decodeImageDataUrl(dataUrl: string): DecodedImageData {
  const match = dataUrl.match(IMAGE_DATA_URL_PATTERN);
  if (!match || !match[3]) throw new Error('图片格式无效');
  const contentType = match[1].toLowerCase();
  const header = match[2].toLowerCase();
  const payload = match[3];
  if (header.split(';').includes('base64')) {
    if (!/^[a-z0-9+/]*={0,2}$/i.test(payload) || payload.length % 4 === 1) throw new Error('图片格式无效');
    const bytes = Uint8Array.from(Buffer.from(payload, 'base64'));
    if (bytes.byteLength === 0) throw new Error('图片格式无效');
    return { bytes, contentType };
  }
  try {
    const decoded = decodeURIComponent(payload);
    const bytes = new TextEncoder().encode(decoded);
    if (bytes.byteLength === 0) throw new Error('图片格式无效');
    return { bytes, contentType };
  } catch {
    throw new Error('图片格式无效');
  }
}

export function encodeImageDataUrl(bytes: Uint8Array, contentType: string): string {
  if (!contentType.toLowerCase().startsWith('image/')) throw new Error('图片格式无效');
  if (bytes.byteLength === 0) throw new Error('图片格式无效');
  return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
}
