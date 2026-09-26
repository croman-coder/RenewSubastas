import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        // `wordmark` kept as the historical token name so existing
        // `font-wordmark` utility classes don't need a global rename.
        // Points at Space Grotesk now, the new Renew display face.
        wordmark: ['var(--font-display)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
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
        // Bid panel + its CTA (globals.css): ink panel on paper, white panel
        // CTA; in the dark version a raised panel with the same white CTA.
        panel: {
          DEFAULT: 'oklch(var(--panel-bg) / <alpha-value>)',
          fg: 'oklch(var(--panel-fg) / <alpha-value>)',
          muted: 'oklch(var(--panel-muted) / <alpha-value>)',
          line: 'oklch(var(--panel-line))',
        },
        cta: {
          DEFAULT: 'oklch(var(--cta-bg) / <alpha-value>)',
          fg: 'oklch(var(--cta-fg) / <alpha-value>)',
        },
        success: 'oklch(var(--success) / <alpha-value>)',
        warning: 'oklch(var(--warning) / <alpha-value>)',
        danger: 'oklch(var(--danger) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
      },
      // DESIGN.md: buttons 11px (lg = --radius), tiles 12–14px, cards 18px.
      // xl/2xl override Tailwind's 12/16px so the existing rounded-xl and
      // rounded-2xl cards pick up the system's shape without edits.
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
