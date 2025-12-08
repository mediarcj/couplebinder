// File: binder-editor/tailwind.config.js
// Description: Tailwind CSS config scoped to binder editor React app
// Notes: Limits content scan to React/Vite files to avoid EJS/global CSS

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {}
  },
  plugins: []
};

