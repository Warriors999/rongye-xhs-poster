import type { GenerationResult, ImageAsset } from '@/domain/project';

export interface PendingDraft {
  upload: ImageAsset;
  referenceImage: ImageAsset | null;
  creativeIdea: string;
  keywords: string;
  forbiddenWords: string;
  promptPlan: GenerationResult;
  originalPrompts: string[];
}

let pending: Promise<unknown> = Promise.resolve();
function operation(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  const run = pending.catch(()=>undefined).then(()=>new Promise((resolve,reject)=>{
    const open = indexedDB.open('rongye-prompt-draft',1);
    open.onupgradeneeded = ()=>open.result.createObjectStore('draft');
    open.onerror = ()=>reject(new Error('草稿保存不可用'));
    open.onsuccess = ()=>{
      const db=open.result;const transaction=db.transaction('draft',mode);const request=action(transaction.objectStore('draft'));
      transaction.oncomplete=()=>{db.close();resolve(request.result)};
      transaction.onerror=transaction.onabort=()=>{db.close();reject(new Error('草稿保存失败'))};
    };
  }));
  pending=run;return run;
}
export const pendingDraft = {
  read: async () => await operation('readonly',store=>store.get('current')) as PendingDraft | undefined,
  save: (draft: PendingDraft) => operation('readwrite',store=>store.put(draft,'current')),
  clear: () => operation('readwrite',store=>store.delete('current'))
};
