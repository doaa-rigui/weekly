/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        /** One voice for both halves of the app. */
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        /**
         * The planner's own palette — the daylight half of the app, against
         * the tracker's night. A green-grey rather than Tailwind's blue-grey
         * slate: the same ramp of steps with the neutral pulled towards a
         * garden, so a week you keep open all day is calm to sit in front of
         * rather than reading as a spreadsheet.
         */
        sage: {
          50: '#f4f6f2',
          100: '#e8ede4',
          200: '#d8e0d3',
          300: '#bcc8b6',
          400: '#8b9a86',
          500: '#6c7d68',
          600: '#55654f',
          700: '#43503f',
          800: '#354034',
          900: '#283028',
        },
        /** Card and sheet surfaces — white, but off it, towards the leaves. */
        paper: '#fbfcfa',
        /**
         * Moss. Today, the current selection, the primary action: the one hue
         * allowed to interrupt the page, and the daylight answer to the
         * tracker's `dream` indigo.
         */
        moss: {
          50: '#eef4ee',
          100: '#dceadd',
          200: '#bcd4bf',
          300: '#97b99c',
          400: '#74a07b',
          500: '#5c7f63',
          600: '#4a6a50',
          700: '#3a5540',
          800: '#2d4332',
        },
        /**
         * The sleep tracker's own palette — a warm-tinted deep indigo rather
         * than a neutral grey, so the dark side of the app reads as evening
         * light instead of as a switched-off screen. The two palettes share
         * only `dawn`, which is the sun in both halves.
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
        /**
         * The same trick in daylight, but louder than a wash: three pools of
         * colour — moss at the top left, a cooler mint opposite, and a low
         * band of gold along the bottom — so the page has weather rather than
         * a flat tint. They only ever meet the paper at the edges of the
         * card, which is where the depth comes from.
         */
        'garden-glow':
          'radial-gradient(1000px 520px at 8% -14%, #c9e0c6 0%, transparent 60%), radial-gradient(880px 480px at 92% -8%, #d8ece8 0%, transparent 58%), radial-gradient(1200px 400px at 50% 108%, #f0ecd4 0%, transparent 62%)',
      },
    },
  },
  plugins: [],
};
