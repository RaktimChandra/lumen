import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * The API the app talks to. Baked in at bundle time; set EXPO_PUBLIC_API_URL to point
 * the app at a local API (Android emulator: http://10.0.2.2:4000).
 */
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'https://lumen-api-x4be.onrender.com';
const allowCleartext = apiUrl.startsWith('http://');

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Lumen',
  slug: 'lumen',
  scheme: 'lumen',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'dev.raktimchandra.lumen',
  },
  android: {
    package: 'dev.raktimchandra.lumen',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundImage: './assets/adaptive-background.png',
      backgroundColor: '#12203a',
    },
    // Only what the app needs: network access and notification permission.
    permissions: ['android.permission.INTERNET', 'android.permission.POST_NOTIFICATIONS'],
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
    ...(allowCleartext ? { usesCleartextTraffic: true } : {}),
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    ['expo-notifications', { icon: './assets/notification-icon.png', color: '#5b3df5' }],
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 160, backgroundColor: '#12203a' },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: { apiUrl },
});
