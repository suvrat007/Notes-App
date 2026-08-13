/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        /*
         * Dark metallic. MALTA (#c0b3a5) is the accent: warm enough to read as
         * deliberate against the cold greys, muted enough that a screen full of
         * it never shouts. Green and red are reserved for EARNED and LOST — the
         * only two things in the app that carry a verdict — so neither ever
         * appears as decoration.
         */
        forge: {
          bg: '#0d0f12',
          surface: '#16191e',
          raised: '#1e232b',
          steel: '#2a2f38',
          text: '#e6e8eb',
          dim: '#8a929e',
          accent: '#c0b3a5',
          'accent-deep': '#5c5148',
          good: '#3ecf8e',
          bad: '#e5484d',
        },
        /*
         * The old names, repointed at the palette above. Every existing
         * className keeps working and simply takes on the new look, rather
         * than needing a rewrite of every component that used them.
         */
        focus: {
          dark: '#0d0f12',
          card: '#16191e',
          accent: '#e6e8eb',
          green: {
            DEFAULT: '#5c5148',
            soft: '#4a4139',
          },
          red: {
            DEFAULT: '#e5484d',
            soft: '#3a1f1f',
          },
          teal: {
            DEFAULT: '#c0b3a5',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        /*
         * A condensed face for headings and numerals. Tabular figures in a
         * narrow grotesque are what make a wall of stats scan as a column of
         * numbers rather than a paragraph.
         */
        heading: ['Oswald', 'Roboto Condensed', 'Arial Narrow', 'sans-serif'],
      },
      borderRadius: {
        // FORGE's 10px corner, so cards read as machined rather than soft.
        forge: '10px',
      },
    },
  },
  plugins: [],
}
