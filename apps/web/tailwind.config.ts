import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        wordmark: ['var(--font-bricolage)', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: {
          base: 'oklch(var(--bg-base) / <alpha-value>)',
          elev: 'oklch(var(--bg-elev) / <alpha-value>)',
          deep: 'oklch(var(--bg-deep) / <alpha-value>)',
        },
        text: {
          strong: 'oklch(var(--text-strong) / <alpha-value>)',
          muted: 'oklch(var(--text-muted) / <alpha-value>)',
          subtle: 'oklch(var(--text-subtle) / <alpha-value>)',
        },
        ink: 'oklch(var(--ink) / <alpha-value>)',
        copper: 'oklch(var(--copper) / <alpha-value>)',
        success: 'oklch(var(--success) / <alpha-value>)',
        warning: 'oklch(var(--warning) / <alpha-value>)',
        danger: 'oklch(var(--danger) / <alpha-value>)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
