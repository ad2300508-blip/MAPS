/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        neon: {
          blue: '#4cc9f0',
          purple: '#7209b7',
          indigo: '#4361ee',
        },
        surface: {
          900: '#09090b',
          800: '#0f0f17',
          700: '#141420',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        neon: '0 0 20px rgba(76, 201, 240, 0.4)',
        'neon-lg': '0 0 40px rgba(76, 201, 240, 0.3)',
      },
    },
  },
  plugins: [],
};
