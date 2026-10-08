import { router, useLocalSearchParams } from 'expo-router';
import { ApiError } from '@/api/client';
import { Button, EmptyState, ErrorState, Loading } from '@/components/ui';
import { useTask } from '@/features/queries';
import { TaskForm } from '@/features/TaskForm';

export default function EditTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const task = useTask(id);

  if (task.data) return <TaskForm key={task.data.id} task={task.data} />;
  if (task.isError) {
    if (task.error instanceof ApiError && task.error.status === 404) {
      return (
        <EmptyState
          title="Task not found"
          message="It may have been deleted on another device."
          action={<Button title="Close" onPress={() => router.back()} />}
        />
      );
    }
    return (
      <ErrorState
        offline={task.error instanceof ApiError && task.error.isNetworkError}
        message={task.error.message}
        onRetry={() => void task.refetch()}
      />
    );
  }
  return <Loading />;
}
