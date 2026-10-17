import { describe, expect, it, vi, afterEach } from 'vitest';
import { api, demoReading } from './api';
import { isAndroid, Purifier } from './native';
vi.mock('./native', () => ({ isAndroid: vi.fn(() => false), Purifier: { request: vi.fn() } }));
afterEach(() => { vi.unstubAllGlobals(); vi.mocked(isAndroid).mockReturnValue(false); });
describe('API transport', () => {
  it('uses the on-phone bridge without an HTTP backend on Android', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(Purifier.request).mockResolvedValue({ result: [{ id: 'native' }] });
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect(await api('/devices')).toEqual([{ id: 'native' }]);
    expect(Purifier.request).toHaveBeenCalledWith({ path: '/devices', method: 'GET', body: '{}' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('reports native failures without switching transports', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(Purifier.request).mockRejectedValue(new Error('Purifier did not respond'));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(api('/devices/id/status')).rejects.toThrow('Purifier did not respond');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('reports backend validation errors in readable form', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: [{ msg: 'Invalid token' }] }), { status: 422 })));
    await expect(api('/devices')).rejects.toThrow('Invalid token');
  });
  it('handles a deleted device with an empty response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    expect(await api('/devices/id', { method: 'DELETE' })).toBeUndefined();
  });
  it('keeps demo state isolated between devices', () => {
    const a = demoReading(0), b = demoReading(1); a.power = false;
    expect(b.power).toBe(true); expect(a.aqi).not.toBe(b.aqi);
  });
});
