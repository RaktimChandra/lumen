import { formatDate, initials } from '@lumen/shared';
import Constants from 'expo-constants';
import { LogOut } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { API_URL } from '@/api/client';
import { signOut } from '@/auth/bootstrap';
import { useSession } from '@/auth/useSession';
import { Screen } from '@/components/Screen';
import { Button, Card, Text } from '@/components/ui';
import { usePalette } from '@/theme';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 2 }}>
      <Text variant="caption" tone="inkFaint">
        {label}
      </Text>
      <Text selectable>{value}</Text>
    </View>
  );
}

export default function AccountScreen() {
  const p = usePalette();
  const { user } = useSession();
  const [busy, setBusy] = useState(false);

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You will need to sign in again to see your projects on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          await signOut();
        },
      },
    ]);

  return (
    <Screen title="Account">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: p.violetSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="heading" style={{ color: p.violet }}>
              {user ? initials(user.fullName) : ''}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="heading">{user?.fullName}</Text>
            <Text variant="caption" tone="inkMuted">
              {user?.email}
            </Text>
          </View>
        </Card>
        <Card>
          <Row label="Member since" value={user ? formatDate(user.createdAt.slice(0, 10)) : ''} />
          <View style={{ height: 1, backgroundColor: p.line }} />
          <Row label="Server" value={API_URL.replace(/^https?:\/\//, '')} />
          <View style={{ height: 1, backgroundColor: p.line }} />
          <Row label="App version" value={Constants.expoConfig?.version ?? '1.0.0'} />
        </Card>
        <Text variant="caption" tone="inkMuted" style={{ paddingHorizontal: 4 }}>
          Your sign-in is stored in the Android Keystore. Projects and tasks you have viewed stay
          available offline until you sign out.
        </Text>
        <Button
          title="Sign out"
          variant="secondary"
          icon={<LogOut size={18} color={p.ink} />}
          loading={busy}
          onPress={confirmSignOut}
        />
      </ScrollView>
    </Screen>
  );
}
