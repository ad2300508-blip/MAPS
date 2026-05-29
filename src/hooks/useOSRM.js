import { useState, useEffect, useRef, useMemo } from 'react';

const BASE = 'https://router.project-osrm.org/route/v1';

// Fine snap: ~100 m (off-route, fast rerouting)
// Coarse snap: ~300 m (on-route, reduces API calls 3x)
const snapFine   = (n) => Math.round(n * 1000) / 1000;
const snapCoarse = (n) => Math.round(n * 333)  / 333;

const DELAYS = [2000, 4000, 8000]; // exponential backoff

export function useOSRM(origin, destination, profile, { fine = true, alternatives = false, exclude = null } = {}) {
  const [route,    setRoute]    = useState(null);
  const [altRoute, setAltRoute] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const abortRef   = useRef(null);
  const retryRef   = useRef(0);
  const timerRef   = useRef(null);

  const snapFn = fine ? snapFine : snapCoarse;

  // Snapped origin — stable across GPS micro-updates
  const snappedOrigin = useMemo(() => {
    if (!origin) return null;
    return [snapFn(origin[0]), snapFn(origin[1])];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin != null ? snapFn(origin[0]) : null, origin != null ? snapFn(origin[1]) : null]);

  useEffect(() => {
    if (!snappedOrigin || !destination) {
      setRoute(null);
      setAltRoute(null);
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
      `?steps=true&geometries=geojson&overview=full&generate_hints=false` +
      `${alternatives ? '&alternatives=true' : ''}` +
      `${exclude ? `&exclude=${exclude}` : ''}`;

    const attempt = () => {
      setLoading(true);
      setError(null);

      fetch(url, { signal: abortRef.current.signal })
        .then((r) => r.json())
        .then((data) => {
          if (data.code === 'Ok' && data.routes?.length > 0) {
            setRoute(data.routes[0]);
            setAltRoute(data.routes[1] ?? null);
            setError(null);
          } else {
            setRoute(null);
            setAltRoute(null);
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
    profile, alternatives, exclude,
  ]);

  return { route, altRoute, loading, error };
}
