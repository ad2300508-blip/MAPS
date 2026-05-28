import { useState, useEffect, useRef } from 'react';

const BASE = 'https://router.project-osrm.org/route/v1';

export function useOSRM(origin, destination, profile) {
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!origin || !destination) {
      setRoute(null);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const url =
      `${BASE}/${profile}/` +
      `${origin[0]},${origin[1]};${destination[0]},${destination[1]}` +
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
  // Only re-fetch when coordinates or profile actually change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    origin?.[0], origin?.[1],
    destination?.[0], destination?.[1],
    profile,
  ]);

  return { route, loading, error };
}
