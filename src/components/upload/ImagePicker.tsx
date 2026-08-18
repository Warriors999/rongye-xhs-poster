'use client';

import { useEffect, useRef, type ChangeEvent } from 'react';
import { StatusBanner } from '@/components/common/StatusBanner';
import { normalizeImage } from '@/lib/image/resize-image';
import { usePosterStore } from '@/store/use-poster-store';

export function ImagePicker() {
  const albumInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const requestToken = useRef(0);
  const mounted = useRef(true);
  const upload = usePosterStore((state) => state.upload);
  const error = usePosterStore((state) => state.error);
  const setUpload = usePosterStore((state) => state.setUpload);
  const setError = usePosterStore((state) => state.setError);
  const clearError = usePosterStore((state) => state.clearError);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      requestToken.current += 1;
    };
  }, []);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const token = ++requestToken.current;
    try {
      const asset = await normalizeImage(file);
      if (!mounted.current || token !== requestToken.current) return;
      setUpload(asset);
      clearError();
    } catch (error) {
      if (!mounted.current || token !== requestToken.current) return;
      setError(error instanceof Error ? error.message : '图片无法读取，请换一张图片');
    }
  }

  return (
    <div className="image-picker">
      {upload && <img className="upload-preview" src={upload.dataUrl} alt="已上传的玩偶照片" />}
      <div className="picker-actions">
        <button className="primary-button" type="button" onClick={() => albumInput.current?.click()}>
          选择照片
        </button>
        <button className="secondary-button" type="button" onClick={() => cameraInput.current?.click()}>
          拍照使用
        </button>
      </div>
      <StatusBanner message={error} />
      <label className="visually-hidden">
        从相册选择照片
        <input ref={albumInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="从相册选择照片" onChange={handleChange} />
      </label>
      <label className="visually-hidden">
        拍照使用
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" aria-label="拍照使用" onChange={handleChange} />
      </label>
    </div>
  );
}
