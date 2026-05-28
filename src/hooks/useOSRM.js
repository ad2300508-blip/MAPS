import { useState, useEffect, useRef, useMemo } from 'react';

const BASE = 'https://router.project-osrm.org/route/v1';

// Round to ~100 m precision so GPS jitter doesn't trigger constant refetches
const snap = (n) => Math.round(n * 1000) / 1000;

export function useOSRM(origin, destination, profile) {
  const [route,   setRoute]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const abortRef = useRef(null);

  // Snapped origin — stable across GPS micro-updates
  const snappedOrigin = useMemo(() => {
    if (!origin) return null;
    return [snap(origin[0]), snap(origin[1])];
  // Recompute only when origin moves ~100 m
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin && snap(origin[0]), origin && snap(origin[1])]);

  useEffect(() => {
    if (!snappedOrigin || !destination) {
      setRoute(null);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const url =
      `${BASE}/${profile}/` +
      `${snappedOrigin[0]},${snappedOrigin[1]};` +
      `${destination[0]},${destination[1]}` +
      `?steps=true&geometries=geojson&overview=full`;

    setLoading(true);
    setError(null);

    fetch(url, { signal: abortRef.current.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.code === 'Ok' && data.routes?.length > 0) {
          setRoute(data.routes[0]);
        } else {
          setRoute(null);
          setError('Percorso non trovato');
        }
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError('Errore di rete');
          setLoading(false);
        }
      });

    return () => abortRef.current?.abort();
  }, [
    snappedOrigin?.[0], snappedOrigin?.[1],
    destination?.[0],   destination?.[1],
    profile,
  ]);

  return { route, loading, error };
}
