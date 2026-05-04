/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['Cascadia Code', 'Consolas', 'monospace']
      }
    }
  },
  plugins: []
}
