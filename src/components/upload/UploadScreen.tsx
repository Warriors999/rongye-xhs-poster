'use client';

import { ImagePicker } from './ImagePicker';
import { usePosterStore } from '@/store/use-poster-store';

export function UploadScreen() {
  const upload = usePosterStore((state) => state.upload);
  const creativeIdea = usePosterStore((state) => state.creativeIdea);
  const error = usePosterStore((state) => state.error);
  const setCreativeIdea = usePosterStore((state) => state.setCreativeIdea);
  const startGeneration = usePosterStore((state) => state.startGeneration);

  return (
    <main className="app-shell">
      <div className="screen-container">
        <section className="upload-card" aria-labelledby="upload-title">
          <p className="brand-name">绒页</p>
          <p className="eyebrow">KNIT · LITTLE THINGS</p>
          <h1 id="upload-title">把玩偶照片，变成小红书海报。</h1>
          <p className="intro">上传一张照片，AI 自动做出 3 张可以直接保存的小红书配图。</p>
          <ImagePicker />
          <label className="idea-field">
            <span>我的创作想法 <em>可选</em></span>
            <textarea
              value={creativeIdea}
              onChange={(event) => setCreativeIdea(event.target.value.slice(0, 500))}
              placeholder="例如：复古玩具店橱窗，暖黄色灯光，带一点童话感。留空也可以。"
              rows={3}
              maxLength={500}
            />
            <small>你可以描述想要的氛围、颜色、场景或主题，AI 会据此设计三种方向。</small>
          </label>
          <p className="ratio-note">默认输出 3:4</p>
          {upload && <button className="generate-button primary-button" type="button" onClick={startGeneration}>{error ? '重新生成 3 张海报' : '生成 3 张海报'}</button>}
          <div className="capabilities" aria-label="制作能力">
            <div><strong>识别</strong><span>看懂玩偶特点</span></div>
            <div><strong>美化</strong><span>增加设计氛围</span></div>
            <div><strong>保存</strong><span>选中即可下载</span></div>
          </div>
          <p className="privacy-note">图片只用于当前制作，不建立作品库</p>
        </section>
      </div>
    </main>
  );
}
