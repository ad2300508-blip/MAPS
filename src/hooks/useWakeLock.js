import { useEffect, useRef } from 'react';

export function useWakeLock(active) {
  const lockRef = useRef(null);

  useEffect(() => {
    if (!active) {
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
      return;
    }

    if (!('wakeLock' in navigator)) return;

    let cancelled = false;
    navigator.wakeLock.request('screen')
      .then((lock) => {
        if (cancelled) { lock.release().catch(() => {}); return; }
        lockRef.current = lock;
        // Re-acquire on visibility change (lock is released when tab hides)
        lock.addEventListener('release', () => {
          if (cancelled || document.visibilityState !== 'visible') return;
          navigator.wakeLock.request('screen')
            .then((l) => { lockRef.current = l; })
            .catch(() => {});
        });
      })
      .catch(() => {}); // silently ignore (permission denied or not supported)

    return () => {
      cancelled = true;
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}
