/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#06070a',
          card: '#0d0f13',
          inner: '#13161b',
        },
        border: {
          DEFAULT: '#1e2228',
        },
        fg: {
          muted: '#9ca3af',
          bright: '#e5e7eb',
          white: '#f3f4f6',
        },
        accent: '#10b981',
        up: '#ef4444',
        down: '#3b82f6',
        warn: '#f59e0b',
        inst: '#a78bfa',
        indiv: '#fb923c',
        frgn: '#3b82f6',
      },
      fontFamily: {
        sans: [
          'Toss Product Sans',
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
