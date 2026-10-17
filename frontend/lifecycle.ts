import { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { isAndroid } from './native';

export function useAppActive(onSuspend: () => void) {
  const [active, setActive] = useState(true);
  useEffect(() => {
    let disposed = false;
    const update = (next: boolean) => {
      if (disposed) return;
      if (!next) onSuspend();
      setActive(next);
    };
    const visibility = () => update(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', visibility);
    const listener = isAndroid() ? App.addListener('appStateChange', ({ isActive }) => update(isActive)) : null;
    if (isAndroid()) void App.getState().then(({ isActive }) => update(isActive));
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', visibility);
      if (listener) void listener.then(handle => handle.remove());
    };
  }, [onSuspend]);
  return active;
}
