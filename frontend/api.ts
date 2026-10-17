import { isAndroid, Purifier } from './native';
export type Device = { id: string; name: string; ip: string; model: string };
export type Reading = {
  power: boolean | null; aqi: number | null; temperature: number | null; humidity: number | null;
  filter_life_remaining: number | null; filter_hours_used: number | null; motor_speed: number | null;
  mode: string | null; favorite_level: number | null; child_lock: boolean | null; buzzer: boolean | null;
  timestamp: string; capabilities: string[]; modes: string[];
};
export type Action = 'power' | 'mode' | 'favorite_level' | 'child_lock' | 'buzzer' | 'reset_filter';
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  if (isAndroid()) {
    const response = await Purifier.request({ path, method: options?.method ?? 'GET', body: typeof options?.body === 'string' ? options.body : '{}' });
    return response.result as T;
  }
  const response = await fetch('/api' + path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers }, signal: options?.signal ?? AbortSignal.timeout(25000) });
  if (!response.ok) {
    let message = 'The local backend is unavailable. Check that it is running.';
    try {
      const body = await response.json();
      message = typeof body.detail === 'string' ? body.detail : body.detail?.map((x: { msg: string }) => x.msg).join(' · ') || message;
    } catch { /* Proxy errors may not contain JSON. */ }
    throw new Error(message);
  }
  return response.status === 204 ? undefined as T : response.json();
}
export const demoDevices: Device[] = [
  { id: 'demo-living', name: 'Living room', ip: '192.168.1.42', model: 'zhimi.airpurifier.mb3' },
  { id: 'demo-bedroom', name: 'Bedroom', ip: '192.168.1.43', model: 'zhimi.airp.mb5' },
];
export function demoReading(index: number): Reading {
  return { power: true, aqi: index ? 8 : 12, temperature: 24.6, humidity: 48, filter_life_remaining: index ? 86 : 72,
    filter_hours_used: 684, motor_speed: 740, mode: index ? 'silent' : 'auto', favorite_level: 5, child_lock: false,
    buzzer: true, timestamp: new Date().toISOString(), capabilities: ['favorite_level', 'child_lock', 'buzzer', 'reset_filter'], modes: ['auto', 'silent', 'favorite'] };
}
export function demoHistory(reading: Reading): Reading[] {
  return Array.from({ length: 30 }, (_, index) => ({ ...reading, aqi: Math.round(12 + Math.sin(index * .6) * 3 + Math.max(0, 18 - index)), timestamp: new Date(Date.now() - (29 - index) * 60000).toISOString() }));
}
