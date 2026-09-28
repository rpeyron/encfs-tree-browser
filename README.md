# EncFS Tree Browser

A web application for viewing and navigating EncFS-encrypted directory trees with bidirectional filename mapping. View both encrypted (encoded) and decrypted (decoded) filenames side-by-side in an interactive tree view.

## Features

- **View encrypted directories**: Load an EncFS volume and see decoded filenames alongside their encrypted counterparts
- **Bidirectional mapping**: Switch between viewing encrypted and decoded names as the primary display
- **Large tree support**: lazy loading keeps browsing responsive on big volumes
- **Lazy loading**: On-demand expansion of directories for minimal initial load time
- **Search & filter**: Real-time search across filenames
- **Clipboard operations**: Copy full paths (encoded or decoded) to clipboard with one click
- **Path converter**: Convert an arbitrary path (encoded ↔ decoded) with a copy button on the result
- **Config persistence**: Restores config, mode, mount point, and directory across reloads
- **Mount point configuration**: Specify where a directory portion connects in the broader EncFS tree

## Requirements

- **Browser**: Chrome 90+, Edge 90+ (uses File System Access API)
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
npm run build
```

### Testing

```bash
npm run test          # Run all tests
npm run test:ui       # Open test UI
```

## Usage

1. **Upload Configuration**
   - Upload the `.encfs6.xml` file from your EncFS volume
   - Enter the EncFS password

2. **Select Directory**
   - Click "Select Directory" and choose the encrypted folder on your system
   - Select the mode (encrypted or decrypted names)
   - Optionally specify a mount point

3. **Browse**
   - View the tree with decoded filenames (if directory is encrypted)
   - Expand folders to explore nested directories
   - Search for files
   - Copy full paths to clipboard

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
  - Hierarchical tree construction from flat file listings
  - Computes the chained name IV of a parent directory and converts each child name
    with the package's `encryptName` / `decryptName` (a failed conversion keeps the
    raw name instead of failing the scan)
  - Mount point offset handling
  - Bidirectional name path mapping (full decoded and encoded paths per node)

- **Persistence** (`src/lib/persist-dir.ts`)
  - Stores the selected `FileSystemDirectoryHandle` in IndexedDB and re‑requests
    permission on load, avoiding re‑selection after restart

- **UI Components** (`src/components/`)
  - TreeGrid: recursive tree rows, expand-on-demand (1 level / all / collapse)
  - ConfigUploader: File upload for .encfs6.xml
  - DirectoryPicker: File System Access API directory selection
  - SearchBar, ModeSelector, MountPointInput: Configuration UI

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

The codec instance is stored in React state (`useState<EncfsNameCodec | null>`); the
password is only ever passed to `fromV6Xml` and never persisted.

**Rebuilding after editing the package:** npm does not watch `../encfs-names-ts`.
After changing it, rebuild it once, then restart the dev server / rerun tests:

```bash
cd ../encfs-names-ts && npm run build   # emits dist/
cd ../encfs-tree-browser && npm run dev
```

If you change only the package's own code, `npm install` in this app is unnecessary —
the link already points at the source tree.

### Key Technologies

- **React + TypeScript**: Type-safe UI components
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

- Requires File System Access API (Chrome/Edge only)
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
| Chrome 90+ | ✅ Full | File System Access API required |
| Edge 90+ | ✅ Full | File System Access API required |
| Firefox | ❌ No | File System Access API not supported |
| Safari | ❌ No | File System Access API not supported |

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
│   ├── components/      # React UI components
│   ├── lib/            # Core logic
│   │   ├── fs-scanner.ts
│   │   ├── persist-dir.ts
│   │   └── tree-builder.ts
│   ├── styles/         # app.css (plain CSS)
│   ├── types/          # TypeScript types
│   ├── hooks/          # React hooks
│   └── App.tsx         # Main app
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

- [x] Config persistence (localStorage + IndexedDB for the directory handle)
- [ ] Drag & drop file upload
- [ ] Auto-detect encoded/decoded mode
- [ ] Export tree to CSV/JSON
- [ ] Statistics panel (file count, size, depth)
- [ ] Keyboard shortcuts and navigation
- [ ] Advanced filtering (by size, date range)
- [ ] Side-by-side comparison view
- [ ] Batch operations on selected files

## Security Notes

- Passwords are kept in memory only, never persisted
- Uses Web Crypto API for all encryption (native browser crypto)
- File System Access API respects OS-level permissions
- No data is transmitted to external servers
- Config files are validated before use

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
