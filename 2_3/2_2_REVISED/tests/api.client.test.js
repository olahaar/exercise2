import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../src/api';

function makeResponse({ ok, status, jsonImpl }) {
  return {
    ok,
    status,
    json: jsonImpl
  };
}

describe('apiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns guidelines and logs arrays, with empty-array fallback', async () => {
    vi.stubGlobal('fetch', vi
      .fn()
      .mockResolvedValueOnce(makeResponse({
        ok: true,
        status: 200,
        jsonImpl: async () => ({ guidelines: ['g1', 'g2'] })
      }))
      .mockResolvedValueOnce(makeResponse({
        ok: true,
        status: 200,
        jsonImpl: async () => ({})
      }))
    );

    await expect(apiClient.getGuidelines()).resolves.toEqual(['g1', 'g2']);
    await expect(apiClient.getLogs()).resolves.toEqual([]);
  });

  it('createLog and updateReflection send JSON payloads and return entry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse({
        ok: true,
        status: 200,
        jsonImpl: async () => ({ entry: { id: 'e1', prompt: 'hello' } })
      }))
      .mockResolvedValueOnce(makeResponse({
        ok: true,
        status: 200,
        jsonImpl: async () => ({ entry: { id: 'e1', reflection: 'updated' } })
      }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.createLog({ tool: 'ChatGPT', prompt: 'hello' })).resolves.toEqual({
      id: 'e1',
      prompt: 'hello'
    });

    await expect(apiClient.updateReflection('e1', 'updated')).resolves.toEqual({
      id: 'e1',
      reflection: 'updated'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/logs',
      expect.objectContaining({ method: 'POST' })
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/logs/e1/reflection',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('deleteLog resolves on 204 responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse({
      ok: true,
      status: 204,
      jsonImpl: async () => ({})
    }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.deleteLog('abc')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/logs/abc', { method: 'DELETE' });
  });

  it('uses server-provided error message when request fails with JSON error payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({
      ok: false,
      status: 400,
      jsonImpl: async () => ({ error: 'Tool name is required.' })
    })));

    await expect(apiClient.createLog({ tool: '', prompt: 'hello' })).rejects.toThrow('Tool name is required.');
  });

  it('falls back to status-based error when parsed JSON has no usable error text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({
      ok: false,
      status: 422,
      jsonImpl: async () => ({ error: '   ' })
    })));

    await expect(apiClient.getLogs()).rejects.toThrow('Request failed (422)');
  });

  it('falls back to status-based error when failed response body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({
      ok: false,
      status: 503,
      jsonImpl: async () => {
        throw new Error('not json');
      }
    })));

    await expect(apiClient.getDeclaration()).rejects.toThrow('Request failed (503)');
  });
});
