let nextId = 0;

export function createId(prefix: 'sticker'): `sticker-${number}`;
export function createId(prefix?: string): string;
export function createId(prefix = 'id'): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}
