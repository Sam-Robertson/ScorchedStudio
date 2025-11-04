import type { Metadata } from 'next';
export const defaultMetadata: Metadata = {
  title: {
    default: 'Scorched Studio — Woodburning in Utah County',
    template: '%s · Scorched Studio',
  },
  description: 'Hands-on woodburning studio for date nights, team events, and private groups.',
  icons: { icon: '/favicon.png' },
};
