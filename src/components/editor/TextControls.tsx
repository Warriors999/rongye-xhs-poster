'use client';

import type { PosterDraft, TextLayer } from '@/domain/project';
import { updateTextLayer } from '@/domain/editor';

type TextControlsProps = {
  draft: PosterDraft;
  activeLayer: TextLayer['id'];
  onChange: (draft: PosterDraft) => void;
  onSelectLayer: (layerId: TextLayer['id']) => void;
};

const FONT_OPTIONS = [
  ['system-ui, sans-serif', '系统圆润'],
  ['PingFang SC, sans-serif', '苹方'],
  ['Microsoft YaHei, sans-serif', '微软雅黑']
] as const;
const COLOR_OPTIONS = [
  ['#2C2524', '暖棕黑'],
  ['#D87568', '珊瑚红'],
  ['#60856C', '鼠尾草绿'],
  ['#62567A', '深紫']
] as const;
const SIZE_OPTIONS = [16, 20, 24, 30, 36];

export function TextControls({ draft, activeLayer, onChange, onSelectLayer }: TextControlsProps) {
  const layer = draft.layers[activeLayer];
  if (!layer) return <p className="editor-empty-note">这个文字图层已移除</p>;
  const patch = (next: Partial<Pick<TextLayer, 'text' | 'fontFamily' | 'fontSize' | 'fill' | 'align'>>) =>
    onChange(updateTextLayer(draft, activeLayer, next));

  return (
    <section className="editor-panel" aria-label="文字编辑">
      <div className="editor-segmented" aria-label="选择文字图层">
        {(['title', 'description', 'tag'] as const).map((layerId) => (
          <button
            key={layerId}
            className={activeLayer === layerId ? 'segment-button active' : 'segment-button'}
            type="button"
            onClick={() => onSelectLayer(layerId)}
          >
            {layerId === 'title' ? '标题' : layerId === 'description' ? '描述' : '标签'}
          </button>
        ))}
      </div>
      <label className="control-label" htmlFor="poster-text-input">文字内容</label>
      <textarea
        id="poster-text-input"
        className="text-control-input"
        value={layer.text}
        rows={2}
        onChange={(event) => patch({ text: event.target.value })}
      />
      <div className="control-grid">
        <label className="control-label" htmlFor="poster-font-size">字号</label>
        <select id="poster-font-size" value={layer.fontSize} onChange={(event) => patch({ fontSize: Number(event.target.value) })}>
          {SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}px</option>)}
        </select>
        <label className="control-label" htmlFor="poster-font-family">字体</label>
        <select id="poster-font-family" value={layer.fontFamily} onChange={(event) => patch({ fontFamily: event.target.value })}>
          {FONT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className="control-row">
        <span className="control-label">颜色</span>
        <div className="swatch-row">
          {COLOR_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              className={layer.fill === value ? 'color-swatch selected' : 'color-swatch'}
              style={{ backgroundColor: value }}
              type="button"
              aria-label={label}
              aria-pressed={layer.fill === value}
              onClick={() => patch({ fill: value })}
            />
          ))}
        </div>
      </div>
      <div className="control-row">
        <span className="control-label">对齐</span>
        <div className="editor-segmented compact">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button key={align} className={layer.align === align ? 'segment-button active' : 'segment-button'} type="button" onClick={() => patch({ align })}>
              {align === 'left' ? '左' : align === 'center' ? '中' : '右'}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
