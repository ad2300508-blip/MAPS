import { useState, useEffect } from 'react';

function angleDelta(from, to) {
  let d = to - from;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

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

    let smoothedHeading = null;
    const ALPHA = 0.35;  // moderate smoothing — GPS heading updates at ~1 Hz

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation([pos.coords.longitude, pos.coords.latitude]);
        setAccuracy(pos.coords.accuracy);
        const rawSpeed = pos.coords.speed;
        // Floor at 0.3 m/s to suppress GPS micro-jitter when stationary
        if (rawSpeed != null && rawSpeed >= 0) setSpeed(rawSpeed < 0.3 ? 0 : rawSpeed);
        // GPS heading is unreliable below ~1 m/s (3.6 km/h); let compass take over
        const reliableHeading = rawSpeed != null && rawSpeed >= 1.0;
        if (reliableHeading && pos.coords.heading != null && !isNaN(pos.coords.heading)) {
          const raw = pos.coords.heading;
          if (smoothedHeading == null) {
            smoothedHeading = raw;
          } else {
            smoothedHeading = (smoothedHeading + ALPHA * angleDelta(smoothedHeading, raw) + 360) % 360;
          }
          setHeading(Math.round(smoothedHeading));
        } else if (!reliableHeading) {
          setHeading(null); // let compass take over at low speeds
        }
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
