'use client';

import { useRef, useState, useEffect, type ChangeEvent } from 'react';
import { ImagePicker } from './ImagePicker';
import { RecentProjects } from '@/components/library/RecentProjects';
import { normalizeImage } from '@/lib/image/resize-image';
import { usePosterStore } from '@/store/use-poster-store';

const starters = [
  { label: '自然光与手作质感', art:'hero', note:'自然光与手作质感', text: '保留玩偶的真实质感，用自然光与手作材质设计三个不同的画面。不要让三个方案只换背景。' },
  { label: '像一本小杂志', art:'editorial', note:'留白与个性排版', text: '把玩偶作为杂志的主角，字体和构图要有个性。三个方案各有不同的视觉表达。' },
  { label: '一场小小冒险', art:'story', note:'一场夜间小冒险', text: '为我的玩偶想象一场小小冒险，用场景和细节讲故事，保留玩偶本身。' }
];

export function UploadScreen({ onShowLibrary }: { onShowLibrary?: () => void } = {}) {
  const state = usePosterStore();
  const referenceInput = useRef<HTMLInputElement>(null);
  const referenceToken = useRef(0);
  const mounted = useRef(true);
  const [referencePending, setReferencePending] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; referenceToken.current += 1; }; }, []);
  const [referenceError, setReferenceError] = useState('');
  async function pickReference(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    const token = ++referenceToken.current;
    setReferencePending(true);
    try {
      const image = await normalizeImage(file, { maxEdge: 1000, quality: .85 });
      if (!mounted.current || token !== referenceToken.current) return;
      state.setReferenceImage(image); setReferenceError('');
    } catch (error) { if (mounted.current && token === referenceToken.current) setReferenceError(error instanceof Error ? error.message : '参考图片无法读取'); }
    finally { if (mounted.current && token === referenceToken.current) setReferencePending(false); }
  }
  return (
    <main className="app-shell create-shell">
      <section className="create-intro">
        <h1 id="upload-title" aria-label="把玩偶照片，变成小红书海报。">开始创作<span className="title-period">。</span></h1>
        <p className="creation-description">从一张照片开始，做出 3 张微海报。</p>
      </section>
      <section className="upload-card create-form" aria-labelledby="upload-title">
        <div className="input-photo-block"><div className="photo-card-topline"><span>你的玩偶照片</span><span className="photo-original-tag"><span aria-hidden="true">✓</span> 保留真实玩偶</span></div><ImagePicker /></div>
        <div className="idea-block"><div className="section-heading"><h2>把简单想法，交给绒页。</h2><span className="optional-label">可选</span></div>
        <label className="idea-field">
          <span className="visually-hidden">我的创作想法</span>
          <textarea value={state.creativeIdea} onChange={(event) => state.setCreativeIdea(event.target.value.slice(0, 500))} placeholder="例如：让我的小伙伴走进复古玩具店，色彩大胆一点，像一张小杂志封面......" rows={3} maxLength={500} />
        </label>
        <p className="idea-helper">构图与排版交给 AI，你只需要说一点想法。</p></div>
        <div className="reference-section">
          <div className="reference-heading"><span className="ref-symbol" aria-hidden="true"><svg viewBox="0 0 32 32"><rect x="3" y="4" width="21" height="22" rx="5" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M27 10v14a5 5 0 0 1-5 5H10M6 21l6-8 4 5 4-4M10 9h.01" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></span><div><h3>风格参考 <span>可选</span></h3><p>借鉴颜色、构图或材质。</p></div><button className="text-button" aria-label="添加参考图片" type="button" onClick={() => referenceInput.current?.click()}>添加 <span aria-hidden="true">＋</span></button></div>
          <input className="visually-hidden" ref={referenceInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="风格参考图片" onChange={pickReference} />
          {state.referenceImage && <div className="reference-preview"><img src={state.referenceImage.dataUrl} alt="仅用于风格借鉴的参考图" /><div><strong>风格参考</strong><p>不会替换你的玩偶。</p><button type="button" className="text-button" onClick={() => { referenceToken.current += 1; setReferencePending(false); state.setReferenceImage(null); }}>移除参考图</button></div></div>}
          {referencePending && <p role="status" className="reference-note">正在读取参考图......</p>}
          {referenceError && <p role="alert" className="save-error">{referenceError}</p>}
          <p className="reference-note">参考图只借鉴风格，主角始终是你的玩偶。</p>
        </div>
        <details className="extra-settings"><summary>补充信息与不想出现的内容</summary><label className="idea-field"><span>关键词或玩偶特点</span><input value={state.keywords} onChange={(e) => state.setKeywords(e.target.value.slice(0,500))} maxLength={500} placeholder="例如：蓝色帽子、手工钩织、小小陪伴" /></label><label className="idea-field"><span>不想出现</span><input value={state.forbiddenWords} onChange={(e) => state.setForbiddenWords(e.target.value.slice(0,300))} maxLength={300} placeholder="例如：爱心、粉色、销售用语" /></label></details>
        <section className="inspiration-section"><div className="section-heading"><h2>找一点灵感</h2><span className="optional-label">轻点填入想法</span></div><div className="idea-starters" aria-label="灵感起点">{starters.map((item) => <button key={item.label} aria-label={item.label} type="button" onClick={() => state.setCreativeIdea(item.text)}><img src={`/visuals/${item.art}.webp`} alt="" /><span className="inspiration-copy"><strong>{item.label}</strong><small>{item.note}</small></span><span className="inspiration-arrow" aria-hidden="true">↗</span></button>)}</div></section>
        <RecentProjects onShowLibrary={onShowLibrary} />
        <p className="privacy-note">图片会发送到生成服务。满意后可保存到本机作品，不公开发布。</p>
        <div className="create-submit" data-ready={Boolean(state.upload)}><div className="create-action-note"><span>{state.upload ? '先设计，再确认生图' : '先选择一张玩偶照片'}</span><span className="ratio-note">目标比例 3:4</span></div><button className="generate-button primary-button" type="button" disabled={!state.upload || referencePending} onClick={state.startDesign}>设计 3 套提示词<svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></button></div>
      </section>
    </main>
  );
}
