import { fireEvent, render, screen } from '@testing-library/react';
import Home from '@/app/page';

describe('mobile poster home', () => {
  beforeEach(() => vi.stubGlobal('scrollTo', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());
  it('shows the launch screen and enters the upload home', async () => {
    render(<Home />);

    expect(screen.getByRole('heading', { name: '把每只玩偶，做成一张好看的图。' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /进入绒页/ }));
    await screen.findByText('暂时无法读取本地作品。');
    expect(screen.getByRole('heading', { name: '把玩偶照片，变成小红书海报。' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选择照片' })).toBeInTheDocument();
  });
});
