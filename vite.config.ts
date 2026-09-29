import react from '@vitejs/plugin-react'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/** Emit the standalone bundle as encfs-browser.html instead of index.html. */
function renameStandaloneHtml(): Plugin {
  return {
    name: 'rename-standalone-html',
    apply: 'build',
    closeBundle() {
      const from = resolve('dist-standalone/index.html')
      const to = resolve('dist-standalone/encfs-browser.html')
      if (existsSync(from)) {
        if (existsSync(to)) rmSync(to)
        renameSync(from, to)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone'
  return {
    plugins: [
      react(),
      ...(standalone ? [viteSingleFile(), renameStandaloneHtml()] : []),
    ],
    build: standalone
      ? {
          outDir: 'dist-standalone',
          assetsInlineLimit: 100000000,
          cssCodeSplit: false,
        }
      : {},
  }
})
