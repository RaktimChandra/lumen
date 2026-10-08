import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, EmptyState } from '@/components/ui';

export default function NotFound() {
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <EmptyState
        title="This screen doesn't exist"
        action={<Button title="Go to dashboard" onPress={() => router.replace('/')} />}
      />
    </View>
  );
}
