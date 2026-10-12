// @vitest-environment node
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { normalizePosterOutput } from './poster-output';

describe('poster output geometry', () => {
  it('preserves a complete 2:3 image inside a 3:4 canvas without cropping or stretching', async () => {
    const input = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const result = await normalizePosterOutput(input, '#0000ff');
    const pixels = await sharp(result.bytes).removeAlpha().raw().toBuffer();
    const pixel = (x: number, y: number) => [...pixels.subarray((y * result.width + x) * 3, (y * result.width + x) * 3 + 3)];
    expect([result.width,result.height,result.padded]).toEqual([1152,1536,true]);
    expect(pixel(0,0)).toEqual([0,0,255]);
    expect(pixel(64,0)).toEqual([255,0,0]);
    expect(pixel(1087,1535)).toEqual([255,0,0]);
    expect(pixel(1151,1535)).toEqual([0,0,255]);
  });

  it('preserves native 3:4 image bytes', async () => {
    const input = await sharp({ create: { width: 768, height: 1024, channels: 3, background: '#ffeecc' } }).png().toBuffer();
    const result = await normalizePosterOutput(input);
    expect(result.bytes).toEqual(input);
    expect([result.width,result.height,result.padded]).toEqual([768,1024,false]);
  });
});
