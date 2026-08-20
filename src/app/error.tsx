'use client';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="app-shell">
      <section className="upload-card" aria-labelledby="error-title">
        <p className="brand-name">绒页</p>
        <h1 id="error-title">刚才没有打开成功</h1>
        <p className="intro">可以重新加载一次，当前页面不会公开或保存你的作品。</p>
        <button className="primary-button" type="button" onClick={reset}>重新加载</button>
      </section>
    </main>
  );
}
