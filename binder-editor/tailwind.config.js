// File: binder-editor/tailwind.config.js
// Description: Tailwind CSS config scoped to binder editor React app
// Notes: Limits content scan to React/Vite files to avoid EJS/global CSS

/** @type {import('tailwindcss').Config} */
export default {
  // I am keeping the `content` field in this object so the receiving code can read that value by its expected name.
  content: [
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    './index.html',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    './src/**/*.{js,jsx,ts,tsx}'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  ],
  // I am keeping the `theme` field in this object so the receiving code can read that value by its expected name.
  theme: {
    // I am keeping the `extend` field in this object so the receiving code can read that value by its expected name.
    extend: {}
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  // I am keeping the `plugins` field in this object so the receiving code can read that value by its expected name.
  plugins: []
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

