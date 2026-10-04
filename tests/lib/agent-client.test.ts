import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { probeAgent, agentList, joinAgentPath, shutdownAgent, resetProbeCache } from '../../src/lib/agent-client';

beforeEach(() => {
  resetProbeCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    json: async () => body,
  }) as Response;

describe('probeAgent', () => {
  it('returns null when nothing answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await probeAgent()).toBeNull();
  });

  it('never probes from file:// (console stays clean)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('location', { protocol: 'file:', hostname: '' });
    vi.stubGlobal('fetch', fetchMock);
    expect(await probeAgent()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts the Rust agent on the first candidate and keeps labels', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, name: 'encfs-agent', version: '0.1.0' }))
      .mockResolvedValueOnce(
        jsonResponse({ roots: [{ name: 'C:\\', path: 'C:\\', label: 'Windows' }] }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const info = await probeAgent();
    expect(info).toEqual({ base: 'http://127.0.0.1:8765', roots: [{ path: 'C:\\', label: 'Windows' }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://127.0.0.1:8765/api/health');
  });

  it('accepts the PowerShell twin on a fallback port after a foreign endpoint', async () => {
    const fetchMock = vi
      .fn()
      // a page returning html (vite/spa fallback) is not an agent → keep probing
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('not json');
        },
      } as unknown as Response)
      .mockResolvedValueOnce(jsonResponse({ ok: true, name: 'encfs-agent-ps', version: '1.0.0' }))
      .mockResolvedValueOnce(jsonResponse({ roots: [{ path: 'D:\\', label: null }] }));
    vi.stubGlobal('fetch', fetchMock);

    const info = await probeAgent();
    expect(info?.roots).toEqual([{ path: 'D:\\' }]);
    expect(String(fetchMock.mock.calls[1][0])).toBe('http://127.0.0.1:8766/api/health');
  });

  it('rejects a non-agent endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: false, name: 'other' })));
    expect(await probeAgent()).toBeNull();
  });
});

describe('agentList', () => {
  it('maps entries to FSEntry and joins the path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        path: 'D:\\vol',
        entries: [
          { name: 'sub', isDir: true, size: 0, mtime: 111 },
          { name: 'a.txt', isDir: false, size: 42, mtime: 222 },
          { name: '', isDir: false, size: 1, mtime: 1 },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const entries = await agentList('', 'D:\\vol');
    expect(entries).toEqual([
      { name: 'sub', isDir: true, size: 0, mtime: 111 },
      { name: 'a.txt', isDir: false, size: 42, mtime: 222 },
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `/api/list?path=${encodeURIComponent('D:\\vol')}`,
    );
  });

  it('throws the server error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'cannot read directory' }, false, 404)));
    await expect(agentList('', 'D:\\nope')).rejects.toThrow('cannot read directory');
  });
});

describe('shutdownAgent', () => {
  it('resolves true when the agent accepts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: true })));
    expect(await shutdownAgent('')).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/api/shutdown', expect.anything());
  });

  it('resolves false when unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect(await shutdownAgent('http://127.0.0.1:8765')).toBe(false);
  });
});

describe('joinAgentPath', () => {
  it('joins an absolute dir with a dir-root-relative path', () => {
    expect(joinAgentPath('D:\\vol', '/sub')).toBe('D:\\vol/sub');
    expect(joinAgentPath('D:\\vol\\', '/sub/deep')).toBe('D:\\vol/sub/deep');
    expect(joinAgentPath('D:/vol/', '/')).toBe('D:/vol');
    expect(joinAgentPath('D:\\vol', '')).toBe('D:\\vol');
  });
});
