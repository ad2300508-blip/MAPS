import { motion, AnimatePresence } from 'framer-motion';
import { TRANSPORT_MODES } from '../data/mockData';

const TRAFFIC_DOT = {
  light:    { color: '#10b981', label: 'Scorrevole' },
  moderate: { color: '#f59e0b', label: 'Moderato'   },
  heavy:    { color: '#ef4444', label: 'Congestionato' },
};

// CO₂ badge color based on grams emitted
function co2Color(grams) {
  if (grams === 0)    return '#10b981';
  if (grams < 100)    return '#f59e0b';
  return '#ef4444';
}

function ModeChip({ mode, isSelected, hasDestination, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      className="flex-1 min-w-0 flex flex-col items-center gap-0.5 py-2.5 px-1 rounded-2xl focus:outline-none"
      style={
        isSelected
          ? {
              background: `${mode.color}1a`,
              border: `1.5px solid ${mode.color}55`,
              boxShadow: `0 0 14px ${mode.color}20`,
            }
          : {
              background: 'rgba(255,255,255,0.04)',
              border: '1.5px solid rgba(255,255,255,0.07)',
            }
      }
      animate={{ y: isSelected ? -1 : 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
    >
      <span className="text-xl leading-none">{mode.icon}</span>
      <span
        className="text-[11px] font-semibold leading-none mt-0.5"
        style={{ color: isSelected ? mode.color : '#64748b' }}
      >
        {mode.shortLabel}
      </span>
      {hasDestination && (
        <span
          className="text-[11px] font-bold leading-none"
          style={{ color: isSelected ? mode.color : '#94a3b8' }}
        >
          {mode.duration}
        </span>
      )}
    </motion.button>
  );
}

export default function TransportModeSelector({
  selectedModeId,
  onModeChange,
  destination,   // the selected POI (or null)
}) {
  const selectedMode = TRANSPORT_MODES.find((m) => m.id === selectedModeId) ?? TRANSPORT_MODES[0];
  const traffic = TRAFFIC_DOT[selectedMode.traffic] ?? TRAFFIC_DOT.light;
  const hasDestination = !!destination;

  return (
    <motion.div
      className="absolute bottom-0 left-0 right-0 z-20"
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 36, delay: 0.15 }}
      // Honor Android / iOS bottom safe area
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div
        className="mx-3 mb-3 rounded-3xl overflow-hidden"
        style={{
          background: 'rgba(12, 12, 20, 0.90)',
          backdropFilter: 'blur(28px) saturate(200%)',
          WebkitBackdropFilter: 'blur(28px) saturate(200%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        {/* ── Route summary (only when destination is selected) ── */}
        <AnimatePresence>
          {hasDestination && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="overflow-hidden"
            >
              <div className="px-4 pt-3 pb-2 border-b border-white/[0.06]">
                {/* Traffic indicator + destination */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <motion.span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: traffic.color }}
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                    />
                    <span className="text-xs text-slate-400">{traffic.label}</span>
                  </div>
                  <span className="text-xs text-slate-500 truncate max-w-[140px]">
                    → {destination.name}
                  </span>
                </div>

                {/* Route stats row */}
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-2xl font-bold text-white tabular-nums">
                    {selectedMode.duration}
                  </span>
                  <span className="text-sm text-slate-400">{selectedMode.distance}</span>
                  <span
                    className="text-xs font-medium px-1.5 py-0.5 rounded-md"
                    style={{
                      color: co2Color(selectedMode.co2Grams),
                      background: `${co2Color(selectedMode.co2Grams)}15`,
                      border: `1px solid ${co2Color(selectedMode.co2Grams)}25`,
                    }}
                  >
                    {selectedMode.co2} CO₂
                  </span>
                  <span
                    className="ml-auto text-sm font-semibold"
                    style={{ color: selectedMode.color }}
                  >
                    {selectedMode.cost}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Mode chips ── */}
        <div className="flex gap-1.5 px-2.5 py-2.5">
          {TRANSPORT_MODES.map((mode) => (
            <ModeChip
              key={mode.id}
              mode={mode}
              isSelected={selectedModeId === mode.id}
              hasDestination={hasDestination}
              onClick={() => onModeChange(mode.id)}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
