# EncFS Tree Browser

A web application for viewing and navigating EncFS-encrypted directory trees with
bidirectional filename mapping: encrypted and decrypted names side-by-side, a batch
converter, and a single-file offline build.

## Features

- **Browse** (Chrome/Edge): pick a directory, see decoded names next to their encoded
  counterparts (lazy loading, works on big volumes)
- **Convert**: paste or load a list of names/paths, encode or decode, view the result as
  a table or as the same interactive tree as Browse
- **Swap / Sort**: flip which representation is the primary column; alphabetical sort by
  the displayed name at the root and in every directory
- **Search & copy**: real-time filter, copy full encoded (📋🔒) or decoded (📋🔓) paths
- **Named configurations**: header dropdown with your configs, drop-in `conf/*.encfs6.xml`
  built-ins, and bundled samples; add/edit via modal, optional **Remember password**
- **Mount point**: shown only when the config enables name chaining, grafts the selected
  directory at the right place in the tree
- **Persistence**: configs, directory setup and display preferences survive reloads
- **Dark mode**: follows the system light/dark preference
- **Standalone build**: one self-contained HTML file that runs offline

## Requirements

- **Directory browsing**: Chrome 90+ or Edge 90+ (File System Access API) — the Browse
  tab only appears there. The Convert tab works in any modern browser
- An **EncFS volume**: its directory, password, and `.encfs6.xml` config file

## Getting Started

```bash
npm install          # links file:../encfs-names-ts and builds it
npm run dev          # http://localhost:5173
npm run test         # unit tests (crypto tests live in ../encfs-names-ts)
npm run build        # dist/
npm run build:standalone   # dist-standalone/encfs-browser.html (single file, offline)
```

### Embedding an .encfs6.xml in the standalone build

1. Drop your config in `conf/xxxx.encfs6.xml` (`conf/` is gitignored)
2. Run `npm run build:standalone` — `xxxx` appears in the dropdown of
   `dist-standalone/encfs-browser.html`, XML inlined

Alternatively, open the standalone file and use **➕ Add configuration…**: the config is
then stored in that browser's localStorage for the `file://` origin.

## Usage

### Header
- **Configuration cluster** (before the tabs): dropdown — last used config on reopening,
  **"Select or add configuration…"** the first time — then **✏️ Edit / 🔒** and the
  password field. The last dropdown entry, **➕ Add configuration…**, opens the modal
  (name, xml, Remember password, delete)
- Tabs **⚡ Convert | 🌳 Browse** follow; on Browse, the directory line sits to their right

### Convert tab
- Paste names/paths (one per line), load a file, or **📄 Sample list** (loads the list
  matching the selected direction)
- Choose Decode or Encode → **☰ Table** or **🌳 Tree** view, **📋 Copy all**

### Browse tab (Chrome/Edge)
1. **📂 Select directory…**, set the mode (mount point appears only for chainedNameIV
   configs), **🔍 Scan**
2. Expand, search, sort, **⇄ Swap** the primary column
3. Copy **📋🔒** (encoded) / **📋🔓** (decoded) paths from any row

## Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome 90+ | ✅ Full | Browse + Convert |
| Edge 90+ | ✅ Full | Browse + Convert |
| Firefox | ⚠️ Convert only | No File System Access API |
| Safari | ⚠️ Convert only | No File System Access API |

## Security

- Passwords stay in memory only; the per-config **Remember** checkbox is an explicit
  opt-in that stores them in cleartext localStorage
- All crypto runs through the Web Crypto API inside
  [`encfs-filename-codec`](../encfs-names-ts); no data leaves the browser
- Config files are validated on load (MAC check rejects a wrong password)

## Documentation & Contributing

- [AGENTS.md](AGENTS.md) — hard rules and commands
- [docs/requirements-functional.md](docs/requirements-functional.md) — features and user flows
- [docs/requirements-technical.md](docs/requirements-technical.md) — architecture, codec
  wiring, storage keys, build sizes, code style
- Crypto details: [`encfs-names-ts`](../encfs-names-ts) (README + `docs/encfs-algo.md`)

Before committing: `npm run test`, `npm run type-check`, `npm run build`, then check the
golden path in a browser.

## License

This project was created as an educational tool for EncFS exploration.

## Resources

- [EncFS Documentation](https://vgough.github.io/encfs/)
- [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
