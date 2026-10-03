# EncFS Tree Browser

A web application for viewing and navigating EncFS-encrypted directory trees with
bidirectional filename mapping: encrypted and decrypted names side-by-side, a batch
converter, and a single-file offline build.

## Features

- **Browse** (Chrome/Edge): pick a directory and see decoded names next to their
  encoded counterparts (lazy loading, works on big volumes)
- **Convert**: paste or load a list of names/paths, encode or decode, view the result as
  a table or as the same interactive tree as Browse
- **Swap / Sort**: the primary column matches the names on disk (set automatically);
  ⇄ swaps it, alphabetical sort by the displayed name at the root and in every directory
- **Search & copy**: real-time filter, copy full encoded (📋🔒) or decoded (📋🔓) paths
- **Auto-detect mode**: encoded/decoded is guessed automatically after picking a directory
- **Export**: 📥 CSV / 📥 JSON download of the loaded tree
- **Keyboard**: ↑↓ navigate, →← expand/collapse/parent, Ctrl+F search, Ctrl+C copy, Esc clear
- **Drag & drop**: drop a text file onto the Convert input (xml drag & drop on config upload)
- **Named configurations**: header dropdown with your configs, drop-in `conf/*.encfs6.xml`
  built-ins, and bundled samples; add/edit via modal, optional **Remember password**
- **Mount point**: always visible — a decoded path prefixed in front of the tree root;
  the encoded view encodes every prefix level too (on chainedNameIV volumes with a
  mount set, the root shows the mount path only)
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
npm run build:agent       # standalone + agent\target\release\encfs-agent.exe (embedded app)
```

The standalone html is **self-compressing** (JS/CSS stored gzipped, inflated at boot
via the native `DecompressionStream`): ~42 KB instead of ~97 KB.

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
1. **📂 Select folder…** — once chosen the button label shows the selected full
   path; or **📂 Browse disk…** when the local agent runs. Set the mode with the
   **🔒 Encoded ⇄ 🔓 Decoded** toggle and an optional **mount prefix**, then **🔍 Scan**
2. The tree opens with a root row for the selected directory showing its **complete
   path** both ways (no icon, no toggle — always open); the **primary column matches
   the names on disk**
3. Expand, search, sort, **⇄ Swap** the primary column, **📥 CSV / JSON** export
4. Copy **📋🔒** (encoded) / **📋🔓** (decoded) paths from any row

## GitHub Pages

`.github/workflows/deploy-pages.yml` (in **this** repo) builds the standalone bundle
on every push to `main`/`master` and publishes it as the site `index.html` — no manual
setup beyond:

1. Publish the codec repo as **`<your-account>/encfs-names-ts`** (public) — the
   workflow checks it out automatically as a sibling of this repo, which is what the
   dependency `file:../encfs-names-ts` resolves to. Renamed/private? set the repo
   variable **`ENCFS_NAMES_REPO`** to `<owner>/<name>` (a PAT would be required if private)
2. Settings → Pages → Source: **GitHub Actions**
3. Note: `conf/` is gitignored — drop-in configs are local only unless you
   `git add -f conf/xxxx.encfs6.xml` (they would then be inlined into the published page)

## Local agent (unrestricted directory access)

`agent/` contains a tiny zero-dependency Rust server that removes the File System
Access API limits: it lists **any directory the OS user can read** (hidden, system,
UNC…), knows the **absolute path**, serves the app itself, and opens your browser.

```bash
npm run build:agent      # standalone html + cargo --release + upx (when available)
agent\target\release\encfs-agent.exe   # single packed file to distribute (~199 KB)
```

- **Distribute only `encfs-agent.exe`**: the html is embedded **gzipped**
  (`Content-Encoding: gzip`, browser inflates natively; flate2 used at build time
  only) and the exe is **packed with UPX** (`agent/compress.mjs`, skipped when upx is
  not installed — some antivirus tools flag UPX-packed binaries, unpack then if needed);
  it binds `127.0.0.1:8765` (fallback → 8785), writes `agent.log` next to itself
  (URL + events; no console window), auto-opens `http://127.0.0.1:8765/`
- **In-app controls**: **⏹ Stop** sits right of **🔍 Scan** (translucent, **red
  label**) — calls `/api/shutdown`, the server exits, and the UI falls back to the
  browser picker automatically
- **In the app**: when the agent answers (served by it, or port 8765), Browse
  replaces the File System Access picker with **« 📂 Browse disk… »** — an in-page
  explorer (drive dropdown **with volume labels when the OS reports them**, e.g.
  `D:\ — Data`; typed paths for UNC/mounts, subfolder navigation) ending with
  **⬇ Use this directory**; mode auto-detected, the button label shows the absolute
  path, scan/expand go through the agent, the root row shows the full path.
  The **Browse tab re-probes the agent** each time it is opened: if it stopped
  answering, the UI returns to the browser picker
- **Multiplatform (Rust)**: Windows, Linux and macOS — verified with
  `cargo check` on `x86_64-unknown-linux-gnu` and `x86_64-apple-darwin`.
  Roots = drives (Windows: volume labels via one cached PowerShell call, best-effort)
  or `/` + real mounts from `/proc/mounts` (Linux). The **PowerShell twin is
  Windows-only**
- **Security**: read-only GET API, localhost only, `Host`/`Origin` guards (blocks DNS
  rebinding / third-party sites), no `..` paths
- **Stopping the server** (no window in release): `curl http://127.0.0.1:8765/api/shutdown`
  (or `Invoke-RestMethod http://127.0.0.1:8765/api/shutdown`), port fallback → 8785;
  fallback: task manager → `encfs-agent.exe` → End task, or
  `taskkill /IM encfs-agent.exe /F`. Same endpoint works on the PowerShell twin
- **PowerShell twin** (no Rust toolchain): `agent\encfs-agent.ps1` behaves the same
  — distribute it **with `encfs-browser.html` beside it**, run hidden:
  `powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File encfs-agent.ps1`

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
