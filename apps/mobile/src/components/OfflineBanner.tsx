import { WifiOff } from 'lucide-react-native';
import { View } from 'react-native';
import { useSession } from '@/auth/useSession';
import { useIsOnline } from '@/lib/useNetwork';
import { usePalette } from '@/theme';
import { Text } from './ui';

/** Shown whenever the device is offline or the server could not be reached at launch. */
export function OfflineBanner() {
  const online = useIsOnline();
  const { offline: serverUnreachable } = useSession();
  const p = usePalette();
  if (online && !serverUnreachable) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: p.amberSoft,
        paddingHorizontal: 16,
        paddingVertical: 9,
      }}
    >
      <WifiOff size={16} color={p.amber} />
      <Text variant="caption" style={{ color: p.amber, flex: 1 }}>
        {online
          ? "Can't reach the server. Showing saved data; changes are paused."
          : 'No internet connection. Showing saved data; changes are paused.'}
      </Text>
    </View>
  );
}
