'use client';

import { useEffect, useState } from 'react';
import { LaunchScreen } from '@/components/launch/LaunchScreen';
import { BrandMark } from '@/components/common/BrandMark';
import { ChooseScreen } from '@/components/choose/ChooseScreen';
import { CopyScreen } from '@/components/copy/CopyScreen';
import { GenerationScreen } from '@/components/generation/GenerationScreen';
import { UploadScreen } from '@/components/upload/UploadScreen';
import { LibraryScreen } from '@/components/library/LibraryScreen';
import { PromptReviewScreen } from '@/components/review/PromptReviewScreen';
import { pendingDraft, type PendingDraft } from '@/lib/projects/pending-draft';
import { usePosterStore } from '@/store/use-poster-store';

export function Wizard() {
  const step = usePosterStore((state) => state.step);
  const completedPromptPlan = usePosterStore((state) => state.completedPromptPlan);
  const [hasEntered, setHasEntered] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [savedDraft,setSavedDraft]=useState<PendingDraft|null>(null);
  useEffect(()=>{let active=true;void pendingDraft.read().then(draft=>{if(active&&draft)setSavedDraft(draft)}).catch(()=>undefined);return()=>{active=false}},[]);
  useEffect(()=>{if(completedPromptPlan>0){setSavedDraft(null);void pendingDraft.clear().catch(()=>undefined)}},[completedPromptPlan]);
  useEffect(()=>{if(step==='upload'){let active=true;void pendingDraft.read().then(draft=>{if(active)setSavedDraft(draft??null)}).catch(()=>undefined);return()=>{active=false}}},[step]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [step, libraryOpen]);
  if (!hasEntered && step === 'upload' && !libraryOpen) return <LaunchScreen onEnter={() => setHasEntered(true)} />;
  return (
    <div className="rongye-app">
      <header className="app-header"><div className="app-header-inner">
        <button className="app-brand" type="button" onClick={() => { setLibraryOpen(false); if (step === 'upload') setHasEntered(false); }} aria-label="绒页首页"><BrandMark /></button>
        <span className="app-header-note">KNIT · LITTLE POSTERS</span>
      </div></header>
      {libraryOpen && <LibraryScreen onClose={() => { setLibraryOpen(false); setHasEntered(true); }} />}
      <div hidden={libraryOpen}>
        {step === 'upload' && <>{savedDraft&&<div className="resume-prompt-draft"><strong>有一份待确认的设计</strong><button type="button" className="text-button" onClick={()=>{usePosterStore.setState({...savedDraft,step:'review'});setSavedDraft(null)}}>继续编辑提示词</button></div>}<UploadScreen onShowLibrary={() => setLibraryOpen(true)} /></>}
        {(step === 'preparing' || step === 'review') && <PromptReviewScreen />}
        {step === 'generating' && <GenerationScreen />}
        {step === 'choose' && <ChooseScreen />}
        {step === 'copy' && <CopyScreen />}
      </div>
      <nav className="app-tabbar" aria-label="主要导航"><div>
        <button className={!libraryOpen ? 'tab-active' : ''} aria-current={!libraryOpen ? 'page' : undefined} type="button" onClick={() => { setLibraryOpen(false); setHasEntered(true); }}><svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true"><path d="m14 4 6 6-10 10H4v-6L14 4Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="m11 7 6 6" stroke="currentColor" strokeWidth="1.6"/></svg><span>创作</span></button>
        <button className={libraryOpen ? 'tab-active' : ''} aria-current={libraryOpen ? 'page' : undefined} type="button" onClick={() => setLibraryOpen(true)}><svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="m6 16 4-5 3 4 2-2 3 4M8 8h.01" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg><span>我的作品</span></button>
      </div></nav>
    </div>
  );
}
