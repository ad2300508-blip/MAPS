import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Minus, Locate, Box, Map, Share2 } from 'lucide-react';

function ControlButton({ icon: Icon, label, onClick, active, accent, style, children }) {
  return (
    <motion.button
      onClick={onClick}
      title={label}
      aria-label={label}
      whileHover={{ scale: 1.08, x: -2 }}
      whileTap={{ scale: 0.93 }}
      className="relative w-11 h-11 flex items-center justify-center rounded-2xl focus:outline-none transition-colors"
      style={{
        background: active
          ? 'linear-gradient(135deg, #4361ee55, #4cc9f055)'
          : 'rgba(16, 16, 28, 0.88)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: active
          ? '1px solid rgba(76, 201, 240, 0.35)'
          : '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: active
          ? '0 0 16px rgba(76, 201, 240, 0.25)'
          : '0 4px 14px rgba(0, 0, 0, 0.4)',
        ...style,
      }}
    >
      {children ?? (
        <Icon
          size={18}
          strokeWidth={2}
          style={{ color: active ? '#4cc9f0' : accent ? '#4cc9f0' : '#94a3b8' }}
        />
      )}
    </motion.button>
  );
}

function Divider() {
  return <div className="w-7 h-px mx-auto" style={{ background: 'rgba(255,255,255,0.07)' }} />;
}

// Compass rose indicator — rotates with map bearing
function CompassButton({ bearing, onClick }) {
  const visible = Math.abs(bearing) > 3; // only show when bearing is non-trivial
  return (
    <motion.button
      onClick={onClick}
      title="Orienta a Nord"
      aria-label="Orienta a Nord"
      whileTap={{ scale: 0.93 }}
      initial={false}
      animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.6, pointerEvents: visible ? 'auto' : 'none' }}
      transition={{ duration: 0.25 }}
      className="w-11 h-11 flex items-center justify-center rounded-2xl focus:outline-none"
      style={{
        background: 'rgba(16,16,28,0.88)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
      }}
    >
      {/* Mini compass rose that rotates to show current bearing */}
      <svg width="22" height="22" viewBox="0 0 22 22" style={{ transform: `rotate(${bearing}deg)`, transition: 'transform 0.3s ease' }}>
        {/* North triangle (red) */}
        <polygon points="11,2 9,11 11,9 13,11" fill="#ef4444" />
        {/* South triangle (white/grey) */}
        <polygon points="11,20 9,11 11,13 13,11" fill="rgba(255,255,255,0.35)" />
      </svg>
    </motion.button>
  );
}

export default function MapControls({ mapApiRef, is3DMode, onToggle3D, onMyLocation, isNavigating, userLocation }) {
  const [bearing, setBearing] = useState(0);

  // Track bearing via map events — reactive and zero-cost when map is still
  useEffect(() => {
    if (!mapApiRef) return;
    let unsubscribe = null;

    const trySetup = () => {
      const map = mapApiRef.current?.getMap();
      if (!map) return null;
      // Read initial bearing
      setBearing(Math.round(map.getBearing() * 10) / 10);
      const update = () => setBearing(Math.round(map.getBearing() * 10) / 10);
      map.on('rotate', update);
      map.on('rotateend', update);
      return () => { map.off('rotate', update); map.off('rotateend', update); };
    };

    // Poll until map is available, then switch to events
    const id = setInterval(() => {
      const cleanup = trySetup();
      if (cleanup) { unsubscribe = cleanup; clearInterval(id); }
    }, 200);

    return () => { clearInterval(id); unsubscribe?.(); };
  }, [mapApiRef]);

  const zoomIn = () => {
    const map = mapApiRef.current?.getMap();
    if (!map) return;
    navigator.vibrate?.([10]);
    map.zoomIn({ duration: 350 });
  };

  const zoomOut = () => {
    const map = mapApiRef.current?.getMap();
    if (!map) return;
    navigator.vibrate?.([10]);
    map.zoomOut({ duration: 350 });
  };

  const orientNorth = () => {
    const map = mapApiRef.current?.getMap();
    if (!map) return;
    map.easeTo({ bearing: 0, duration: 600 });
    navigator.vibrate?.([15]);
  };

  const shareLocation = () => {
    if (!userLocation) return;
    const [lng, lat] = userLocation;
    navigator.vibrate?.([15]);
    if (typeof navigator.share === 'function') {
      navigator.share({
        title: 'La mia posizione',
        url: `https://www.google.com/maps?q=${lat},${lng}`,
      }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`).catch(() => {});
    }
  };

  const canShare = !!userLocation;

  return (
    <div
      className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2"
      style={{ zIndex: 40 }}
    >
      {/* Zoom in */}
      <ControlButton icon={Plus} label="Zoom avanti" onClick={zoomIn} />

      {/* Zoom out */}
      <ControlButton icon={Minus} label="Zoom indietro" onClick={zoomOut} />

      <Divider />

      {/* My location */}
      <ControlButton
        icon={Locate}
        label="La mia posizione"
        onClick={onMyLocation}
        accent
      />

      {/* Share current location */}
      {canShare && (
        <ControlButton
          icon={Share2}
          label="Condividi posizione"
          onClick={shareLocation}
        />
      )}

      {/* Compass / North Up — only appears when map is rotated */}
      {!isNavigating && <CompassButton bearing={bearing} onClick={orientNorth} />}

      {/* 2D / 3D toggle — hidden during navigation (pitch is controlled by follow mode) */}
      {!isNavigating && (
        <>
          <Divider />
          <ControlButton
            icon={is3DMode ? Box : Map}
            label={is3DMode ? 'Passa a 2D' : 'Passa a 3D'}
            onClick={onToggle3D}
            active={is3DMode}
          />
        </>
      )}
    </div>
  );
}
