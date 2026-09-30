# EncFS Tree Browser — Technical Requirements

Functional requirements and user flows: [requirements-functional.md](requirements-functional.md).
Usage and build commands: [../README.md](../README.md) (codec wiring and architecture: below).

## Architecture

- **File System Access API**: browser native, no server; the Browse tab (directory
  scanning) requires Chrome/Edge, other browsers keep the Convert tab only
- **Tree grid**: plain recursive rows in `TreeGrid.tsx` — lazy expansion keeps the DOM small;
  virtualisation is a future enhancement, not current behaviour
- **Single directory browsing**: a configuration (xml + password) is separate from its
  directory binding; the binding grafts its tree at the mount point (`src/lib/chain.ts`),
  and the mount point also seeds the chained-IV walk for `chainedNameIV` volumes
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
- `src/lib/export.ts` — flatten tree, CSV/JSON serialization, browser download
- `src/lib/encfs-xml.ts` — `chainedNameIV` flag read from the xml

**Tree building / scanning:**
- `src/lib/tree-builder.ts` — tree construction from FSA scans, chained-IV conversion,
  full path mapping
- `src/lib/chain.ts` — directory grafting at mount points, id prefixing, path conversion
- `src/lib/fs-scanner.ts` — File System Access API wrapper (one directory level)

**Persistence:**
- `src/lib/persist-dir.ts` — save/load directory handles via IndexedDB (keyed per directory)

**UI components** (`src/components/`):
- `TreeGrid.tsx` — tree rendering (expand/collapse, copy buttons, lazy children)
- `TreeToolbar.tsx` — shared toolbar (search, sort, expand, swap) for both tabs
- `DirectorySetup.tsx` — directory line in the header (Select directory, mode,
  mount point shown only for chainedNameIV configs)
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
  raw-name fallback, package wiring), chain (grafting, path conversion), config-store
  (round-trips, password sanitizing, legacy migration), tree-filter (search on both
  representations, sort by displayed primary name, flatten visible rows for keyboard
  nav), mode-detect (encoded/decoded fixtures), export (flatten, CSV quoting, JSON tree)
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
4. **Mode detection**: user specifies encoded/decoded, don't guess
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
- `npm run build:standalone` → `dist-standalone/encfs-browser.html` (single self-contained file,
  via `vite-plugin-singlefile` in `vite.config.ts` mode `standalone`; sample xml configs
  are inlined through `?raw` imports)
- Sizes (gzip): JS ≈ 62 KB (22 KB), CSS ≈ 18 KB (3,7 KB), standalone ≈ 80 KB (25,4 KB).
  Levers already applied: Preact runtime via alias, dead-CSS removal, native `DOMParser`
  (no XML library), `removeViteModuleLoader`, target es2022

## Future Enhancements

1. ✅ Config persistence (localStorage + IndexedDB dir handles)
2. ✅ Batch encode/decode (table + tree views)
3. ✅ Single-directory browse with sample path lists for Convert
4. ✅ Standalone single-file build
5. ✅ Drag & drop file upload (config xml + Convert input)
6. ✅ Auto-detect encoded/decoded mode (after directory pick)
7. ✅ Export tree to CSV/JSON
8. ✅ Keyboard shortcuts and navigation (↑↓ →← Enter/Space Ctrl+F Ctrl+C Esc)
9. Statistics panel
10. Advanced filtering
11. Compare view (split screen)
12. Error recovery on partial scan
