import { useState, useEffect } from 'react';

export function useGeolocation() {
  const [location, setLocation] = useState(null);
  const [heading,  setHeading]  = useState(null);
  const [speed,    setSpeed]    = useState(null);   // m/s, null if unknown
  const [accuracy, setAccuracy] = useState(null);
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocalizzazione non supportata');
      setLoading(false);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation([pos.coords.longitude, pos.coords.latitude]);
        setAccuracy(pos.coords.accuracy);
        if (pos.coords.speed != null && pos.coords.speed >= 0) setSpeed(pos.coords.speed);
        if (pos.coords.heading != null && !isNaN(pos.coords.heading)) setHeading(pos.coords.heading);
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err.code === 1 ? 'Permesso GPS negato' : 'Impossibile ottenere posizione');
        setLoading(false);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { location, heading, speed, accuracy, error, loading };
}
