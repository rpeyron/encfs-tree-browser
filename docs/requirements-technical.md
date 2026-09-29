# EncFS Tree Browser — Technical Requirements

Functional requirements and user flows: [requirements-functional.md](requirements-functional.md).
Usage, npm-package wiring and build instructions: [../README.md](../README.md).

## Architecture

- **File System Access API**: browser native, no server, Chrome/Edge for directory
  browsing; browsers without it still work via the listing-file fallback and batch convert
- **Tree grid**: plain recursive rows in `TreeGrid.tsx` — lazy expansion keeps the DOM small;
  virtualisation is a future enhancement, not current behaviour
- **Single directory browsing**: a configuration (xml + password) is separate from its
  directory binding; the binding grafts its tree at the mount point (`src/lib/chain.ts`),
  and the mount point also seeds the chained-IV walk for `chainedNameIV` volumes
- **`encfs-filename-codec` (`file:../encfs-names-ts`)**: all EncFS filename crypto in one
  local package — MAC-verified, vector-tested, reusable. Rebuild it (`npm run build` in
  `encfs-names-ts`) after editing it; the app has no crypto code of its own
- **React hooks**: state management at app scope (no context/Redux)
- **Plain CSS**: `src/styles/app.css` only — Tailwind v4 + `@tailwindcss/postcss` broke
  with Vite (CSS not generated), so utility frameworks are banned here
- **localStorage**: configurations, active id, directory setup (per config), display prefs;
  optional cleartext password per config (opt-in only)
- **IndexedDB**: `FileSystemDirectoryHandle` per `dir:<configId>:<stepId>` (`persist-dir.ts`)

## Key Files & Responsibilities

**EncFS Logic** — external package `encfs-filename-codec` (`../encfs-names-ts/src/index.ts`):
- `.encfs6.xml` parsing, volume key derivation, Block/Stream name ciphers, EncFS base64,
  chained name IVs. The app never parses the config itself

**Configuration & state:**
- `src/lib/config-store.ts` — user configs / active id / steps / prefs in localStorage,
  password sanitizing, legacy-key migration
- `src/lib/builtin-configs.ts` — bundled sample configs (`?raw` xml imports)

**Tree building / scanning:**
- `src/lib/tree-builder.ts` — tree construction (FSA levels + eager listing trees),
  chained-IV conversion, full path mapping
- `src/lib/chain.ts` — step grafting at mount points, id prefixing, path conversion helpers
- `src/lib/listing-parser.ts` — directory listing file parser (format spec)
- `src/lib/fs-scanner.ts` — File System Access API wrapper (one directory level)

**Persistence:**
- `src/lib/persist-dir.ts` — save/load directory handles via IndexedDB (keyed per step)

**UI components** (`src/components/`):
- `TreeGrid.tsx` — tree rendering (expand/collapse, copy buttons, lazy children)
- `ConfigManager.tsx` — config dropdown, password + Remember, add/replace/delete config
- `ChainBindings.tsx` — (removed) directory bindings now live in `DirectorySetup.tsx`
- `DirectorySetup.tsx` — single directory bar (source, mode, mount point) in the Tree tab
- `ConfigModal.tsx` — add/edit/delete configuration modal
- `BatchConvert.tsx` — batch encode/decode (table/tree views)
- `ConfigUploader.tsx`, `DirectoryPicker.tsx`, `DirectoryListingUpload.tsx`,
  `SearchBar.tsx` — supporting inputs

**Styling:**
- `src/styles/app.css` — all application styling
- `src/index.css` — global CSS only (body/reset)

**Testing:**
- `tests/lib/tree-builder.test.ts` — chained-IV conversion + package wiring (MUST PASS)
- `tests/lib/chain.test.ts` — grafting, id helpers, path conversion
- `tests/lib/config-store.test.ts` — store round-trips, password sanitizing, migration
- `tests/lib/listing-parser.test.ts` — listing parsing + eager tree vs fixture vectors
- `tests/fixtures/encfs-real-test-vectors.json` — real EncFS 1.9.5 encoded/decoded pairs

## EncFS Integration (delegated to `encfs-filename-codec`)

- `EncfsNameCodec.fromV6Xml(xml, password)` parses `.encfs6.xml` (boost_serialization),
  derives the volume key and verifies its MAC — wrong password throws
- Component conversion: `encryptName(component, parentIv)` / `decryptName(component, parentIv)`
  return the next-component IV for `chainedNameIV` volumes
- The package throws `EncfsCodecError`; the app catches it and keeps the raw name so one
  bad name never fails the scan
- Algorithm/format details: `../encfs-names-ts/README.md` and `encfs-algo.md`

## File Structure

```
src/
  ├── components/      # React UI components
  ├── lib/             # Core logic (tree-building, fs-scanning, persistence)
  ├── styles/          # CSS stylesheets
  ├── types/           # Shared TypeScript types
  ├── hooks/           # Custom React hooks
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
  (round-trips, password sanitizing, legacy migration), listing-parser (format + eager tree)
- **Crypto algorithm tests**: `../encfs-names-ts` (`npm test` there)
- **Not yet covered**: component/UI tests (`@testing-library` deliberately not installed)

## Error Handling

- Validation at boundaries: config upload, password, directory selection
- Graceful degradation: one failed conversion never fails the scan
- User feedback: inline errors in setup, error badges in the tree view
- Error recovery: editing config without a full reset

## Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome 90+ | Full | File System Access API for directory browsing |
| Edge 90+ | Full | File System Access API for directory browsing |
| Firefox | Partial | Listing-file fallback + batch convert; no directory picker |
| Safari | Partial | Listing-file fallback + batch convert; no directory picker |

Browsers without the File System Access API cannot open a directory directly; they work
through the uploaded listing format (see `src/lib/listing-parser.ts`).

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

1. **Directory browsing** needs the File System Access API (Chrome/Edge); elsewhere use
   the listing fallback
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

- `npm run build` → `dist/` (normal multi-file build)
- `npm run build:standalone` → `dist-standalone/index.html` (single self-contained file,
  via `vite-plugin-singlefile` in `vite.config.ts` mode `standalone`; sample xml configs
  are inlined through `?raw` imports)

## Future Enhancements

1. ✅ Config persistence (localStorage + IndexedDB dir handles)
2. ✅ Batch encode/decode (table + tree views)
3. ✅ Single-directory browse with bundled sample listings
4. ✅ Standalone single-file build
5. Drag & drop file upload
6. Auto-detect mode
7. Export to CSV/JSON
8. Statistics panel
9. Keyboard navigation
10. Advanced filtering
11. Compare view (split screen)
12. Error recovery on partial scan
