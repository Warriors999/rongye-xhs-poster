'use client';

import { useEffect, useState } from 'react';
import { LATEST_AUTO_RESULT_ID, projectLibrary, type SavedProject } from '@/lib/projects/project-library';
import { usePosterStore } from '@/store/use-poster-store';

export function RecentProjects({ onShowLibrary }: { onShowLibrary?: () => void }) {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const restoreProject = usePosterStore((state) => state.restoreProject);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const saved = await projectLibrary.list();
        const latest = saved.find((project) => project.id === LATEST_AUTO_RESULT_ID) ?? saved[0];
        if (active) setProjects(latest ? [latest] : []);
      } catch { if (active) setFailed(true); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  return (
    <section className="recent-projects" aria-labelledby="recent-title">
      <div className="section-heading"><h2 id="recent-title">上次结果</h2>{onShowLibrary && <button className="text-button" type="button" onClick={onShowLibrary}>查看作品 <span aria-hidden="true">›</span></button>}</div>
      {loading ? <p className="recent-empty" role="status">正在读取作品…</p> : failed ? <p className="recent-empty">暂时无法读取本地作品。</p> : projects.length === 0 ? <p className="recent-empty">第一份作品，从上面这张照片开始。<br /><span>生成完成后会自动暂存在这里。</span></p> : <div className="recent-list">{projects.map((project) => (
        <button className="recent-project" key={project.id} type="button" onClick={() => restoreProject(project)} aria-label={`继续${project.title}`}>
          <img src={project.generation.posters[0]?.image.dataUrl || project.upload.dataUrl} alt="" />
          <span><strong>{project.title}</strong><small>{new Date(project.savedAt).toLocaleDateString('zh-CN')} · {project.generation.posters.length} 张海报</small></span>
          <span className="row-chevron" aria-hidden="true">›</span>
        </button>
      ))}</div>}
    </section>
  );
}
