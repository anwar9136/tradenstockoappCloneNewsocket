/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Modern Trading App Theme - Based on Reference Screenshots
        'app-bg': '#000000',
        'app-surface': '#1C1C1E',
        'app-border': '#2C2C2E',
        'app-blue': '#0051FF',
        'app-blue-hover': '#0046E0',
        'app-green': '#00C853',
        'app-red': '#FF3B30',
        'app-text-primary': '#FFFFFF',
        'app-text-secondary': '#A8A8A8',
        'app-text-tertiary': '#6E6E73',
        
        // Legacy support - map old colors to new theme
        'trading-primary': {
          50: '#e6f0ff',
          100: '#cce0ff',
          200: '#99c2ff',
          300: '#66a3ff',
          400: '#3385ff',
          500: '#0051FF',
          600: '#0046E0',
          700: '#003ACC',
          800: '#002EB8',
          900: '#0022A3',
        },
        'trading-success': {
          50: '#e6f9f0',
          100: '#ccf3e1',
          200: '#99e7c3',
          300: '#66dba5',
          400: '#33cf87',
          500: '#00C853',
          600: '#00B34A',
          700: '#009E41',
          800: '#008938',
          900: '#00742F',
        },
        'trading-danger': {
          50: '#ffe9e8',
          100: '#ffd3d1',
          200: '#ffa7a3',
          300: '#ff7b75',
          400: '#ff4f47',
          500: '#FF3B30',
          600: '#E6362B',
          700: '#CC3026',
          800: '#B32B21',
          900: '#99251C',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'SF Pro Display', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      backgroundImage: {
        'app-gradient': 'linear-gradient(180deg, #000000 0%, #1C1C1E 100%)',
      },
      boxShadow: {
        'app-card': '0 2px 8px rgba(0, 0, 0, 0.4)',
        'app-card-hover': '0 4px 12px rgba(0, 81, 255, 0.2)',
      },
      borderRadius: {
        'app': '12px',
        'app-lg': '16px',
      }
    },
  },
  plugins: [],
}