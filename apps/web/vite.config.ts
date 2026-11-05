import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` casa com o caminho do GitHub Pages: https://barrosyan.github.io/afero/
export default defineConfig({
  base: '/afero/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
