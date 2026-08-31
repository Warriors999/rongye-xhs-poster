'use client';

import { useState } from 'react';
import { LaunchScreen } from '@/components/launch/LaunchScreen';
import { ProgressDots } from '@/components/common/ProgressDots';
import { ChooseScreen } from '@/components/choose/ChooseScreen';
import { CopyScreen } from '@/components/copy/CopyScreen';
import { GenerationScreen } from '@/components/generation/GenerationScreen';
import { UploadScreen } from '@/components/upload/UploadScreen';
import { usePosterStore } from '@/store/use-poster-store';

export function Wizard() {
  const step = usePosterStore((state) => state.step);
  const [hasEntered, setHasEntered] = useState(false);

  if (!hasEntered && step === 'upload') {
    return <LaunchScreen onEnter={() => setHasEntered(true)} />;
  }

  return (
    <>
      <ProgressDots current={step} />
      {step === 'upload' && <UploadScreen />}
      {step === 'generating' && <GenerationScreen />}
      {step === 'choose' && <ChooseScreen />}
      {step === 'copy' && <CopyScreen />}
    </>
  );
}
