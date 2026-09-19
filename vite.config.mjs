import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  publicDir: resolve(import.meta.dirname, 'assets'),
  base: './',
  build: {
    outDir: resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'src/renderer/index.html'),
      },
    },
  },
})
