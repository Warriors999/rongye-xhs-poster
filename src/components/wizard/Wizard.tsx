'use client';

import { useState } from 'react';
import { LaunchScreen } from '@/components/launch/LaunchScreen';
import { ChooseScreen } from '@/components/choose/ChooseScreen';
import { CopyScreen } from '@/components/copy/CopyScreen';
import { GenerationScreen } from '@/components/generation/GenerationScreen';
import { UploadScreen } from '@/components/upload/UploadScreen';
import { LibraryScreen } from '@/components/library/LibraryScreen';
import { usePosterStore } from '@/store/use-poster-store';

export function Wizard() {
  const step = usePosterStore((state) => state.step);
  const [hasEntered, setHasEntered] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const isHome = !hasEntered && step === 'upload' && !libraryOpen;
  return (
    <div className="studio-app">
      <header className="studio-header"><div className="studio-header-inner">
        <button className="studio-brand" type="button" onClick={() => { setLibraryOpen(false); if (step === 'upload') setHasEntered(false); }} aria-label="绒页首页"><span className="brand-symbol" aria-hidden="true">✳</span><span>绒页<small>RONGYE</small></span></button>
        <nav aria-label="主要导航"><button className={!isHome && !libraryOpen ? 'nav-active' : ''} type="button" onClick={() => { setLibraryOpen(false); setHasEntered(true); }}>创作</button><button className={libraryOpen ? 'nav-active' : ''} type="button" disabled={step === 'generating'} onClick={() => setLibraryOpen(true)}>我的作品</button></nav>
      </div></header>
      {libraryOpen ? <LibraryScreen onClose={() => { setLibraryOpen(false); setHasEntered(true); }} /> : isHome ? <LaunchScreen onEnter={() => setHasEntered(true)} /> : <>
        {step === 'upload' && <UploadScreen />}
        {step === 'generating' && <GenerationScreen />}
        {step === 'choose' && <ChooseScreen />}
        {step === 'copy' && <CopyScreen />}
      </>}
      <footer className="studio-footer"><span>绒页 · 为每一份小小的手作</span><span>MADE WITH CARE</span></footer>
    </div>
  );
}
