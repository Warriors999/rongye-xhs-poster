'use client';

import { useRef, useState } from 'react';
import type { Stage as KonvaStage } from 'konva/lib/Stage';
import type { LayerId, PosterDraft, TextLayer } from '@/domain/project';
import { cloneDraft, usePosterStore } from '@/store/use-poster-store';
import { BackgroundControls } from './BackgroundControls';
import { PosterStage } from './PosterStage';
import { StickerControls } from './StickerControls';
import { TextControls } from './TextControls';
import { exportPoster } from '@/lib/export/export-poster';
import { StatusBanner } from '@/components/common/StatusBanner';

type EditorTool = 'text' | 'sticker' | 'image' | 'background';

export function EditorScreen() {
  const draft = usePosterStore((state) => state.selectedDraft);
  const updateDraft = usePosterStore((state) => state.updateDraft);
  const goBack = usePosterStore((state) => state.goBack);
  const markExported = usePosterStore((state) => state.markExported);
  const setExportResult = usePosterStore((state) => state.setExportResult);
  const [tool, setTool] = useState<EditorTool>('text');
  const [activeTextLayer, setActiveTextLayer] = useState<TextLayer['id']>('title');
  const [selectedLayer, setSelectedLayer] = useState<LayerId | null>('title');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const initialDraft = useRef<PosterDraft | null>(null);
  const stageRef = useRef<KonvaStage | null>(null);

  if (!draft) {
    return <main className="placeholder-screen"><p>还没有可编辑的海报</p></main>;
  }
  if (!initialDraft.current) initialDraft.current = cloneDraft(draft);
  const sourceImage = initialDraft.current.image;
  const commitDraft = (nextDraft: PosterDraft) => updateDraft(() => nextDraft);
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    const selectionFrame = stageRef.current?.findOne('.selection-frame');
    selectionFrame?.hide();
    stageRef.current?.draw();
    try {
      const result = await exportPoster(stageRef.current, 'png');
      setExportResult(result);
      markExported();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出失败，请重试');
    } finally {
      selectionFrame?.show();
      stageRef.current?.draw();
      setExporting(false);
    }
  };

  const selectLayer = (layerId: LayerId | null) => {
    setSelectedLayer(layerId);
    if (layerId === 'title' || layerId === 'description' || layerId === 'tag') {
      setActiveTextLayer(layerId);
      setTool('text');
    }
  };

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <button className="icon-button" type="button" onClick={goBack} aria-label="返回方案选择">‹</button>
        <div><p className="editor-eyebrow">最后调整</p><h1>编辑海报</h1></div>
        <button className="text-button" type="button" onClick={() => initialDraft.current && updateDraft(() => cloneDraft(initialDraft.current!))}>恢复 AI 初始方案</button>
      </header>

      <section className="editor-canvas-area">
        <div className="canvas-note"><span className="canvas-note-dot" />3:4 小红书配图</div>
        <PosterStage draft={draft} selectedLayer={selectedLayer} onSelectLayer={selectLayer} onChange={commitDraft} stageRef={stageRef} />
        <p className="editor-hint">点击文字或表情后，可以在画布上拖动位置</p>
      </section>

      <section className="editor-workbench" aria-label="海报编辑工具">
        {tool === 'text' && <TextControls draft={draft} activeLayer={activeTextLayer} onChange={commitDraft} onSelectLayer={(layerId) => { setActiveTextLayer(layerId); setSelectedLayer(layerId); }} />}
        {tool === 'sticker' && <StickerControls draft={draft} selectedStickerId={selectedLayer?.startsWith('sticker-') ? selectedLayer : null} onChange={commitDraft} onSelectSticker={setSelectedLayer} />}
        {(tool === 'image' || tool === 'background') && <BackgroundControls draft={draft} sourceImage={sourceImage} onChange={commitDraft} />}
      </section>

      <nav className="editor-toolbar" aria-label="编辑工具">
        <button className={tool === 'text' ? 'editor-tool active' : 'editor-tool'} type="button" onClick={() => setTool('text')}><span>文</span>文字</button>
        <button className={tool === 'sticker' ? 'editor-tool active' : 'editor-tool'} type="button" onClick={() => setTool('sticker')}><span>♡</span>表情</button>
        <button className={tool === 'image' ? 'editor-tool active' : 'editor-tool'} type="button" onClick={() => setTool('image')}><span>图</span>图片</button>
        <button className={tool === 'background' ? 'editor-tool active' : 'editor-tool'} type="button" onClick={() => setTool('background')}><span>底</span>背景</button>
      </nav>
      <div className="editor-export-bar safe-bottom">
        {exportError && <StatusBanner message={exportError} />}
        <button className="primary-button" type="button" onClick={handleExport} disabled={exporting}>{exporting ? '正在导出…' : '导出 3:4 图片'}</button>
      </div>
    </main>
  );
}
