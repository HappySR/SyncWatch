/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
        colors: {
            background: '#0b0f19',

            surface: {
            DEFAULT: 'rgba(255,255,255,0.05)',
            hover: 'rgba(255,255,255,0.08)',
            },

            border: {
            DEFAULT: 'rgba(255,255,255,0.12)',
            focus: 'rgba(255,255,255,0.2)',
            },

            text: {
            primary: '#ffffff',
            secondary: 'rgba(255,255,255,0.75)',
            muted: 'rgba(255,255,255,0.45)',
            },

            primary: {
            DEFAULT: '#8b5cf6',
            hover: '#7c3aed',
            soft: 'rgba(139,92,246,0.15)',
            },

            secondary: {
            DEFAULT: '#22d3ee',
            hover: '#06b6d4',
            soft: 'rgba(34,211,238,0.15)',
            },

            success: '#22c55e',
            warning: '#f59e0b',
            error: '#ef4444',
        },
    },
  },
  plugins: [],
}
