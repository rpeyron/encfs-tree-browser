# AGENTS.md

## Project

EncFS Tree Browser — React + Vite + TypeScript web app that browses EncFS-encrypted
directory trees (File System Access API) and shows encoded ↔ decoded filenames side by side.

## Docs

- [docs/requirements-functional.md](docs/requirements-functional.md) — features, user flows, out of scope
- [docs/requirements-technical.md](docs/requirements-technical.md) — architecture, key files, code style, constraints, performance, security
- [README.md](README.md) — usage and how the `encfs-filename-codec` npm package is used
- [../encfs-names-ts/README.md](../encfs-names-ts/README.md) — the crypto package (format details: `encfs-algo.md`)

## Hard Rules

- **No crypto in this app**: filename crypto comes only from `encfs-filename-codec`
  (`file:../encfs-names-ts`). Rebuild that package after editing it: `cd ../encfs-names-ts && npm run build`
- **Password**: memory only — passed straight to `EncfsNameCodec.fromV6Xml`, never persisted or logged
- **Plain CSS** in `src/styles/app.css`; no Tailwind or utility frameworks
- **Chrome/Edge only** (File System Access API) — no fallback
- **TypeScript strict, no `any`**; compact code, comments only for non-obvious WHY
- One failed name conversion must never fail the whole scan (keep the raw name)

## Commands

```bash
npm install
npm run dev          # http://localhost:5173
npm run test         # Vitest (must pass: tests/lib/tree-builder.test.ts)
npm run type-check
npm run build        # tsc -b && vite build
```

Before committing: `npm run test`, `npm run type-check`, `npm run build`, then a manual
browser check of the golden path.
