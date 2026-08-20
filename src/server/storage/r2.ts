import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface StoredObject {
  data: Uint8Array;
  contentType: string;
}

export interface ObjectStorage {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

function assertStorageKey(key: string): void {
  if (!key || key.length > 500 || key.includes('..') || key.startsWith('/') || key.includes('\\')) {
    throw new Error('存储路径无效');
  }
}

function copyBytes(data: Uint8Array): Uint8Array {
  return new Uint8Array(data);
}

export class InMemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, StoredObject>();

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    assertStorageKey(key);
    this.objects.set(key, { data: copyBytes(data), contentType: contentType || 'application/octet-stream' });
  }

  async get(key: string): Promise<StoredObject | null> {
    assertStorageKey(key);
    const object = this.objects.get(key);
    return object ? { data: copyBytes(object.data), contentType: object.contentType } : null;
  }

  async exists(key: string): Promise<boolean> {
    assertStorageKey(key);
    return this.objects.has(key);
  }

  async delete(key: string): Promise<void> {
    assertStorageKey(key);
    this.objects.delete(key);
  }
}

export interface R2ObjectStorageOptions {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  client?: S3Client;
}

export class R2ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: R2ObjectStorageOptions) {
    this.client = options.client ?? new S3Client({
      region: 'auto',
      endpoint: options.endpoint,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey }
    });
    this.bucket = options.bucket;
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    assertStorageKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: copyBytes(data), ContentType: contentType || 'application/octet-stream' }));
  }

  async get(key: string): Promise<StoredObject | null> {
    assertStorageKey(key);
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!response.Body) return null;
      const data = await response.Body.transformToByteArray();
      return { data: copyBytes(data), contentType: response.ContentType || 'application/octet-stream' };
    } catch (error) {
      const code = error && typeof error === 'object' && '$metadata' in error ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode : undefined;
      if (code === 404 || (error as { name?: string })?.name === 'NoSuchKey' || (error as { name?: string })?.name === 'NotFound') return null;
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    assertStorageKey(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      const code = error && typeof error === 'object' && '$metadata' in error ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode : undefined;
      if (code === 404 || (error as { name?: string })?.name === 'NotFound') return false;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    assertStorageKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export function createObjectStorage(env: Record<string, string | undefined> = process.env): ObjectStorage {
  const endpoint = env.R2_ENDPOINT?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.R2_BUCKET?.trim();
  if (!endpoint && !accessKeyId && !secretAccessKey && !bucket) return new InMemoryObjectStorage();
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) throw new Error('R2 存储配置不完整');
  return new R2ObjectStorage({ endpoint, accessKeyId, secretAccessKey, bucket });
}
