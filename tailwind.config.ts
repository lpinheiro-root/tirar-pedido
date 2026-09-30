import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#f8f9ff',
          dim: '#d0dbed',
          bright: '#f8f9ff',
          'container-lowest': '#ffffff',
          'container-low': '#eff4ff',
          container: '#e6eeff',
          'container-high': '#dee9fc',
          'container-highest': '#d9e3f6',
          variant: '#d9e3f6',
        },
        'on-surface': '#121c2a',
        'on-surface-variant': '#475569',
        'inverse-surface': '#27313f',
        'inverse-on-surface': '#eaf1ff',
        outline: '#64748b',
        'outline-variant': '#cbd5e1',
        primary: {
          DEFAULT: '#2563eb',
          container: '#2563eb',
          'on-container': '#dbeafe',
          fixed: '#dbeafe',
        },
        'on-primary': '#ffffff',
        secondary: {
          DEFAULT: '#0284c7',
          container: '#38bdf8',
          'on-container': '#0c4a6e',
        },
        'on-secondary': '#ffffff',
        tertiary: {
          DEFAULT: '#7d3d00',
          container: '#a15100',
        },
        'on-tertiary': '#ffffff',
        error: {
          DEFAULT: '#ba1a1a',
          container: '#ffdad6',
          'on-container': '#93000a',
        },
        'on-error': '#ffffff',
        background: '#fafafa',
        'on-background': '#1f2937',
        'border-muted': '#e5e7eb',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        h1: ['24px', { lineHeight: '32px', letterSpacing: '-0.02em', fontWeight: '700' }],
        h2: ['18px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        body: ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        label: ['12px', { lineHeight: '16px', letterSpacing: '0.01em', fontWeight: '500' }],
        button: ['14px', { lineHeight: '20px', fontWeight: '500' }],
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.75rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
      },
      boxShadow: {
        ambient: '0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 1px 2px -1px rgba(0, 0, 0, 0.1)',
      },
      spacing: {
        18: '4.5rem',
      },
      maxWidth: {
        content: '1440px',
      },
    },
  },
  plugins: [],
};

export default config;
