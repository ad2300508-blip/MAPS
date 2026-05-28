import { useState, useEffect } from 'react';

export function useCompassHeading() {
  const [heading, setHeading] = useState(null);

  useEffect(() => {
    const handle = (e) => {
      // iOS: webkitCompassHeading is already 0°=North
      if (e.webkitCompassHeading != null) {
        setHeading(e.webkitCompassHeading);
        return;
      }
      // Android absolute: alpha rotates counter-clockwise from North
      if (e.absolute && e.alpha != null) {
        setHeading((360 - e.alpha + 360) % 360);
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
