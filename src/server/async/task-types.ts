import type { DesignBrief, GenerationResult, ImageAsset, PosterDraft, PosterStyle, ResearchSummary } from '@/domain/project';

export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type TaskPhase = 'queued' | 'recognizing' | 'understanding' | 'researching' | 'designing' | 'generating' | 'checking' | 'completed' | 'failed';

export interface SafeGenerationConfig {
  mode: 'mock' | 'configured';
}

export interface GenerationJob {
  taskId: string;
  originalKey: string;
  keywords: string;
  forbiddenWords: string;
  creativeIdea: string;
  referenceKey?: string;
  referenceWidth?: number;
  referenceHeight?: number;
  targetStyle?: PosterStyle;
  revisionPrompt?: string;
  selectedPosterDesign?: DesignBrief;
  selectedPosterCopy?: PosterDraft['copy'];
  approvedPlan?: GenerationResult;
  config: SafeGenerationConfig;
}

export interface StoredImageAssetMetadata {
  id?: string;
  assetKey: string;
  contentType: string;
  width: number;
  height: number;
  source?: ImageAsset['source'];
  mode?: ImageAsset['mode'];
}

export type TaskPosterMetadata = Omit<PosterDraft, 'image'> & { image: StoredImageAssetMetadata };

export interface TaskResult {
  analysis: GenerationResult['analysis'];
  research: ResearchSummary;
  posters: TaskPosterMetadata[];
  warnings?: string[];
}

export interface CreateTaskInput {
  taskId?: string;
  originalKey?: string;
  originalWidth?: number;
  originalHeight?: number;
  keywords: string;
  forbiddenWords: string;
  creativeIdea: string;
}

export interface TaskRecord extends CreateTaskInput {
  taskId: string;
  originalKey: string;
  status: TaskStatus;
  phase: TaskPhase;
  progress: number;
  warnings: string[];
  error?: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
  result?: TaskResult;
}

export interface TaskUpdate {
  status?: TaskStatus;
  phase?: TaskPhase;
  progress?: number;
  warnings?: string[];
  error?: string;
  result?: TaskResult;
}

export interface TaskClaim {
  claimed: boolean;
  task: TaskRecord | null;
}

export interface TaskStore {
  create(input: CreateTaskInput): Promise<TaskRecord>;
  get(taskId: string): Promise<TaskRecord | null>;
  claim(taskId: string): Promise<TaskClaim>;
  requeueStale(taskId: string): Promise<TaskRecord | null>;
  update(taskId: string, patch: TaskUpdate): Promise<TaskRecord | null>;
  deleteExpired(): Promise<number>;
}

export interface QueueMessage {
  id: string;
  receipt: string;
  job: GenerationJob;
  recovered?: boolean;
}

export interface GenerationQueue {
  enqueue(job: GenerationJob): Promise<void>;
  dequeue(options?: { waitMs?: number }): Promise<QueueMessage | null>;
  ack(message: QueueMessage): Promise<void>;
  reclaimExpired?(): Promise<number>;
}

export function isTaskId(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,100}$/.test(value);
}

export function assetKeyFor(taskId: string, style: PosterStyle): string {
  return `tasks/${taskId}/assets/${style}`;
}

export function referenceKeyFor(taskId: string): string {
  return `tasks/${taskId}/reference`;
}

export function originalKeyFor(taskId: string): string {
  return `tasks/${taskId}/original`;
}

export function cloneTaskValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function safeTaskError(_error: unknown): string {
  return '生成服务暂时不可用，请重试';
}

export function normalizeProgress(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
