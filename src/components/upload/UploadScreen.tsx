'use client';

import { useRef, useState, useEffect, type ChangeEvent } from 'react';
import { ImagePicker } from './ImagePicker';
import { normalizeImage } from '@/lib/image/resize-image';
import { usePosterStore } from '@/store/use-poster-store';

const starters = [
  { label: '纸艺与鲜明色彩', text: '让我的玩偶走进鲜明色彩的纸艺世界，构图大胆、有层次。请给出三个不同的创意。' },
  { label: '像一本小杂志', text: '把玩偶作为杂志的主角，字体和构图要有个性。三个方案各有不同的视觉表达。' },
  { label: '一场小小冒险', text: '为我的玩偶想象一场小小冒险，用场景和细节讲故事，保留玩偶本身。' }
];

export function UploadScreen() {
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
        <p className="section-kicker">开始一张新的微海报</p>
        <h1 id="upload-title">把玩偶照片，变成小红书海报。</h1>
        <p>AI 会先理解你的想法和玩偶，再自动设计 3 张微海报。</p>
        <div className="create-mini-gallery" aria-label="历史成品示例">
          <img src="/examples/story.webp" alt="针织玩偶氛围海报示例" />
          <img src="/examples/editorial.webp" alt="针织玩偶排版海报示例" />
          <span>从一张照片，<br />到不止一种表达。</span>
        </div>
      </section>
      <section className="upload-card create-form" aria-labelledby="upload-title">
        <div className="form-section-heading"><span>01</span><div><h2>你的玩偶照片</h2><p>主角始终是它，真实纹理和配件会被保留。</p></div></div>
        <ImagePicker />
        <div className="form-section-heading"><span>02</span><div><h2>把简单想法，交给绒页。</h2><p>一句话就好，构图和设计由 AI 来想。</p></div></div>
        <label className="idea-field">
          <span>我的创作想法 <em>可选</em></span>
          <textarea value={state.creativeIdea} onChange={(event) => state.setCreativeIdea(event.target.value.slice(0, 500))} placeholder="例如：我的小伙伴闯进了一家复古玩具店，想要大胆一点的色彩......" rows={3} maxLength={500} />
        </label>
        <div className="idea-starters" aria-label="灵感起点">{starters.map((item) => <button key={item.label} type="button" onClick={() => state.setCreativeIdea(item.text)}>{item.label}<span aria-hidden="true">＋</span></button>)}</div>
        <div className="reference-section">
          <div className="reference-heading"><div><h3>有喜欢的画面吗？ <span>可选</span></h3><p>参考它的颜色、构图或材质。</p></div><button className="text-button" type="button" onClick={() => referenceInput.current?.click()}>添加参考图片</button></div>
          <input className="visually-hidden" ref={referenceInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="风格参考图片" onChange={pickReference} />
          {state.referenceImage && <div className="reference-preview"><img src={state.referenceImage.dataUrl} alt="仅用于风格借鉴的参考图" /><div><strong>风格参考</strong><p>不会替换你的玩偶。</p><button type="button" className="text-button" onClick={() => { referenceToken.current += 1; setReferencePending(false); state.setReferenceImage(null); }}>移除参考图</button></div></div>}
          {referencePending && <p role="status" className="reference-note">正在读取参考图......</p>}
          {referenceError && <p role="alert" className="save-error">{referenceError}</p>}
          <p className="reference-note">参考图只借鉴风格，主角始终是你的玩偶。</p>
        </div>
        <details className="extra-settings"><summary>补充信息与不想出现的内容</summary><label className="idea-field"><span>关键词或玩偶特点</span><input value={state.keywords} onChange={(e) => state.setKeywords(e.target.value.slice(0,500))} maxLength={500} placeholder="例如：蓝色帽子、手工钩织、小小陪伴" /></label><label className="idea-field"><span>不想出现</span><input value={state.forbiddenWords} onChange={(e) => state.setForbiddenWords(e.target.value.slice(0,300))} maxLength={300} placeholder="例如：爱心、粉色、销售用语" /></label></details>
        <div className="create-submit"><p className="ratio-note">目标比例 3:4</p><button className="generate-button primary-button" type="button" disabled={!state.upload || referencePending} onClick={state.startGeneration}>{state.error ? '重新生成 3 张海报' : '生成 3 张海报'}</button><p className="privacy-note">图片会发送到生成服务。满意后可保存到本机作品，不公开发布。</p></div>
      </section>
    </main>
  );
}
