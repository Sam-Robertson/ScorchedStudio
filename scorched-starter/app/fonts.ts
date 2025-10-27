// app/fonts.ts
import localFont from 'next/font/local';

export const vulfSans = localFont({
  src: [
    { path: '../public/fonts/VulfSans-Light.otf', weight: '300', style: 'normal' },
    { path: '../public/fonts/VulfSans-LightItalic.otf', weight: '300', style: 'italic' },
    { path: '../public/fonts/VulfSans-Regular.otf', weight: '400', style: 'normal' },
    { path: '../public/fonts/VulfSans-Italic.otf', weight: '400', style: 'italic' },
    { path: '../public/fonts/VulfSans-Medium.otf', weight: '500', style: 'normal' },
    { path: '../public/fonts/VulfSans-MediumItalic.otf', weight: '500', style: 'italic' },
    { path: '../public/fonts/VulfSans-Bold.otf', weight: '700', style: 'normal' },
    { path: '../public/fonts/VulfSans-BoldItalic.otf', weight: '700', style: 'italic' },
    { path: '../public/fonts/VulfSans-Black.otf', weight: '900', style: 'normal' },
    { path: '../public/fonts/VulfSans-BlackItalic.otf', weight: '900', style: 'italic' }
  ],
  variable: '--font-sans',
  display: 'swap',
  preload: true
});

export const vulfMono = localFont({
  src: [
    { path: '../public/fonts/VulfMono-Light.otf', weight: '300', style: 'normal' },
    { path: '../public/fonts/VulfMono-LightItalic.otf', weight: '300', style: 'italic' },
    { path: '../public/fonts/VulfMono-Regular.otf', weight: '400', style: 'normal' },
    { path: '../public/fonts/VulfMono-Italic.otf', weight: '400', style: 'italic' },
    { path: '../public/fonts/VulfMono-Bold.otf', weight: '700', style: 'normal' },
    { path: '../public/fonts/VulfMono-BoldItalic.otf', weight: '700', style: 'italic' },
    { path: '../public/fonts/VulfMono-Black.otf', weight: '900', style: 'normal' },
    { path: '../public/fonts/VulfMono-BlackItalic.otf', weight: '900', style: 'italic' }
  ],
  variable: '--font-display',
  display: 'swap',
  preload: true
});
