import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.airstudio.purifier',
  appName: 'Air Studio',
  webDir: 'dist',
  loggingBehavior: 'none',
  server: { androidScheme: 'https' },
};
export default config;
