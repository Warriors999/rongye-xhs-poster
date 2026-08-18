import { fireEvent, render, screen } from '@testing-library/react';
import type { ImageAsset } from '@/domain/project';
import { usePosterStore } from '@/store/use-poster-store';
import { UploadScreen } from './UploadScreen';

const upload: ImageAsset = {
  id: 'upload-1', dataUrl: 'data:image/jpeg;base64,test', width: 100, height: 80, source: 'upload'
};

describe('UploadScreen', () => {
  beforeEach(() => usePosterStore.getState().resetSession());

  it('shows the upload home copy and actions', () => {
    render(<UploadScreen />);

    expect(screen.getByText('绒页')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '把玩偶照片，变成小红书海报。' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选择照片' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '拍照使用' })).toBeInTheDocument();
    expect(screen.getByText('默认输出 3:4')).toBeInTheDocument();
    expect(screen.getByText('识别')).toBeInTheDocument();
    expect(screen.getByText('美化')).toBeInTheDocument();
    expect(screen.getByText('保存')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /我的创作想法/ })).toBeInTheDocument();
    expect(screen.getByText('图片只用于当前制作，不建立作品库')).toBeInTheDocument();
  });

  it('starts generation only after an upload exists', () => {
    usePosterStore.getState().setUpload(upload);
    render(<UploadScreen />);

    fireEvent.click(screen.getByRole('button', { name: '生成 3 张海报' }));

    expect(usePosterStore.getState().step).toBe('generating');
  });

  it('offers a retry without clearing the upload inputs after generation fails', () => {
    usePosterStore.getState().setUpload(upload);
    usePosterStore.getState().setKeywords('兔子');
    usePosterStore.getState().setForbiddenWords('塑料');
    usePosterStore.getState().startGeneration();
    usePosterStore.getState().failGeneration('生成服务暂时不可用');
    render(<UploadScreen />);

    fireEvent.click(screen.getByRole('button', { name: '重新生成 3 张海报' }));

    expect(usePosterStore.getState()).toMatchObject({
      step: 'generating',
      upload,
      keywords: '兔子',
      forbiddenWords: '塑料',
      error: null
    });
  });
});
