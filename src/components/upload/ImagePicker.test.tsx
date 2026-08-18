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
    usePosterStore.getState().resetSession();
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
