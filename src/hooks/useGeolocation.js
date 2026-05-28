import { useState, useEffect } from 'react';

export function useGeolocation() {
  const [location, setLocation] = useState(null);   // [lng, lat]
  const [heading, setHeading] = useState(null);     // degrees 0-360
  const [accuracy, setAccuracy] = useState(null);   // meters
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocalizzazione non supportata dal browser');
      setLoading(false);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation([pos.coords.longitude, pos.coords.latitude]);
        setAccuracy(pos.coords.accuracy);
        if (pos.coords.heading != null && !isNaN(pos.coords.heading)) {
          setHeading(pos.coords.heading);
        }
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err.code === 1 ? 'Permesso GPS negato' : 'Impossibile ottenere la posizione');
        setLoading(false);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { location, heading, accuracy, error, loading };
}
