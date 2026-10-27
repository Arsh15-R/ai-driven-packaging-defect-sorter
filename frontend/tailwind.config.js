/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        space: {
          black: '#020408',
          dark: '#060911',
          card: 'rgba(12, 17, 29, 0.72)',
          surface: '#0B0F19',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-highlight': 'rgba(255, 255, 255, 0.16)',
        },
        apple: {
          blue: '#2997FF',
          cyan: '#64D2FF',
          emerald: '#30D158',
          crimson: '#FF453A',
          amber: '#FF9F0A',
          purple: '#BF5AF2',
          pink: '#FF375F',
          gray: '#86868B',
          lightgray: '#D2D2D7',
        },
        arc: {
          dark: '#060911',
          surface: '#0B0F19',
          card: '#101726',
          border: 'rgba(255, 255, 255, 0.08)',
          cyan: '#64D2FF',
          blue: '#2997FF',
          green: '#30D158',
          red: '#FF453A',
          amber: '#FF9F0A',
          purple: '#BF5AF2',
          muted: '#86868B'
        }
      },
      boxShadow: {
        'glow-cyan': '0 0 30px rgba(100, 210, 255, 0.3)',
        'glow-emerald': '0 0 30px rgba(48, 209, 88, 0.3)',
        'glow-crimson': '0 0 30px rgba(255, 69, 58, 0.35)',
        'glow-purple': '0 0 30px rgba(191, 90, 242, 0.3)',
        'glow-amber': '0 0 30px rgba(255, 159, 10, 0.3)',
        'glass': '0 12px 40px -10px rgba(0, 0, 0, 0.7)',
        'glass-card': '0 20px 50px -15px rgba(0, 0, 0, 0.8), inset 0 1px 1px 0 rgba(255, 255, 255, 0.12)',
        'specular': 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.18)',
        'tactile': '0 8px 24px -4px rgba(0, 0, 0, 0.6), inset 0 1px 2px rgba(255, 255, 255, 0.25), inset 0 -2px 4px rgba(0, 0, 0, 0.5)',
        'tactile-red': '0 8px 30px rgba(255, 69, 58, 0.45), inset 0 1px 2px rgba(255, 255, 255, 0.4), inset 0 -3px 6px rgba(0, 0, 0, 0.5)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'JetBrains Mono', 'Fira Code', 'Menlo', 'monospace']
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-pulse': 'glow 4s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { opacity: '0.4', transform: 'scale(0.98)' },
          '100%': { opacity: '0.8', transform: 'scale(1.02)' }
        }
      }
    },
  },
  plugins: [],
}
