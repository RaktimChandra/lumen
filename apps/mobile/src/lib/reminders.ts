import { todayISO } from '@lumen/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from '@/api/client';

const REMINDER_ID = 'lumen-due-tomorrow';
const REMINDER_HOUR = 18;
/** Remembers the day a late reminder was shown, so reopening the app does not repeat it. */
const LAST_SHOWN_KEY = 'lumen.reminder.lastShown';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return todayISO(d);
}

/**
 * Bonus feature: a local notification at 6 pm listing tasks due tomorrow.
 * Scheduled on the device each time the app opens, so it needs no push server.
 * Silently does nothing if permission is declined or the API is unreachable.
 */
export async function scheduleDueTomorrowReminders(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const permission = await Notifications.getPermissionsAsync();
    let granted = permission.granted;
    if (!granted && permission.canAskAgain)
      granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Task reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);

    const tomorrow = tomorrowISO();
    const { data } = await api.tasks.list({
      sort: 'dueDate',
      order: 'asc',
      limit: 100,
      overdue: false,
    });
    const due = data.filter((task) => task.dueDate === tomorrow && task.status !== 'COMPLETED');
    if (due.length === 0) return;

    const at = new Date();
    at.setHours(REMINDER_HOUR, 0, 0, 0);
    if (at.getTime() <= Date.now()) {
      // Past 6 pm: remind once, shortly after opening the app.
      if ((await AsyncStorage.getItem(LAST_SHOWN_KEY)) === todayISO()) return;
      await AsyncStorage.setItem(LAST_SHOWN_KEY, todayISO());
      at.setTime(Date.now() + 60_000);
    }

    const names = due.slice(0, 3).map((task) => task.name);
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: {
        title: due.length === 1 ? '1 task is due tomorrow' : `${due.length} tasks are due tomorrow`,
        body: names.join(', ') + (due.length > 3 ? ` and ${due.length - 3} more` : ''),
        data: { url: '/tasks' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
        channelId: 'reminders',
      },
    });
  } catch {
    // Reminders are best-effort; never block the app.
  }
}
