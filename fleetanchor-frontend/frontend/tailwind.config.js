/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0A1628', 2: '#0F2040', 3: '#162952', 4: '#1E3A6E' },
        gold: { DEFAULT: '#F5A623', dark: '#E8951A', light: '#FFF3DC' },
        teal: { DEFAULT: '#00C9A7', dark: '#00A88C', light: '#E1F5EE' },
        anchor: { red: '#E84B4B', green: '#2ECC71', blue: '#3498DB', purple: '#9B59B6' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in': 'slideIn 0.25s ease-out',
        'pulse-gold': 'pulseGold 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideIn: { from: { transform: 'translateY(-8px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        pulseGold: { '0%,100%': { boxShadow: '0 0 0 0 rgba(245,166,35,0.4)' }, '50%': { boxShadow: '0 0 0 8px rgba(245,166,35,0)' } },
      },
    },
  },
  plugins: [],
};
