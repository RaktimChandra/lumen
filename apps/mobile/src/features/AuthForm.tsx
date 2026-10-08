import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '@/components/ui';
import { radius, spectrum, usePalette } from '@/theme';

export function SpectrumLine({ height = 3 }: { height?: number }) {
  return (
    <Svg width="100%" height={height}>
      <Defs>
        <LinearGradient id="spectrum" x1="0" x2="1" y1="0" y2="0">
          {spectrum.map((color, i) => (
            <Stop key={color} offset={i / (spectrum.length - 1)} stopColor={color} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect width="100%" height={height} fill="url(#spectrum)" />
    </Svg>
  );
}

export function LogoMark({ size = 36 }: { size?: number }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 4,
          backgroundColor: p.ink,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Text
          style={{
            color: p.canvas,
            fontSize: size * 0.55,
            lineHeight: size * 0.7,
            fontFamily: 'InstrumentSans_700Bold',
          }}
        >
          L
        </Text>
        <View
          style={{
            position: 'absolute',
            bottom: size * 0.12,
            left: size * 0.2,
            right: size * 0.2,
            height: 3,
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <SpectrumLine />
        </View>
      </View>
      <Text variant="heading" style={{ fontSize: 19 }}>
        Lumen
      </Text>
    </View>
  );
}

export function AuthScreen({
  title,
  subtitle,
  notice,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  notice?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingTop: insets.top }}>
        <SpectrumLine />
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: 24,
          paddingTop: 40,
          paddingBottom: insets.bottom + 24,
          gap: 28,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <LogoMark />
        <View style={{ gap: 6 }}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          <Text tone="inkMuted">{subtitle}</Text>
        </View>
        {notice}
        <View style={{ gap: 16 }}>{children}</View>
        <View>{footer}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Notice({ tone, children }: { tone: 'red' | 'amber'; children: string }) {
  const p = usePalette();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: tone === 'red' ? p.redSoft : p.amberSoft,
        borderRadius: radius.control,
        padding: 12,
      }}
    >
      <Text variant="caption" style={{ color: tone === 'red' ? p.red : p.amber, fontSize: 14 }}>
        {children}
      </Text>
    </View>
  );
}
