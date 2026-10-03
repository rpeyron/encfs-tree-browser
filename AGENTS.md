# AGENTS.md

## Project

EncFS Tree Browser — Preact (React-compatible API) + Vite + TypeScript web app that browses EncFS-encrypted
directory trees (File System Access API) and shows encoded ↔ decoded filenames side by side.

## Docs

- [docs/requirements-functional.md](docs/requirements-functional.md) — features, user flows, out of scope
- [docs/requirements-technical.md](docs/requirements-technical.md) — architecture, key files, code style, constraints, performance, security
- [README.md](README.md) — usage and how the `encfs-filename-codec` npm package is used
- [../encfs-names-ts/README.md](../encfs-names-ts/README.md) — the crypto package (format details: `encfs-algo.md`)

## Hard Rules

- **No crypto in this app**: filename crypto comes only from `encfs-filename-codec`
  (`file:../encfs-names-ts`). Rebuild that package after editing it: `cd ../encfs-names-ts && npm run build`
- **Runtime**: source imports `react` / `react-dom/client`, but `vite.config.ts` aliases
  them to `preact/compat` (+ `preact/compat/client`) — no `react`/`react-dom` packages
  installed, only `@types/react*` for TypeScript. Keep imports React-compatible; JSX uses
  the automatic `preact/jsx-runtime` (the `oxc.jsx` block there is required — prefresh
  would otherwise emit classic `h()`)
- **Password**: memory only by default — passed straight to `EncfsNameCodec.fromV6Xml`,
  never logged; persistence only via the per-config "Remember" opt-in (cleartext localStorage)
- **Plain CSS** in `src/styles/app.css`; no Tailwind or utility frameworks
- **Directory browsing** needs the File System Access API (Chrome/Edge) — the Browse tab
  is hidden elsewhere; list conversions work everywhere via the Convert tab
- **Directory ≠ config**: the directory binding (mount point, mode, source) is separate from the
  EncFS configuration entity (xml + password); one directory per configuration
- **TypeScript strict, no `any`**; compact code, comments only for non-obvious WHY
- One failed name conversion must never fail the whole scan (keep the raw name)

## Commands

```bash
npm install
npm run dev            # http://localhost:5173
npm run test           # Vitest (must pass: tests/lib/*)
npm run type-check
npm run build          # tsc -b && vite build
npm run build:standalone  # single self-contained dist-standalone/encfs-browser.html
npm run build:agent       # standalone + agent\target\release\encfs-agent.exe (embedded app)
```

Before committing: `npm run test`, `npm run type-check`, `npm run build`, then a manual
browser check of the golden path.
