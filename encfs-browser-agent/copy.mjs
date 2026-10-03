// Copy the agent(s) into dist/ next to the built app.
// - always: the PowerShell twin (self-contained, favicon embedded)
// - only if already built: the Rust exe (never triggers a build)
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

const ps1 = join(root, 'encfs-browser-agent', 'encfs-browser-agent.ps1');
if (existsSync(ps1)) {
  copyFileSync(ps1, join(dist, 'encfs-browser-agent.ps1'));
  console.log(`copied encfs-browser-agent.ps1 -> dist/`);
} else {
  console.log('encfs-browser-agent.ps1 not found — skipped');
}

const exe = join(root, 'encfs-browser-agent', 'target', 'release', 'encfs-browser-agent.exe');
if (existsSync(exe)) {
  copyFileSync(exe, join(dist, 'encfs-browser-agent.exe'));
  console.log(`copied encfs-browser-agent.exe -> dist/`);
} else {
  console.log('encfs-browser-agent.exe not built — skipped (run `npm run build:agent` to build it)');
}
