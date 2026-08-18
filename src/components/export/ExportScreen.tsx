'use client';

import { usePosterStore } from '@/store/use-poster-store';
import { clearSession } from '@/lib/privacy/clear-session';

function saveResult(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

export function ExportScreen() {
  const result = usePosterStore((state) => state.exportResult);
  const draft = usePosterStore((state) => state.selectedDraft);
  const continueEditing = usePosterStore((state) => state.continueEditing);
  const dataUrl = result?.dataUrl || draft?.image.dataUrl;
  const filename = result?.filename || 'knitting-poster.png';

  const startAgain = () => {
    clearSession();
  };

  return (
    <main className="export-shell">
      <section className="export-card" aria-labelledby="export-title">
        <p className="eyebrow">已经做好了</p>
        <h1 id="export-title">这张海报，可以发啦。</h1>
        {dataUrl ? <img className="export-preview" src={dataUrl} alt="已导出的针织玩偶小红书海报" /> : <div className="export-preview export-empty">请长按保存当前预览</div>}
        <p className="export-success">图片已按 3:4 高清尺寸准备好，仅保存在当前制作流程中。</p>
        <div className="export-actions">
          {dataUrl && <button className="primary-button" type="button" onClick={() => saveResult(dataUrl, filename)}>保存到手机</button>}
          <button className="secondary-button" type="button" onClick={continueEditing}>继续编辑</button>
          <button className="text-button export-restart" type="button" onClick={startAgain}>重新制作一张</button>
        </div>
        <p className="privacy-note">如果浏览器不支持下载，也可以长按上方图片保存。</p>
      </section>
    </main>
  );
}
