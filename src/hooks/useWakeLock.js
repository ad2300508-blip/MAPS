import { useEffect, useRef } from 'react';

export function useWakeLock(active) {
  const lockRef    = useRef(null);
  const cancelRef  = useRef(false);

  useEffect(() => {
    if (!active) {
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
      return;
    }

    if (!('wakeLock' in navigator)) return;

    cancelRef.current = false;

    // Recursive acquire so every released lock sets up a new release listener,
    // handling the case where the screen turns off more than once per session.
    const acquire = async () => {
      if (cancelRef.current) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelRef.current) { lock.release().catch(() => {}); return; }
        lockRef.current = lock;
        lock.addEventListener('release', () => {
          lockRef.current = null;
          if (!cancelRef.current && document.visibilityState === 'visible') acquire();
        });
      } catch { /* permission denied or not supported */ }
    };

    acquire();

    return () => {
      cancelRef.current = true;
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}
