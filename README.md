# EncFS Tree Browser

A web application for viewing and navigating EncFS-encrypted directory trees with bidirectional filename mapping. View both encrypted (encoded) and decrypted (decoded) filenames side-by-side in an interactive tree view.

## Features

- **View encrypted directories**: Load an EncFS volume and see decoded filenames alongside their encrypted counterparts
- **Bidirectional mapping**: toolbar Swap flips which of encoded/decoded is the primary column
- **Large tree support**: lazy loading keeps browsing responsive on big volumes
- **Single directory browse**: pick one directory in the Browse tab (Chrome/Edge), with mode + mount point (mount point shown only when the config enables name chaining)
- **Sort toggle**: alphabetical sort by displayed name at the root and inside every directory
- **Search & filter**: Real-time search across filenames
- **Clipboard operations**: Copy full encoded (📋🔒) or decoded (📋🔓) paths with one click
- **Convert tab**: paste or load a list of names/paths, encode or decode, view results as a table or as the same tree as Browse
- **Named configurations**: header dropdown (your configs first, bundled configs, samples last, "Add…" entry) + edit modal with password **Remember** opt-in — drop extra volumes in `conf/xxxx.encfs6.xml` (gitignored) and they appear automatically as built-ins named `xxxx`
- **Sample path lists**: built-in samples load their EncFS 1.9.5 test file list into Convert (matching the selected direction)
- **Config persistence**: configs, directory setup, and display preferences survive reloads
- **Dark mode**: follows the system light/dark preference
- **Standalone build**: one self-contained HTML file that runs offline (`npm run build:standalone`)

## Requirements

- **Browser**: Chrome 90+, Edge 90+ for directory browsing (File System Access API — the
  Browse tab only appears when supported). The Convert tab works in any modern browser
- **EncFS volume**: A directory containing EncFS-encrypted files
- **EncFS password**: Password for the EncFS volume
- **.encfs6.xml config**: The configuration file from the EncFS volume

## Getting Started

### Installation

```bash
npm install
```

`npm install` also links the local `file:../encfs-names-ts` dependency and builds it
(see [How the npm package is used](#how-the-npm-package-is-used)).

### Development

```bash
npm run dev
```

Opens dev server at `http://localhost:5173`

### Build

```bash
npm run build              # dist/ (multi-file)
npm run build:standalone   # dist-standalone/encfs-browser.html (single file, offline)
```

### Embedding an .encfs6.xml in the standalone build

The standalone HTML ships with whatever configurations existed **at build time**:

1. Drop your volume config in `conf/xxxx.encfs6.xml` (the `conf/` folder is gitignored)
2. Run `npm run build:standalone`
3. `dist-standalone/encfs-browser.html` now contains `xxxx` in its configuration
   dropdown — the XML is inlined, no network needed

Alternatively, open the standalone file and use **➕ Add configuration…** in the
dropdown: the config is then stored in that browser's localStorage for the `file://`
origin (per machine, not embedded in the HTML).

### Testing

```bash
npm run test          # Run all tests
npm run test:ui       # Open test UI
```

## Usage

### Header
- **Configuration cluster** (before the tabs): dropdown first — shows the last used
  configuration on reopening, or **"Select or add configuration…"** the very first
  time; **✏️ Edit / 🔒** sits right beside it, then the password field
- **➕ Add configuration…** (last dropdown entry) opens the modal: name, xml,
  **Remember password**, and delete for user configs
- Tabs **⚡ Convert | 🌳 Browse** follow; on Browse, the directory line
  (Select directory… / mode / mount point / Scan) sits to their right

### Convert tab (first)
- Paste names/paths (one per line), load a file, or click **📄 Sample list** with a
  built-in sample (loads encoded or decoded paths to match the selected direction)
- Choose Decode or Encode → **☰ Table** or **🌳 Tree** view (same tree component,
  toolbar and behaviour as Browse), **📋 Copy all**

### Browse tab (Chrome/Edge)
1. Header (Browse tab only): **📂 Select directory…**, set mode (mount point input
   only appears when the config has name chaining enabled), **🔍 Scan**
2. Tree with both representations per row
3. Toolbar: **A→Z Sort**, **▾ Expand 1 level**, **▾▾ Expand all**, **▴ Collapse all**,
   search, **⇄ Swap** to flip primary column
4. Copy **📋🔒** (encoded path) / **📋🔓** (decoded path) from any row

## Architecture

### Core Components

- **EncFS name crypto**: provided entirely by the
  [`encfs-filename-codec`](../encfs-names-ts) npm package (see
  [How the npm package is used](#how-the-npm-package-is-used))
  - `.encfs6.xml` parsing, volume key derivation, Block/Stream name encode/decode are
    all in the package (MAC-verified, golden-vector tested)

- **File System** (`src/lib/fs-scanner.ts`)
  - File System Access API integration for directory scanning
  - One level of entries per call; deeper levels are loaded on demand

- **Tree Building** (`src/lib/tree-builder.ts`)
  - Hierarchical tree construction from a directory scan
  - Computes the chained name IV of a parent directory and converts each child name
    with the package's `encryptName` / `decryptName` (a failed conversion keeps the
    raw name instead of failing the scan)
  - Mount point offset handling
  - Bidirectional name path mapping (full decoded and encoded paths per node)

- **Path tree / filter / sort** (`src/lib/path-tree.ts`, `tree-filter.ts`)
  - Builds a TreeGrid-compatible forest from Convert input/output pairs
  - Search filter and alphabetical sort by displayed primary name

- **Persistence** (`src/lib/persist-dir.ts`, `src/lib/config-store.ts`)
  - Stores directory handles in IndexedDB, keyed `dir:<configId>:<stepId>`, and
    re-requests permission on load
  - Stores configurations, directory setup, active id and display prefs in localStorage

- **Chain / grafting** (`src/lib/chain.ts`)
  - Grafts the directory tree at its mount point; mount points also seed the
    chained-IV walk for `chainedNameIV` volumes

- **UI Components** (`src/components/`)
  - TreeGrid: recursive tree rows, expand-on-demand (1 level / all / collapse)
  - TreeToolbar: shared toolbar (search, sort, expand, swap) for both tabs
  - ConfigModal: add/edit/delete configuration (modal, includes Remember password)
  - DirectorySetup: single directory bar (mode, mount point) in the Browse tab
  - BatchConvert: Convert tab (table view + same tree as Browse)
  - ConfigUploader, DirectoryPicker, SearchBar: inputs

### How the npm package is used

All EncFS filename crypto lives in the local package `encfs-names-ts`, published to this
workspace as **`encfs-filename-codec`**. The app has no crypto code of its own.

**Dependency** (`package.json`):

```json
"dependencies": {
  "encfs-filename-codec": "file:../encfs-names-ts"
}
```

`file:` creates a junction/symlink from `node_modules/encfs-filename-codec` to
`../encfs-names-ts`. npm runs the package's `prepare` script once at install time,
which runs `tsc` and emits `dist/` — that `dist/` is what the app imports
(`exports` points at `./dist/src/index.js` + `.d.ts`).

**Import points in the app:**

| Where | Call | Purpose |
|-------|------|---------|
| `src/App.tsx` | `EncfsNameCodec.fromV6Xml(xml, password)` | Parse `.encfs6.xml`, derive the volume key from the password, build the codec |
| `src/lib/tree-builder.ts` | `codec.decryptName(component, parentIv)` | Encoded → decoded name of one path component |
| `src/lib/tree-builder.ts` | `codec.encryptName(component, parentIv)` | Decoded → encoded name of one path component |
| `src/lib/tree-builder.ts` | `codec.chainedNameIv` | Whether children's names chain their parent's IV |

The codec instance is stored in app state (`useState<EncfsNameCodec | null>`); the
password is only ever passed to `fromV6Xml`, kept in memory by default (cleartext
localStorage only with the explicit per-config "Remember" opt-in).

**Rebuilding after editing the package:** npm does not watch `../encfs-names-ts`.
After changing it, rebuild it once, then restart the dev server / rerun tests:

```bash
cd ../encfs-names-ts && npm run build   # emits dist/
cd ../encfs-tree-browser && npm run dev
```

If you change only the package's own code, `npm install` in this app is unnecessary —
the link already points at the source tree.

### Key Technologies

- **Preact + TypeScript**: React-compatible UI (source imports `react`, the runtime is aliased to `preact/compat` in `vite.config.ts` — keeps the standalone bundle ~56% smaller)
- **Vite**: Fast build tool and dev server
- **encfs-filename-codec**: EncFS filename crypto (Web Crypto API: PBKDF2, AES, HMAC‑SHA1)
- **Plain CSS**: Direct CSS styling for maintainability and reliability
- **Vitest**: Unit testing with fixtures

## EncFS Support

Filename crypto is delegated to [`encfs-filename-codec`](../encfs-names-ts); this app
only calls it. Supported there:

- **Block cipher** (nameio/block): Most common EncFS configuration
- **Stream cipher** (nameio/stream): Alternative name encoding
- **Key derivation**: EncFS `BytesToKey` (SHA‑1, 16 rounds) from the volume password,
  then AES‑CFB decryption of the encoded volume key from `encodedKeyData` (V6 config;
  Argon2id/V7 and cipher interface < 3 are not supported)
- **Filename encoding**: EncFS custom base64 (alphabet `,-0-9A-Za-z`) — characters are
  filename‑safe (no `/`, `+`, `=`)
- **Chained name IV**: parent-directory IV chain walked component by component
- **Path conversion**: Full‑path decode/encode with a copy button on the result

### Limitations

- Direct directory browsing requires the File System Access API (Chrome/Edge); the
  Browse tab is hidden elsewhere — the Convert tab works in any modern browser
- Cannot modify files through this interface
- Relies on user-selected directories (respects OS permissions)

## Testing

Tests cover this app's wiring of the codec and its tree building; the crypto algorithms
themselves are tested in [`encfs-names-ts`](../encfs-names-ts) (`npm test` there):

```bash
# Run all tests
npm run test

# Run specific test file
npm run test -- tree-builder.test.ts

# Watch mode
npm run test -- --watch

# Test UI
npm run test:ui
```

### Test Coverage

- Package wiring: `fromV6Xml` password rejection, encode/decode round-trips (ascii,
  unicode, chained full paths) against real EncFS 1.9.5 fixture vectors
- Tree builder: per-directory IV chaining in both modes, fallback to the raw name when
  a name cannot be converted
- Config store: round-trips, password sanitizing, legacy key migration
- Chain: grafting at mount points, path conversion helpers
- Tree filter/sort: search matching both representations, alphabetical sort by
  displayed primary name

Crypto algorithm tests live in [`encfs-names-ts`](../encfs-names-ts) (`npm test` there),
with real encrypted trees and Rust golden vectors.

## Code Style

- Lightweight TypeScript with strict mode
- Minimal comments (only for non-obvious WHY)
- Compact, readable implementations
- Security-first input validation
- No crypto code in the app — all of it comes from `encfs-filename-codec`

## Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome 90+ | ✅ Full | Browse + Convert (File System Access API) |
| Edge 90+ | ✅ Full | Browse + Convert (File System Access API) |
| Firefox | ⚠️ Convert only | No File System Access API → Browse tab hidden |
| Safari | ⚠️ Convert only | No File System Access API → Browse tab hidden |

## Troubleshooting

### "Directory is not encoded" error
- Verify you selected the correct directory (should contain encrypted filenames)
- Check that the password is correct
- Ensure the .encfs6.xml config matches the volume

### Permission denied when selecting directory
- Grant the browser permission to access the directory
- Try selecting from a different location
- Check OS-level file permissions

### Slow performance with large directories
- Enable "Load Full Tree" gradually rather than all at once
- Use search to narrow down results
- Consider browsing a subdirectory instead of the full tree

## Development

### Project Structure

```
encfs-tree-browser/
├── src/
│   ├── components/      # UI components (Preact runtime) — TreeGrid, TreeToolbar, ConfigModal, DirectorySetup, BatchConvert, …
│   ├── lib/            # Core logic
│   │   ├── fs-scanner.ts
│   │   ├── tree-builder.ts
│   │   ├── tree-filter.ts
│   │   ├── path-tree.ts
│   │   ├── chain.ts
│   │   ├── encfs-xml.ts
│   │   ├── config-store.ts
│   │   ├── builtin-configs.ts
│   │   └── persist-dir.ts
│   ├── assets/configs/ # Bundled sample .encfs6.xml + sample path lists (inlined in standalone build)
│   ├── styles/         # app.css (plain CSS)
│   ├── types/          # TypeScript types
│   ├── hooks/          # Custom UI hooks (useClipboard)
│   └── App.tsx         # Main app (tabs: convert / browse)
├── tests/              # Test files
│   ├── fixtures/       # Real EncFS 1.9.5 vector configs
│   └── lib/
└── .claude/            # Agent rules and documentation
```

### Adding Features

When adding new features:
1. Add types to `src/types/index.ts`
2. Create core logic in `src/lib/`
3. Write tests in `tests/`
4. Add UI components in `src/components/`
5. Wire into `src/App.tsx`

## Future Enhancements

- [x] Config persistence (configs, directory setup, prefs in localStorage; directory handles in IndexedDB)
- [x] Convert tab (table + tree views matching Browse)
- [x] Single-directory Browse with mode + mount point (shown only for chainedNameIV configs)
- [x] Sort toggle by displayed name (root + every directory)
- [x] Standalone single-file build (`npm run build:standalone`)
- [ ] Drag & drop file upload
- [ ] Auto-detect encoded/decoded mode
- [ ] Export tree to CSV/JSON
- [ ] Statistics panel (file count, size, depth)
- [ ] Keyboard shortcuts and navigation
- [ ] Advanced filtering (by size, date range)
- [ ] Side-by-side comparison view

## Security Notes

- Passwords are kept in memory only by default; the per-config **Remember** checkbox is
  an explicit opt-in that stores the password in cleartext localStorage
- Uses Web Crypto API for all encryption (native browser crypto, inside `encfs-filename-codec`)
- File System Access API respects OS-level permissions
- No data is transmitted to external servers
- Config files are validated before use (MAC check on password)

## Contributing

To contribute improvements:
1. Check `AGENTS.md` (constraints) and `docs/requirements-technical.md` (architecture/style)

2. Run tests: `npm run test`
3. Build: `npm run build`
4. Test in browser before committing

## License

This project was created as an educational tool for EncFS exploration.

## Resources

- [EncFS Documentation](https://vgough.github.io/encfs/)
- [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
