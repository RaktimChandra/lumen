import {
  PROJECT_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type ProjectStatus,
  type ProjectTaskStats,
  type TaskPriority,
  type TaskStatus,
} from '@lumen/shared';
import { AlertTriangle, RotateCw, Search, WifiOff, X } from 'lucide-react-native';
import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { fonts, priorityTone, radius, statusTone, usePalette, type Palette } from '@/theme';

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

type Variant = 'title' | 'heading' | 'body' | 'label' | 'caption' | 'number';

const variants: Record<Variant, TextStyle> = {
  title: { fontFamily: fonts.semibold, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  number: {
    fontFamily: fonts.semibold,
    fontSize: 28,
    lineHeight: 32,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
};

export function Text({
  variant = 'body',
  tone = 'ink',
  style,
  ...rest
}: TextProps & { variant?: Variant; tone?: keyof Palette }) {
  const palette = usePalette();
  return (
    <RNText
      {...rest}
      style={[variants[variant], { color: palette[tone] }, style]}
      maxFontSizeMultiplier={1.6}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export function Button({
  title,
  variant = 'secondary',
  loading,
  icon,
  style,
  disabled,
  compact,
  ...rest
}: ButtonProps) {
  const p = usePalette();
  const bg =
    variant === 'primary'
      ? p.violet
      : variant === 'danger'
        ? p.red
        : variant === 'ghost'
          ? 'transparent'
          : p.surface;
  const fg = variant === 'primary' || variant === 'danger' ? p.onAccent : p.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          height: compact ? 38 : 48,
          paddingHorizontal: compact ? 12 : 18,
          borderRadius: radius.control,
          backgroundColor: bg,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: p.lineStrong,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : icon}
      <Text variant="label" style={{ color: fg, fontSize: compact ? 14 : 15 }}>
        {title}
      </Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

interface FieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  right?: ReactNode;
}

export const TextField = forwardRef<TextInput, FieldProps>(function TextField(
  { label, error, hint, right, style, ...rest },
  ref,
) {
  const p = usePalette();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label" style={{ fontSize: 13 }}>
        {label}
      </Text>
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={p.inkFaint}
          style={[
            {
              minHeight: 48,
              borderWidth: 1,
              borderColor: error ? p.red : p.lineStrong,
              borderRadius: radius.control,
              paddingHorizontal: 14,
              paddingRight: right ? 48 : 14,
              backgroundColor: p.surface,
              color: p.ink,
              fontFamily: fonts.regular,
              fontSize: 16,
            },
            style,
          ]}
          {...rest}
        />
        {right && <View style={{ position: 'absolute', right: 4 }}>{right}</View>}
      </View>
      {error ? (
        <Text variant="caption" tone="red" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="inkMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

export function SearchBar({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
}) {
  const p = usePalette();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 44,
        borderRadius: radius.control,
        backgroundColor: p.surface,
        borderWidth: 1,
        borderColor: p.line,
        paddingHorizontal: 12,
        gap: 8,
      }}
    >
      <Search size={18} color={p.inkFaint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={p.inkFaint}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        maxLength={100}
        style={{
          flex: 1,
          color: p.ink,
          fontFamily: fonts.regular,
          fontSize: 16,
          paddingVertical: 0,
        }}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} accessibilityLabel="Clear search" hitSlop={10}>
          <X size={16} color={p.inkFaint} />
        </Pressable>
      )}
    </View>
  );
}

/** Horizontal set of selectable chips; selecting the active chip clears it. */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
  label: string;
}) {
  const p = usePalette();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(selected ? null : option.value)}
            style={{
              height: 34,
              paddingHorizontal: 12,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: selected ? p.violet : p.line,
              backgroundColor: selected ? p.violetSoft : p.surface,
              justifyContent: 'center',
            }}
          >
            <Text variant="label" style={{ fontSize: 13, color: selected ? p.violet : p.inkMuted }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Status, priority, progress                                          */
/* ------------------------------------------------------------------ */

export function StatusChip({ status }: { status: TaskStatus | ProjectStatus }) {
  const p = usePalette();
  const tone = statusTone[status];
  const label =
    status in TASK_STATUS_LABELS
      ? TASK_STATUS_LABELS[status as TaskStatus]
      : PROJECT_STATUS_LABELS[status as ProjectStatus];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 24,
        paddingHorizontal: 9,
        borderRadius: radius.pill,
        backgroundColor: p[tone.bg],
        alignSelf: 'flex-start',
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: p[tone.fg] }} />
      <Text variant="caption" style={{ fontFamily: fonts.medium, fontSize: 12, color: p[tone.fg] }}>
        {label}
      </Text>
    </View>
  );
}

/** Signal bars plus label so priority never depends on colour alone. */
export function PriorityBars({
  priority,
  showLabel = true,
}: {
  priority: TaskPriority;
  showLabel?: boolean;
}) {
  const p = usePalette();
  const level = priority === 'HIGH' ? 3 : priority === 'MEDIUM' ? 2 : 1;
  const color = p[priorityTone[priority]];
  return (
    <View
      accessible
      accessibilityLabel={`${TASK_PRIORITY_LABELS[priority]} priority`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12 }}>
        {[1, 2, 3].map((bar) => (
          <View
            key={bar}
            style={{
              width: 3,
              height: bar * 4,
              borderRadius: 1,
              backgroundColor: bar <= level ? color : p.lineStrong,
            }}
          />
        ))}
      </View>
      {showLabel && (
        <Text variant="caption" tone="inkMuted" style={{ fontSize: 12 }}>
          {TASK_PRIORITY_LABELS[priority]}
        </Text>
      )}
    </View>
  );
}

export function Beam({ stats, height = 6 }: { stats: ProjectTaskStats; height?: number }) {
  const p = usePalette();
  const pct = (n: number) => (stats.total === 0 ? 0 : (n / stats.total) * 100);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${stats.progress}% complete, ${stats.completed} of ${stats.total} tasks`}
      accessibilityValue={{ min: 0, max: 100, now: stats.progress }}
      style={{
        height,
        borderRadius: height,
        backgroundColor: p.sunken,
        flexDirection: 'row',
        overflow: 'hidden',
      }}
    >
      <View style={{ width: `${pct(stats.completed)}%`, backgroundColor: p.green }} />
      <View
        style={{ width: `${pct(stats.inProgress)}%`, backgroundColor: p.blue, opacity: 0.75 }}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Layout and states                                                   */
/* ------------------------------------------------------------------ */

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return (
    <View
      style={[
        {
          backgroundColor: p.surface,
          borderRadius: radius.panel,
          borderWidth: 1,
          borderColor: p.line,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 6 }}>
      <Text variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {message && (
        <Text variant="caption" tone="inkMuted" style={{ textAlign: 'center', maxWidth: 300 }}>
          {message}
        </Text>
      )}
      {action && <View style={{ marginTop: 14 }}>{action}</View>}
    </View>
  );
}

export function ErrorState({
  offline,
  message,
  onRetry,
}: {
  offline: boolean;
  message: string;
  onRetry: () => void;
}) {
  const p = usePalette();
  const Icon = offline ? WifiOff : AlertTriangle;
  return (
    <View
      accessibilityRole="alert"
      style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 8 }}
    >
      <Icon size={26} color={p.red} />
      <Text variant="heading" style={{ textAlign: 'center' }}>
        {offline ? 'No internet connection' : "This didn't load"}
      </Text>
      <Text variant="caption" tone="inkMuted" style={{ textAlign: 'center', maxWidth: 300 }}>
        {offline
          ? 'Connect to the internet and try again. Data you viewed before is still available.'
          : message}
      </Text>
      <Button
        title="Try again"
        icon={<RotateCw size={16} color={p.ink} />}
        onPress={onRetry}
        style={{ marginTop: 10 }}
        compact
      />
    </View>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  const p = usePalette();
  return (
    <View accessibilityLabel={label} style={{ paddingVertical: 48, alignItems: 'center' }}>
      <ActivityIndicator color={p.violet} />
    </View>
  );
}
