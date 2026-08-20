import type { ImageAsset, PosterStyle } from '@/domain/project';
import { IMAGE_PROVIDER_UNAVAILABLE_ERROR, type ImageBeautifier, type ImageBeautifyInput } from './image-provider';

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? character);
}

const styles = {
  lifestyle: { background: '#f7e2df', accent: '#c95f68', secondary: '#fff4ee' },
  story: { background: '#efe3cf', accent: '#8c6b45', secondary: '#fff9ed' },
  editorial: { background: '#e2ece5', accent: '#4e6b66', secondary: '#f7fffb' },
  cute: { background: '#f7e2df', accent: '#c95f68', secondary: '#fff4ee' },
  daily: { background: '#efe3cf', accent: '#8c6b45', secondary: '#fff9ed' },
  series: { background: '#e2ece5', accent: '#4e6b66', secondary: '#f7fffb' },
  studio: { background: '#f7e2df', accent: '#c95f68', secondary: '#fff4ee' },
  craft: { background: '#efe3cf', accent: '#8c6b45', secondary: '#fff9ed' },
  original: { background: '#e2ece5', accent: '#4e6b66', secondary: '#f7fffb' }
} as const;

const legacyDirectionMap: Partial<Record<PosterStyle, string>> = { cute: 'lifestyle', daily: 'story', series: 'editorial' };

export interface MockImageProviderDependencies {
  env?: Record<string, string | undefined>;
}

function configuredFailureDirection(env: Record<string, string | undefined>): string | undefined {
  const value = env.MOCK_IMAGE_FAIL_DIRECTION?.trim();
  return value || undefined;
}

function shouldFail(style: PosterStyle | undefined, env: Record<string, string | undefined>): boolean {
  const configured = configuredFailureDirection(env);
  if (!configured || !style) return false;
  return style === configured || legacyDirectionMap[style] === configured;
}

export class MockImageProvider implements ImageBeautifier {
  private readonly env: Record<string, string | undefined>;

  constructor(dependencies: MockImageProviderDependencies = {}) {
    this.env = dependencies.env ?? process.env;
  }

  async beautify({ image, mode, poster }: ImageBeautifyInput): Promise<ImageAsset> {
    if (!poster) return { ...image, id: `${image.id}-${mode}`, source: 'beautified', mode };
    if (shouldFail(poster.style, this.env)) throw new Error(IMAGE_PROVIDER_UNAVAILABLE_ERROR);
    const style = styles[poster.style] ?? styles[mode];
    const title = escapeXml(poster.copy.title);
    const description = escapeXml(poster.copy.description);
    const tags = escapeXml(poster.copy.tags.join('  '));
    const source = escapeXml(image.dataUrl);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536"><defs><linearGradient id="wash" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${style.secondary}"/><stop offset="1" stop-color="${style.background}"/></linearGradient></defs><rect width="1024" height="1536" fill="url(#wash)"/><circle cx="865" cy="180" r="190" fill="#fff" opacity=".48"/><path d="M80 1160 C230 1060 360 1290 520 1170 S810 1090 960 1210" fill="none" stroke="${style.accent}" stroke-width="5" opacity=".34"/><path d="M730 86 h160 v160 h-160 z M760 116 h100 M760 156 h68 M760 196 h112" fill="none" stroke="${style.accent}" stroke-width="4" opacity=".28"/><rect x="44" y="44" width="936" height="1448" rx="22" fill="none" stroke="#443836" stroke-opacity=".18" stroke-width="3"/><rect x="142" y="240" width="740" height="710" rx="28" fill="#fff" opacity=".38"/><image href="${source}" x="170" y="255" width="684" height="680" preserveAspectRatio="xMidYMid meet"/><text x="80" y="1130" fill="#2d2524" font-family="sans-serif" font-size="66" font-weight="800">${title}</text><text x="80" y="1200" fill="#756662" font-family="sans-serif" font-size="27">${description}</text><text x="80" y="1375" fill="${style.accent}" font-family="sans-serif" font-size="22" font-weight="600">${tags}</text></svg>`;
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
