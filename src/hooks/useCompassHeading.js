import { useState, useEffect, useRef } from 'react';

function angleDelta(from, to) {
  let d = to - from;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function useCompassHeading() {
  const [heading, setHeading] = useState(null);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    let smoothed = null;
    const ALPHA = 0.15;  // heavy smoothing — device orientation fires at ~60 Hz

    const handle = (e) => {
      let raw;
      if (e.webkitCompassHeading != null) {
        raw = e.webkitCompassHeading;
      } else if (e.absolute && e.alpha != null) {
        raw = (360 - e.alpha + 360) % 360;
      } else {
        return;
      }

      if (smoothed == null) {
        smoothed = raw;
      } else {
        smoothed = (smoothed + ALPHA * angleDelta(smoothed, raw) + 360) % 360;
      }

      // Throttle state updates to ~10 Hz — compass fires at 60 Hz which
      // would cause 60 React re-renders/s while navigation is active.
      const now = performance.now();
      if (now - lastUpdateRef.current >= 100) {
        lastUpdateRef.current = now;
        setHeading(Math.round(smoothed));
      }
    };

    window.addEventListener('deviceorientationabsolute', handle, true);
    window.addEventListener('deviceorientation', handle, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handle, true);
      window.removeEventListener('deviceorientation', handle, true);
    };
  }, []);

  return heading;
}
