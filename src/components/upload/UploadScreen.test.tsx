import { fireEvent, render, screen, act } from '@testing-library/react';
import type { ImageAsset } from '@/domain/project';
import { usePosterStore } from '@/store/use-poster-store';
import { UploadScreen } from './UploadScreen';
import { normalizeImage } from '@/lib/image/resize-image';
vi.mock('@/lib/image/resize-image', () => ({ normalizeImage: vi.fn() }));

const upload: ImageAsset = {
  id: 'upload-1', dataUrl: 'data:image/jpeg;base64,test', width: 100, height: 80, source: 'upload'
};

describe('UploadScreen', () => {
  beforeEach(() => usePosterStore.getState().clearSession());

  it('shows the upload home copy and actions', async () => {
    render(<UploadScreen />);
 await screen.findByText('暂时无法读取本地作品。');

    expect(screen.getByText('把简单想法，交给绒页。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '把玩偶照片，变成小红书海报。' })).toBeInTheDocument();
    expect(screen.getByText('从一张照片开始，做出 3 张微海报。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选择照片' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '拍照使用' })).toBeInTheDocument();
    expect(screen.getByText('目标比例 3:4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加参考图片' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '自然光与手作质感' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /我的创作想法/ })).toBeInTheDocument();
    expect(screen.getByText('参考图只借鉴风格，主角始终是你的玩偶。')).toBeInTheDocument();
  });

  it('starts generation only after an upload exists', async () => {
    usePosterStore.getState().setUpload(upload);
    render(<UploadScreen />);
 await screen.findByText('暂时无法读取本地作品。');

    fireEvent.click(screen.getByRole('button', { name: '设计 3 套提示词' }));

    expect(usePosterStore.getState().step).toBe('preparing');
  });

  it('offers a retry without clearing the upload inputs after generation fails', async () => {
    usePosterStore.getState().setUpload(upload);
    usePosterStore.getState().setKeywords('兔子');
    usePosterStore.getState().setForbiddenWords('塑料');
    usePosterStore.getState().startGeneration();
    usePosterStore.getState().failGeneration('生成服务暂时不可用');
    render(<UploadScreen />);
 await screen.findByText('暂时无法读取本地作品。');

    fireEvent.click(screen.getByRole('button', { name: '设计 3 套提示词' }));

    expect(usePosterStore.getState()).toMatchObject({
      step: 'preparing',
      upload,
      keywords: '兔子',
      forbiddenWords: '塑料',
      error: null
    });
  });
});

it('offers creative starters without making the user choose a fixed template', async () => {
 render(<UploadScreen />);
 await screen.findByText('暂时无法读取本地作品。');
 fireEvent.click(screen.getByRole('button', { name: '自然光与手作质感' }));
 expect(usePosterStore.getState().creativeIdea).toContain('自然光');
 expect(screen.getByLabelText('风格参考图片')).toBeInTheDocument();
});

it('does not overwrite a restored reference after leaving during decode', async () => {
 let resolve!: (image: ImageAsset) => void;
 vi.mocked(normalizeImage).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
 const view = render(<UploadScreen />);
 await screen.findByText('暂时无法读取本地作品。');
 fireEvent.change(screen.getByLabelText('风格参考图片'), { target: { files: [new File(['x'], 'ref.png', {type:'image/png'})] } });
 expect(screen.getByRole('button',{name:'设计 3 套提示词'})).toBeDisabled();
 view.unmount();
 const restored = {...upload, id:'restored'}; usePosterStore.getState().setReferenceImage(restored);
 await act(async () => resolve({...upload,id:'late'}));
 expect(usePosterStore.getState().referenceImage?.id).toBe('restored');
});
