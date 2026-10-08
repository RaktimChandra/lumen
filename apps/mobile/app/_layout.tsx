// Import single weights so only the fonts the app uses are bundled.
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans/400Regular';
import { InstrumentSans_500Medium } from '@expo-google-fonts/instrument-sans/500Medium';
import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold';
import { InstrumentSans_700Bold } from '@expo-google-fonts/instrument-sans/700Bold';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { bootstrapSession } from '@/auth/bootstrap';
import { useSession } from '@/auth/useSession';
import { ToastHost } from '@/components/Toast';
import { clearCachedData, persistOptions, queryClient } from '@/lib/query';
import { usePalette } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  });
  const { status } = useSession();
  const palette = usePalette();
  const scheme = useColorScheme();

  useEffect(() => {
    void bootstrapSession();
  }, []);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(palette.canvas);
  }, [palette.canvas]);

  // Whatever ended the session (sign-out, expiry, revocation), drop cached data.
  useEffect(() => {
    if (status === 'anonymous') void clearCachedData();
  }, [status]);

  const ready = fontsLoaded && status !== 'loading';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  const signedIn = status === 'authenticated';
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.canvas } }}
        >
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
        <ToastHost />
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
