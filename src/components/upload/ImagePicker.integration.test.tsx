import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { usePosterStore } from '@/store/use-poster-store';
import { ImagePicker } from './ImagePicker';

describe('ImagePicker integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    usePosterStore.getState().resetSession();
  });

  it('normalizes a selected image through the real normalizeImage implementation', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 80, close: vi.fn() })));
    render(<ImagePicker />);
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => tagName === 'canvas' ? ({
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,real')
    } as unknown as HTMLCanvasElement) : createElement(tagName, options));

    const user = userEvent.setup();
    const upload = waitFor(() => expect(usePosterStore.getState().upload?.dataUrl).toBe('data:image/jpeg;base64,real'));
    await user.upload(screen.getByLabelText('从相册选择照片'), new File(['photo'], 'doll.jpg', { type: 'image/jpeg' }));
    await upload;
    expect(screen.getByRole('img', { name: '已上传的玩偶照片' })).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,real'
    );
  });
});
