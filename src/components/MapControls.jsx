import { motion } from 'framer-motion';
import { Plus, Minus, Locate, Box, Map } from 'lucide-react';

function ControlButton({ icon: Icon, label, onClick, active, accent, style }) {
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
      <Icon
        size={18}
        strokeWidth={2}
        style={{ color: active ? '#4cc9f0' : accent ? '#4cc9f0' : '#94a3b8' }}
      />
    </motion.button>
  );
}

function Divider() {
  return <div className="w-7 h-px mx-auto" style={{ background: 'rgba(255,255,255,0.07)' }} />;
}

export default function MapControls({ mapApiRef, is3DMode, onToggle3D, onMyLocation, isNavigating }) {
  const zoomIn = () => {
    const map = mapApiRef.current?.getMap();
    if (!map) return;
    map.zoomIn({ duration: 350 });
  };

  const zoomOut = () => {
    const map = mapApiRef.current?.getMap();
    if (!map) return;
    map.zoomOut({ duration: 350 });
  };

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
