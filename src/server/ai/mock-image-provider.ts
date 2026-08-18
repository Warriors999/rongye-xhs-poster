import type { ImageAsset } from '@/domain/project';
import type { ImageBeautifier, ImageBeautifyInput } from './image-provider';

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? character);
}

const styles = {
  studio: { background: '#f7e2df', accent: '#c95f68' },
  craft: { background: '#efe3cf', accent: '#8c6b45' },
  original: { background: '#e2ece5', accent: '#4e6b66' }
} as const;

export class MockImageProvider implements ImageBeautifier {
  async beautify({ image, mode, poster }: ImageBeautifyInput): Promise<ImageAsset> {
    if (!poster) return { ...image, id: `${image.id}-${mode}`, source: 'beautified', mode };
    const style = styles[mode];
    const title = escapeXml(poster.copy.title);
    const description = escapeXml(poster.copy.description);
    const tags = escapeXml(poster.copy.tags.join('  '));
    const source = escapeXml(image.dataUrl);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536"><rect width="1024" height="1536" fill="${style.background}"/><circle cx="865" cy="180" r="190" fill="#fff" opacity=".48"/><path d="M80 1160 C230 1060 360 1290 520 1170 S810 1090 960 1210" fill="none" stroke="${style.accent}" stroke-width="5" opacity=".34"/><rect x="44" y="44" width="936" height="1448" rx="22" fill="none" stroke="#443836" stroke-opacity=".18" stroke-width="3"/><rect x="142" y="240" width="740" height="710" rx="28" fill="#fff" opacity=".38"/><image href="${source}" x="170" y="255" width="684" height="680" preserveAspectRatio="xMidYMid meet"/><text x="80" y="1130" fill="#2d2524" font-family="sans-serif" font-size="66" font-weight="800">${title}</text><text x="80" y="1200" fill="#756662" font-family="sans-serif" font-size="27">${description}</text><text x="80" y="1375" fill="${style.accent}" font-family="sans-serif" font-size="22" font-weight="600">${tags}</text></svg>`;
    return {
      ...image,
      id: `${image.id}-${mode}`,
      dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      width: 1024,
      height: 1536,
      source: 'beautified',
      mode
    };
  }
}
