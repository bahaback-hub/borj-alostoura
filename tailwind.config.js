/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './app.js'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0A0C10', 900: '#0E1117', 850: '#12161F', 800: '#161B26', 700: '#1E2532', 600: '#2A3344', 500: '#3A4559' },
        gold: { 300: '#F0D48A', 400: '#E3B94E', 500: '#D4A64A', 600: '#B8862F' },
        mist: { 100: '#EEF1F6', 200: '#D7DCE5', 300: '#B7BFCC', 400: '#8C96A8', 500: '#6B7688' }
      },
      fontFamily: { head: ['Cairo', 'Tajawal', 'sans-serif'], body: ['Tajawal', 'Cairo', 'sans-serif'] }
    }
  },
  plugins: []
};
