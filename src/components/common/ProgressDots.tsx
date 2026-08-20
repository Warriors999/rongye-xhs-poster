import type { WizardStep } from '@/domain/project';

const steps: WizardStep[] = ['upload', 'generating', 'choose'];

export function ProgressDots({ current }: { current: WizardStep }) {
  const index = steps.indexOf(current);
  return (
    <div className="progress-dots" aria-label="制作进度">
      {steps.map((step, stepIndex) => (
        <span key={step} className={stepIndex <= index ? 'progress-dot active' : 'progress-dot'} />
      ))}
    </div>
  );
}
