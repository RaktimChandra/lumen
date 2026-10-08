import { CheckCircle2, CircleAlert } from 'lucide-react-native';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, usePalette } from '@/theme';
import { Text } from './ui';

type Toast = { id: number; message: string; tone: 'success' | 'error' };
let current: Toast | null = null;
let counter = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const toast = {
  success(message: string) {
    current = { id: ++counter, message, tone: 'success' };
    emit();
  },
  error(message: string) {
    current = { id: ++counter, message, tone: 'error' };
    emit();
  },
};

/** One short message at a time, announced to screen readers. */
export function ToastHost() {
  const item = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const p = usePalette();

  useEffect(() => {
    if (!item) return;
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    const timer = setTimeout(
      () => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
          if (current?.id === item.id) {
            current = null;
            emit();
          }
        });
      },
      item.tone === 'error' ? 4500 : 2600,
    );
    return () => clearTimeout(timer);
  }, [item, opacity]);

  if (!item) return null;
  const Icon = item.tone === 'success' ? CheckCircle2 : CircleAlert;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: insets.bottom + 72,
        opacity,
        zIndex: 100,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: p.ink,
          borderRadius: radius.panel,
          paddingVertical: 12,
          paddingHorizontal: 14,
        }}
      >
        <Icon size={18} color={item.tone === 'success' ? p.green : p.red} />
        <Text style={{ color: p.canvas, fontFamily: fonts.medium, flex: 1 }}>{item.message}</Text>
      </View>
    </Animated.View>
  );
}
