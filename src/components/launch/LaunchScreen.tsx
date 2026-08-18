'use client';

type LaunchScreenProps = {
  onEnter: () => void;
};

export function LaunchScreen({ onEnter }: LaunchScreenProps) {
  return (
    <main className="launch-shell">
      <div className="launch-grain" aria-hidden="true" />
      <div className="launch-corner launch-corner-top" aria-hidden="true" />
      <div className="launch-corner launch-corner-bottom" aria-hidden="true" />

      <section className="launch-content" aria-labelledby="launch-title">
        <div className="launch-label">KNIT · LITTLE POSTERS</div>

        <div className="launch-art-wrap" aria-label="一只被排版成微海报的针织玩偶">
          <div className="launch-paper launch-paper-back" aria-hidden="true" />
          <div className="launch-paper launch-paper-front">
            <div className="poster-topline">NO. 01 / LITTLE THINGS</div>
            <svg className="launch-doll" viewBox="0 0 220 250" role="img" aria-label="粉色针织小熊插画">
              <path d="M38 113C22 77 36 30 76 28c25-1 38 18 34 38-4-20 16-38 41-33 40 8 47 57 30 91l-11 17H51l-13-28Z" fill="#e6a09a" stroke="#493c39" strokeWidth="5" />
              <path d="M61 116c0-42 24-65 51-65s50 23 50 65v44c0 31-21 48-50 48s-51-17-51-48v-44Z" fill="#eab1a5" stroke="#493c39" strokeWidth="5" />
              <path d="M76 104c8-13 17-16 27-12M131 92c11-4 20-1 28 12" fill="none" stroke="#f6d1c8" strokeWidth="6" strokeLinecap="round" />
              <circle cx="94" cy="125" r="5" fill="#493c39" /><circle cx="132" cy="125" r="5" fill="#493c39" />
              <path d="M105 145c6 7 12 7 18 0" fill="none" stroke="#493c39" strokeWidth="4" strokeLinecap="round" />
              <path d="M77 166c13 12 26 17 40 17s27-5 39-17" fill="none" stroke="#d48d89" strokeWidth="4" strokeDasharray="4 7" strokeLinecap="round" />
              <path d="M49 208c16-15 28-19 42-19h42c14 0 27 4 41 19l-11 31H60l-11-31Z" fill="#f5e8d8" stroke="#493c39" strokeWidth="5" />
              <path d="M71 217h76M68 230h83" stroke="#d9bda9" strokeWidth="4" strokeDasharray="3 7" strokeLinecap="round" />
              <path d="M56 205 39 231M165 205l17 26" stroke="#493c39" strokeWidth="5" strokeLinecap="round" />
            </svg>
            <div className="poster-caption">软软的日常<br /><em>made to be shared</em></div>
            <div className="poster-sticker">hand<br />knit</div>
          </div>
        </div>

        <div className="launch-copy">
          <div className="launch-name-mark"><span className="launch-name-dot" aria-hidden="true" />绒页</div>
          <h1 id="launch-title">把每只玩偶，做成一张好看的图。</h1>
          <p>给手作创作者的手机端小红书微海报工具</p>
        </div>

        <button className="launch-enter" type="button" onClick={onEnter}>
          <span>进入绒页</span><span aria-hidden="true">↗</span>
        </button>
      </section>

      <p className="launch-footer">made for little makers · 01</p>
    </main>
  );
}
