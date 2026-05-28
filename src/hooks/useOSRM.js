import { useState, useEffect, useRef, useMemo } from 'react';

const BASE = 'https://router.project-osrm.org/route/v1';

// Round to ~100 m precision so GPS jitter doesn't trigger constant refetches
const snap = (n) => Math.round(n * 1000) / 1000;

const DELAYS = [2000, 4000, 8000]; // exponential backoff

export function useOSRM(origin, destination, profile) {
  const [route,   setRoute]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const abortRef   = useRef(null);
  const retryRef   = useRef(0);
  const timerRef   = useRef(null);

  // Snapped origin — stable across GPS micro-updates (~100m grid)
  const snappedOrigin = useMemo(() => {
    if (!origin) return null;
    return [snap(origin[0]), snap(origin[1])];
  }, [origin != null ? snap(origin[0]) : null, origin != null ? snap(origin[1]) : null]);

  useEffect(() => {
    if (!snappedOrigin || !destination) {
      setRoute(null);
      setLoading(false);
      setError(null);
      return;
    }

    retryRef.current = 0;
    clearTimeout(timerRef.current);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const url =
      `${BASE}/${profile}/` +
      `${snappedOrigin[0]},${snappedOrigin[1]};` +
      `${destination[0]},${destination[1]}` +
      `?steps=true&geometries=geojson&overview=full`;

    const attempt = () => {
      setLoading(true);
      setError(null);

      fetch(url, { signal: abortRef.current.signal })
        .then((r) => r.json())
        .then((data) => {
          if (data.code === 'Ok' && data.routes?.length > 0) {
            setRoute(data.routes[0]);
            setError(null);
          } else {
            setRoute(null);
            setError('Percorso non trovato');
          }
          setLoading(false);
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          const retry = retryRef.current;
          if (retry < DELAYS.length) {
            retryRef.current++;
            timerRef.current = setTimeout(attempt, DELAYS[retry]);
            // Keep loading = true while retrying; don't clear existing route
          } else {
            setError('Errore di rete');
            setLoading(false);
          }
        });
    };

    attempt();

    return () => {
      abortRef.current?.abort();
      clearTimeout(timerRef.current);
    };
  }, [
    snappedOrigin?.[0], snappedOrigin?.[1],
    destination?.[0],   destination?.[1],
    profile,
  ]);

  return { route, loading, error };
}
