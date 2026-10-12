'use client';

type LaunchScreenProps = { onEnter: () => void };

export function LaunchScreen({ onEnter }: LaunchScreenProps) {
  return (
    <main className="studio-home">
      <section className="home-story" aria-labelledby="launch-title">
        <p className="section-kicker">把手作，放进好看的日常</p>
        <h1 id="launch-title">把每只玩偶，做成一张好看的图。</h1>
        <p className="home-intro">一张照片，一点灵感。绒页帮你把真实的针织小伙伴，做成有构图、有文字、有故事的微海报。</p>
        <button className="primary-button home-start" type="button" onClick={onEnter}>进入绒页 <span aria-hidden="true">↗</span></button>
        <p className="home-footnote">为手作创作者而做 · 手机上就能完成</p>
      </section>
      <div className="home-art" aria-label="绒页历史海报示例">
        <figure className="art-sheet art-sheet-back"><img src="/examples/editorial.webp" alt="针织玩偶的留白排版海报示例" /><figcaption>让小小的手作，被看见。</figcaption></figure>
        <figure className="art-sheet art-sheet-front"><img src="/examples/warm.webp" alt="真实针织玩偶的微海报示例" /><figcaption>一只玩偶，很多种可能。</figcaption></figure>
        <span className="art-note">Your little creation,<br />a whole new story.</span>
      </div>
      <section className="home-path" aria-label="制作流程">
        <div><span>01</span><strong>带上你的玩偶</strong><p>从相册选一张清晰照片。</p></div>
        <div><span>02</span><strong>说一点你的想法</strong><p>也可以带一张喜欢的参考图。</p></div>
        <div><span>03</span><strong>选你喜欢的那张</strong><p>直接保存，再决定要不要写文案。</p></div>
      </section>
      <p className="home-example-note">上方为历史成品示例。你的照片会生成属于自己的方案。</p>
    </main>
  );
}
