import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '@/theme';
import { OfflineBanner } from './OfflineBanner';
import { Text } from './ui';

/** Top-level screen: safe area, offline banner and a large title with optional actions. */
export function Screen({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const p = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: p.canvas, paddingTop: insets.top }}>
      <OfflineBanner />
      {title && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: 12,
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="title" accessibilityRole="header">
              {title}
            </Text>
            {subtitle && (
              <Text variant="caption" tone="inkMuted" style={{ marginTop: 2 }}>
                {subtitle}
              </Text>
            )}
          </View>
          {actions}
        </View>
      )}
      {children}
    </View>
  );
}
