/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * The sleep tracker's own palette — a warm-tinted deep indigo rather
         * than a neutral grey, so the dark side of the app reads as evening
         * light instead of as a switched-off screen. The planner keeps
         * Tailwind's slate; these are used nowhere near it.
         */
        night: {
          950: '#070b17',
          900: '#0b1020',
          850: '#101733',
          800: '#151d3a',
          700: '#1d2748',
          600: '#2a3559',
          500: '#3d4a75',
          400: '#6b7aa8',
          300: '#98a4c9',
          200: '#c3cbe4',
          100: '#e7ebf7',
        },
        /** Asleep. */
        dream: {
          300: '#b3bdfd',
          400: '#95a3fb',
          500: '#7c8cf8',
          600: '#6272e8',
        },
        /** First light — the sleep that comes after waking for Fajr. */
        dawn: {
          300: '#f8d19a',
          400: '#f6bf74',
          500: '#f0a94c',
        },
        moon: '#f7e3b5',
      },
      backgroundImage: {
        /** A low glow behind the page, so the dark isn't flat. */
        'night-glow':
          'radial-gradient(1200px 600px at 15% -10%, #1b2547 0%, transparent 60%), radial-gradient(900px 500px at 90% 0%, #17203d 0%, transparent 55%)',
      },
    },
  },
  plugins: [],
};
