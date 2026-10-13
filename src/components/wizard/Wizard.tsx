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
import { projectLibrary, type SavedProject } from '@/lib/projects/project-library';
import { usePosterStore } from '@/store/use-poster-store';

export function Wizard() {
  const step = usePosterStore((state) => state.step);
  const generation = usePosterStore((state) => state.generation);
  const generationError = usePosterStore((state) => state.error);
  const goBack = usePosterStore((state) => state.goBack);
  const resumeResults = usePosterStore((state) => state.resumeResults);
  const completedPromptPlan = usePosterStore((state) => state.completedPromptPlan);
  const restoreProject = usePosterStore((state) => state.restoreProject);
  const [hasEntered, setHasEntered] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [savedDraft,setSavedDraft]=useState<PendingDraft|null>(null);
  const [lastSaved,setLastSaved]=useState<SavedProject|null>(null);
  useEffect(()=>{let active=true;void pendingDraft.read().then(draft=>{if(active&&draft)setSavedDraft(draft)}).catch(()=>undefined);return()=>{active=false}},[]);
  useEffect(()=>{if(completedPromptPlan>0){setSavedDraft(null);void pendingDraft.clear().catch(()=>undefined)}},[completedPromptPlan]);
  useEffect(()=>{if(step==='upload'){let active=true;void pendingDraft.read().then(draft=>{if(active)setSavedDraft(draft??null)}).catch(()=>undefined);return()=>{active=false}}},[step]);
  useEffect(()=>{
    if(step!=='upload'||libraryOpen)return;
    let active=true;
    void projectLibrary.list().then(projects=>{if(active)setLastSaved(projects[0]??null)}).catch(()=>undefined);
    return()=>{active=false};
  },[step,libraryOpen]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [step, libraryOpen]);
  const handleBack = () => {
    if (libraryOpen) { setLibraryOpen(false); return; }
    if (step === 'upload') { setHasEntered(false); return; }
    if (step === 'generating' && !generationError && !window.confirm('图片任务已经提交。返回后将停止等待，服务端可能继续处理。确定返回吗？')) return;
    goBack();
  };
  if (!hasEntered && step === 'upload' && !libraryOpen) return <LaunchScreen onEnter={() => setHasEntered(true)} />;
  return (
    <div className="rongye-app">
      <header className="app-header"><div className="app-header-inner">
        <button className="app-back" type="button" onClick={handleBack} aria-label="返回上一级"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg><span>返回</span></button>
        <button className="app-brand" type="button" onClick={() => { setLibraryOpen(false); if (step === 'upload') setHasEntered(false); }} aria-label="绒页首页"><BrandMark /></button>
        <span className="app-header-note">KNIT · LITTLE POSTERS</span>
      </div></header>
      {libraryOpen && <LibraryScreen onClose={() => { setLibraryOpen(false); setHasEntered(true); }} />}
      <div hidden={libraryOpen}>
        {step === 'upload' && <>{generation?<div className="resume-prompt-draft"><strong>本次结果仍在</strong><button type="button" className="text-button" onClick={resumeResults}>继续查看本次结果</button></div>:lastSaved&&<div className="resume-prompt-draft"><strong>上次结果已暂存在此浏览器</strong><button type="button" className="text-button" onClick={()=>{restoreProject(lastSaved);setHasEntered(true)}}>继续上次生成结果</button></div>}{savedDraft&&<div className="resume-prompt-draft"><strong>有一份待确认的设计</strong><button type="button" className="text-button" onClick={()=>{usePosterStore.setState({...savedDraft,step:'review'});setSavedDraft(null)}}>继续编辑提示词</button></div>}<UploadScreen onShowLibrary={() => setLibraryOpen(true)} /></>}
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
