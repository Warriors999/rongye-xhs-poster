'use client';

import { useEffect, useState } from 'react';
import { projectLibrary, type SavedProject } from '@/lib/projects/project-library';
import { usePosterStore } from '@/store/use-poster-store';

export function LibraryScreen({ onClose, onOpen }: { onClose: () => void; onOpen?: (project: SavedProject) => void }) {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const restoreProject = usePosterStore((state) => state.restoreProject);

  useEffect(() => {
    let active = true;
    void projectLibrary.list().then((saved) => { if (active) setProjects(saved); }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : '作品读取失败，请重试');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const removeProject = async (project: SavedProject) => {
    if (deleting) return;
    setDeleting(project.id);
    setError(null);
    try {
      await projectLibrary.remove(project.id);
      setProjects((current) => current.filter((saved) => saved.id !== project.id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '作品删除失败，请重试');
    } finally { setDeleting(null); }
  };

  return (
    <main className="app-shell library-shell">
      <section className="choose-card" aria-labelledby="library-title">
        <div className="choose-heading"><div><p className="kicker">留住喜欢的创作</p><h1 id="library-title">我的作品</h1></div><button className="text-button" type="button" onClick={onClose}>返回创作</button></div>
        <p className="library-notice">作品仅保存在此浏览器，最多保留 12 个。打开后可下载、调整或查看提示词。</p>
        {error && <p className="save-error" role="alert">{error}</p>}
        {loading ? <p className="library-empty" role="status">正在打开作品库…</p> : projects.length === 0 ? <div className="library-empty"><img className="library-empty-image" src="/visuals/editorial.webp" alt="新生成的针织玩偶创作灵感" /><h2>还没有保存的作品</h2><p>生成海报后，点击「保存到作品库」，下次就能在这里找到。</p><button className="primary-button" type="button" onClick={onClose}>去创作一张</button></div> : <div className="library-grid">
          {projects.map((project) => <article className="library-card" key={project.id}>
            <button className="poster-select-button" type="button" aria-label={`打开${project.title}`} onClick={() => { restoreProject(project); onOpen?.(project); onClose(); }}>
              <img className="library-thumb" src={project.generation.posters[0]?.image.dataUrl || project.upload.dataUrl} alt={project.title} />
            </button>
            <div className="poster-option-copy"><strong>{project.title}</strong><p>{new Date(project.savedAt).toLocaleDateString('zh-CN')} · {project.generation.posters.length} 张海报</p></div>
            <div className="poster-option-actions"><button className="secondary-button" type="button" onClick={() => { restoreProject(project); onOpen?.(project); onClose(); }}>继续创作</button><button className="text-button" type="button" aria-label={`删除${project.title}`} disabled={Boolean(deleting)} onClick={() => void removeProject(project)}>{deleting === project.id ? '正在删除…' : '删除'}</button></div>
          </article>)}
        </div>}
      </section>
    </main>
  );
}
