import prefresh from '@prefresh/vite'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin, type UserConfig } from 'vite'
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
export default defineConfig(async ({ mode }) => {
  const standalone = mode === 'standalone'
  return {
    plugins: [
      (await prefresh()) as Plugin,
      ...(standalone ? [viteSingleFile({ removeViteModuleLoader: true }), renameStandaloneHtml()] : []),
    ],
    // Runtime stays API-compatible with React (same hooks/components); Preact
    // keeps the bundle ~64% smaller than react-dom 19.
    // Source imports `react` / `react-dom/client`; only these two aliases are used.
    // JSX resolves directly to `preact/jsx-runtime` via `oxc.jsx.importSource`.
    resolve: {
      alias: {
        react: 'preact/compat',
        'react-dom/client': 'preact/compat/client',
      },
    },
    // prefresh defaults to the classic `h` pragma; force the automatic runtime
    // so JSX compiles to preact/jsx-runtime imports. `oxc` is read by the
    // rolldown pipeline but not exposed in Vite's UserConfig types yet.
    oxc: {
      jsx: {
        runtime: 'automatic',
        importSource: 'preact',
      },
    },
    build: standalone
      ? {
          outDir: 'dist-standalone',
          assetsInlineLimit: 100000000,
          cssCodeSplit: false,
          target: 'es2022',
        }
      : {
          target: 'es2022',
        },
  } as UserConfig
})
