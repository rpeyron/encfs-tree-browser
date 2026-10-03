// Copy the agent(s) into dist/ next to the built app.
// - always: the PowerShell twin (self-contained, favicon embedded)
// - only if already built: the Rust exe (never triggers a build)
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

const ps1 = join(root, 'agent', 'encfs-agent.ps1');
copyFileSync(ps1, join(dist, 'encfs-agent.ps1'));
console.log(`copied encfs-agent.ps1 -> dist/`);

const exe = join(root, 'agent', 'target', 'release', 'encfs-agent.exe');
if (existsSync(exe)) {
  copyFileSync(exe, join(dist, 'encfs-agent.exe'));
  console.log(`copied encfs-agent.exe -> dist/`);
} else {
  console.log('encfs-agent.exe not built — skipped (run `npm run build:agent` to build it)');
}
