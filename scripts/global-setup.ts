import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const agentPath = join(__dirname, '..', 'encfs-browser-agent', 'encfs-browser-agent.ps1');
const htmlPath = join(__dirname, '..', 'dist', 'encfs-browser.html');

export default async function globalSetup() {
  console.log('Starting PowerShell agent...');

  // Launch agent in background
  const agent = spawn('powershell', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', agentPath,
    '-HtmlPath', htmlPath,
    '-NoBrowser'
  ], {
    stdio: 'pipe'
  });

  // Keep process alive - store in global
  (globalThis as any).__agentProcess = agent;

  // Log output for debugging
  agent.stdout?.on('data', (data) => console.log(`Agent: ${data}`));
  agent.stderr?.on('data', (data) => console.error(`Agent error: ${data}`));

  // Wait for agent to respond
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:8765/api/health');
      if (res.ok) {
        console.log('Agent ready on port 8765');
        return;
      }
    } catch {
      // Not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error('Agent failed to start after 30s');
}
