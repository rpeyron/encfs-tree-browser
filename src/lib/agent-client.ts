import type { FSEntry } from './fs-scanner';

/** A mount point/drive of the machine running the agent. */
export interface AgentRoot {
  path: string;
  /** Filesystem/volume label when the OS exposes one. */
  label?: string;
}

/** Reachable local agent (Rust `encfs-agent` or `encfs-agent.ps1`). */
export interface AgentInfo {
  /** Base URL, '' when the page itself is served by the agent (same origin). */
  base: string;
  roots: AgentRoot[];
}

const AGENT_NAME = /^encfs-agent(-ps)?$/;
const PORT_CANDIDATES = Array.from({ length: 21 }, (_, i) => 8765 + i);

async function tryProbe(base: string): Promise<AgentInfo | null> {
  try {
    const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(700) });
    if (!health.ok) return null;
    const info = (await health.json()) as { ok?: boolean; name?: string };
    if (!info.ok || !AGENT_NAME.test(String(info.name))) return null;
    const roots = await fetch(`${base}/api/roots`, { signal: AbortSignal.timeout(700) });
    if (!roots.ok) return null;
    const data = (await roots.json()) as {
      roots?: Array<{ path?: string; label?: string | null }>;
    };
    const list: AgentRoot[] = (data.roots ?? [])
      .filter((r) => typeof r.path === 'string' && r.path.length > 0)
      .map((r) => ({
        path: String(r.path),
        ...(r.label ? { label: String(r.label) } : {}),
      }));
    return { base, roots: list };
  } catch {
    return null;
  }
}

let cachedProbe: Promise<AgentInfo | null> | null = null;

/** Reset probe cache (for tests only) */
export function resetProbeCache() {
  cachedProbe = null;
}

/**
 * Probe for the local agent without polluting the console with failed requests:
 * - file:// → never probe (no silent relative fetch possible, noise-free by default)
 * - localhost http (agent same-origin or vite) → relative endpoint first
 * - always try 8765 once; the full port range is only scanned in dev
 * - cached: subsequent calls return the same promise (probe once per page load)
 */
export async function probeAgent(): Promise<AgentInfo | null> {
  if (cachedProbe) return cachedProbe;

  if (typeof location !== 'undefined' && location.protocol === 'file:') return null;

  cachedProbe = (async () => {
    const bases: string[] = [];
    if (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      bases.push('');
    }
    bases.push('http://127.0.0.1:8765');
    if (import.meta.env.DEV) {
      bases.push(...PORT_CANDIDATES.slice(1).map((p) => `http://127.0.0.1:${p}`));
    }
    for (const base of bases) {
      const info = await tryProbe(base);
      if (info) return info;
    }
    return null;
  })();

  return cachedProbe;
}

interface RawEntry {
  name?: string;
  isDir?: boolean;
  size?: number;
  mtime?: number;
}

/** One directory level, same FSEntry shape as the File System Access scanner. */
export async function agentList(base: string, path: string): Promise<FSEntry[]> {
  let res: Response;
  try {
    res = await fetch(`${base}/api/list?path=${encodeURIComponent(path)}`, {
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    // connection refused/reset while talking to the agent
    throw new Error(
      `Local agent request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    entries?: RawEntry[];
  };
  if (!res.ok || data.error) {
    throw new Error(data.error ?? `agent list failed (HTTP ${res.status})`);
  }
  return (data.entries ?? [])
    .filter((e) => typeof e.name === 'string' && e.name.length > 0)
    .map((e) => ({
      name: e.name as string,
      isDir: Boolean(e.isDir),
      size: Number(e.size) || 0,
      mtime: Number(e.mtime) || 0,
    }));
}

/** Ask the local agent to exit gracefully; resolves false when unreachable. */
export async function shutdownAgent(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api/shutdown`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Join an absolute directory with a dir-root-relative path (`/sub`). */
export function joinAgentPath(dir: string, rel: string): string {
  const base = dir.replace(/[/\\]+$/, '');
  const clean = rel.replace(/^[/\\]+/, '');
  return clean ? `${base}/${clean}` : base;
}
