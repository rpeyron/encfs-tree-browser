import prefresh from '@prefresh/vite'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { defineConfig, type Plugin, type UserConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Read version from package.json
const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
const version = pkg.version || 'dev'

/**
 * Self-compressing standalone: replace the inlined JS/CSS with gzip+base64 payloads
 * inflated at boot via the native DecompressionStream (Chrome/Edge 80+, our target).
 * Drops the file from ~97 KB to ~40 KB; no document.write, no external requests.
 */
function compressHtml(html: string): string {
  const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/)
  if (!scriptMatch) return html
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/)
  const gz = (text: string) => gzipSync(Buffer.from(text, 'utf8'), { level: 9 }).toString('base64')
  const js = gz(scriptMatch[1])
  const css = styleMatch ? gz(styleMatch[1]) : ''
  const title = html.match(/<title>[^<]*<\/title>/)?.[0] ?? '<title>encfs-tree-browser</title>'
  const metas = (html.match(/<meta[^>]*>/g) ?? [])
    .filter((m) => !/charset/i.test(m))
    .join('\n')
  const icon = html.match(/<link rel="icon"[^>]*>/)?.[0] ?? ''
  const lines = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8" />',
    metas,
    title,
    icon,
    '  <style>html,body{margin:0;min-height:100%;background:#fff}@media(prefers-color-scheme:dark){body{background:#0f172a}}</style>',
    '</head>',
    '<body><div id="root"></div>',
    '  <script>',
    '    (async () => {',
    '      try {',
    '        const inflate = async (b64) => await new Response(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream("gzip"))).text();',
    ...(css
      ? [`        const style = document.createElement("style"); style.textContent = await inflate("${css}"); document.head.appendChild(style);`]
      : []),
    `        const mod = document.createElement("script"); mod.type = "module"; mod.textContent = await inflate("${js}"); document.body.appendChild(mod);`,
    '      } catch (e) { document.body.textContent = "This build requires DecompressionStream (Chrome/Edge 80+): " + e; }',
    '    })();',
    '  </script>',
    '</body>',
    '</html>',
    '',
  ]
  return lines.join('\n')
}

/** Inline the favicon as a data URI so the standalone html is fully self-contained. */
function inlineFavicon(): Plugin {
  return {
    name: 'inline-favicon',
    transformIndexHtml(html) {
      const svg = readFileSync(resolve('public/favicon.svg'), 'utf8')
      const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`
      return html.replace(
        /<link rel="icon"[^>]*\/?>/,
        `<link rel="icon" type="image/svg+xml" href="${uri}" />`,
      )
    },
  }
}

/**
 * Runs after vite-plugin-singlefile inlined JS/CSS: compress the document and emit
 * it as encfs-browser.html (replacing index.html).
 */
function finalizeStandalone(): Plugin {
  return {
    name: 'finalize-standalone',
    apply: 'build',
    closeBundle() {
      const from = resolve('dist/index.html')
      const to = resolve('dist/encfs-browser.html')
      if (!existsSync(from)) return
      const html = readFileSync(from, 'utf8')
      writeFileSync(to, compressHtml(html))
      rmSync(from)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const standalone = mode === 'standalone'
  return {
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
      __APP_VERSION__: JSON.stringify(version),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [
      inlineFavicon(),
      (await prefresh()) as Plugin,
      ...(standalone ? [viteSingleFile({ removeViteModuleLoader: true }), finalizeStandalone()] : []),
    ],
    // Runtime stays API-compatible with React (same hooks/components); Preact
    // keeps the bundle ~64% smaller than react-dom 19.
    resolve: {
      alias: {
        react: 'preact/compat',
        'react/jsx-runtime': 'preact/jsx-runtime',
        'react/jsx-dev-runtime': 'preact/jsx-dev-runtime',
        'react-dom/client': 'preact/compat/client',
        'react-dom': 'preact/compat',
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
          outDir: 'dist',
          assetsInlineLimit: 100000000,
          cssCodeSplit: false,
          target: 'es2022',
        }
      : {
          target: 'es2022',
        },
  } as UserConfig
})
