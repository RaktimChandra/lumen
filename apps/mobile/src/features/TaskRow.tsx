import {
  describeDue,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type Task,
  type TaskStatus,
} from '@lumen/shared';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { Alert, Platform, Pressable, View } from 'react-native';
import { errorMessage } from '@/api/client';
import { toast } from '@/components/Toast';
import { PriorityBars, StatusChip, Text } from '@/components/ui';
import { fonts, usePalette } from '@/theme';
import { useUpdateTask } from './queries';

export function useSetTaskStatus() {
  const update = useUpdateTask();
  return (task: Task, status: TaskStatus) => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    update.mutate(
      { id: task.id, input: { status } },
      {
        onSuccess: () => status === 'COMPLETED' && toast.success(`Completed “${task.name}”`),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };
}

export function CompleteToggle({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const p = usePalette();
  const done = task.status === 'COMPLETED';
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={done ? `Reopen ${task.name}` : `Mark ${task.name} completed`}
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: done ? p.green : p.lineStrong,
        backgroundColor: done ? p.green : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {done && <Check size={14} color={p.onAccent} strokeWidth={3} />}
    </Pressable>
  );
}

export function TaskRow({ task, showProject = true }: { task: Task; showProject?: boolean }) {
  const p = usePalette();
  const setStatus = useSetTaskStatus();
  const done = task.status === 'COMPLETED';

  const openStatusMenu = () => {
    Alert.alert(task.name, 'Change status', [
      ...TASK_STATUSES.filter((s) => s !== task.status).map((status) => ({
        text: TASK_STATUS_LABELS[status],
        onPress: () => setStatus(task, status),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })}
      onLongPress={openStatusMenu}
      accessibilityRole="button"
      accessibilityLabel={`${task.name}, ${TASK_STATUS_LABELS[task.status]}`}
      accessibilityHint="Opens the task. Long press to change its status."
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: pressed ? p.sunken : 'transparent',
      })}
    >
      <CompleteToggle
        task={task}
        onToggle={() => setStatus(task, done ? 'PENDING' : 'COMPLETED')}
      />
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          variant="label"
          numberOfLines={2}
          style={{
            fontSize: 15,
            color: done ? p.inkMuted : p.ink,
            textDecorationLine: done ? 'line-through' : 'none',
          }}
        >
          {task.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {showProject && (
            <Text variant="caption" tone="inkMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
              {task.projectName}
            </Text>
          )}
          <Text
            variant="caption"
            numberOfLines={1}
            style={{
              flexShrink: 0,
              color: task.isOverdue ? p.red : p.inkMuted,
              fontFamily: task.isOverdue ? fonts.medium : fonts.regular,
            }}
          >
            {describeDue(task.dueDate, done)}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <StatusChip status={task.status} />
        <PriorityBars priority={task.priority} showLabel={false} />
      </View>
    </Pressable>
  );
}

export function Separator() {
  const p = usePalette();
  return <View style={{ height: 1, backgroundColor: p.line, marginLeft: 52 }} />;
}
