'use client';

import { useEffect, useState } from 'react';
import { generationResultSchema } from '@/server/ai/contracts';
import { usePosterStore } from '@/store/use-poster-store';
import { pendingDraft } from '@/lib/projects/pending-draft';
import { PROMPT_PROTECTION, reviewedImagePrompt } from '@/lib/prompt-review';

export function PromptReviewScreen() {
  const state=usePosterStore();
  const [active,setActive]=useState(0);
  const [saved,setSaved]=useState('');
  const [submitting,setSubmitting]=useState(false);
  useEffect(()=>{
    if(state.step!=='preparing'||!state.upload)return;
    const controller=new AbortController();
    const form=new FormData();
    form.set('imageDataUrl',state.upload.dataUrl);form.set('width',String(state.upload.width));form.set('height',String(state.upload.height));
    form.set('creativeIdea',state.creativeIdea);form.set('keywords',state.keywords);form.set('forbiddenWords',state.forbiddenWords);
    if(state.referenceImage){form.set('referenceImageDataUrl',state.referenceImage.dataUrl);form.set('referenceWidth',String(state.referenceImage.width));form.set('referenceHeight',String(state.referenceImage.height));}
    void fetch('/api/design',{method:'POST',body:form,signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error('设计服务暂时不可用，请重试');
      const result=generationResultSchema.parse(await response.json());
      if(!controller.signal.aborted)state.setPromptPlan(result);
    }).catch(()=>{if(!controller.signal.aborted)state.failGeneration('设计服务暂时不可用，请重试');});
    return ()=>controller.abort();
  },[state.step]); // Capture the input at the start of this design request.

  useEffect(()=>{
    if(state.step!=='review'||!state.upload||!state.promptPlan)return;
    let active=true;
    const timer=setTimeout(()=>{void pendingDraft.save({upload:state.upload!,referenceImage:state.referenceImage,creativeIdea:state.creativeIdea,keywords:state.keywords,forbiddenWords:state.forbiddenWords,promptPlan:state.promptPlan!,originalPrompts:state.originalPrompts}).then(()=>{if(active)setSaved('草稿已保存在此浏览器');}).catch(()=>{if(active)setSaved('草稿未保存，请保持页面打开');});},300);
    return ()=>{active=false;clearTimeout(timer)};
  },[state.step,state.promptPlan]);

  const poster=state.promptPlan?.posters[active];
  const submit = async () => {
    if (!state.upload || !state.promptPlan || submitting) return;
    setSubmitting(true);
    try {
      await pendingDraft.save({upload:state.upload,referenceImage:state.referenceImage,creativeIdea:state.creativeIdea,keywords:state.keywords,forbiddenWords:state.forbiddenWords,promptPlan:state.promptPlan,originalPrompts:state.originalPrompts});
    } catch { setSaved('此浏览器暂时无法保存草稿'); }
    state.submitPrompts();
  };
  return <main className="app-shell review-shell"><section className="review-card">
    <p className="kicker">设计在前，生成由你决定</p><div className="choose-heading"><h1>{state.step==='preparing'?'正在设计提示词':'先看看设计提示词'}</h1>{state.upload&&<img className="choose-upload-thumb" src={state.upload.dataUrl} alt="本次玩偶原图"/>}</div>
    <p className="choose-intro">{state.step==='preparing'?'AI 正在理解原图和想法，结合绒页规范设计方案。':'可以直接保留，也可以修改场景、配色、构图或文字要求。确认后才开始生图。'}</p>
    {state.step==='preparing'?<div className="review-wait" role="status"><span className="review-spinner"/>正在准备三套设计，不会调用图片模型…</div>:poster&&<>
      <div className="review-tabs" role="tablist" aria-label="设计方案">{state.promptPlan!.posters.map((p,i)=><button type="button" role="tab" key={p.style} aria-selected={i===active} onClick={()=>setActive(i)}>方案 {String.fromCharCode(65+i)}</button>)}</div>
      <h2 className="review-concept">{poster.design?.label||poster.copy.title}</h2><p className="review-concept-note">{poster.design?.concept}</p>
      <label className="idea-field"><span>方案 {String.fromCharCode(65+active)} 的提示词</span><textarea rows={13} maxLength={8000} value={poster.finalPrompt||''} onChange={e=>state.editPrompt(active,e.target.value)}/></label>
      <div className="review-edit-bar"><span>{(poster.finalPrompt||'').length}/8000</span><button className="text-button" type="button" onClick={()=>state.editPrompt(active,state.originalPrompts[active]||'')}>恢复模型原稿</button></div>
      <details className="prompt-details"><summary>固定主体保护要求</summary><p>{PROMPT_PROTECTION}</p></details>
      <details className="prompt-details"><summary>查看将提交的完整提示词</summary><p>{reviewedImagePrompt(poster.finalPrompt||'')}</p></details>
      <p className="library-notice" role="status">{saved}</p>{state.error&&<p className="save-error" role="alert">{state.error}</p>}
      <button className="primary-button" type="button" disabled={submitting||!state.promptPlan!.posters.every(p=>p.finalPrompt?.trim())} onClick={()=>void submit()}>{submitting?'正在提交…':`按当前提示词生成 ${state.promptPlan!.posters.length} 张`}</button>
    </>}
    <button className="text-button" type="button" onClick={state.goBack}>返回修改照片与想法</button>
  </section></main>;
}
