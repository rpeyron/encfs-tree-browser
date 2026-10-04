export default async function globalTeardown() {
  console.log('Stopping PowerShell agent...');

  // Kill the stored process
  const agent = (globalThis as any).__agentProcess;
  if (agent) {
    agent.kill();
    console.log('Agent process killed');
  }

  // Also try API shutdown as backup
  for (let port = 8765; port <= 8785; port++) {
    try {
      await fetch(`http://127.0.0.1:${port}/api/shutdown`);
      console.log(`Agent stopped via API on port ${port}`);
      break;
    } catch {
      // Try next port
    }
  }

  // Wait a bit for cleanup
  await new Promise(resolve => setTimeout(resolve, 500));
}
