# EncFS Tree Browser — Technical Requirements

Functional requirements and user flows: [requirements-functional.md](requirements-functional.md).
Usage and build commands: [../README.md](../README.md) (codec wiring and architecture: below).

## Architecture

- **File System Access API**: browser native, no server; the Browse tab (directory
  scanning) requires Chrome/Edge, other browsers keep the Convert tab only
- **Local agent** (`agent/`, zero-dependency Rust + PowerShell twin): removes the FSA
  limits — serves the app itself (gzip), lists any directory via HTTP, provides drive
  roots with volume labels; while reachable the FSA picker is replaced by the in-page
  explorer and the Browse tab re-probes it on every activation
- **Tree grid**: plain recursive rows in `TreeGrid.tsx` — lazy expansion keeps the DOM small;
  virtualisation is a future enhancement, not current behaviour
- **Single directory browsing**: a configuration (xml + password) is separate from its
  directory binding; the mount field prefixes the root row (or, on `chainedNameIV`
  volumes with a mount set, grafts only the mount path) and seeds the chained-IV walk
- **`encfs-filename-codec` (`file:../encfs-names-ts`)**: all EncFS filename crypto in one
  local package — MAC-verified, vector-tested, reusable. Rebuild it (`npm run build` in
  `encfs-names-ts`) after editing it; the app has no crypto code of its own
- **Hooks-based state**: state management at app scope (no context/Redux); source uses
  React's API while the bundled runtime is Preact (`preact/compat` alias + automatic
  JSX from `preact/jsx-runtime` in `vite.config.ts`) — no functional difference
- **Plain CSS**: `src/styles/app.css` only — Tailwind v4 + `@tailwindcss/postcss` broke
  with Vite (CSS not generated), so utility frameworks are banned here
- **localStorage**: configurations, active id, directory setup (per config), display prefs;
  optional cleartext password per config (opt-in only)
- **IndexedDB**: `FileSystemDirectoryHandle` per `dir:<configId>:<stepId>` (`persist-dir.ts`)

## Key Files & Responsibilities

**EncFS Logic** — external package `encfs-filename-codec` (`../encfs-names-ts/src/index.ts`):
- `.encfs6.xml` parsing, volume key derivation, Block/Stream name ciphers, EncFS base64,
  chained name IVs. The app never parses the config itself — the package uses the
  browser's native `DOMParser` (with a small internal fallback parser for Node/tests),
  so no XML library ships in the bundle

**Configuration & state:**
- `src/lib/config-store.ts` — user configs / active id / steps / prefs in localStorage,
  password sanitizing, legacy-key migration
- `src/lib/builtin-configs.ts` — sample configs (`?raw` imports) + `conf/*.encfs6.xml`
  glob (drop-in built-ins, gitignored)
- `src/lib/mode-detect.ts` — encode/decode mode auto-detection (decode + re-encode
  round-trip on root names, ratio threshold)
- `src/lib/agent-client.ts` — local agent probe (silent on `file:`, same-origin first,
  port 8765 in prod, full port range in dev), `/api/list` → `FSEntry[]`, roots with
  labels, path join, `/api/shutdown`
- `src/lib/export.ts` — flatten tree, CSV/JSON serialization, browser download
- `src/lib/encfs-xml.ts` — `chainedNameIV` flag read from the xml

**Tree building / scanning:**
- `src/lib/tree-builder.ts` — tree construction from FSA scans, chained-IV conversion,
  full path mapping
- `src/lib/chain.ts` — mount-prefix / grafting at mount points, id prefixing, path
  conversion, root row for the selected directory (`wrapDirectoryRoot` +
  `directoryDisplayNames`, optional display `prefix`)
- `src/lib/fs-scanner.ts` — File System Access API wrapper (one directory level)

**Persistence:**
- `src/lib/persist-dir.ts` — save/load directory handles via IndexedDB (keyed per directory)

**UI components** (`src/components/`):
- `TreeGrid.tsx` — tree rendering (expand/collapse, copy buttons, lazy children)
- `TreeToolbar.tsx` — shared toolbar (search, sort, expand, swap) for both tabs
- `DirectorySetup.tsx` — directory line in the header (Select folder + chosen-path
  label, encoded⇄decoded toggle, mount prefix; agent mode → `AgentExplorer`)
- `AgentExplorer.tsx` — in-page disk explorer popover (drives + volume labels, typed
  path, subfolder navigation, ⬇ Use this directory)
- `ConfigModal.tsx` — add/edit/delete configuration modal (incl. Remember password)
- `BatchConvert.tsx` — Convert tab (table view + same tree as Browse)
- `ConfigUploader.tsx`, `DirectoryPicker.tsx`, `SearchBar.tsx` — supporting inputs

**Styling:**
- `src/styles/app.css` — all application styling
- `src/index.css` — global CSS only (body/reset)

**Testing:**
- `tests/lib/tree-builder.test.ts` — chained-IV conversion + package wiring (MUST PASS)
- `tests/lib/chain.test.ts` — grafting, id helpers, path conversion
- `tests/lib/config-store.test.ts` — store round-trips, password sanitizing, migration
- `tests/lib/tree-filter.test.ts` — search matching both representations, sort by
  displayed primary name
- `tests/fixtures/encfs-real-test-vectors.json` — real EncFS 1.9.5 encoded/decoded pairs

## Local agent (`agent/`)

Zero-dependency Rust server — plus a PowerShell twin (`agent/encfs-agent.ps1`, Windows
only) for machines without a Rust toolchain (same API; distribute it beside
`encfs-browser.html` or `encfs-browser.html.gz`). The Rust agent is **multiplatform**:
`cargo check` passes for Windows (host), `x86_64-unknown-linux-gnu` and
`x86_64-apple-darwin`.

- **HTTP API** (GET only, `127.0.0.1:8765` → fallback 8785, guards on `Host`/`Origin`):

  | Route | Response |
  |---|---|
  | `/` | embedded standalone html, **gzipped** (`Content-Encoding: gzip`) |
  | `/favicon.svg` | embedded icon |
  | `/api/health` | `{"ok":true,"name":"encfs-agent","version":"…"}` (PS twin: `encfs-agent-ps`) |
  | `/api/roots` | `{"roots":[{name,path,label}]}` — ready drives/mounts; `label` = volume name when the OS exposes it (Windows: one cached PowerShell call, best-effort `null` otherwise; Linux: `/` + real `/proc/mounts` mounts, no label) |
  | `/api/list?path=` | `{"path":…,"entries":[{name,isDir,size,mtime}]}` — same shape as `FSEntry`; absolute path required, `..` rejected |
  | `/api/shutdown` | `{"ok":true}` then the process exits (graceful local stop) |

- **Embedding**: `agent/build.rs` gzips `../dist/encfs-browser.html` into
  `OUT_DIR` (clear failure when the standalone was not built) → `include_bytes!` →
  served with `Content-Encoding: gzip` (native browser inflation, no runtime code).
  **flate2 is a build-dependency only, never linked into the binary**. The exe carries
  **`icon.ico`** (generated by `agent/make-icon.mjs` from the favicon design, embedded
  via the `winresource` build-dependency, Windows target only) and is **packed with
  UPX** by `agent/compress.mjs` (`upx --best --lzma`, skipped when upx is absent):
  **~199 KB single distributable file**
- **App integration**: `steps[].source: 'agent'` — scan/expand/mode-detect go through
  `agentList`; the FSA picker is **hidden while the agent is reachable** (selection
  goes through `AgentExplorer`); root row shows the absolute path (parent part raw in
  both representations, basename via the codec); mount field hidden for agent paths.
  The Browse tab **re-probes the agent on activation** and falls back to the picker
  (cold-start state) when it no longer answers
- **Logging**: `agent.log` next to the exe/script (UTC timestamps, URL, events) —
  release builds have no console window
- **Build**: `npm run build:standalone` + `cargo build --release` + `node agent/compress.mjs`
  (wrapped by `npm run build:agent`)

## EncFS Integration (delegated to `encfs-filename-codec`)

- `EncfsNameCodec.fromV6Xml(xml, password)` parses `.encfs6.xml` (boost_serialization),
  derives the volume key and verifies its MAC — wrong password throws
- Component conversion: `encryptName(component, parentIv)` / `decryptName(component, parentIv)`
  return the next-component IV for `chainedNameIV` volumes
- The package throws `EncfsCodecError`; the app catches it and keeps the raw name so one
  bad name never fails the scan
- Algorithm/format details: `../encfs-names-ts/README.md` and `encfs-algo.md`

**Wiring between app and package:**

- Dependency (`package.json`): `"encfs-filename-codec": "file:../encfs-names-ts"` — npm
  creates a junction to the package; its `prepare` script builds `dist/`, which is what
  the app imports (`exports` → `./dist/src/index.js` + `.d.ts`)
- Import points:

| Where | Call | Purpose |
|-------|------|---------|
| `src/App.tsx` | `EncfsNameCodec.fromV6Xml(xml, password)` | Parse `.encfs6.xml`, derive the volume key, build the codec |
| `src/lib/tree-builder.ts` | `codec.decryptName(component, parentIv)` | Encoded → decoded name of one path component |
| `src/lib/tree-builder.ts` | `codec.encryptName(component, parentIv)` | Decoded → encoded name of one path component |
| `src/lib/tree-builder.ts` | `codec.chainedNameIv` | Whether children's names chain their parent's IV |

- After editing the package: `cd ../encfs-names-ts && npm run build`, then restart the
  dev server / rerun tests (the link already points at the source tree — no reinstall)

## File Structure

```
src/
  ├── components/      # UI components (Preact runtime)
  ├── lib/             # Core logic (tree-building, fs-scanning, persistence)
  ├── styles/          # CSS stylesheets
  ├── types/           # Shared TypeScript types
  ├── hooks/           # Custom UI hooks
  ├── App.tsx          # Main app component
  ├── main.tsx         # Entry point
  └── index.css        # Global CSS (body/reset; app styles live in styles/app.css)

tests/
  ├── fixtures/        # Test data and vectors
  └── lib/             # Test files
docs/                  # This file + functional requirements
```

## Code Style

- **Compact and readable**: minimize lines while staying clear
- **Lean comments**: only the non-obvious WHY; no narrative comments
- **No premature abstractions**: one-off functions over premature helpers
- **Strict typing**: TypeScript strict mode, no `any`
- **Security first**: validate at boundaries (user input, File System API), trust internals
- **Minimal dependencies**: built-in APIs first (Web Crypto, File System Access API)
- **Files**: kebab-case (`tree-builder.ts`, `fs-scanner.ts`, `app.css`)
- **Components**: PascalCase (`TreeGrid.tsx`); props typed with interfaces
- **Functions/types**: camelCase; **constants**: UPPER_SNAKE_CASE; **types**: PascalCase suffix (`TreeNode`, `FSEntry`)
- **CSS classes**: kebab-case; CSS custom properties `--color-*` for semantic colors,
  media queries for tablet layouts

## Performance

- **Lazy loading** (implemented): scan level 1 initially, children loaded on demand;
  target level 1 < 1s for 1000+ items
- **Expand All** (implemented): loads the whole subtree on demand from the toolbar
- **Large trees** (target, not yet verified): 10,000+ nodes scroll/expand smoothly
- **Virtualisation / search debounce** (future): render only visible rows, debounce 300ms

## Testing

- **Unit tests**: `tests/lib/` — tree-builder (chained-IV conversion in both modes,
  raw-name fallback, package wiring), chain (grafting, path conversion, root wrapper),
  config-store (round-trips, password sanitizing, legacy migration), tree-filter (search
  on both representations, sort by displayed primary name, flatten visible rows),
  mode-detect (encoded/decoded fixtures), export (flatten, CSV quoting, JSON tree),
  agent-client (probe fallbacks, list mapping, shutdown, path join with mocked fetch)
- **Rust tests**: `agent/` — `cargo test --release` (path rules, percent decoding, JSON
  escaping, real-directory listing, roots)
- **Crypto algorithm tests**: `../encfs-names-ts` (`npm test` there) — real encrypted
  trees + Rust golden vectors
- **Not yet covered**: component/UI tests (no browser-test framework installed)

## Error Handling

- Validation at boundaries: config upload, password, directory selection
- Graceful degradation: one failed conversion never fails the scan
- User feedback: inline errors in setup, error badges in the tree view
- Error recovery: editing config without a full reset

## Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome 90+ | Full | Browse + Convert (File System Access API) |
| Edge 90+ | Full | Browse + Convert (File System Access API) |
| Firefox | Convert only | No File System Access API → Browse tab hidden |
| Safari | Convert only | No File System Access API → Browse tab hidden |

## Security

- **Password**: memory only by default — passed straight to `EncfsNameCodec.fromV6Xml`,
  never logged. The per-config "Remember" checkbox is an explicit opt-in that stores it
  in cleartext localStorage; unchecking strips it on save
- **Crypto**: Web Crypto API only, inside `encfs-filename-codec`; no third-party crypto libraries
- **Input validation**: config and user input at boundaries
- **File access**: only through the File System Access API (user-authorized)

## Accessibility

- Semantic HTML (table structure for the tree)
- Keyboard navigation fully supported
- ARIA labels on interactive elements
- Color contrast sufficient for readability; icons have text alternatives

## Important Constraints

1. **Directory browsing** needs the File System Access API (Chrome/Edge); elsewhere
   the Browse tab is hidden and only the Convert tab is available
2. **Password handling**: memory only by default; persistence requires explicit opt-in
3. **Large trees**: must support 10,000+ items with smooth scrolling/expand
4. **Mode detection**: auto-detected after a directory pick; the mode toggle always
   overrides
5. **Column redundancy**: Name (primary) + Alternate (secondary); no Type column (icon only)
6. **Styling**: plain CSS only; no utility frameworks
7. **Directory ≠ config**: the directory binding (mount point, mode, source) belongs to the
   browsing setup, not to the EncFS configuration entity; one directory per configuration

## Known Issues & Workarounds

1. **Tailwind v4 compatibility**: `@tailwindcss/postcss` did not work with Vite → plain CSS in `src/styles/app.css`
2. The former volume-key decryption blocker is resolved: all filename crypto lives in
   `encfs-filename-codec`, MAC-verified against real EncFS 1.9.5 trees and Rust golden vectors

## Build

- `npm run build` → `dist/` (normal multi-file build, target es2022)
- `npm run build:standalone` → `dist/encfs-browser.html` (single file;
  `vite-plugin-singlefile` + self-compressing loader: JS/CSS gzipped, inflated via
  native `DecompressionStream`, favicon as `data:` URI; **≈ 42 KB instead of ≈ 97 KB**)
- `npm run build:agent` → standalone + `cargo build --release` + UPX packing
- Sizes: JS ≈ 62 KB (22 KB gzip), CSS ≈ 18 KB (3,7 KB gzip), agent exe ≈ 199 KB (UPX)
- GitHub Pages: `.github/workflows/deploy-pages.yml` (repository root) builds the
  standalone and publishes `encfs-browser.html` as the site `index.html`; requires
  `encfs-names-ts` published under the same GitHub owner (or repo variable
  `ENCFS_NAMES_REPO`); Pages source = GitHub Actions; `conf/` is gitignored so
  drop-in configs are absent from the published page unless force-added
