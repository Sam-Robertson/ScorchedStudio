// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // maps className="font-sans" to your Vulf Sans variable
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        // maps className="font-display" to your Vulf Mono variable
        display: ['var(--font-display)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
