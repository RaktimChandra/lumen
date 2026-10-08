import { zodResolver } from '@hookform/resolvers/zod';
import {
  createTaskSchema,
  formatDate,
  LIMITS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  todayISO,
  type Task,
} from '@lumen/shared';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { z } from 'zod';
import { ApiError, errorMessage } from '@/api/client';
import { OfflineBanner } from '@/components/OfflineBanner';
import { toast } from '@/components/Toast';
import { Button, Text, TextField } from '@/components/ui';
import { fonts, radius, usePalette } from '@/theme';
import { useCreateTask, useDeleteTask, useProjects, useUpdateTask } from './queries';

type FormValues = z.input<typeof createTaskSchema>;
const FIELDS = ['projectId', 'name', 'description', 'priority', 'status', 'dueDate'] as const;

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

/** Single-choice segmented control rendered as accessible radio buttons. */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label" style={{ fontSize: 13 }}>
        {label}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{
          flexDirection: 'row',
          backgroundColor: p.sunken,
          borderRadius: radius.control,
          padding: 3,
          gap: 3,
        }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              style={{
                flex: 1,
                height: 38,
                borderRadius: radius.control - 2,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? p.surface : 'transparent',
                borderWidth: selected ? 1 : 0,
                borderColor: p.line,
              }}
            >
              <Text
                style={{
                  fontFamily: selected ? fonts.semibold : fonts.medium,
                  fontSize: 13,
                  color: selected ? p.ink : p.inkMuted,
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const DATE_SHORTCUTS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In a week', days: 7 },
];

export function TaskForm({ task, projectId }: { task?: Task; projectId?: string }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const projects = useProjects({ limit: 100, sort: 'name', order: 'asc' });
  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();

  const form = useForm<FormValues, unknown, z.output<typeof createTaskSchema>>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      projectId: task?.projectId ?? projectId ?? '',
      name: task?.name ?? '',
      description: task?.description ?? '',
      priority: task?.priority ?? 'MEDIUM',
      status: task?.status ?? 'PENDING',
      dueDate: task?.dueDate ?? '',
    },
  });
  const { errors, isSubmitting } = form.formState;

  // Pick the only project automatically when there is just one.
  useEffect(() => {
    const list = projects.data?.data;
    if (!task && !form.getValues('projectId') && list?.length === 1)
      form.setValue('projectId', list[0]!.id);
  }, [projects.data, task, form]);

  const submit = form.handleSubmit(async (values) => {
    try {
      if (task) await update.mutateAsync({ id: task.id, input: values });
      else await create.mutateAsync(values);
      toast.success(task ? 'Task saved' : 'Task added');
      router.back();
    } catch (error) {
      if (error instanceof ApiError && error.details.length) {
        for (const d of error.details) {
          if ((FIELDS as readonly string[]).includes(d.path))
            form.setError(d.path as (typeof FIELDS)[number], { message: d.message });
        }
      } else if (error instanceof ApiError && error.code === 'NOT_FOUND') {
        form.setError('projectId', {
          message: 'That project no longer exists. Choose another one.',
        });
      } else {
        toast.error(errorMessage(error));
      }
    }
  });

  const confirmDelete = () => {
    if (!task) return;
    Alert.alert('Delete this task?', `“${task.name}” will be removed on every device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          remove.mutate(task.id, {
            onSuccess: () => {
              toast.success('Task deleted');
              router.back();
            },
            onError: (error) => toast.error(errorMessage(error)),
          }),
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: p.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Controller
          control={form.control}
          name="name"
          render={({ field }) => (
            <TextField
              label="Task name"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.name?.message}
              placeholder="e.g. Align the 785 nm laser"
              maxLength={LIMITS.taskName.max}
              autoFocus={!task}
            />
          )}
        />

        <Controller
          control={form.control}
          name="projectId"
          render={({ field }) => (
            <View style={{ gap: 6 }}>
              <Text variant="label" style={{ fontSize: 13 }}>
                Project
              </Text>
              {projects.isPending ? (
                <Text variant="caption" tone="inkMuted">
                  Loading projects…
                </Text>
              ) : (projects.data?.data.length ?? 0) === 0 ? (
                <Text variant="caption" tone="inkMuted">
                  You have no projects yet. Create one on the Lumen web app first.
                </Text>
              ) : (
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Project"
                  style={{ gap: 6 }}
                >
                  {projects.data!.data.map((project) => {
                    const selected = field.value === project.id;
                    return (
                      <Pressable
                        key={project.id}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        onPress={() => field.onChange(project.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          minHeight: 44,
                          paddingHorizontal: 14,
                          borderRadius: radius.control,
                          borderWidth: 1,
                          borderColor: selected ? p.violet : p.line,
                          backgroundColor: selected ? p.violetSoft : p.surface,
                        }}
                      >
                        <View
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 8,
                            borderWidth: selected ? 5 : 1.5,
                            borderColor: selected ? p.violet : p.lineStrong,
                          }}
                        />
                        <Text
                          style={{ flex: 1, fontFamily: selected ? fonts.semibold : fonts.regular }}
                          numberOfLines={1}
                        >
                          {project.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {errors.projectId?.message && (
                <Text variant="caption" tone="red">
                  {errors.projectId.message}
                </Text>
              )}
            </View>
          )}
        />

        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <Segmented
              label="Status"
              options={TASK_STATUSES.map((v) => ({ value: v, label: TASK_STATUS_LABELS[v] }))}
              value={field.value ?? 'PENDING'}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={form.control}
          name="priority"
          render={({ field }) => (
            <Segmented
              label="Priority"
              options={TASK_PRIORITIES.map((v) => ({ value: v, label: TASK_PRIORITY_LABELS[v] }))}
              value={field.value ?? 'MEDIUM'}
              onChange={field.onChange}
            />
          )}
        />

        <Controller
          control={form.control}
          name="dueDate"
          render={({ field }) => {
            const value = typeof field.value === 'string' ? field.value : '';
            return (
              <View style={{ gap: 8 }}>
                <TextField
                  label="Due date (optional)"
                  value={value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="YYYY-MM-DD"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  error={errors.dueDate?.message}
                  hint={value && !errors.dueDate ? formatDate(value, '') : undefined}
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {DATE_SHORTCUTS.map((shortcut) => (
                    <Button
                      key={shortcut.label}
                      title={shortcut.label}
                      compact
                      onPress={() => field.onChange(addDays(shortcut.days))}
                    />
                  ))}
                  {value ? (
                    <Button
                      title="Clear"
                      compact
                      variant="ghost"
                      onPress={() => field.onChange('')}
                    />
                  ) : null}
                </View>
              </View>
            );
          }}
        />

        <Controller
          control={form.control}
          name="description"
          render={({ field }) => (
            <TextField
              label="Description (optional)"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.description?.message}
              multiline
              numberOfLines={4}
              maxLength={LIMITS.description.max}
              style={{ minHeight: 96, paddingTop: 12, textAlignVertical: 'top' }}
              placeholder="Notes, links, acceptance criteria"
            />
          )}
        />

        <Button
          title={task ? 'Save changes' : 'Add task'}
          variant="primary"
          loading={isSubmitting}
          onPress={() => void submit()}
        />
        {task && (
          <Button
            title="Delete task"
            variant="ghost"
            onPress={confirmDelete}
            loading={remove.isPending}
            style={{ marginTop: -6 }}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
