// Pack the release exe with UPX (best ratio) when `upx` is on PATH.
// Skip silently in CI/machines without it — the unpacked exe still works.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const exe = join(dirname(fileURLToPath(import.meta.url)), 'target', 'release', 'encfs-agent.exe');
if (!existsSync(exe)) {
  console.error('encfs-agent.exe not found — run `cargo build --release` first');
  process.exit(1);
}

const before = statSync(exe).size;
const result = spawnSync('upx', ['--best', '--lzma', exe], { encoding: 'utf8' });
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

if (result.error && result.error.code === 'ENOENT') {
  console.log('upx not found — skipping exe compression');
  process.exit(0);
}
if (result.status !== 0) {
  if (/already packed/i.test(output)) {
    console.log('exe already packed');
    process.exit(0);
  }
  console.error(output);
  process.exit(1);
}

const after = statSync(exe).size;
console.log(`exe packed with upx: ${before} -> ${after} bytes (${((1 - after / before) * 100).toFixed(1)}% smaller)`);
