import { Capacitor, registerPlugin } from '@capacitor/core';

export const isAndroid = () => Capacitor.getPlatform() === 'android';
export const Purifier = registerPlugin<{
  request(options: { path: string; method: string; body: string }): Promise<{ result: unknown }>;
}>('Purifier');
