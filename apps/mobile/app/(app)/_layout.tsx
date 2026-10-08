import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { scheduleDueTomorrowReminders } from '@/lib/reminders';
import { usePalette } from '@/theme';

export default function AppLayout() {
  const p = usePalette();

  useEffect(() => {
    void scheduleDueTomorrowReminders();
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: p.canvas },
        headerStyle: { backgroundColor: p.canvas },
        headerTintColor: p.ink,
        headerTitleStyle: { fontFamily: 'InstrumentSans_600SemiBold' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="project/[id]" options={{ headerShown: true, title: '' }} />
      <Stack.Screen
        name="task/new"
        options={{ presentation: 'modal', headerShown: true, title: 'New task' }}
      />
      <Stack.Screen
        name="task/[id]"
        options={{ presentation: 'modal', headerShown: true, title: 'Edit task' }}
      />
    </Stack>
  );
}
