import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'standalone' ? [viteSingleFile()] : [])],
  build:
    mode === 'standalone'
      ? {
          outDir: 'dist-standalone',
          assetsInlineLimit: 100000000,
          cssCodeSplit: false,
        }
      : {},
}))
