import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import type { ImageAsset } from '@/domain/project';
import { normalizeImage } from '@/lib/image/resize-image';
import { usePosterStore } from '@/store/use-poster-store';
import { ImagePicker } from './ImagePicker';

vi.mock('@/lib/image/resize-image', () => ({
  normalizeImage: vi.fn()
}));

describe('ImagePicker', () => {
  beforeEach(() => {
    usePosterStore.getState().clearSession();
    vi.mocked(normalizeImage).mockResolvedValue({
      id: 'upload-test',
      dataUrl: 'data:image/jpeg;base64,test',
      width: 100,
      height: 80,
      source: 'upload'
    } satisfies ImageAsset);
  });

  it('offers labelled album and camera file inputs', () => {
    render(<ImagePicker />);

    expect(screen.getByLabelText('从相册选择照片')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(screen.getByLabelText('拍照使用')).toHaveAttribute('accept', 'image/*');
    expect(screen.getByLabelText('拍照使用')).toHaveAttribute('capture', 'environment');
  });

  it('keeps three generated posters stacked and raises the clicked card', () => {
    render(<ImagePicker />);

    const deepSea = screen.getByRole('button', { name: '查看深海之梦示例海报' });
    const fiberDream = screen.getByRole('button', { name: '查看织物造梦示例海报' });
    const summerStory = screen.getByRole('button', { name: '查看夏日物语示例海报' });
    expect(screen.getAllByRole('img', { name: /示例海报：/ })).toHaveLength(3);
    expect(deepSea).toHaveAttribute('data-position', 'front');
    expect(screen.getByRole('img', { name: '示例海报：深海之梦' })).toHaveAttribute('src', '/home-posters/deep-sea.webp');

    fireEvent.click(fiberDream);
    expect(fiberDream).toHaveAttribute('data-position', 'front');
    expect(fiberDream).toHaveAttribute('aria-current', 'true');
    expect(deepSea).not.toHaveAttribute('data-position', 'front');

    fireEvent.click(summerStory);
    expect(summerStory).toHaveAttribute('data-position', 'front');

    fireEvent.click(summerStory);
    expect(summerStory).toHaveAttribute('data-position', 'front');
    expect(screen.getByRole('dialog', { name: '夏日物语大图预览' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '夏日物语完整海报' })).toHaveAttribute('src', '/home-posters/summer-story-full.webp');

    fireEvent.click(screen.getByRole('button', { name: '关闭大图预览' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(summerStory).toHaveAttribute('data-position', 'front');
  });

  it('switches on a horizontal swipe and preserves vertical scrolling', () => {
    render(<ImagePicker />);
    const carousel = screen.getByRole('region', { name: '示例海报' });

    fireEvent.touchStart(carousel, { touches: [{ clientX: 260, clientY: 100 }] });
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 70, clientY: 108 }] });
    expect(screen.getByRole('button', { name: '查看织物造梦示例海报' })).toHaveAttribute('data-position', 'front');

    fireEvent.touchStart(carousel, { touches: [{ clientX: 180, clientY: 90 }] });
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 170, clientY: 250 }] });
    expect(screen.getByRole('button', { name: '查看织物造梦示例海报' })).toHaveAttribute('data-position', 'front');
  });

  it('stores a normalized image and shows its preview after selection', async () => {
    render(<ImagePicker />);
    const file = new File(['photo'], 'doll.jpg', { type: 'image/jpeg' });

    fireEvent.change(screen.getByLabelText('从相册选择照片'), { target: { files: [file] } });

    expect(await screen.findByRole('img', { name: '已上传的玩偶照片' })).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,test'
    );
    await waitFor(() => expect(usePosterStore.getState().upload?.id).toBe('upload-test'));
  });

  it('accepts an upload after the effect cleanup and remount in Strict Mode', async () => {
    render(
      <StrictMode>
        <ImagePicker />
      </StrictMode>
    );

    fireEvent.change(screen.getByLabelText('从相册选择照片'), {
      target: { files: [new File(['photo'], 'doll.jpg', { type: 'image/jpeg' })] }
    });

    await waitFor(() => expect(usePosterStore.getState().upload?.id).toBe('upload-test'));
  });

  it('keeps the existing upload when normalization fails', async () => {
    const existing: ImageAsset = {
      id: 'existing-upload',
      dataUrl: 'data:image/jpeg;base64,existing',
      width: 80,
      height: 80,
      source: 'upload'
    };
    usePosterStore.getState().setUpload(existing);
    vi.mocked(normalizeImage).mockRejectedValueOnce(new Error('图片无法读取，请换一张图片'));
    render(<ImagePicker />);

    fireEvent.change(screen.getByLabelText('从相册选择照片'), {
      target: { files: [new File(['broken'], 'broken.jpg', { type: 'image/jpeg' })] }
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('图片无法读取，请换一张图片');
    expect(usePosterStore.getState().upload).toBe(existing);
    expect(screen.getByRole('img', { name: '已上传的玩偶照片' })).toHaveAttribute('src', existing.dataUrl);
  });

  it('accepts only the latest result from rapid selections', async () => {
    let resolveFirst!: (asset: ImageAsset) => void;
    let resolveSecond!: (asset: ImageAsset) => void;
    vi.mocked(normalizeImage)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    render(<ImagePicker />);
    const input = screen.getByLabelText('从相册选择照片');

    fireEvent.change(input, { target: { files: [new File(['first'], 'first.jpg', { type: 'image/jpeg' })] } });
    fireEvent.change(input, { target: { files: [new File(['second'], 'second.jpg', { type: 'image/jpeg' })] } });
    resolveSecond({ id: 'second', dataUrl: 'data:image/jpeg;base64,second', width: 2, height: 2, source: 'upload' });
    await waitFor(() => expect(usePosterStore.getState().upload?.id).toBe('second'));
    resolveFirst({ id: 'first', dataUrl: 'data:image/jpeg;base64,first', width: 1, height: 1, source: 'upload' });

    await waitFor(() => expect(usePosterStore.getState().upload?.id).toBe('second'));
  });

  it('ignores an async success after the component unmounts', async () => {
    let resolve!: (asset: ImageAsset) => void;
    vi.mocked(normalizeImage).mockImplementationOnce(() => new Promise((next) => { resolve = next; }));
    const setUpload = vi.spyOn(usePosterStore.getState(), 'setUpload');
    const { unmount } = render(<ImagePicker />);

    fireEvent.change(screen.getByLabelText('从相册选择照片'), {
      target: { files: [new File(['photo'], 'doll.jpg', { type: 'image/jpeg' })] }
    });
    unmount();
    resolve({ id: 'late-success', dataUrl: 'data:image/jpeg;base64,late', width: 1, height: 1, source: 'upload' });
    await Promise.resolve();

    expect(setUpload).not.toHaveBeenCalled();
  });

  it('ignores an async failure after the component unmounts', async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(normalizeImage).mockImplementationOnce(() => new Promise((_resolve, nextReject) => { reject = nextReject; }));
    const setError = vi.spyOn(usePosterStore.getState(), 'setError');
    const { unmount } = render(<ImagePicker />);

    fireEvent.change(screen.getByLabelText('从相册选择照片'), {
      target: { files: [new File(['broken'], 'broken.jpg', { type: 'image/jpeg' })] }
    });
    unmount();
    reject(new Error('late failure'));
    await Promise.resolve();

    expect(setError).not.toHaveBeenCalled();
  });

  it('ignores an old failure when the latest request succeeds', async () => {
    let rejectFirst!: (reason: Error) => void;
    let resolveSecond!: (asset: ImageAsset) => void;
    vi.mocked(normalizeImage)
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    render(<ImagePicker />);
    const input = screen.getByLabelText('从相册选择照片');

    fireEvent.change(input, { target: { files: [new File(['first'], 'first.jpg', { type: 'image/jpeg' })] } });
    fireEvent.change(input, { target: { files: [new File(['second'], 'second.jpg', { type: 'image/jpeg' })] } });
    resolveSecond({ id: 'latest', dataUrl: 'data:image/jpeg;base64,latest', width: 2, height: 2, source: 'upload' });
    await waitFor(() => expect(usePosterStore.getState().upload?.id).toBe('latest'));
    rejectFirst(new Error('old failure'));
    await Promise.resolve();

    expect(usePosterStore.getState().error).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('opens the matching input from each visible action button', () => {
    render(<ImagePicker />);
    const albumInput = screen.getByLabelText('从相册选择照片') as HTMLInputElement;
    const cameraInput = screen.getByLabelText('拍照使用') as HTMLInputElement;
    const albumClick = vi.spyOn(albumInput, 'click');
    const cameraClick = vi.spyOn(cameraInput, 'click');

    fireEvent.click(screen.getByRole('button', { name: '选择照片' }));
    fireEvent.click(screen.getByRole('button', { name: '拍照使用' }));

    expect(albumClick).toHaveBeenCalledOnce();
    expect(cameraClick).toHaveBeenCalledOnce();
  });
});
