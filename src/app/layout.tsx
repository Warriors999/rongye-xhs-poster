import type { Metadata, Viewport } from 'next';
import './globals.css';
import './rongye.css';

export const metadata: Metadata = {
  title: '绒页｜小红书微海报',
  description: '把每只玩偶，做成一张好看的图。',
  manifest: '/manifest.webmanifest'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F8F6F2'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
