import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/** `false` only when the device reports no connection, so the first render is not a false alarm. */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        setOnline(state.isConnected !== false);
      }),
    [],
  );
  return online;
}
